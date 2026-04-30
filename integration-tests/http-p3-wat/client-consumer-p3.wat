;; Hand-written component-model WAT — WASIp3 HTTP client/consumer (Phase 3).
;;
;; Imports:
;;   - `wasi:http/types@0.3.0-rc-2026-03-15`        — request/response types
;;   - `wasi:http/handler@0.3.0-rc-2026-03-15`      — upstream handler.handle
;;   - `jsco:test/sink@0.1.0`                       — test side-channel
;;       (chunk(data: list<u8>))                    — sync host import
;;
;; Exports:
;;   - `jsco:test/runner@0.1.0`                     — test entry point
;;       (run() async -> result<_, error-code>)
;;
;; Behaviour (Phase 3 streaming-chunks pattern, plan §2):
;;   1. Build outbound request: fields.new + stream.new<u8> + future.new<rt>;
;;      request.new(headers, some(body_r), trailers_r, none-options).
;;   2. Issue async upstream.handle(req) — subtask runs concurrently.
;;   3. Pump 4 body chunks into the request body stream:
;;        chunk1 = "hello" (5 bytes)
;;        chunk2 = 32-byte pattern (0x42 fill)
;;        chunk3 = "world" (5 bytes)
;;        chunk4 = 2 MiB of zeros (64 × 32 KiB writes)
;;   4. Drop body writable; future.write Ok(none) trailers; drop trailers writable.
;;   5. Wait for upstream subtask RETURNED. Read response handle from retptr.
;;   6. response.consume-body(resp, rcu) → (resp_body_r, resp_trailers_r);
;;      drop resp_trailers_r.
;;   7. Drain resp_body_r in 32 KiB chunks. On each COMPLETED+count call
;;      `sink.chunk(buf, count)`. On DROPPED → finalize.
;;   8. ws-drop; task.return(Ok); EXIT.
;;
;; All async ops use the callback form of async-lift; no JSPI.

