;; Hand-written component-model WAT — WASIp3 HTTP forwarder middleware (Phase 4a).
;;
;; Imports `wasi:http/types@0.3.0-rc-2026-03-15` and an upstream
;; `wasi:http/handler@0.3.0-rc-2026-03-15`. Exports `wasi:http/handler` (downstream).
;;
;; CONCURRENT DRIVER — req-side pump and resp-side pump run independently:
;;
;;   Setup (handle-start):
;;     1. Allocate rcu future, write Ok(()), drop writable.
;;     2. consume-body(req_in, rcu_r) → (req_in_body_r, req_in_trailers_r).
;;     3. Build outbound request with fresh body+trailers pairs → request.new.
;;     4. Async-lower upstream handler.handle(req_out, retptr) → subtask.
;;     5. Join subtask to waitable-set; start concurrent pumps.
;;
;;   Req-side pump (phases 0–4):
;;     0. stream.read req_in_body → buffer
;;     1. stream.write echo → req_out_body (repeat 0→1 until EOF)
;;     2. stream.write "-fwd-" → req_out_body; drop writable
;;     3. future.write Ok(none) → req_out_trailers; drop writable
;;     4. req side done
;;
;;   Resp-side pump (phases 0–5):
;;     0. awaiting subtask RETURNED (no-op)
;;     1. stream.read resp_in_body → buffer
;;     2. stream.write echo → resp_out_body (repeat 1→2 until EOF)
;;     3. stream.write "-fwd-" → resp_out_body; drop writable
;;     4. future.write Ok(none) → resp_out_trailers; drop writable
;;     5. resp side done
;;
;;   On subtask RETURNED (Ok):
;;     consume-body on response → resp_in_body_r; build downstream response;
;;     **early task.return(Ok(resp))** — lets the caller start reading resp_body
;;     concurrently; resp_phase → 1 (start reading).
;;
;;   On subtask RETURNED (Err):
;;     cleanup all; task.return(Err); both sides → done; EXIT.
;;
;;   Finalize: when req_phase==4 AND resp_phase==5 → ws-drop; EXIT.
;;
;; Body-mutation contract (per http-WAT-plan §2):
;;   response_body == request_body + "-fwd-" + "-handled-" + "-fwd-"
;;
;; All async ops use the callback form of async-lift; no JSPI.

