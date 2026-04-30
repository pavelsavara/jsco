;; Hand-written component-model WAT — WASIp3 HTTP forwarder middleware (Phase 1.2).
;;
;; Imports `wasi:http/types@0.3.0-rc-2026-03-15` and an upstream
;; `wasi:http/handler@0.3.0-rc-2026-03-15`. Exports `wasi:http/handler` (downstream).
;;
;; Behaviour (consume + reconstruct):
;;   1. Allocate a `res` future for the inbound request, write Ok(()), drop writable.
;;   2. consume-body(req_in, rcu_in_r) → (req_in_body_r, req_in_trailers_r).
;;      Drop req_in_trailers_r (we do not propagate trailers in this phase).
;;   3. Build a brand-new outbound request with our own body+trailers stream/future
;;      pairs: request.new(headers, some(req_out_body_r), req_out_trailers_r, none-options).
;;      Drop the request transmit-completion future readable.
;;   4. Async-lower `handler.handle(out_req, retptr)` → returns state|(handle<<4).
;;      The result will be spilled to `retptr` when the subtask resolves.
;;   5. Pump req_in_body → req_out_body chunk-by-chunk; on EOF write "-fwd-" then drop
;;      out body writable. Write Ok(none) to req_out_trailers_w; drop writable.
;;   6. Wait for the upstream subtask to RETURN; read resp_in handle from retptr.
;;   7. consume-body on the inbound response → (resp_in_body_r, resp_in_trailers_r).
;;      Drop resp_in_trailers_r.
;;   8. Build downstream response: fields.new + body+trailers pairs.
;;      response.new(headers, some(resp_out_body_r), resp_out_trailers_r).
;;      Drop response transmit-completion future readable.
;;   9. Pump resp_in_body → resp_out_body; on EOF write "-fwd-" then drop writable.
;;      Write Ok(none) to resp_out_trailers_w; drop writable.
;;  10. task.return(Ok(resp_out_handle)); EXIT.
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
  ;;   0x4000 .. 0xBFFF  chunk buffer (32 KiB)

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
  ;; Core implementation module
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
    ;; State struct at 0x1000 (offsets):
    ;;   +0   phase            i32
    ;;   +4   req_in_body_r    i32
    ;;   +8   req_out_body_w   i32
    ;;   +12  req_out_trailers_w i32
    ;;   +16  resp_in_body_r   i32 (filled at phase 6)
    ;;   +20  resp_out_body_w  i32 (filled at phase 7)
    ;;   +24  resp_out_trailers_w i32 (filled at phase 7)
    ;;   +28  resp_out_handle  i32 (filled at phase 7)
    ;;   +32  ws               i32
    ;;   +36  read_count       i32
    ;;   +40  subtask_h        i32
    ;;
    ;; Phases:
    ;;   0 stream.read on req_in_body_r
    ;;   1 stream.write echo on req_out_body_w
    ;;   2 stream.write "-fwd-" on req_out_body_w (after EOF read)
    ;;   3 future.write Ok(none) on req_out_trailers_w
    ;;   4 wait for upstream subtask
    ;;   5 stream.read on resp_in_body_r
    ;;   6 stream.write echo on resp_out_body_w
    ;;   7 stream.write "-fwd-" on resp_out_body_w
    ;;   8 future.write Ok(none) on resp_out_trailers_w
    ;;   9 done — finalize, task.return(Ok), EXIT
    ;;  10 err finalize — ws-drop, task.return(Err(internal-error)), EXIT
    ;;
    ;; The transitions {phase 4 → 5} and {phase 6/7/8 setup} read additional
    ;; values out of memory (handler.handle retptr, response.new retbuf,
    ;; consume-body retbuf for the response). Those side-effecting transitions
    ;; happen in `$drive` between phase advances.
    ;; -----------------------------------------------------------------

    ;; Helper: re-arm a single waitable into ws (disjoin then rejoin).
    (func $rearm (param $h i32) (param $ws i32)
      (call $waitable-join (local.get $h) (i32.const 0))
      (call $waitable-join (local.get $h) (local.get $ws)))

    ;; -----------------------------------------------------------------
    ;; $drive(state_ptr, rc, post_event) -> i32
    ;; -----------------------------------------------------------------
    (func $drive (param $state i32) (param $rc i32) (param $post i32) (result i32)
      (local $phase i32)
      (local $ws i32)
      (local $handle i32)
      (local $count i32)
      (local $status-low i32)
      (local $tmp i32)
      (local $hdrs i32)
      (local $stream-pair i64)
      (local $future-pair i64)

      (local.set $ws (i32.load offset=32 (local.get $state)))

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=0 (local.get $state)))

          ;; ==================================================================
          ;; Process the just-completed event (post=1) and advance phase.
          ;; ==================================================================
          (if (local.get $post)
            (then
              (local.set $status-low (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count      (i32.shr_u (local.get $rc) (i32.const 4)))

              ;; ----- phase 0 (req_in read) -----
              (if (i32.eqz (local.get $phase))
                (then
                  (if (i32.eq (local.get $status-low) (i32.const 1))
                    (then (i32.store offset=0 (local.get $state) (i32.const 2)))   ;; EOF → write -fwd-
                    (else
                      (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then
                          (i32.store offset=36 (local.get $state) (local.get $count))
                          (i32.store offset=0  (local.get $state) (i32.const 1))))))))

              ;; ----- phase 1 (req_out write echo) -----
              (if (i32.eq (local.get $phase) (i32.const 1))
                (then
                  ;; Advance only when the write actually transferred bytes.
                  ;; BLOCKED-resume delivers count=0 → must NOT advance.
                  (if (i32.gt_u (local.get $count) (i32.const 0))
                    (then (i32.store offset=0 (local.get $state) (i32.const 0))))))

              ;; ----- phase 2 (req_out write "-fwd-") -----
              (if (i32.eq (local.get $phase) (i32.const 2))
                (then
                  (if (i32.gt_u (local.get $count) (i32.const 0))
                    (then
                      (call $stream-drop-writable-u8 (i32.load offset=8 (local.get $state)))
                      (i32.store offset=8 (local.get $state) (i32.const 0))
                      (i32.store offset=0 (local.get $state) (i32.const 3))))))

              ;; ----- phase 3 (req_out trailers write) -----
              (if (i32.eq (local.get $phase) (i32.const 3))
                (then
                  (call $future-drop-writable-rt (i32.load offset=12 (local.get $state)))
                  (i32.store offset=12 (local.get $state) (i32.const 0))
                  (i32.store offset=0  (local.get $state) (i32.const 4))))

              ;; ----- phase 4 (subtask wait) -----
              (if (i32.eq (local.get $phase) (i32.const 4))
                (then
                  (block $ph4
                  ;; rc holds subtask state (RETURNED=2). Drop subtask.
                  ;; The retptr at 0x40 has been filled with the spilled result.
                  (call $subtask-drop (i32.load offset=40 (local.get $state)))
                  (i32.store offset=40 (local.get $state) (i32.const 0))

                  ;; result disc at 0x40+0; if non-zero this is Err → propagate.
                  (if (i32.ne (i32.load (i32.const 0x40)) (i32.const 0))
                    (then
                      (i32.store offset=0 (local.get $state) (i32.const 10))
                      (br $ph4)))

                  ;; --- consume-body inbound response ---
                  ;; rcu future for resp consume-body
                  (local.set $stream-pair (call $future-new-rcu))
                  (drop (call $future-write-rcu
                    (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32)))
                    (i32.const 0x30)))
                  (call $future-drop-writable-rcu
                    (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32))))

                  ;; resp.consume-body(resp_in_handle, rcu_r) → retbuf 0x50
                  (call $resp-consume-body
                    (i32.load (i32.const 0x44))                   ;; upstream resp handle
                    (i32.wrap_i64 (local.get $stream-pair))       ;; rcu readable
                    (i32.const 0x50))
                  ;; resp_in_body_r → state+16; drop resp_in_trailers_r
                  (i32.store offset=16 (local.get $state) (i32.load (i32.const 0x50)))
                  (call $future-drop-readable-rt (i32.load (i32.const 0x54)))

                  ;; --- Build outbound response ---
                  (local.set $hdrs (call $fields-new))

                  (local.set $stream-pair (call $stream-new-u8))
                  ;; resp_out_body_r (low 32) consumed by response.new; resp_out_body_w (high 32) → state+20
                  (i32.store offset=20 (local.get $state)
                    (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32))))

                  (local.set $future-pair (call $future-new-rt))
                  ;; resp_out_trailers_r consumed by response.new; resp_out_trailers_w → state+24
                  (i32.store offset=24 (local.get $state)
                    (i32.wrap_i64 (i64.shr_u (local.get $future-pair) (i64.const 32))))

                  ;; response.new(headers, some(body_r), trailers_r) → retbuf 0x20
                  (call $response-new
                    (local.get $hdrs)
                    (i32.const 1)                                 ;; option<stream> some
                    (i32.wrap_i64 (local.get $stream-pair))       ;; resp_out_body_r
                    (i32.wrap_i64 (local.get $future-pair))       ;; resp_out_trailers_r
                    (i32.const 0x20))
                  (i32.store offset=28 (local.get $state) (i32.load (i32.const 0x20)))   ;; resp_out_handle
                  (call $future-drop-readable-rcu (i32.load (i32.const 0x24)))           ;; completion_r

                  (i32.store offset=0 (local.get $state) (i32.const 5)))))               ;; → phase 5

              ;; ----- phase 5 (resp_in read) -----
              (if (i32.eq (local.get $phase) (i32.const 5))
                (then
                  (if (i32.eq (local.get $status-low) (i32.const 1))
                    (then (i32.store offset=0 (local.get $state) (i32.const 7)))   ;; EOF → -fwd-
                    (else
                      (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then
                          (i32.store offset=36 (local.get $state) (local.get $count))
                          (i32.store offset=0  (local.get $state) (i32.const 6))))))))

              ;; ----- phase 6 (resp_out write echo) -----
              (if (i32.eq (local.get $phase) (i32.const 6))
                (then
                  (if (i32.gt_u (local.get $count) (i32.const 0))
                    (then (i32.store offset=0 (local.get $state) (i32.const 5))))))

              ;; ----- phase 7 (resp_out write -fwd-) -----
              (if (i32.eq (local.get $phase) (i32.const 7))
                (then
                  (if (i32.gt_u (local.get $count) (i32.const 0))
                    (then
                      (call $stream-drop-writable-u8 (i32.load offset=20 (local.get $state)))
                      (i32.store offset=20 (local.get $state) (i32.const 0))
                      (i32.store offset=0  (local.get $state) (i32.const 8))))))

              ;; ----- phase 8 (resp_out trailers write) -----
              (if (i32.eq (local.get $phase) (i32.const 8))
                (then
                  (call $future-drop-writable-rt (i32.load offset=24 (local.get $state)))
                  (i32.store offset=24 (local.get $state) (i32.const 0))
                  (i32.store offset=0  (local.get $state) (i32.const 9))))

              (local.set $post (i32.const 0))
              (local.set $phase (i32.load offset=0 (local.get $state)))))

          ;; ---- finalize Ok ----
          (if (i32.eq (local.get $phase) (i32.const 9))
            (then
              (call $ws-drop (local.get $ws))
              (call $task-return (i32.const 0) (i32.load offset=28 (local.get $state)))
              (br $exit)))

          ;; ---- finalize Err ----
          (if (i32.eq (local.get $phase) (i32.const 10))
            (then
              (call $ws-drop (local.get $ws))
              ;; Err(internal-error) — single case (disc=0).
              (call $task-return (i32.const 1) (i32.const 0))
              (br $exit)))

          ;; ==================================================================
          ;; Issue op for current phase.
          ;; ==================================================================
          (block $issued (result i32)
            (if (i32.eqz (local.get $phase))
              (then
                (br $issued (call $stream-read-u8
                  (i32.load offset=4 (local.get $state))
                  (i32.const 0x4000)
                  (i32.const 0x8000)))))
            (if (i32.eq (local.get $phase) (i32.const 1))
              (then
                (br $issued (call $stream-write-u8
                  (i32.load offset=8 (local.get $state))
                  (i32.const 0x4000)
                  (i32.load offset=36 (local.get $state))))))
            (if (i32.eq (local.get $phase) (i32.const 2))
              (then
                (br $issued (call $stream-write-u8
                  (i32.load offset=8 (local.get $state))
                  (i32.const 0)
                  (i32.const 5)))))
            (if (i32.eq (local.get $phase) (i32.const 3))
              (then
                (br $issued (call $future-write-rt
                  (i32.load offset=12 (local.get $state))
                  (i32.const 0x10)))))
            (if (i32.eq (local.get $phase) (i32.const 4))
              (then
                ;; subtask wait: nothing to issue, the subtask is already running.
                ;; We immediately fall through to BLOCKED with handle = subtask_h.
                (br $issued (i32.const -1))))
            (if (i32.eq (local.get $phase) (i32.const 5))
              (then
                (br $issued (call $stream-read-u8
                  (i32.load offset=16 (local.get $state))
                  (i32.const 0x4000)
                  (i32.const 0x8000)))))
            (if (i32.eq (local.get $phase) (i32.const 6))
              (then
                (br $issued (call $stream-write-u8
                  (i32.load offset=20 (local.get $state))
                  (i32.const 0x4000)
                  (i32.load offset=36 (local.get $state))))))
            (if (i32.eq (local.get $phase) (i32.const 7))
              (then
                (br $issued (call $stream-write-u8
                  (i32.load offset=20 (local.get $state))
                  (i32.const 0)
                  (i32.const 5)))))
            ;; phase 8: trailers
            (br $issued (call $future-write-rt
              (i32.load offset=24 (local.get $state))
              (i32.const 0x10))))
          (local.set $rc)

          ;; ---- BLOCKED? ----
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              ;; Look up handle by phase. Default = phase 0 (req_in_body_r).
              (local.set $handle (i32.load offset=4 (local.get $state)))
              (if (i32.eq (local.get $phase) (i32.const 1))
                (then (local.set $handle (i32.load offset=8  (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 2))
                (then (local.set $handle (i32.load offset=8  (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 3))
                (then (local.set $handle (i32.load offset=12 (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 4))
                (then (local.set $handle (i32.load offset=40 (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 5))
                (then (local.set $handle (i32.load offset=16 (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 6))
                (then (local.set $handle (i32.load offset=20 (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 7))
                (then (local.set $handle (i32.load offset=20 (local.get $state)))))
              (if (i32.eq (local.get $phase) (i32.const 8))
                (then (local.set $handle (i32.load offset=24 (local.get $state)))))

              (call $rearm (local.get $handle) (local.get $ws))
              (call $ctx-set-0 (local.get $state))
              (return (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4))))))

          ;; rc holds the synchronous result; loop with post_event=true.
          (local.set $post (i32.const 1))
          (br $L)))

      (i32.const 0))   ;; EXIT

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

      ;; If subtask completed synchronously (RETURNED=2), record handle=0; else save it.
      (if (i32.eq (local.get $subtask-state) (i32.const 2))
        (then (local.set $subtask-h (i32.const 0))))

      ;; --- 5. Allocate ws and seed initial state ---
      (local.set $ws (call $ws-new))

      (i32.store offset=0  (i32.const 0x1000) (i32.const 0))
      (i32.store offset=4  (i32.const 0x1000) (local.get $req-in-body-r))
      (i32.store offset=8  (i32.const 0x1000) (local.get $req-out-body-w))
      (i32.store offset=12 (i32.const 0x1000) (local.get $req-out-trailers-w))
      (i32.store offset=16 (i32.const 0x1000) (i32.const 0))   ;; resp_in_body_r (later)
      (i32.store offset=20 (i32.const 0x1000) (i32.const 0))   ;; resp_out_body_w (later)
      (i32.store offset=24 (i32.const 0x1000) (i32.const 0))   ;; resp_out_trailers_w (later)
      (i32.store offset=28 (i32.const 0x1000) (i32.const 0))   ;; resp_out_handle (later)
      (i32.store offset=32 (i32.const 0x1000) (local.get $ws))
      (i32.store offset=36 (i32.const 0x1000) (i32.const 0))   ;; read_count
      (i32.store offset=40 (i32.const 0x1000) (local.get $subtask-h))

      ;; If subtask returned synchronously, we'll need phase 4 to be a no-op. The
      ;; driver's phase-4 BLOCKED branch joins handle=0 to ws (no-op), but waiting
      ;; on an empty waitable-set is wrong. Special-case: skip directly to phase 5
      ;; via post-event with rc=0 (count=0, status=COMPLETED).
      ;; For Phase 1.2 (non-error path) we expect the upstream impl ALSO uses the
      ;; callback form — therefore it should NOT complete synchronously. Trap if it does.
      (if (i32.eqz (local.get $subtask-h))
        (then (unreachable)))

      (call $drive (i32.const 0x1000) (i32.const 0) (i32.const 0)))

    ;; -----------------------------------------------------------------
    ;; handle-cb(event, handle, rc) -> i32
    ;; -----------------------------------------------------------------
    (func $handle-cb (export "handle-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (call $drive (call $ctx-get-0) (local.get $rc) (i32.const 1))))

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