(component $client-consumer-p3-wat

  ;; ===================================================================
  ;; Component-level shared types
  ;; ===================================================================

  (type $error-code (variant (case "internal-error")))
  (type $stream-u8 (stream u8))
  (type $result-unit (result (error $error-code)))
  (type $future-result-unit (future $result-unit))

  ;; ===================================================================
  ;; Imported wasi:http/types instance type
  ;; ===================================================================
  (type $http-types-iface (instance
    (export "fields"          (type (sub resource)))            ;; idx 0
    (export "request"         (type (sub resource)))            ;; idx 1
    (export "response"        (type (sub resource)))            ;; idx 2
    (export "request-options" (type (sub resource)))            ;; idx 3

    (type (variant (case "internal-error")))                    ;; idx 4
    (export "error-code" (type (eq 4)))                         ;; idx 5

    (type (own 0))                                              ;; idx 6  = own<fields>
    (type (option 6))                                           ;; idx 7  = option<own<fields>>
    (type (stream u8))                                          ;; idx 8  = stream<u8>
    (type (result (error 5)))                                   ;; idx 9  = result<_, error-code>
    (type (future 9))                                           ;; idx 10 = future<rcu>
    (type (result 7 (error 5)))                                 ;; idx 11 = result<option<trailers>, error-code>
    (type (future 11))                                          ;; idx 12 = future<rt>
    (type (option 8))                                           ;; idx 13 = option<stream<u8>>
    (type (own 2))                                              ;; idx 14 = own<response>
    (type (tuple 14 10))                                        ;; idx 15 = tuple<own<response>, future<rcu>>
    (type (own 1))                                              ;; idx 16 = own<request>
    (type (tuple 8 12))                                         ;; idx 17 = tuple<stream<u8>, future<rt>>
    (type (own 3))                                              ;; idx 18 = own<request-options>
    (type (option 18))                                          ;; idx 19 = option<own<request-options>>
    (type (tuple 16 10))                                        ;; idx 20 = tuple<own<request>, future<rcu>>

    ;; idx 21: fields.new() -> own<fields>
    (type (func (result 6)))
    (export "[constructor]fields" (func (type 21)))

    ;; idx 22: response.new(headers, contents, trailers) -> tuple<own<response>, future<rcu>>
    (type (func
      (param "headers"  6)
      (param "contents" 13)
      (param "trailers" 12)
      (result 15)))
    (export "[static]response.new" (func (type 22)))

    ;; idx 23: request.new(headers, contents, trailers, options) -> tuple<own<request>, future<rcu>>
    (type (func
      (param "headers"  6)
      (param "contents" 13)
      (param "trailers" 12)
      (param "options"  19)
      (result 20)))
    (export "[static]request.new" (func (type 23)))

    ;; idx 24: request.consume-body(this, res) -> tuple<stream<u8>, future<rt>>
    (type (func
      (param "this" 16)
      (param "res"  10)
      (result 17)))
    (export "[static]request.consume-body" (func (type 24)))

    ;; idx 25: response.consume-body(this, res) -> tuple<stream<u8>, future<rt>>
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
  (type $run-result (result (error $error-code)))

  ;; ===================================================================
  ;; Imported upstream wasi:http/handler instance type
  ;; ===================================================================
  (type $upstream-handler-iface (instance
    (alias outer $client-consumer-p3-wat $request  (type))      ;; idx 0
    (export "request" (type (eq 0)))                            ;; idx 1
    (alias outer $client-consumer-p3-wat $response (type))      ;; idx 2
    (export "response" (type (eq 2)))                           ;; idx 3
    (type (variant (case "internal-error")))                    ;; idx 4
    (export "error-code" (type (eq 4)))                         ;; idx 5
    (type (own 1))                                              ;; idx 6 = own<request>
    (type (own 3))                                              ;; idx 7 = own<response>
    (type (result 7 (error 5)))                                 ;; idx 8 = result<own<response>, error-code>

    (type (func async (param "request" 6) (result 8)))          ;; idx 9
    (export "handle" (func (type 9)))
  ))
  (import "wasi:http/handler@0.3.0-rc-2026-03-15"
          (instance $upstream (type $upstream-handler-iface)))

  ;; ===================================================================
  ;; Imported jsco:test/sink instance type
  ;; ===================================================================
  (type $sink-iface (instance
    (type (list u8))                                            ;; idx 0
    (type (func (param "data" 0)))                              ;; idx 1
    (export "chunk" (func (type 1)))
  ))
  (import "jsco:test/sink@0.1.0"
          (instance $sink (type $sink-iface)))

  ;; ===================================================================
  ;; Linear memory
  ;; ===================================================================
  ;;
  ;; Layout:
  ;;   0x0000             reserved (small static buffers)
  ;;   0x0010 .. 0x001B   trailers Ok(none) buffer (12 bytes)
  ;;   0x0020 .. 0x0027   request.new retbuf (8 bytes)
  ;;   0x0028 .. 0x002F   resp consume-body retbuf (8 bytes)
  ;;   0x0030             rcu Ok(()) buffer (1 byte = 0)
  ;;   0x0040 .. 0x0047   upstream handler async-lower retbuf
  ;;                          offset 0: result disc (i32)
  ;;                          offset 4: own<response> handle (i32) on Ok
  ;;   0x1000 ..          per-task state struct
  ;;   0x2000 .. 0x2004   chunk1  "hello" (5 bytes)
  ;;   0x2010 .. 0x202F   chunk2  32-byte 0x42 pattern
  ;;   0x2040 .. 0x2044   chunk3  "world" (5 bytes)
  ;;   0x4000 .. 0xBFFF   response read buffer (32 KiB)
  ;;   0x10000 .. 0x17FFF chunk4 source: 32 KiB of zeros (memory-init zero)
  ;;
  ;; Memory size = 4 pages (256 KiB). Sufficient.

  (core module $mem-module
    (memory (export "memory") 4)
    (data (i32.const 0x2000) "hello")
    (data (i32.const 0x2010) "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
    (data (i32.const 0x2040) "world")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; ===================================================================
  ;; Canon lower of imported instance functions
  ;; ===================================================================

  (alias export $http-types "[constructor]fields" (func $fields-new-comp))
  (core func $fields-new-core (canon lower (func $fields-new-comp)))

  (alias export $http-types "[static]request.new" (func $request-new-comp))
  (core func $request-new-core (canon lower (func $request-new-comp) (memory $mem)))

  (alias export $http-types "[static]response.consume-body" (func $resp-consume-body-comp))
  (core func $resp-consume-body-core (canon lower (func $resp-consume-body-comp) (memory $mem)))

  (alias export $upstream "handle" (func $upstream-handle-comp))
  (core func $upstream-handle-core
    (canon lower (func $upstream-handle-comp) async (memory $mem)))

  (alias export $sink "chunk" (func $sink-chunk-comp))
  (core func $sink-chunk-core (canon lower (func $sink-chunk-comp) (memory $mem)))

  ;; ===================================================================
  ;; Canon stream / future / waitable / subtask / context / task ops
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

  (core func $task-return-core (canon task.return (result $run-result) (memory $mem)))

  ;; ===================================================================
  ;; Core implementation module
  ;; ===================================================================
  (core module $impl
    (import "host" "memory"               (memory 0))
    (import "host" "fields-new"           (func $fields-new           (result i32)))
    (import "host" "request-new"          (func $request-new          (param i32 i32 i32 i32 i32 i32 i32)))
    (import "host" "resp-consume-body"    (func $resp-consume-body    (param i32 i32 i32)))
    (import "host" "upstream-handle"      (func $upstream-handle      (param i32 i32) (result i32)))
    (import "host" "sink-chunk"           (func $sink-chunk           (param i32 i32)))

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
    ;; CONCURRENT driver — interleaves req-write and resp-read.
    ;;
    ;; State at 0x1000 (i32 fields):
    ;;   +0   req_phase
    ;;   +4   resp_phase
    ;;   +8   body_w                (req body writable; 0 once dropped)
    ;;   +12  trailers_w            (req trailers writable; 0 once dropped)
    ;;   +16  subtask_h             (upstream.handle subtask; 0 once dropped)
    ;;   +20  resp_body_r           (resp body readable; 0 until obtained / dropped)
    ;;   +24  ws                    (waitable-set handle)
    ;;   +28  chunk4_remaining      (countdown 64 → 0 for 32 KiB body chunks)
    ;;   +32  outcome               (0 = Ok, 1 = Err)
    ;;
    ;; req_phase:
    ;;   0  write chunk1 "hello" (5 bytes)
    ;;   1  write chunk2 32-byte pattern
    ;;   2  write chunk3 "world" (5 bytes)
    ;;   3  write 32 KiB zeros; decrement counter; loop
    ;;   4  future.write Ok(none) trailers
    ;;   5  req side fully done (body_w + trailers_w dropped)
    ;;
    ;; resp_phase:
    ;;   0  awaiting subtask RETURNED (no resp_body_r yet)
    ;;   1  reading resp body
    ;;   2  resp side fully done (resp_body_r dropped or never opened)
    ;;
    ;; Both sides are pumped on every drive() invocation. The only sequencing
    ;; constraint is "resp_phase=0 → 1" happens when the subtask event fires
    ;; (we then call response.consume-body and start reading). Otherwise req
    ;; and resp progress independently, draining each side until the runtime
    ;; says BLOCKED, then yielding via WAIT|(ws<<4) with the relevant
    ;; waitables joined.
    ;; -----------------------------------------------------------------

    (func $rearm (param $h i32) (param $ws i32)
      (call $waitable-join (local.get $h) (i32.const 0))
      (call $waitable-join (local.get $h) (local.get $ws)))

    ;; -----------------------------------------------------------------
    ;; $issue-body-write — call stream.write with the chunk for $phase.
    ;; Returns the runtime rc (BLOCKED=-1 or (count<<4)|status).
    ;; -----------------------------------------------------------------
    (func $issue-body-write (param $state i32) (param $phase i32) (result i32)
      (local $body-w i32)
      (local.set $body-w (i32.load offset=8 (local.get $state)))
      (if (i32.eqz (local.get $phase))
        (then (return (call $stream-write-u8
          (local.get $body-w) (i32.const 0x2000) (i32.const 5)))))
      (if (i32.eq (local.get $phase) (i32.const 1))
        (then (return (call $stream-write-u8
          (local.get $body-w) (i32.const 0x2010) (i32.const 32)))))
      (if (i32.eq (local.get $phase) (i32.const 2))
        (then (return (call $stream-write-u8
          (local.get $body-w) (i32.const 0x2040) (i32.const 5)))))
      ;; phase 3: 32 KiB of zeros
      (call $stream-write-u8
        (local.get $body-w) (i32.const 0x10000) (i32.const 0x8000)))

    ;; -----------------------------------------------------------------
    ;; $advance-body-phase — called after a stream.write COMPLETED with
    ;; count > 0. Bumps the body phase; on chunk4 exhaustion drops body_w
    ;; and moves to phase 4 (trailers).
    ;; -----------------------------------------------------------------
    (func $advance-body-phase (param $state i32)
      (local $phase i32)
      (local.set $phase (i32.load offset=0 (local.get $state)))
      (if (i32.lt_u (local.get $phase) (i32.const 3))
        (then
          (i32.store offset=0 (local.get $state)
            (i32.add (local.get $phase) (i32.const 1)))
          (return)))
      ;; phase == 3: chunk4 loop
      (i32.store offset=28 (local.get $state)
        (i32.sub (i32.load offset=28 (local.get $state)) (i32.const 1)))
      (if (i32.eqz (i32.load offset=28 (local.get $state)))
        (then
          (call $stream-drop-writable-u8 (i32.load offset=8 (local.get $state)))
          (i32.store offset=8 (local.get $state) (i32.const 0))
          (i32.store offset=0 (local.get $state) (i32.const 4)))))

    ;; -----------------------------------------------------------------
    ;; $abort-req-side — server-side reader dropped early. Drop whatever
    ;; req-side writables we still hold and move to req_phase=5.
    ;; -----------------------------------------------------------------
    (func $abort-req-side (param $state i32)
      (if (i32.ne (i32.load offset=8 (local.get $state)) (i32.const 0))
        (then
          (call $stream-drop-writable-u8 (i32.load offset=8 (local.get $state)))
          (i32.store offset=8 (local.get $state) (i32.const 0))))
      (if (i32.ne (i32.load offset=12 (local.get $state)) (i32.const 0))
        (then
          (call $future-drop-writable-rt (i32.load offset=12 (local.get $state)))
          (i32.store offset=12 (local.get $state) (i32.const 0))))
      (i32.store offset=0 (local.get $state) (i32.const 5)))

    ;; -----------------------------------------------------------------
    ;; $pump-req — issue req-side ops until BLOCKED or req_phase==5.
    ;; On BLOCKED, rearms the relevant writable (body_w or trailers_w).
    ;; -----------------------------------------------------------------
    (func $pump-req (param $state i32) (param $ws i32)
      (local $phase i32)
      (local $rc i32)
      (local $count i32)

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=0 (local.get $state)))

          ;; req fully done
          (if (i32.eq (local.get $phase) (i32.const 5))
            (then (br $exit)))

          ;; Issue current op.
          (if (i32.lt_u (local.get $phase) (i32.const 4))
            (then
              (local.set $rc
                (call $issue-body-write (local.get $state) (local.get $phase))))
            (else
              ;; phase == 4: future.write trailers
              (local.set $rc
                (call $future-write-rt
                  (i32.load offset=12 (local.get $state))
                  (i32.const 0x10)))))

          ;; BLOCKED? Rearm and exit.
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              (if (i32.lt_u (local.get $phase) (i32.const 4))
                (then
                  (call $rearm
                    (i32.load offset=8 (local.get $state))
                    (local.get $ws)))
                (else
                  (call $rearm
                    (i32.load offset=12 (local.get $state))
                    (local.get $ws))))
              (br $exit)))

          ;; DROPPED? Abort req side.
          (if (i32.eq (i32.and (local.get $rc) (i32.const 0xF)) (i32.const 1))
            (then
              (call $abort-req-side (local.get $state))
              (br $exit)))

          ;; COMPLETED.
          (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
          (if (i32.lt_u (local.get $phase) (i32.const 4))
            (then
              ;; stream.write — sync completion always has count > 0
              ;; (jsco runtime never returns count=0 with COMPLETED on a
              ;; sync stream.write; that pattern is only for BLOCKED-resume
              ;; events delivered via the callback path).
              (if (i32.gt_u (local.get $count) (i32.const 0))
                (then (call $advance-body-phase (local.get $state)))))
            (else
              ;; phase 4: future.write — drop trailers writable, req side done.
              (call $future-drop-writable-rt
                (i32.load offset=12 (local.get $state)))
              (i32.store offset=12 (local.get $state) (i32.const 0))
              (i32.store offset=0  (local.get $state) (i32.const 5))))

          (br $L))))

    ;; -----------------------------------------------------------------
    ;; $pump-resp — issue stream.read on resp_body_r until BLOCKED or
    ;; resp_phase becomes 2. No-op when resp_phase != 1.
    ;; -----------------------------------------------------------------
    (func $pump-resp (param $state i32) (param $ws i32)
      (local $phase i32)
      (local $rc i32)
      (local $status i32)
      (local $count i32)

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=4 (local.get $state)))

          ;; Only pump while reading.
          (if (i32.ne (local.get $phase) (i32.const 1))
            (then (br $exit)))

          (local.set $rc (call $stream-read-u8
            (i32.load offset=20 (local.get $state))
            (i32.const 0x4000)
            (i32.const 0x8000)))

          ;; BLOCKED?
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              (call $rearm
                (i32.load offset=20 (local.get $state))
                (local.get $ws))
              (br $exit)))

          (local.set $status (i32.and (local.get $rc) (i32.const 0xF)))
          (local.set $count  (i32.shr_u (local.get $rc) (i32.const 4)))

          ;; DROPPED → resp side done.
          (if (i32.eq (local.get $status) (i32.const 1))
            (then
              (call $stream-drop-readable-u8
                (i32.load offset=20 (local.get $state)))
              (i32.store offset=20 (local.get $state) (i32.const 0))
              (i32.store offset=4  (local.get $state) (i32.const 2))
              (br $exit)))

          ;; COMPLETED.
          (if (i32.gt_u (local.get $count) (i32.const 0))
            (then
              (call $sink-chunk (i32.const 0x4000) (local.get $count))
              (br $L)))

          ;; count == 0 with COMPLETED — defensively rearm and yield.
          (call $rearm
            (i32.load offset=20 (local.get $state))
            (local.get $ws))
          (br $exit))))

    ;; -----------------------------------------------------------------
    ;; $on-subtask-returned — subtask transitioned to RETURNED. Inspect
    ;; the result at retbuf 0x40, drop the subtask, and (on Ok) call
    ;; response.consume-body to obtain resp_body_r and start reading.
    ;; -----------------------------------------------------------------
    (func $on-subtask-returned (param $state i32)
      (local $stream-pair i64)
      (local $rcu-r i32) (local $rcu-w i32)

      (call $subtask-drop (i32.load offset=16 (local.get $state)))
      (i32.store offset=16 (local.get $state) (i32.const 0))

      ;; Err? Mark and skip resp reading.
      (if (i32.ne (i32.load (i32.const 0x40)) (i32.const 0))
        (then
          (i32.store offset=32 (local.get $state) (i32.const 1))
          (i32.store offset=4  (local.get $state) (i32.const 2))
          (return)))

      ;; Build rcu future for consume-body.
      (local.set $stream-pair (call $future-new-rcu))
      (local.set $rcu-r (i32.wrap_i64 (local.get $stream-pair)))
      (local.set $rcu-w
        (i32.wrap_i64 (i64.shr_u (local.get $stream-pair) (i64.const 32))))
      (drop (call $future-write-rcu (local.get $rcu-w) (i32.const 0x30)))
      (call $future-drop-writable-rcu (local.get $rcu-w))

      ;; consume-body(resp_handle, rcu_r) → (resp_body_r, resp_trailers_r) at 0x28.
      (call $resp-consume-body
        (i32.load (i32.const 0x44))
        (local.get $rcu-r)
        (i32.const 0x28))

      (i32.store offset=20 (local.get $state) (i32.load (i32.const 0x28)))
      (call $future-drop-readable-rt (i32.load (i32.const 0x2C)))

      ;; Start reading.
      (i32.store offset=4 (local.get $state) (i32.const 1)))

    ;; -----------------------------------------------------------------
    ;; $drive — top-level scheduler.
    ;;
    ;; If $post=1, dispatch the incoming event by $event:
    ;;   EVENT_SUBTASK=1       → on-subtask-returned
    ;;   EVENT_STREAM_READ=2   → handle resp body read result
    ;;   EVENT_STREAM_WRITE=3  → handle req body write result
    ;;   EVENT_FUTURE_WRITE=5  → trailers write completed (advance to phase 5)
    ;;
    ;; Then pump both sides. If both are done, finalize and EXIT. Otherwise
    ;; save state and return WAIT|(ws<<4) with the relevant waitables joined
    ;; (subtask_h was joined once at run-start; body_w / trailers_w / 
    ;; resp_body_r are rearmed by pump-* on BLOCKED).
    ;; -----------------------------------------------------------------
    (func $drive (param $state i32) (param $event i32) (param $rc i32) (param $post i32) (result i32)
      (local $ws i32)
      (local $count i32)

      (local.set $ws (i32.load offset=24 (local.get $state)))

      (if (local.get $post)
        (then
          (block $dispatched
            ;; EVENT_STREAM_WRITE = 3 → body_w
            (if (i32.eq (local.get $event) (i32.const 3))
              (then
                ;; DROPPED?
                (if (i32.eq (i32.and (local.get $rc) (i32.const 0xF)) (i32.const 1))
                  (then
                    (call $abort-req-side (local.get $state))
                    (br $dispatched)))
                ;; COMPLETED with count > 0 → advance; count == 0 (BLOCKED-resume) → don't.
                (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
                (if (i32.gt_u (local.get $count) (i32.const 0))
                  (then (call $advance-body-phase (local.get $state))))
                (br $dispatched)))

            ;; EVENT_FUTURE_WRITE = 5 → trailers_w (rare; futures usually sync)
            (if (i32.eq (local.get $event) (i32.const 5))
              (then
                (if (i32.ne (i32.load offset=12 (local.get $state)) (i32.const 0))
                  (then
                    (call $future-drop-writable-rt
                      (i32.load offset=12 (local.get $state)))
                    (i32.store offset=12 (local.get $state) (i32.const 0))))
                (i32.store offset=0 (local.get $state) (i32.const 5))
                (br $dispatched)))

            ;; EVENT_SUBTASK = 1
            (if (i32.eq (local.get $event) (i32.const 1))
              (then
                (call $on-subtask-returned (local.get $state))
                (br $dispatched)))

            ;; EVENT_STREAM_READ = 2 → resp_body_r
            (if (i32.eq (local.get $event) (i32.const 2))
              (then
                (if (i32.eq (i32.and (local.get $rc) (i32.const 0xF)) (i32.const 1))
                  (then
                    (call $stream-drop-readable-u8
                      (i32.load offset=20 (local.get $state)))
                    (i32.store offset=20 (local.get $state) (i32.const 0))
                    (i32.store offset=4  (local.get $state) (i32.const 2))
                    (br $dispatched)))
                (local.set $count (i32.shr_u (local.get $rc) (i32.const 4)))
                (if (i32.gt_u (local.get $count) (i32.const 0))
                  (then (call $sink-chunk (i32.const 0x4000) (local.get $count))))
                (br $dispatched)))
            ;; (Unknown event — fall through.)
          )))

      ;; Pump both sides. Each may issue, advance, or rearm.
      (call $pump-req  (local.get $state) (local.get $ws))
      (call $pump-resp (local.get $state) (local.get $ws))

      ;; Finalize?
      (if (i32.and
            (i32.eq (i32.load offset=0 (local.get $state)) (i32.const 5))
            (i32.eq (i32.load offset=4 (local.get $state)) (i32.const 2)))
        (then
          (call $ws-drop (local.get $ws))
          (call $task-return
            (i32.load offset=32 (local.get $state))
            (i32.const 0))
          (return (i32.const 0))))   ;; EXIT

      ;; Save state and yield.
      (call $ctx-set-0 (local.get $state))
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4))))

    ;; -----------------------------------------------------------------
    ;; run-start() -> i32
    ;; -----------------------------------------------------------------
    (func $run-start (export "run-start") (result i32)
      (local $headers i32)
      (local $body-pair i64) (local $trailers-pair i64)
      (local $body-r i32) (local $body-w i32)
      (local $trailers-r i32) (local $trailers-w i32)
      (local $req-handle i32) (local $req-completion-r i32)
      (local $upstream-rc i32)
      (local $subtask-state i32) (local $subtask-h i32)
      (local $ws i32)

      ;; --- 1. Build outbound request ---
      (local.set $headers (call $fields-new))

      (local.set $body-pair (call $stream-new-u8))
      (local.set $body-r (i32.wrap_i64 (local.get $body-pair)))
      (local.set $body-w (i32.wrap_i64 (i64.shr_u (local.get $body-pair) (i64.const 32))))

      (local.set $trailers-pair (call $future-new-rt))
      (local.set $trailers-r (i32.wrap_i64 (local.get $trailers-pair)))
      (local.set $trailers-w (i32.wrap_i64 (i64.shr_u (local.get $trailers-pair) (i64.const 32))))

      ;; request.new(headers, some(body_r), trailers_r, none-options) → 0x20
      (call $request-new
        (local.get $headers)
        (i32.const 1)
        (local.get $body-r)
        (local.get $trailers-r)
        (i32.const 0)
        (i32.const 0)
        (i32.const 0x20))
      (local.set $req-handle       (i32.load (i32.const 0x20)))
      (local.set $req-completion-r (i32.load (i32.const 0x24)))
      (call $future-drop-readable-rcu (local.get $req-completion-r))

      ;; --- 2. Issue async upstream.handle(req, retptr=0x40) ---
      (local.set $upstream-rc (call $upstream-handle (local.get $req-handle) (i32.const 0x40)))
      (local.set $subtask-state (i32.and (local.get $upstream-rc) (i32.const 0xF)))
      (local.set $subtask-h     (i32.shr_u (local.get $upstream-rc) (i32.const 4)))
      (if (i32.eq (local.get $subtask-state) (i32.const 2))
        (then (local.set $subtask-h (i32.const 0))))
      (if (i32.eqz (local.get $subtask-h))
        (then (unreachable)))

      ;; --- 3. Allocate ws and seed initial state ---
      (local.set $ws (call $ws-new))

      ;; New state layout:
      ;;   +0  req_phase=0     +4  resp_phase=0
      ;;   +8  body_w          +12 trailers_w
      ;;   +16 subtask_h       +20 resp_body_r=0 (set later)
      ;;   +24 ws              +28 chunk4_remaining=64
      ;;   +32 outcome=0
      (i32.store offset=0  (i32.const 0x1000) (i32.const 0))
      (i32.store offset=4  (i32.const 0x1000) (i32.const 0))
      (i32.store offset=8  (i32.const 0x1000) (local.get $body-w))
      (i32.store offset=12 (i32.const 0x1000) (local.get $trailers-w))
      (i32.store offset=16 (i32.const 0x1000) (local.get $subtask-h))
      (i32.store offset=20 (i32.const 0x1000) (i32.const 0))
      (i32.store offset=24 (i32.const 0x1000) (local.get $ws))
      (i32.store offset=28 (i32.const 0x1000) (i32.const 64))          ;; chunk4_remaining = 64 (× 32 KiB = 2 MiB)
      (i32.store offset=32 (i32.const 0x1000) (i32.const 0))           ;; outcome = Ok

      ;; Join subtask_h to ws so we'll be notified of RETURNED while
      ;; concurrently driving req-write / resp-read.
      (call $waitable-join (local.get $subtask-h) (local.get $ws))

      (call $drive (i32.const 0x1000) (i32.const 0) (i32.const 0) (i32.const 0)))

    ;; -----------------------------------------------------------------
    ;; run-cb(event, handle, rc) -> i32
    ;; -----------------------------------------------------------------
    (func $run-cb (export "run-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (call $drive (call $ctx-get-0) (local.get $event) (local.get $rc) (i32.const 1))))

  ;; ===================================================================
  ;; Wire imports + instantiate
  ;; ===================================================================
  (core instance $host-exports
    (export "memory"                    (memory $mem))
    (export "fields-new"                (func $fields-new-core))
    (export "request-new"               (func $request-new-core))
    (export "resp-consume-body"         (func $resp-consume-body-core))
    (export "upstream-handle"           (func $upstream-handle-core))
    (export "sink-chunk"                (func $sink-chunk-core))

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
  (alias core export $core "run-start" (core func $run-start-core))
  (alias core export $core "run-cb"    (core func $run-cb-core))

  ;; ===================================================================
  ;; Async-lift jsco:test/runner.run (callback form)
  ;; ===================================================================
  (type $run-func
    (func async (result $run-result)))
  (func $run (type $run-func)
    (canon lift (core func $run-start-core) async
      (callback $run-cb-core) (memory $mem)))

  ;; ===================================================================
  ;; Typed export instance: jsco:test/runner@0.1.0
  ;; ===================================================================
  (type $runner-iface (instance
    (type (variant (case "internal-error")))                    ;; idx 0
    (export "error-code" (type (eq 0)))                         ;; idx 1
    (type (result (error 1)))                                   ;; idx 2 = result<_, error-code>
    (type (func async (result 2)))                              ;; idx 3
    (export "run" (func (type 3)))
  ))
  (instance $runner-inst
    (export "error-code" (type $error-code))
    (export "run"        (func $run)))
  (export "jsco:test/runner@0.1.0"
    (instance $runner-inst)
    (instance (type $runner-iface)))
)