(component $server-fwd-p3-wat

  ;; ===================================================================
  ;; Component-level shared types
  ;; ===================================================================

  (type $error-code (variant (case "internal-error")))             ;; 1-case stub

  (type $stream-u8 (stream u8))
  (type $result-unit (result (error $error-code)))
  (type $future-result-unit (future $result-unit))

  ;; ===================================================================
  ;; Imported wasi:http/types instance type
  ;; ===================================================================
  (type $http-types-iface (instance
    (export "fields"   (type (sub resource)))                   ;; idx 0
    (export "request"  (type (sub resource)))                   ;; idx 1
    (export "response" (type (sub resource)))                   ;; idx 2
    (export "request-options" (type (sub resource)))            ;; idx 3

    ;; idx 4: stub error-code; idx 5: error-code export
    (type (variant (case "internal-error")))
    (export "error-code" (type (eq 4)))

    (type (own 0))                                              ;; idx 6 = own<fields>
    (type (option 6))                                           ;; idx 7 = option<own<fields>>
    (type (stream u8))                                          ;; idx 8 = stream<u8>
    (type (result (error 5)))                                   ;; idx 9 = result<_, error-code>
    (type (future 9))                                           ;; idx 10 = future<result<_, error-code>>
    (type (result 7 (error 5)))                                 ;; idx 11 = result<option<trailers>, error-code>
    (type (future 11))                                          ;; idx 12 = future<result<option<trailers>, error-code>>
    (type (option 8))                                           ;; idx 13 = option<stream<u8>>
    (type (own 2))                                              ;; idx 14 = own<response>
    (type (tuple 14 10))                                        ;; idx 15 = tuple<own<response>, future<...>>
    (type (own 1))                                              ;; idx 16 = own<request>
    (type (tuple 8 12))                                         ;; idx 17 = tuple<stream<u8>, future<trailers>>
    (type (own 3))                                              ;; idx 18 = own<request-options>
    (type (option 18))                                          ;; idx 19 = option<own<request-options>>
    (type (tuple 16 10))                                        ;; idx 20 = tuple<own<request>, future<rcu>>

    ;; idx 21: fn fields.new() -> own<fields>
    (type (func (result 6)))
    (export "[constructor]fields" (func (type 21)))

    ;; idx 22: fn response.new(headers, option<stream>, future<trailers>) -> tuple<own<response>, future<rcu>>
    (type (func
      (param "headers"  6)
      (param "contents" 13)
      (param "trailers" 12)
      (result 15)))
    (export "[static]response.new" (func (type 22)))

    ;; idx 23: fn request.new(headers, contents, trailers, options) -> tuple<own<request>, future<rcu>>
    (type (func
      (param "headers"  6)
      (param "contents" 13)
      (param "trailers" 12)
      (param "options"  19)
      (result 20)))
    (export "[static]request.new" (func (type 23)))

    ;; idx 24: fn request.consume-body(this, res) -> tuple<stream<u8>, future<trailers>>
    (type (func
      (param "this" 16)
      (param "res"  10)
      (result 17)))
    (export "[static]request.consume-body" (func (type 24)))

    ;; idx 25: fn response.consume-body(this, res) -> tuple<stream<u8>, future<trailers>>
    (type (func
      (param "this" 14)
      (param "res"  10)
      (result 17)))
    (export "[static]response.consume-body" (func (type 25)))
  ))
  (import "wasi:http/types@0.3.0-rc-2026-03-15"
          (instance $http-types (type $http-types-iface)))

  (alias export $http-types "fields"   (type $fields))
  (alias export $http-types "request"  (type $request))
  (alias export $http-types "response" (type $response))

  ;; Component-level derived types
  (type $own-fields (own $fields))
  (type $option-trailers (option $own-fields))
  (type $result-rt (result $option-trailers (error $error-code)))
  (type $future-rt (future $result-rt))
  (type $handler-result (result (own $response) (error $error-code)))

  ;; ===================================================================
  ;; Imported upstream wasi:http/handler instance type
  ;; ===================================================================
  (type $upstream-handler-iface (instance
    (alias outer $server-fwd-p3-wat $request  (type))           ;; idx 0
    (export "request" (type (eq 0)))                            ;; idx 1
    (alias outer $server-fwd-p3-wat $response (type))           ;; idx 2
    (export "response" (type (eq 2)))                           ;; idx 3
    (type (variant (case "internal-error")))                    ;; idx 4
    (export "error-code" (type (eq 4)))                         ;; idx 5
    (type (own 1))                                              ;; idx 6 = own<request>
    (type (own 3))                                              ;; idx 7 = own<response>
    (type (result 7 (error 5)))                                 ;; idx 8 = result<own<response>, error-code>

    ;; idx 9: handle: async func(request: own<request>) -> result<own<response>, error-code>
    (type (func async (param "request" 6) (result 8)))
    (export "handle" (func (type 9)))
  ))
  (import "wasi:http/handler@0.3.0-rc-2026-03-15"
          (instance $upstream (type $upstream-handler-iface)))

  ;; ===================================================================
  ;; Linear memory shared by core impl and canon abi
  ;; ===================================================================
  ;;
  ;; Layout:
  ;;   0x0000 .. 0x0004  static "-fwd-" (5 bytes)
  ;;   0x0010 .. 0x001B  trailers Ok(none) buffer (12 bytes, all zero)
  ;;   0x0020 .. 0x0027  response.new retbuf (8 bytes)
  ;;   0x0028 .. 0x002F  consume-body retbuf — req side  (8 bytes)
  ;;   0x0030            rcu Ok(()) buffer (1 byte = 0)
  ;;   0x0040 .. 0x0047  upstream handler.handle async-lower retbuf:
  ;;                       offset 0: result disc (i32)
  ;;                       offset 4: own<response> handle (i32) on Ok
  ;;   0x0048 .. 0x004F  request.new retbuf  (8 bytes)
  ;;   0x0050 .. 0x0057  consume-body retbuf — resp side (8 bytes)
  ;;   0x1000 ..         per-task state struct
  ;;   0x4000 .. 0xBFFF  req-side chunk buffer (32 KiB)
  ;;   0xC000 .. 0x13FFF resp-side chunk buffer (32 KiB)

  (core module $mem-module
    (memory (export "memory") 4)
    (data (i32.const 0) "-fwd-")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; ===================================================================
  ;; Canon lower of imported instance functions
  ;; ===================================================================

  (alias export $http-types "[constructor]fields" (func $fields-new-comp))
  (core func $fields-new-core (canon lower (func $fields-new-comp)))

  (alias export $http-types "[static]response.new" (func $response-new-comp))
  (core func $response-new-core (canon lower (func $response-new-comp) (memory $mem)))

  (alias export $http-types "[static]request.new" (func $request-new-comp))
  (core func $request-new-core (canon lower (func $request-new-comp) (memory $mem)))

  (alias export $http-types "[static]request.consume-body" (func $req-consume-body-comp))
  (core func $req-consume-body-core (canon lower (func $req-consume-body-comp) (memory $mem)))

  (alias export $http-types "[static]response.consume-body" (func $resp-consume-body-comp))
  (core func $resp-consume-body-core (canon lower (func $resp-consume-body-comp) (memory $mem)))

  ;; Upstream handler.handle — async lower (returns state|handle<<4; result spilled to retptr)
  (alias export $upstream "handle" (func $upstream-handle-comp))
  (core func $upstream-handle-core
    (canon lower (func $upstream-handle-comp) async (memory $mem)))

  ;; ===================================================================
  ;; Canon stream / future / waitable / subtask / resource / context / task ops
  ;; ===================================================================

  (core func $stream-new-u8           (canon stream.new           $stream-u8))
  (core func $stream-read-u8          (canon stream.read          $stream-u8 (memory $mem) async))
  (core func $stream-write-u8         (canon stream.write         $stream-u8 (memory $mem) async))
  (core func $stream-drop-readable-u8 (canon stream.drop-readable $stream-u8))
  (core func $stream-drop-writable-u8 (canon stream.drop-writable $stream-u8))

  (core func $future-new-rt           (canon future.new           $future-rt))
  (core func $future-write-rt         (canon future.write         $future-rt (memory $mem) async))
  (core func $future-drop-writable-rt (canon future.drop-writable $future-rt))
  (core func $future-drop-readable-rt (canon future.drop-readable $future-rt))

  (core func $future-new-rcu           (canon future.new           $future-result-unit))
  (core func $future-write-rcu         (canon future.write         $future-result-unit (memory $mem) async))
  (core func $future-drop-writable-rcu (canon future.drop-writable $future-result-unit))
  (core func $future-drop-readable-rcu (canon future.drop-readable $future-result-unit))

  (core func $ws-new        (canon waitable-set.new))
  (core func $ws-drop       (canon waitable-set.drop))
  (core func $waitable-join (canon waitable.join))
  (core func $subtask-drop  (canon subtask.drop))

  (core func $ctx-get-0    (canon context.get i32 0))
  (core func $ctx-set-0    (canon context.set i32 0))

  (core func $task-return-core (canon task.return (result $handler-result) (memory $mem)))

  ;; ===================================================================
  ;; Core implementation module — CONCURRENT DRIVER
  ;; ===================================================================
  (core module $impl
    (import "host" "memory"               (memory 0))
    (import "host" "fields-new"           (func $fields-new           (result i32)))
    (import "host" "response-new"         (func $response-new         (param i32 i32 i32 i32 i32)))
    (import "host" "request-new"          (func $request-new          (param i32 i32 i32 i32 i32 i32 i32)))
    (import "host" "req-consume-body"     (func $req-consume-body     (param i32 i32 i32)))
    (import "host" "resp-consume-body"    (func $resp-consume-body    (param i32 i32 i32)))
    (import "host" "upstream-handle"      (func $upstream-handle      (param i32 i32) (result i32)))

    (import "host" "stream-new-u8"           (func $stream-new-u8           (result i64)))
    (import "host" "stream-read-u8"          (func $stream-read-u8          (param i32 i32 i32) (result i32)))
    (import "host" "stream-write-u8"         (func $stream-write-u8         (param i32 i32 i32) (result i32)))
    (import "host" "stream-drop-readable-u8" (func $stream-drop-readable-u8 (param i32)))
    (import "host" "stream-drop-writable-u8" (func $stream-drop-writable-u8 (param i32)))

    (import "host" "future-new-rt"           (func $future-new-rt           (result i64)))
    (import "host" "future-write-rt"         (func $future-write-rt         (param i32 i32) (result i32)))
    (import "host" "future-drop-writable-rt" (func $future-drop-writable-rt (param i32)))
    (import "host" "future-drop-readable-rt" (func $future-drop-readable-rt (param i32)))

    (import "host" "future-new-rcu"           (func $future-new-rcu           (result i64)))
    (import "host" "future-write-rcu"         (func $future-write-rcu         (param i32 i32) (result i32)))
    (import "host" "future-drop-writable-rcu" (func $future-drop-writable-rcu (param i32)))
    (import "host" "future-drop-readable-rcu" (func $future-drop-readable-rcu (param i32)))

    (import "host" "ws-new"               (func $ws-new               (result i32)))
    (import "host" "ws-drop"              (func $ws-drop              (param i32)))
    (import "host" "waitable-join"        (func $waitable-join        (param i32 i32)))
    (import "host" "subtask-drop"         (func $subtask-drop         (param i32)))

    (import "host" "ctx-get-0"            (func $ctx-get-0            (result i32)))
    (import "host" "ctx-set-0"            (func $ctx-set-0            (param i32)))

    (import "host" "task-return"          (func $task-return          (param i32 i32)))

    ;; -----------------------------------------------------------------
    ;; State struct at 0x1000 (i32 fields):
    ;;   +0   req_phase          (0=read, 1=echo-write, 2=fwd-write, 3=trailers, 4=done)
    ;;   +4   resp_phase         (0=await-subtask, 1=read, 2=echo-write, 3=fwd-write, 4=trailers, 5=done)
    ;;   +8   req_in_body_r      (0 when dropped)
    ;;   +12  req_out_body_w     (0 when dropped)
    ;;   +16  req_out_trailers_w (0 when dropped)
    ;;   +20  subtask_h          (0 once dropped)
    ;;   +24  resp_in_body_r     (0 until obtained / when dropped)
    ;;   +28  resp_out_body_w    (0 until obtained / when dropped)
    ;;   +32  resp_out_trailers_w (0 until obtained / when dropped)
    ;;   +36  (reserved)
    ;;   +40  ws
    ;;   +44  req_echo_count
    ;;   +48  resp_echo_count
    ;; -----------------------------------------------------------------

    ;; Helper: re-arm a single waitable into ws (disjoin then rejoin).
    (func $rearm (param $h i32) (param $ws i32)
      (call $waitable-join (local.get $h) (i32.const 0))
      (call $waitable-join (local.get $h) (local.get $ws)))

    ;; -----------------------------------------------------------------
    ;; $abort-req-side — drop req-side handles, set req_phase=4.
    ;; -----------------------------------------------------------------
    (func $abort-req-side (param $state i32)
      (if (i32.ne (i32.load offset=8 (local.get $state)) (i32.const 0))
        (then
          (call $stream-drop-readable-u8 (i32.load offset=8 (local.get $state)))
          (i32.store offset=8 (local.get $state) (i32.const 0))))
      (if (i32.ne (i32.load offset=12 (local.get $state)) (i32.const 0))
        (then
          (call $stream-drop-writable-u8 (i32.load offset=12 (local.get $state)))
          (i32.store offset=12 (local.get $state) (i32.const 0))))
      (if (i32.ne (i32.load offset=16 (local.get $state)) (i32.const 0))
        (then
          (call $future-drop-writable-rt (i32.load offset=16 (local.get $state)))
          (i32.store offset=16 (local.get $state) (i32.const 0))))
      (i32.store offset=0 (local.get $state) (i32.const 4)))

    ;; -----------------------------------------------------------------
    ;; $abort-resp-side — drop resp-side handles, set resp_phase=5.
    ;; -----------------------------------------------------------------
    (func $abort-resp-side (param $state i32)
      (if (i32.ne (i32.load offset=24 (local.get $state)) (i32.const 0))
        (then
          (call $stream-drop-readable-u8 (i32.load offset=24 (local.get $state)))
          (i32.store offset=24 (local.get $state) (i32.const 0))))
      (if (i32.ne (i32.load offset=28 (local.get $state)) (i32.const 0))
        (then
          (call $stream-drop-writable-u8 (i32.load offset=28 (local.get $state)))
          (i32.store offset=28 (local.get $state) (i32.const 0))))
      (if (i32.ne (i32.load offset=32 (local.get $state)) (i32.const 0))
        (then
          (call $future-drop-writable-rt (i32.load offset=32 (local.get $state)))
          (i32.store offset=32 (local.get $state) (i32.const 0))))
      (i32.store offset=4 (local.get $state) (i32.const 5)))

    ;; -----------------------------------------------------------------
    ;; $on-subtask-returned — handles subtask RETURNED event.
    ;; On Ok: consume-body → resp_in_body_r; build downstream response;
    ;;        EARLY task.return(Ok(resp)); resp_phase → 1.
    ;; On Err: cleanup all; task.return(Err); EXIT path.
    ;; -----------------------------------------------------------------
    (func $on-subtask-returned (param $state i32)
      (local $stream-pair i64) (local $future-pair i64)
      (local $rcu-r i32) (local $rcu-w i32)
      (local $hdrs i32)

      ;; Drop subtask handle.
      (call $subtask-drop (i32.load offset=20 (local.get $state)))
      (i32.store offset=20 (local.get $state) (i32.const 0))

      ;; Check result disc at retbuf 0x40. Non-zero = Err.
      (if (i32.ne (i32.load (i32.const 0x40)) (i32.const 0))
        (then
          ;; Err path: cleanup everything, task.return(Err).
          (call $abort-req-side (local.get $state))
          (call $abort-resp-side (local.get $state))
          (call $task-return (i32.const 1) (i32.const 0))
          (return)))

      ;; --- Ok path: consume-body on inbound response ---
      (local.set $stream-pair (call $future-new-rcu))
      (local.set $rcu-r (i32.wrap_i64 (local.get $stream-pair)))
      (local.set $rcu-w
        (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32))))
      (drop (call $future-write-rcu (local.get $rcu-w) (i32.const 0x30)))
      (call $future-drop-writable-rcu (local.get $rcu-w))

      ;; consume-body(resp_handle, rcu_r) → retbuf 0x50
      (call $resp-consume-body
        (i32.load (i32.const 0x44))         ;; upstream resp handle
        (local.get $rcu-r)
        (i32.const 0x50))
      (i32.store offset=24 (local.get $state) (i32.load (i32.const 0x50)))  ;; resp_in_body_r
      (call $future-drop-readable-rt (i32.load (i32.const 0x54)))           ;; drop resp_in_trailers_r

      ;; --- Build downstream response ---
      (local.set $hdrs (call $fields-new))

      (local.set $stream-pair (call $stream-new-u8))
      ;; resp_out_body_w (high 32) → state+28
      (i32.store offset=28 (local.get $state)
        (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32))))

      (local.set $future-pair (call $future-new-rt))
      ;; resp_out_trailers_w (high 32) → state+32
      (i32.store offset=32 (local.get $state)
        (i32.wrap_i64 (i64.shr_u (local.get $future-pair) (i64.const 32))))

      ;; response.new(headers, some(body_r), trailers_r) → retbuf 0x20
      (call $response-new
        (local.get $hdrs)
        (i32.const 1)                                     ;; option some
        (i32.wrap_i64 (local.get $stream-pair))            ;; resp_out_body_r
        (i32.wrap_i64 (local.get $future-pair))            ;; resp_out_trailers_r
        (i32.const 0x20))
      (call $future-drop-readable-rcu (i32.load (i32.const 0x24)))  ;; completion_r

      ;; **EARLY task.return(Ok(resp))** — the caller can start reading
      ;; the response body concurrently while we pump it.
      (call $task-return (i32.const 0) (i32.load (i32.const 0x20)))

      ;; Start reading response body.
      (i32.store offset=4 (local.get $state) (i32.const 1)))

    ;; -----------------------------------------------------------------
    ;; $pump-req — issue req-side ops until BLOCKED or req_phase==4.
    ;; Req buffer at 0x4000, 32 KiB.
    ;; -----------------------------------------------------------------
    (func $pump-req (param $state i32) (param $ws i32)
      (local $phase i32)
      (local $rc i32)
      (local $status i32)
      (local $count i32)

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=0 (local.get $state)))

          ;; Done?
          (if (i32.eq (local.get $phase) (i32.const 4))
            (then (br $exit)))

          ;; --- Phase 0: read req_in_body ---
          (if (i32.eqz (local.get $phase))
            (then
              (local.set $rc (call $stream-read-u8
                (i32.load offset=8 (local.get $state))
                (i32.const 0x4000) (i32.const 0x8000)))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=8 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; DROPPED → EOF, write "-fwd-"
              (if (i32.eq (local.get $status) (i32.const 1))
                (then
                  (call $stream-drop-readable-u8 (i32.load offset=8 (local.get $state)))
                  (i32.store offset=8 (local.get $state) (i32.const 0))
                  (i32.store offset=0 (local.get $state) (i32.const 2))
                  (br $L)))
              ;; COMPLETED + count > 0 → echo
              (if (i32.gt_u (local.get $count) (i32.const 0))
                (then
                  (i32.store offset=44 (local.get $state) (local.get $count))
                  (i32.store offset=0 (local.get $state) (i32.const 1))
                  (br $L)))
              ;; count == 0: rearm, yield
              (call $rearm (i32.load offset=8 (local.get $state)) (local.get $ws))
              (br $exit)))

          ;; --- Phase 1: write echo to req_out_body ---
          (if (i32.eq (local.get $phase) (i32.const 1))
            (then
              (local.set $rc (call $stream-write-u8
                (i32.load offset=12 (local.get $state))
                (i32.const 0x4000)
                (i32.load offset=44 (local.get $state))))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=12 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; DROPPED → upstream reader dropped, abort
              (if (i32.eq (local.get $status) (i32.const 1))
                (then
                  (call $abort-req-side (local.get $state))
                  (br $exit)))
              ;; COMPLETED + count > 0 → back to reading
              (if (i32.gt_u (local.get $count) (i32.const 0))
                (then
                  (i32.store offset=0 (local.get $state) (i32.const 0))
                  (br $L)))
              ;; count == 0 (BLOCKED-resume): rearm, yield
              (call $rearm (i32.load offset=12 (local.get $state)) (local.get $ws))
              (br $exit)))

          ;; --- Phase 2: write "-fwd-" to req_out_body ---
          (if (i32.eq (local.get $phase) (i32.const 2))
            (then
              (local.set $rc (call $stream-write-u8
                (i32.load offset=12 (local.get $state))
                (i32.const 0) (i32.const 5)))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=12 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; Any completion (count > 0 or DROPPED): drop writable, → trailers
              (call $stream-drop-writable-u8 (i32.load offset=12 (local.get $state)))
              (i32.store offset=12 (local.get $state) (i32.const 0))
              (i32.store offset=0 (local.get $state) (i32.const 3))
              (br $L)))

          ;; --- Phase 3: future.write trailers Ok(none) ---
          (local.set $rc (call $future-write-rt
            (i32.load offset=16 (local.get $state))
            (i32.const 0x10)))
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              (call $rearm (i32.load offset=16 (local.get $state)) (local.get $ws))
              (br $exit)))
          ;; Done: drop writable, req_phase = 4
          (call $future-drop-writable-rt (i32.load offset=16 (local.get $state)))
          (i32.store offset=16 (local.get $state) (i32.const 0))
          (i32.store offset=0 (local.get $state) (i32.const 4))
          (br $exit))))

    ;; -----------------------------------------------------------------
    ;; $pump-resp — issue resp-side ops until BLOCKED or resp_phase==5.
    ;; Resp buffer at 0xC000, 32 KiB.
    ;; No-op while resp_phase==0 (awaiting subtask).
    ;; -----------------------------------------------------------------
    (func $pump-resp (param $state i32) (param $ws i32)
      (local $phase i32)
      (local $rc i32)
      (local $status i32)
      (local $count i32)

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=4 (local.get $state)))

          ;; Awaiting subtask or done?
          (if (i32.eqz (local.get $phase))
            (then (br $exit)))
          (if (i32.eq (local.get $phase) (i32.const 5))
            (then (br $exit)))

          ;; --- Phase 1: read resp_in_body ---
          (if (i32.eq (local.get $phase) (i32.const 1))
            (then
              (local.set $rc (call $stream-read-u8
                (i32.load offset=24 (local.get $state))
                (i32.const 0xC000) (i32.const 0x8000)))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=24 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; DROPPED → EOF, write "-fwd-"
              (if (i32.eq (local.get $status) (i32.const 1))
                (then
                  (call $stream-drop-readable-u8 (i32.load offset=24 (local.get $state)))
                  (i32.store offset=24 (local.get $state) (i32.const 0))
                  (i32.store offset=4 (local.get $state) (i32.const 3))
                  (br $L)))
              ;; COMPLETED + count > 0 → echo
              (if (i32.gt_u (local.get $count) (i32.const 0))
                (then
                  (i32.store offset=48 (local.get $state) (local.get $count))
                  (i32.store offset=4 (local.get $state) (i32.const 2))
                  (br $L)))
              ;; count == 0: rearm, yield
              (call $rearm (i32.load offset=24 (local.get $state)) (local.get $ws))
              (br $exit)))

          ;; --- Phase 2: write echo to resp_out_body ---
          (if (i32.eq (local.get $phase) (i32.const 2))
            (then
              (local.set $rc (call $stream-write-u8
                (i32.load offset=28 (local.get $state))
                (i32.const 0xC000)
                (i32.load offset=48 (local.get $state))))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=28 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; DROPPED → downstream reader dropped, abort
              (if (i32.eq (local.get $status) (i32.const 1))
                (then
                  (call $abort-resp-side (local.get $state))
                  (br $exit)))
              ;; COMPLETED + count > 0 → back to reading
              (if (i32.gt_u (local.get $count) (i32.const 0))
                (then
                  (i32.store offset=4 (local.get $state) (i32.const 1))
                  (br $L)))
              ;; count == 0 (BLOCKED-resume): rearm, yield
              (call $rearm (i32.load offset=28 (local.get $state)) (local.get $ws))
              (br $exit)))

          ;; --- Phase 3: write "-fwd-" to resp_out_body ---
          (if (i32.eq (local.get $phase) (i32.const 3))
            (then
              (local.set $rc (call $stream-write-u8
                (i32.load offset=28 (local.get $state))
                (i32.const 0) (i32.const 5)))
              (if (i32.eq (local.get $rc) (i32.const -1))
                (then
                  (call $rearm (i32.load offset=28 (local.get $state)) (local.get $ws))
                  (br $exit)))
              (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
              ;; Any completion: drop writable, → trailers
              (call $stream-drop-writable-u8 (i32.load offset=28 (local.get $state)))
              (i32.store offset=28 (local.get $state) (i32.const 0))
              (i32.store offset=4 (local.get $state) (i32.const 4))
              (br $L)))

          ;; --- Phase 4: future.write trailers Ok(none) ---
          (local.set $rc (call $future-write-rt
            (i32.load offset=32 (local.get $state))
            (i32.const 0x10)))
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              (call $rearm (i32.load offset=32 (local.get $state)) (local.get $ws))
              (br $exit)))
          (call $future-drop-writable-rt (i32.load offset=32 (local.get $state)))
          (i32.store offset=32 (local.get $state) (i32.const 0))
          (i32.store offset=4 (local.get $state) (i32.const 5))
          (br $exit))))

    ;; -----------------------------------------------------------------
    ;; $drive — top-level scheduler.
    ;;
    ;; If $post=1, dispatch event by event_code + handle:
    ;;   EVENT_SUBTASK=1       → on-subtask-returned
    ;;   EVENT_STREAM_READ=2   → advance req or resp read phase
    ;;   EVENT_STREAM_WRITE=3  → advance req or resp write phase
    ;;   EVENT_FUTURE_WRITE=5  → drop trailers writable, advance phase
    ;;
    ;; Then pump both sides. Finalize when both done.
    ;; -----------------------------------------------------------------
    (func $drive (param $state i32) (param $event i32) (param $waitable i32)
                 (param $rc i32) (param $post i32) (result i32)
      (local $ws i32)
      (local $status i32)
      (local $count i32)

      (local.set $ws (i32.load offset=40 (local.get $state)))

      (if (local.get $post)
        (then
          (block $dispatched
            ;; --- EVENT_SUBTASK = 1 ---
            (if (i32.eq (local.get $event) (i32.const 1))
              (then
                (call $on-subtask-returned (local.get $state))
                (br $dispatched)))

            (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
            (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))

            ;; --- EVENT_STREAM_READ = 2 ---
            (if (i32.eq (local.get $event) (i32.const 2))
              (then
                ;; req_in_body_r?
                (if (i32.eq (local.get $waitable) (i32.load offset=8 (local.get $state)))
                  (then
                    (if (i32.eq (local.get $status) (i32.const 1))
                      (then
                        (call $stream-drop-readable-u8 (i32.load offset=8 (local.get $state)))
                        (i32.store offset=8 (local.get $state) (i32.const 0))
                        (i32.store offset=0 (local.get $state) (i32.const 2)))
                      (else (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then
                          (i32.store offset=44 (local.get $state) (local.get $count))
                          (i32.store offset=0 (local.get $state) (i32.const 1))))))
                    (br $dispatched)))
                ;; resp_in_body_r?
                (if (i32.eq (local.get $waitable) (i32.load offset=24 (local.get $state)))
                  (then
                    (if (i32.eq (local.get $status) (i32.const 1))
                      (then
                        (call $stream-drop-readable-u8 (i32.load offset=24 (local.get $state)))
                        (i32.store offset=24 (local.get $state) (i32.const 0))
                        (i32.store offset=4 (local.get $state) (i32.const 3)))
                      (else (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then
                          (i32.store offset=48 (local.get $state) (local.get $count))
                          (i32.store offset=4 (local.get $state) (i32.const 2))))))
                    (br $dispatched)))
                (br $dispatched)))

            ;; --- EVENT_STREAM_WRITE = 3 ---
            (if (i32.eq (local.get $event) (i32.const 3))
              (then
                ;; req_out_body_w?
                (if (i32.eq (local.get $waitable) (i32.load offset=12 (local.get $state)))
                  (then
                    (if (i32.eq (local.get $status) (i32.const 1))
                      (then
                        (call $abort-req-side (local.get $state))
                        (br $dispatched)))
                    (if (i32.gt_u (local.get $count) (i32.const 0))
                      (then
                        ;; req_phase 1 (echo) → 0 (read)
                        (if (i32.eq (i32.load offset=0 (local.get $state)) (i32.const 1))
                          (then (i32.store offset=0 (local.get $state) (i32.const 0))))
                        ;; req_phase 2 (fwd) → drop writable, → 3
                        (if (i32.eq (i32.load offset=0 (local.get $state)) (i32.const 2))
                          (then
                            (call $stream-drop-writable-u8 (i32.load offset=12 (local.get $state)))
                            (i32.store offset=12 (local.get $state) (i32.const 0))
                            (i32.store offset=0 (local.get $state) (i32.const 3))))))
                    (br $dispatched)))
                ;; resp_out_body_w?
                (if (i32.eq (local.get $waitable) (i32.load offset=28 (local.get $state)))
                  (then
                    (if (i32.eq (local.get $status) (i32.const 1))
                      (then
                        (call $abort-resp-side (local.get $state))
                        (br $dispatched)))
                    (if (i32.gt_u (local.get $count) (i32.const 0))
                      (then
                        ;; resp_phase 2 (echo) → 1 (read)
                        (if (i32.eq (i32.load offset=4 (local.get $state)) (i32.const 2))
                          (then (i32.store offset=4 (local.get $state) (i32.const 1))))
                        ;; resp_phase 3 (fwd) → drop writable, → 4
                        (if (i32.eq (i32.load offset=4 (local.get $state)) (i32.const 3))
                          (then
                            (call $stream-drop-writable-u8 (i32.load offset=28 (local.get $state)))
                            (i32.store offset=28 (local.get $state) (i32.const 0))
                            (i32.store offset=4 (local.get $state) (i32.const 4))))))
                    (br $dispatched)))
                (br $dispatched)))

            ;; --- EVENT_FUTURE_WRITE = 5 ---
            (if (i32.eq (local.get $event) (i32.const 5))
              (then
                ;; req_out_trailers_w?
                (if (i32.eq (local.get $waitable) (i32.load offset=16 (local.get $state)))
                  (then
                    (call $future-drop-writable-rt (i32.load offset=16 (local.get $state)))
                    (i32.store offset=16 (local.get $state) (i32.const 0))
                    (i32.store offset=0 (local.get $state) (i32.const 4))
                    (br $dispatched)))
                ;; resp_out_trailers_w?
                (if (i32.eq (local.get $waitable) (i32.load offset=32 (local.get $state)))
                  (then
                    (call $future-drop-writable-rt (i32.load offset=32 (local.get $state)))
                    (i32.store offset=32 (local.get $state) (i32.const 0))
                    (i32.store offset=4 (local.get $state) (i32.const 5))
                    (br $dispatched)))))
          )))

      ;; Pump both sides.
      (call $pump-req  (local.get $state) (local.get $ws))
      (call $pump-resp (local.get $state) (local.get $ws))

      ;; Finalize? Both sides done.
      (if (i32.and
            (i32.eq (i32.load offset=0 (local.get $state)) (i32.const 4))
            (i32.eq (i32.load offset=4 (local.get $state)) (i32.const 5)))
        (then
          (call $ws-drop (local.get $ws))
          (return (i32.const 0))))   ;; EXIT

      ;; Yield.
      (call $ctx-set-0 (local.get $state))
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4))))

    ;; -----------------------------------------------------------------
    ;; handle-start(req_in: i32) -> i32
    ;; -----------------------------------------------------------------
    (func $handle-start (export "handle-start") (param $req-in i32) (result i32)
      (local $rcu-pair i64)
      (local $body-pair i64) (local $trailers-pair i64)
      (local $headers i32)
      (local $req-in-body-r i32) (local $req-in-trailers-r i32)
      (local $req-out-body-r i32) (local $req-out-body-w i32)
      (local $req-out-trailers-r i32) (local $req-out-trailers-w i32)
      (local $req-out-handle i32) (local $req-out-completion-r i32)
      (local $ws i32)
      (local $upstream-rc i32)
      (local $subtask-h i32)
      (local $subtask-state i32)

      ;; --- 1. rcu future for inbound request consume-body ---
      (local.set $rcu-pair (call $future-new-rcu))
      (drop (call $future-write-rcu
        (i32.wrap_i64 (i64.shr_u (local.get $rcu-pair) (i64.const 32)))
        (i32.const 0x30)))
      (call $future-drop-writable-rcu
        (i32.wrap_i64 (i64.shr_u (local.get $rcu-pair) (i64.const 32))))

      ;; --- 2. consume-body inbound request → (body_r, trailers_r) ---
      (call $req-consume-body
        (local.get $req-in)
        (i32.wrap_i64 (local.get $rcu-pair))
        (i32.const 0x28))
      (local.set $req-in-body-r     (i32.load (i32.const 0x28)))
      (local.set $req-in-trailers-r (i32.load (i32.const 0x2C)))
      (call $future-drop-readable-rt (local.get $req-in-trailers-r))

      ;; --- 3. Build outbound request: fresh body+trailers stream/future pairs ---
      (local.set $headers (call $fields-new))

      (local.set $body-pair (call $stream-new-u8))
      (local.set $req-out-body-r (i32.wrap_i64 (local.get $body-pair)))
      (local.set $req-out-body-w (i32.wrap_i64 (i64.shr_u (local.get $body-pair) (i64.const 32))))

      (local.set $trailers-pair (call $future-new-rt))
      (local.set $req-out-trailers-r (i32.wrap_i64 (local.get $trailers-pair)))
      (local.set $req-out-trailers-w (i32.wrap_i64 (i64.shr_u (local.get $trailers-pair) (i64.const 32))))

      ;; request.new(headers, some(body_r), trailers_r, none-options) → retbuf 0x48
      (call $request-new
        (local.get $headers)
        (i32.const 1)                       ;; option<stream> some
        (local.get $req-out-body-r)
        (local.get $req-out-trailers-r)
        (i32.const 0)                       ;; option<options> none disc
        (i32.const 0)                       ;; option<options> none payload
        (i32.const 0x48))
      (local.set $req-out-handle       (i32.load (i32.const 0x48)))
      (local.set $req-out-completion-r (i32.load (i32.const 0x4C)))
      (call $future-drop-readable-rcu (local.get $req-out-completion-r))

      ;; --- 4. Issue async upstream.handle(req_out, retptr=0x40) ---
      (local.set $upstream-rc (call $upstream-handle (local.get $req-out-handle) (i32.const 0x40)))
      (local.set $subtask-state (i32.and (local.get $upstream-rc) (i32.const 0xF)))
      (local.set $subtask-h     (i32.shr_u (local.get $upstream-rc) (i32.const 4)))

      ;; Callback-form upstream should not complete synchronously.
      (if (i32.eq (local.get $subtask-state) (i32.const 2))
        (then (unreachable)))

      ;; --- 5. Allocate ws and seed initial state ---
      (local.set $ws (call $ws-new))

      ;; Join subtask to ws so we get the RETURNED event.
      (call $waitable-join (local.get $subtask-h) (local.get $ws))

      (i32.store offset=0  (i32.const 0x1000) (i32.const 0))     ;; req_phase = 0 (read)
      (i32.store offset=4  (i32.const 0x1000) (i32.const 0))     ;; resp_phase = 0 (await subtask)
      (i32.store offset=8  (i32.const 0x1000) (local.get $req-in-body-r))
      (i32.store offset=12 (i32.const 0x1000) (local.get $req-out-body-w))
      (i32.store offset=16 (i32.const 0x1000) (local.get $req-out-trailers-w))
      (i32.store offset=20 (i32.const 0x1000) (local.get $subtask-h))
      (i32.store offset=24 (i32.const 0x1000) (i32.const 0))     ;; resp_in_body_r (later)
      (i32.store offset=28 (i32.const 0x1000) (i32.const 0))     ;; resp_out_body_w (later)
      (i32.store offset=32 (i32.const 0x1000) (i32.const 0))     ;; resp_out_trailers_w (later)
      (i32.store offset=36 (i32.const 0x1000) (i32.const 0))     ;; (reserved)
      (i32.store offset=40 (i32.const 0x1000) (local.get $ws))
      (i32.store offset=44 (i32.const 0x1000) (i32.const 0))     ;; req_echo_count
      (i32.store offset=48 (i32.const 0x1000) (i32.const 0))     ;; resp_echo_count

      ;; --- 6. Drive — starts req-side pump immediately ---
      (call $drive (i32.const 0x1000) (i32.const 0) (i32.const 0) (i32.const 0) (i32.const 0)))

    ;; -----------------------------------------------------------------
    ;; handle-cb(event, handle, rc) -> i32
    ;; -----------------------------------------------------------------
    (func $handle-cb (export "handle-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (call $drive (call $ctx-get-0) (local.get $event) (local.get $handle) (local.get $rc) (i32.const 1))))

  ;; ===================================================================
  ;; Wire imports + instantiate
  ;; ===================================================================
  (core instance $host-exports
    (export "memory"                    (memory $mem))
    (export "fields-new"                (func $fields-new-core))
    (export "response-new"              (func $response-new-core))
    (export "request-new"               (func $request-new-core))
    (export "req-consume-body"          (func $req-consume-body-core))
    (export "resp-consume-body"         (func $resp-consume-body-core))
    (export "upstream-handle"           (func $upstream-handle-core))

    (export "stream-new-u8"             (func $stream-new-u8))
    (export "stream-read-u8"            (func $stream-read-u8))
    (export "stream-write-u8"           (func $stream-write-u8))
    (export "stream-drop-readable-u8"   (func $stream-drop-readable-u8))
    (export "stream-drop-writable-u8"   (func $stream-drop-writable-u8))

    (export "future-new-rt"             (func $future-new-rt))
    (export "future-write-rt"           (func $future-write-rt))
    (export "future-drop-writable-rt"   (func $future-drop-writable-rt))
    (export "future-drop-readable-rt"   (func $future-drop-readable-rt))

    (export "future-new-rcu"            (func $future-new-rcu))
    (export "future-write-rcu"          (func $future-write-rcu))
    (export "future-drop-writable-rcu"  (func $future-drop-writable-rcu))
    (export "future-drop-readable-rcu"  (func $future-drop-readable-rcu))

    (export "ws-new"                    (func $ws-new))
    (export "ws-drop"                   (func $ws-drop))
    (export "waitable-join"             (func $waitable-join))
    (export "subtask-drop"              (func $subtask-drop))

    (export "ctx-get-0"                 (func $ctx-get-0))
    (export "ctx-set-0"                 (func $ctx-set-0))

    (export "task-return"               (func $task-return-core)))

  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))))
  (alias core export $core "handle-start" (core func $handle-start-core))
  (alias core export $core "handle-cb"    (core func $handle-cb-core))

  ;; ===================================================================
  ;; Async-lift wasi:http/handler.handle (callback form)
  ;; ===================================================================
  (type $handle-func
    (func async (param "request" (own $request)) (result $handler-result)))
  (func $handle (type $handle-func)
    (canon lift (core func $handle-start-core) async
      (callback $handle-cb-core) (memory $mem)))

  ;; Typed instance type for the wasi:http/handler export — see comment in
  ;; server-impl-p3.wat. Re-exporting `request`/`response`/`error-code` from
  ;; the handler instance (via outer aliases) is required for WAC compose to
  ;; match resource identity against the importer's `wasi:http/types`.
  (type $handler-iface (instance
    (alias outer $server-fwd-p3-wat $request    (type))                ;; idx 0
    (export "request"    (type (eq 0)))                                ;; idx 1
    (alias outer $server-fwd-p3-wat $response   (type))                ;; idx 2
    (export "response"   (type (eq 2)))                                ;; idx 3
    (alias outer $server-fwd-p3-wat $error-code (type))                ;; idx 4
    (export "error-code" (type (eq 4)))                                ;; idx 5
    (type (own 1))                                                     ;; idx 6
    (type (own 3))                                                     ;; idx 7
    (type (result 7 (error 5)))                                        ;; idx 8
    (type (func async (param "request" 6) (result 8)))                 ;; idx 9
    (export "handle" (func (type 9)))                                  ;; idx 10
  ))

  (instance $handler-inst
    (export "request"    (type $request))
    (export "response"   (type $response))
    (export "error-code" (type $error-code))
    (export "handle"     (func $handle))
  )
  (export "wasi:http/handler@0.3.0-rc-2026-03-15"
    (instance $handler-inst)
    (instance (type $handler-iface))))
