;; Hand-written component-model WAT for hello-p3-world.
;; Minimal WASIp3 component that prints "hello from jsco" to stdout.
;;
;; Imports: wasi:cli/types@0.3.0-rc-2026-03-15, wasi:cli/stdout@0.3.0-rc-2026-03-15
;; Exports: wasi:cli/run@0.3.0-rc-2026-03-15

(component $hello-p3-world-wat

  ;; =====================================================================
  ;; Import: wasi:cli/types — error-code enum
  ;; =====================================================================
  (type $cli-types-iface (instance
    (type $ec (enum "io" "illegal-byte-sequence" "pipe"))
    (export "error-code" (type (eq $ec)))
  ))
  (import "wasi:cli/types@0.3.0-rc-2026-03-15" (instance $cli-types (type $cli-types-iface)))
  (alias export $cli-types "error-code" (type $error-code))

  ;; =====================================================================
  ;; Import: wasi:cli/stdout — write-via-stream
  ;;   write-via-stream(data: stream<u8>) -> future<result<_, error-code>>
  ;; =====================================================================
  (type $stdout-iface (instance
    (alias outer $hello-p3-world-wat $error-code (type $ec))
    (export "error-code" (type (eq $ec)))
    (type $s (stream u8))                                           ;; stream<u8>
    (type $r (result (error $ec)))                                  ;; result<_, error-code>
    (type $f (future $r))                                           ;; future<result<_, error-code>>
    (type $wvs-type (func (param "data" $s) (result $f)))
    (export "write-via-stream" (func (type $wvs-type)))
  ))
  (import "wasi:cli/stdout@0.3.0-rc-2026-03-15" (instance $stdout (type $stdout-iface)))

  ;; =====================================================================
  ;; Component-level types for canon operations
  ;; =====================================================================
  (type $result-void (result))                                       ;; run's return type
  (type $result-error-code (result (error $error-code)))             ;; future payload
  (type $future-result (future $result-error-code))                  ;; future<result<_, error-code>>
  (type $stream-u8 (stream u8))                                      ;; stream<u8>

  ;; =====================================================================
  ;; Memory module — shared linear memory with greeting string
  ;; =====================================================================
  (core module $mem-module
    (memory (export "memory") 1)
    (data (i32.const 0) "hello from jsco\n")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; =====================================================================
  ;; Canon lower: write-via-stream (sync lower — returns future handle)
  ;; Core ABI: (i32 stream_readable) -> (i32 future_readable)
  ;; =====================================================================
  (alias export $stdout "write-via-stream" (func $write-via-stream-comp))
  (core func $write-via-stream (canon lower (func $write-via-stream-comp)))

  ;; =====================================================================
  ;; Canon stream operations for stream<u8>
  ;; =====================================================================
  ;; stream.new: () -> i64 (packed: writable << 32 | readable)
  (core func $stream-new (canon stream.new $stream-u8))
  ;; stream.write: (handle:i32, ptr:i32, len:i32) -> i32 (packed count|status)
  (core func $stream-write (canon stream.write $stream-u8 (memory $mem) async))
  ;; stream.drop-writable: (handle:i32) -> void
  (core func $stream-drop-writable (canon stream.drop-writable $stream-u8))

  ;; =====================================================================
  ;; Canon future operations for future<result<_, error-code>>
  ;; =====================================================================
  ;; future.drop-readable: (handle:i32) -> void
  (core func $future-drop-readable (canon future.drop-readable $future-result))

  ;; =====================================================================
  ;; Canon task.return for run's result type
  ;; =====================================================================
  (core func $task-return (canon task.return (result $result-void)))

  ;; =====================================================================
  ;; Canon waitable-set operations
  ;; =====================================================================
  (core func $ws-new (canon waitable-set.new))
  (core func $ws-poll (canon waitable-set.poll (memory $mem)))
  (core func $ws-drop (canon waitable-set.drop))
  (core func $waitable-join (canon waitable.join))

  ;; =====================================================================
  ;; Canon context get/set for persisting state across start/callback
  ;; =====================================================================
  (core func $ctx-get-0 (canon context.get i32 0))
  (core func $ctx-set-0 (canon context.set i32 0))

  ;; =====================================================================
  ;; Core module — implements run via async start + callback pattern
  ;; =====================================================================
  (core module $hello-impl
    (import "host" "memory"              (memory 0))
    (import "host" "write-via-stream"    (func $write-via-stream (param i32) (result i32)))
    (import "host" "stream-new"          (func $stream-new (result i64)))
    (import "host" "stream-write"        (func $stream-write (param i32 i32 i32) (result i32)))
    (import "host" "stream-drop-writable" (func $stream-drop-writable (param i32)))
    (import "host" "future-drop-readable" (func $future-drop-readable (param i32)))
    (import "host" "task-return"         (func $task-return (param i32)))
    (import "host" "ws-new"              (func $ws-new (result i32)))
    (import "host" "ws-poll"             (func $ws-poll (param i32 i32) (result i32)))
    (import "host" "ws-drop"             (func $ws-drop (param i32)))
    (import "host" "waitable-join"       (func $waitable-join (param i32 i32)))
    (import "host" "ctx-get-0"           (func $ctx-get-0 (result i32)))
    (import "host" "ctx-set-0"           (func $ctx-set-0 (param i32)))

    ;; Constants
    ;; stream.write status: COMPLETED=0, DROPPED=1
    ;; stream.write return: (count << 4) | status
    ;; Callback return: EXIT=0, YIELD=1, WAIT = 2|(ws_id<<4)
    ;; Event buffer: 12 bytes per event (event_code:i32, handle:i32, return_code:i32)

    ;; ---------------------------------------------------------------
    ;; start: called when run() is invoked
    ;; Returns: i32 status (0=EXIT, 2|(ws_id<<4)=WAIT)
    ;; ---------------------------------------------------------------
    (func $start (export "start") (result i32)
      (local $packed i64)
      (local $readable i32)
      (local $writable i32)
      (local $write-status i32)
      (local $future-handle i32)
      (local $ws-id i32)

      ;; 1. Create a stream pair
      call $stream-new
      local.set $packed
      ;; readable = lower 32 bits
      local.get $packed
      i32.wrap_i64
      local.set $readable
      ;; writable = upper 32 bits
      local.get $packed
      i64.const 32
      i64.shr_u
      i32.wrap_i64
      local.set $writable

      ;; 2. Call write-via-stream with the readable end
      ;;    This starts the host consuming the stream
      ;;    Returns a future readable handle
      local.get $readable
      call $write-via-stream
      local.set $future-handle

      ;; 3. Write "hello from jsco\n" (16 bytes at offset 0) to writable end
      ;;    stream.write is async: returns (count << 4 | status)
      ;;    For 16 bytes, expect COMPLETED (status=0) with count=16
      local.get $writable
      i32.const 0      ;; ptr to greeting in memory
      i32.const 16     ;; length of "hello from jsco\n"
      call $stream-write
      local.set $write-status

      ;; Check if stream.write returned BLOCKED (0xFFFFFFFF)
      local.get $write-status
      i32.const -1     ;; 0xFFFFFFFF = BLOCKED
      i32.eq
      if
        ;; Write is blocked — need to wait via waitable-set
        ;; Create waitable set
        call $ws-new
        local.set $ws-id

        ;; Save ws-id and future-handle in context for callback
        ;; Pack: (future_handle << 16) | ws_id
        local.get $future-handle
        i32.const 16
        i32.shl
        local.get $ws-id
        i32.or
        call $ctx-set-0

        ;; The stream.write handle is the writable handle itself
        ;; Join it to the waitable set
        local.get $writable
        local.get $ws-id
        call $waitable-join

        ;; Return WAIT: 2 | (ws_id << 4)
        i32.const 2
        local.get $ws-id
        i32.const 4
        i32.shl
        i32.or
        return
      end

      ;; 4. Write completed synchronously — close writable end
      local.get $writable
      call $stream-drop-writable

      ;; 5. Drop the future (we don't need to wait for it)
      local.get $future-handle
      call $future-drop-readable

      ;; 6. Signal the result: ok (discriminant 0)
      i32.const 0
      call $task-return

      ;; 7. Return EXIT (0)
      i32.const 0
    )

    ;; ---------------------------------------------------------------
    ;; callback: called when waitable-set events arrive
    ;; Params: (event_code:i32, handle:i32, return_code:i32)
    ;; Returns: i32 status (0=EXIT)
    ;; ---------------------------------------------------------------
    (func $callback (export "callback") (param $event-code i32) (param $handle i32) (param $return-code i32) (result i32)
      (local $ctx i32)
      (local $ws-id i32)
      (local $future-handle i32)

      ;; Recover ws-id and future-handle from context
      call $ctx-get-0
      local.set $ctx
      local.get $ctx
      i32.const 0xFFFF
      i32.and
      local.set $ws-id
      local.get $ctx
      i32.const 16
      i32.shr_u
      local.set $future-handle

      ;; The stream write event arrived — write completed
      ;; Now close the writable end (the handle from the event is the writable handle)
      local.get $handle
      call $stream-drop-writable

      ;; Drop the future
      local.get $future-handle
      call $future-drop-readable

      ;; Drop the waitable set
      local.get $ws-id
      call $ws-drop

      ;; Signal the result: ok (discriminant 0)
      i32.const 0
      call $task-return

      ;; Return EXIT (0)
      i32.const 0
    )
  )

  ;; =====================================================================
  ;; Instantiate core module with lowered imports
  ;; =====================================================================
  (core instance $host-exports
    (export "memory"               (memory $mem))
    (export "write-via-stream"     (func $write-via-stream))
    (export "stream-new"           (func $stream-new))
    (export "stream-write"         (func $stream-write))
    (export "stream-drop-writable" (func $stream-drop-writable))
    (export "future-drop-readable" (func $future-drop-readable))
    (export "task-return"          (func $task-return))
    (export "ws-new"               (func $ws-new))
    (export "ws-poll"              (func $ws-poll))
    (export "ws-drop"              (func $ws-drop))
    (export "waitable-join"        (func $waitable-join))
    (export "ctx-get-0"            (func $ctx-get-0))
    (export "ctx-set-0"            (func $ctx-set-0))
  )
  (core instance $core (instantiate $hello-impl
    (with "host" (instance $host-exports))
  ))

  ;; =====================================================================
  ;; Canon lift: async run with callback
  ;; =====================================================================
  (alias core export $core "start" (core func $core-start))
  (alias core export $core "callback" (core func $core-callback))

  (type $run-func-type (func async (result $result-void)))
  (func $run (type $run-func-type)
    (canon lift (core func $core-start) async (callback $core-callback))
  )

  ;; =====================================================================
  ;; Export: wasi:cli/run@0.3.0-rc-2026-03-15
  ;; =====================================================================
  (instance $run-inst
    (export "run" (func $run) (func (type $run-func-type)))
  )
  (export "wasi:cli/run@0.3.0-rc-2026-03-15" (instance $run-inst))
)
