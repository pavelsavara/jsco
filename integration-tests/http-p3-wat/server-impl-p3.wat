;; Hand-written component-model WAT — WASIp3 HTTP handler (Phase 1.1).
;;
;; Leaf "implementer" component for the HTTP P3 WAT integration suite.
;; Imports `wasi:http/types@0.3.0-rc-2026-03-15` and exports
;; `wasi:http/handler@0.3.0-rc-2026-03-15`.
;;
;; Behaviour:
;;   1. Allocate a `res` future of type `future<result<_, error-code>>`,
;;      write Ok(()) to it (1 byte = 0), drop the writable end. The host
;;      side of consume-body() will read this and resolve the request's
;;      completion promise as Ok(()).
;;   2. Call `request.consume-body(req, res)` to obtain
;;        - request body stream readable
;;        - request trailers future readable
;;   3. Allocate a fresh response: empty fields, body stream pair, trailers
;;      future pair. Build via `response.new(headers, some(body_r), trailers_r)`.
;;      Drop the response transmit-completion future (we don't track it).
;;   4. Pump request body → response body chunk-by-chunk, then append the
;;      literal "-handled-" (9 bytes), then drop response body writable.
;;   5. Write Ok(none) to the response trailers future and drop its writable.
;;      (Trailer propagation deferred to a later phase.)
;;   6. `task.return(Ok(resp_handle))` and EXIT.
;;
;; All async ops use the callback form of async-lift — the host never
;; relies on JSPI to suspend the wasm. The state machine uses ctx slot 0
;; to address a per-task struct in linear memory at 0x1000.

(component $server-impl-p3-wat

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
    ;; idx 0: fields, 1: request, 2: response (abstract resources)
    (export "fields"  (type (sub resource)))
    (export "request" (type (sub resource)))
    (export "response" (type (sub resource)))

    ;; idx 3: stub error-code; idx 4: error-code export
    (type (variant (case "internal-error")))
    (export "error-code" (type (eq 3)))

    ;; idx 5: own<fields>
    (type (own 0))
    ;; idx 6: option<own<fields>>           (= option<trailers>)
    (type (option 5))
    ;; idx 7: stream<u8>
    (type (stream u8))
    ;; idx 8: result<_, error-code>
    (type (result (error 4)))
    ;; idx 9: future<result<_, error-code>>
    (type (future 8))
    ;; idx 10: result<option<trailers>, error-code>
    (type (result 6 (error 4)))
    ;; idx 11: future<result<option<trailers>, error-code>>
    (type (future 10))
    ;; idx 12: option<stream<u8>>
    (type (option 7))
    ;; idx 13: own<response>
    (type (own 2))
    ;; idx 14: tuple<own<response>, future<result<_, error-code>>>
    (type (tuple 13 9))
    ;; idx 15: own<request>
    (type (own 1))
    ;; idx 16: tuple<stream<u8>, future<result<option<trailers>, error-code>>>
    (type (tuple 7 11))

    ;; idx 17: fn fields.new() -> own<fields>
    (type (func (result 5)))
    (export "[constructor]fields" (func (type 17)))

    ;; idx 18: fn response.new(headers, option<stream>, future<...>)
    ;;          -> tuple<own<response>, future<...>>
    (type (func
      (param "headers"  5)
      (param "contents" 12)
      (param "trailers" 11)
      (result 14)))
    (export "[static]response.new" (func (type 18)))

    ;; idx 19: fn request.consume-body(this, res) -> tuple<stream<u8>, future<...>>
    (type (func
      (param "this" 15)
      (param "res"  9)
      (result 16)))
    (export "[static]request.consume-body" (func (type 19)))
  ))
  (import "wasi:http/types@0.3.0-rc-2026-03-15"
          (instance $http-types (type $http-types-iface)))

  (alias export $http-types "fields"   (type $fields))
  (alias export $http-types "request"  (type $request))
  (alias export $http-types "response" (type $response))

  ;; Component-level derived types matching the imported instance signatures.
  ;; (Resource types must be wrapped in own<>/borrow<> before use in compound types.)
  (type $own-fields (own $fields))
  (type $option-trailers (option $own-fields))
  (type $result-rt (result $option-trailers (error $error-code)))
  (type $future-rt (future $result-rt))
  (type $option-stream (option $stream-u8))

  ;; ===================================================================
  ;; Linear memory shared by core impl and canon abi
  ;; ===================================================================
  ;;
  ;; Layout:
  ;;   0x0000 .. 0x0008  static "-handled-" (9 bytes)
  ;;   0x0010 .. 0x001B  trailers Ok(none) buffer (12 bytes, implicitly zero)
  ;;                       offset 0: result disc (0 = Ok)
  ;;                       offset 4: option<own<fields>> disc (0 = none)
  ;;                       offset 8-11: own handle (don't-care for none)
  ;;   0x0020 .. 0x0027  response.new retbuf:
  ;;                       offset 0: own<response> handle
  ;;                       offset 4: future readable handle (resp completion)
  ;;   0x0028 .. 0x002F  consume-body retbuf:
  ;;                       offset 0: stream<u8> readable handle (req body)
  ;;                       offset 4: future readable handle (req trailers)
  ;;   0x0030            rcu Ok(()) buffer (1 byte = 0, implicitly zero)
  ;;   0x1000 ..         per-task state struct (see offsets in $drive below)
  ;;   0x4000 .. 0xBFFF  chunk buffer (32 KiB) for stream read/write
  ;;
  (core module $mem-module
    (memory (export "memory") 4)
    (data (i32.const 0) "-handled-")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; ===================================================================
  ;; Canon lower of imported instance functions
  ;; ===================================================================

  (alias export $http-types "[constructor]fields" (func $fields-new-comp))
  (core func $fields-new-core (canon lower (func $fields-new-comp)))
  ;; () -> i32 (handle of new fields)

  (alias export $http-types "[static]response.new" (func $response-new-comp))
  (core func $response-new-core (canon lower (func $response-new-comp) (memory $mem)))
  ;; Flat params: headers(i32), contents-disc(i32), contents-payload(i32), trailers(i32);
  ;; Spilled result (tuple>1) -> trailing retptr.
  ;; -> (param i32 i32 i32 i32 i32) (no result; result spilled to retbuf)

  (alias export $http-types "[static]request.consume-body" (func $consume-body-comp))
  (core func $consume-body-core (canon lower (func $consume-body-comp) (memory $mem)))
  ;; Flat params: this(i32), res(i32). Spilled result tuple -> retptr.
  ;; -> (param i32 i32 i32)

  ;; ===================================================================
  ;; Canon stream / future / waitable / resource / context / task ops
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

  (core func $ctx-get-0    (canon context.get i32 0))
  (core func $ctx-set-0    (canon context.set i32 0))

  (core func $request-drop-core (canon resource.drop $request))

  (type $handler-result (result (own $response) (error $error-code)))
  (core func $task-return-core (canon task.return (result $handler-result) (memory $mem)))

  ;; ===================================================================
  ;; Core implementation module
  ;; ===================================================================
  (core module $impl
    (import "host" "memory"               (memory 0))
    (import "host" "fields-new"           (func $fields-new           (result i32)))
    (import "host" "response-new"         (func $response-new         (param i32 i32 i32 i32 i32)))
    (import "host" "consume-body"         (func $consume-body         (param i32 i32 i32)))
    (import "host" "request-drop"         (func $request-drop         (param i32)))

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

    (import "host" "ctx-get-0"            (func $ctx-get-0            (result i32)))
    (import "host" "ctx-set-0"            (func $ctx-set-0            (param i32)))

    (import "host" "task-return"          (func $task-return          (param i32 i32)))

    ;; State struct offsets at 0x1000:
    ;;   +0   phase           i32
    ;;   +4   req_body_r      i32
    ;;   +8   resp_body_w     i32
    ;;   +12  resp_trailers_w i32
    ;;   +16  resp_handle     i32
    ;;   +20  ws              i32
    ;;   +24  read_count      i32   ;; bytes pending echo write
    ;;
    ;; Phase encoding ("op pending"):
    ;;   0 = stream.read on req_body_r
    ;;   1 = stream.write on resp_body_w (echo body of read_count bytes)
    ;;   2 = stream.write on resp_body_w of "-handled-"
    ;;   3 = future.write on resp_trailers_w of Ok(none)
    ;;   4 = done (finalize and EXIT)

    ;; -----------------------------------------------------------------
    ;; $drive(state_ptr, rc, post_event) -> i32
    ;; Centralized state-machine driver. Returns either EXIT (0) or
    ;; WAIT|(ws<<4) (= 2 | (ws<<4)).
    ;;
    ;; If post_event=0, drive issues the op for state.phase from scratch.
    ;; If post_event=1, drive treats `rc` as the result of the operation
    ;; that was pending at state.phase, processes it, advances the phase,
    ;; then loops to issue the next op.
    ;; -----------------------------------------------------------------
    (func $drive (param $state i32) (param $rc i32) (param $post i32) (result i32)
      (local $phase i32)
      (local $req-body-r i32)
      (local $resp-body-w i32)
      (local $resp-trailers-w i32)
      (local $resp-handle i32)
      (local $ws i32)
      (local $read-count i32)
      (local $status-low i32)
      (local $count i32)
      (local $handle i32)

      (local.set $req-body-r       (i32.load offset=4  (local.get $state)))
      (local.set $resp-body-w      (i32.load offset=8  (local.get $state)))
      (local.set $resp-trailers-w  (i32.load offset=12 (local.get $state)))
      (local.set $resp-handle      (i32.load offset=16 (local.get $state)))
      (local.set $ws               (i32.load offset=20 (local.get $state)))

      (block $exit
        (loop $L
          (local.set $phase (i32.load offset=0 (local.get $state)))

          ;; ---- post-event: process rc, advance state.phase ----
          (if (local.get $post)
            (then
              (local.set $status-low (i32.and (local.get $rc) (i32.const 0xF)))
              (local.set $count      (i32.shr_u (local.get $rc) (i32.const 4)))

              (if (i32.eqz (local.get $phase))
                (then
                  ;; phase 0 (read): DROPPED → phase 2 ; COMPLETED+count → phase 1 ; else stay 0
                  (if (i32.eq (local.get $status-low) (i32.const 1))
                    (then
                      (i32.store offset=0 (local.get $state) (i32.const 2)))
                    (else
                      (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then
                          (i32.store offset=24 (local.get $state) (local.get $count))
                          (i32.store offset=0  (local.get $state) (i32.const 1)))))))
                (else
                  (if (i32.eq (local.get $phase) (i32.const 1))
                    (then
                      ;; phase 1 (write echo): advance to phase 0 (read) ONLY when
                      ;; the write actually transferred bytes (count > 0). On a
                      ;; BLOCKED-resume event the runtime delivers rc=0 (no count
                      ;; carried, no bytes written) — we must NOT advance, because
                      ;; the read_count bytes at 0x4000 still need to be flushed.
                      (if (i32.gt_u (local.get $count) (i32.const 0))
                        (then (i32.store offset=0 (local.get $state) (i32.const 0)))))
                    (else
                      (if (i32.eq (local.get $phase) (i32.const 2))
                        (then
                          ;; phase 2 (write -handled-): same gate. Only advance to
                          ;; phase 3 (drop body writable, write trailers) once the
                          ;; 9-byte "-handled-" payload has actually been written.
                          (if (i32.gt_u (local.get $count) (i32.const 0))
                            (then
                              (call $stream-drop-writable-u8 (local.get $resp-body-w))
                              (i32.store offset=8 (local.get $state) (i32.const 0))
                              (i32.store offset=0 (local.get $state) (i32.const 3)))))
                        (else
                          ;; phase 3 (write trailers): future.write always returns
                          ;; COMPLETED with count=0 (futures have no count), so we
                          ;; do NOT gate on count here — we only ever reach the
                          ;; phase-3 post-event after a successful future.write.
                          (call $future-drop-writable-rt (local.get $resp-trailers-w))
                          (i32.store offset=12 (local.get $state) (i32.const 0))
                          (i32.store offset=0  (local.get $state) (i32.const 4))))))))

              (local.set $post (i32.const 0))
              (local.set $phase (i32.load offset=0 (local.get $state)))
            ))

          ;; ---- finalize ----
          (if (i32.eq (local.get $phase) (i32.const 4))
            (then
              (call $ws-drop (local.get $ws))
              ;; task.return was already called early (after response.new) to avoid
              ;; deadlock with WAT-to-WAT callers that read response body concurrently
              ;; with writing request body. Just exit the drive loop here.
              (br $exit)))

          ;; ---- issue op for current phase ----
          (block $issued (result i32)
            (if (i32.eqz (local.get $phase))
              (then
                ;; phase 0: stream.read(req_body_r, CHUNK_BUF=0x4000, CHUNK_LEN=0x8000)
                (br $issued (call $stream-read-u8
                  (local.get $req-body-r)
                  (i32.const 0x4000)
                  (i32.const 0x8000)))))
            (if (i32.eq (local.get $phase) (i32.const 1))
              (then
                ;; phase 1: stream.write(resp_body_w, CHUNK_BUF, read_count)
                (local.set $read-count (i32.load offset=24 (local.get $state)))
                (br $issued (call $stream-write-u8
                  (local.get $resp-body-w)
                  (i32.const 0x4000)
                  (local.get $read-count)))))
            (if (i32.eq (local.get $phase) (i32.const 2))
              (then
                ;; phase 2: stream.write(resp_body_w, HANDLED_PTR=0, 9)
                (br $issued (call $stream-write-u8
                  (local.get $resp-body-w)
                  (i32.const 0)
                  (i32.const 9)))))
            ;; phase 3: future.write(resp_trailers_w, TRAILERS_VAL_PTR=0x10)
            (br $issued (call $future-write-rt
              (local.get $resp-trailers-w)
              (i32.const 0x10))))
          (local.set $rc)

          ;; ---- BLOCKED? ----
          (if (i32.eq (local.get $rc) (i32.const -1))
            (then
              ;; Pick the handle to wait on for this phase.
              ;;   phase 0 → req_body_r ; phase 1,2 → resp_body_w ; phase 3 → resp_trailers_w
              (if (i32.eqz (local.get $phase))
                (then (local.set $handle (local.get $req-body-r)))
                (else
                  (if (i32.eq (local.get $phase) (i32.const 3))
                    (then (local.set $handle (local.get $resp-trailers-w)))
                    (else (local.set $handle (local.get $resp-body-w))))))

              ;; Re-arm: disjoin then rejoin so onReady callback is registered fresh.
              (call $waitable-join (local.get $handle) (i32.const 0))
              (call $waitable-join (local.get $handle) (local.get $ws))

              ;; Persist state and return WAIT|(ws<<4).
              (call $ctx-set-0 (local.get $state))
              (return (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4))))
            ))

          ;; rc holds the synchronous result; loop with post_event=true.
          (local.set $post (i32.const 1))
          (br $L))
      )

      (i32.const 0) ;; EXIT
    )

    ;; -----------------------------------------------------------------
    ;; handle-start(req: i32) -> i32
    ;; -----------------------------------------------------------------
    (func $handle-start (export "handle-start") (param $req i32) (result i32)
      (local $rcu-pair i64) (local $rcu-r i32) (local $rcu-w i32)
      (local $headers i32)
      (local $body-pair i64) (local $resp-body-r i32) (local $resp-body-w i32)
      (local $trailers-pair i64) (local $resp-trailers-r i32) (local $resp-trailers-w i32)
      (local $resp-handle i32) (local $resp-completion-r i32)
      (local $req-body-r i32) (local $req-trailers-r i32)
      (local $ws i32)
      (local $write-status i32)

      ;; --- 1. Allocate "res" future, write Ok(()), drop writable ---
      (local.set $rcu-pair (call $future-new-rcu))
      (local.set $rcu-r (i32.wrap_i64 (local.get $rcu-pair)))
      (local.set $rcu-w (i32.wrap_i64 (i64.shr_u (local.get $rcu-pair) (i64.const 32))))

      ;; result<_, error-code-stub> Ok = byte 0x00 at RCU_OK_PTR (already zero).
      ;; future.write is async; for a 1-byte payload it should COMPLETE
      ;; synchronously (the value is buffered).
      (local.set $write-status
        (call $future-write-rcu (local.get $rcu-w) (i32.const 0x30)))
      (drop (local.get $write-status))
      (call $future-drop-writable-rcu (local.get $rcu-w))

      ;; --- 2. consume-body(req, rcu_r) → (req_body_r, req_trailers_r) ---
      (call $consume-body
        (local.get $req)
        (local.get $rcu-r)
        (i32.const 0x28))               ;; retptr (CONSUME_RETBUF)
      (local.set $req-body-r     (i32.load offset=0 (i32.const 0x28)))
      (local.set $req-trailers-r (i32.load offset=4 (i32.const 0x28)))

      ;; (Drop req_trailers_r for Phase 1.1 — we don't propagate trailers yet.
      ;;  Dropping the readable signals "we don't care" to the producer.)
      (call $future-drop-readable-rt (local.get $req-trailers-r))

      ;; --- 3. Allocate response: empty fields + body+trailers stream/future pairs ---
      (local.set $headers (call $fields-new))

      (local.set $body-pair (call $stream-new-u8))
      (local.set $resp-body-r (i32.wrap_i64 (local.get $body-pair)))
      (local.set $resp-body-w (i32.wrap_i64 (i64.shr_u (local.get $body-pair) (i64.const 32))))

      (local.set $trailers-pair (call $future-new-rt))
      (local.set $resp-trailers-r (i32.wrap_i64 (local.get $trailers-pair)))
      (local.set $resp-trailers-w (i32.wrap_i64 (i64.shr_u (local.get $trailers-pair) (i64.const 32))))

      ;; --- 4. response.new(headers, some(resp_body_r), resp_trailers_r) ---
      (call $response-new
        (local.get $headers)
        (i32.const 1)                  ;; option disc = some
        (local.get $resp-body-r)
        (local.get $resp-trailers-r)
        (i32.const 0x20))              ;; retptr (RESPONSE_RETBUF)
      (local.set $resp-handle       (i32.load offset=0 (i32.const 0x20)))
      (local.set $resp-completion-r (i32.load offset=4 (i32.const 0x20)))

      ;; Drop response transmit-completion future readable (we don't track it).
      (call $future-drop-readable-rcu (local.get $resp-completion-r))

      ;; --- 4b. Call task.return EARLY: yield response handle to caller now,
      ;;     before driving body+trailers writes. This is required to avoid
      ;;     a streaming deadlock when the caller is also a WAT component
      ;;     that wants to read the response body concurrently with writing
      ;;     the request body. See plan §10 / WAT-to-WAT bridge notes.
      (call $task-return (i32.const 0) (local.get $resp-handle))

      ;; --- 5. Allocate ws and persist initial state ---
      (local.set $ws (call $ws-new))

      (i32.store offset=0  (i32.const 0x1000) (i32.const 0))                   ;; phase = 0 (read)
      (i32.store offset=4  (i32.const 0x1000) (local.get $req-body-r))
      (i32.store offset=8  (i32.const 0x1000) (local.get $resp-body-w))
      (i32.store offset=12 (i32.const 0x1000) (local.get $resp-trailers-w))
      (i32.store offset=16 (i32.const 0x1000) (local.get $resp-handle))
      (i32.store offset=20 (i32.const 0x1000) (local.get $ws))
      (i32.store offset=24 (i32.const 0x1000) (i32.const 0))                   ;; read_count

      ;; --- 6. Drive the state machine ---
      ;; (request handle ownership was transferred to consume-body; do not drop it here.)
      (call $drive (i32.const 0x1000) (i32.const 0) (i32.const 0))
    )

    ;; -----------------------------------------------------------------
    ;; handle-cb(event, handle, rc) -> i32
    ;; -----------------------------------------------------------------
    (func $handle-cb (export "handle-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (call $drive (call $ctx-get-0) (local.get $rc) (i32.const 1))
    )
  )

  ;; ===================================================================
  ;; Wire imports + instantiate the core module
  ;; ===================================================================
  (core instance $host-exports
    (export "memory"                    (memory $mem))
    (export "fields-new"                (func $fields-new-core))
    (export "response-new"              (func $response-new-core))
    (export "consume-body"              (func $consume-body-core))
    (export "request-drop"              (func $request-drop-core))

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

    (export "ctx-get-0"                 (func $ctx-get-0))
    (export "ctx-set-0"                 (func $ctx-set-0))

    (export "task-return"               (func $task-return-core))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))
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

  ;; Typed instance type for the wasi:http/handler export.
  ;; WAC compose requires the exported instance to declare the resource
  ;; identities it transitively references (`request`, `response`,
  ;; `error-code`) so the composition tool can match them against the
  ;; importer's same-named resources from `wasi:http/types`. We do this by
  ;; re-exporting the imported resource types from the handler instance via
  ;; outer aliases. wit-component does the same thing for Rust-built
  ;; wasi:http/handler exporters.
  (type $handler-iface (instance
    (alias outer $server-impl-p3-wat $request    (type))               ;; idx 0
    (export "request"    (type (eq 0)))                                ;; idx 1
    (alias outer $server-impl-p3-wat $response   (type))               ;; idx 2
    (export "response"   (type (eq 2)))                                ;; idx 3
    (alias outer $server-impl-p3-wat $error-code (type))               ;; idx 4
    (export "error-code" (type (eq 4)))                                ;; idx 5
    (type (own 1))                                                     ;; idx 6 = own<request>
    (type (own 3))                                                     ;; idx 7 = own<response>
    (type (result 7 (error 5)))                                        ;; idx 8 = result<own<response>, error-code>
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
    (instance (type $handler-iface)))
)
