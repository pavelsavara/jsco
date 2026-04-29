;; Hand-written component-model WAT — DOS / event-loop-starvation attack patterns.
;;
;; Each export demonstrates one class of malicious-guest behavior described in
;; ../../proposals.md ("DOS / Event-Loop-Starvation Attack Surface"). Tests in
;; tests/host/wasip3/bad-guests-integration.test.ts exercise these to validate
;; that the host either bounds them, yields, or aborts them — they MUST NOT
;; freeze the JS event loop indefinitely.
;;
;; All exports are sync-lifted (no async lift, no waitable-set.wait). The guest
;; never calls wait(), which is the sole place JSPI can suspend today. So
;; without host-side mitigation each export will spin indefinitely on the WASM
;; thread and starve Node.js's I/O.
;;
;; Each export takes a u32 iteration cap and returns u32 (iterations completed).
;; Tests pass a large cap (e.g. 10_000_000) and rely on a wall-clock timeout
;; to detect the spin.
;;
;; Imports: none (all canon ops are core-funcs, not real component imports).
;; Exports: test:bad-guests/attacks@0.1.0 { a1-..., a5-..., a7-..., b1-... }

(component $bad-guests-p3-wat

  ;; Component-level types
  (type $stream-u8 (stream u8))
  (type $future-u8 (future u8))
  ;; Component-defined resource type for B6 (resource-leak)
  (type $r (resource (rep i32)))

  ;; Component-level import: a host function that returns a Promise on the JS
  ;; side (we lower it `async` to obtain a subtask handle each call).
  ;; Used by A6 (subtask-cancel-spin) and B4 (subtask-handle-leak).
  (type $fn-async-fn (func (result u8)))
  (type $async-host-iface (instance
    (export "async-fn" (func (type $fn-async-fn)))
  ))
  (import "test:bad-guests/async-host@0.1.0" (instance $async-host (type $async-host-iface)))
  (alias export $async-host "async-fn" (func $async-fn-comp))

  ;; Shared linear memory
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; Canon stream ops (async mode — return BLOCKED i32 when not ready)
  (core func $stream-new          (canon stream.new           $stream-u8))
  (core func $stream-read         (canon stream.read          $stream-u8 (memory $mem) async))
  (core func $stream-write        (canon stream.write         $stream-u8 (memory $mem) async))
  (core func $stream-cancel-read  (canon stream.cancel-read   $stream-u8 async))
  (core func $stream-cancel-write (canon stream.cancel-write  $stream-u8 async))
  (core func $stream-drop-readable (canon stream.drop-readable $stream-u8))
  (core func $stream-drop-writable (canon stream.drop-writable $stream-u8))

  ;; Canon future ops
  (core func $future-new          (canon future.new           $future-u8))
  (core func $future-read         (canon future.read          $future-u8 (memory $mem) async))
  (core func $future-write        (canon future.write         $future-u8 (memory $mem) async))
  (core func $future-cancel-read  (canon future.cancel-read   $future-u8 async))
  (core func $future-cancel-write (canon future.cancel-write  $future-u8 async))
  (core func $future-drop-readable (canon future.drop-readable $future-u8))
  (core func $future-drop-writable (canon future.drop-writable $future-u8))

  ;; Canon waitable-set ops
  (core func $ws-new              (canon waitable-set.new))
  (core func $ws-poll             (canon waitable-set.poll  (memory $mem)))
  (core func $ws-drop             (canon waitable-set.drop))

  ;; Canon backpressure ops (component-level; no params/results)
  (core func $bp-inc              (canon backpressure.inc))
  (core func $bp-dec              (canon backpressure.dec))

  ;; Canon resource ops for the component-defined resource (B6)
  (core func $resource-new        (canon resource.new  $r))
  (core func $resource-drop       (canon resource.drop $r))

  ;; Canon subtask ops (A6, B4) and async-lowered host call.
  (core func $async-call          (canon lower (func $async-fn-comp) async))
  (core func $subtask-cancel      (canon subtask.cancel))
  (core func $subtask-drop        (canon subtask.drop))

  ;; Core implementation: each attack export is a separate core function.
  (core module $impl
    (import "host" "memory"               (memory 0))
    (import "host" "stream-new"           (func $stream-new           (result i64)))
    (import "host" "stream-read"          (func $stream-read          (param i32 i32 i32) (result i32)))
    (import "host" "stream-write"         (func $stream-write         (param i32 i32 i32) (result i32)))
    (import "host" "stream-cancel-read"   (func $stream-cancel-read   (param i32) (result i32)))
    (import "host" "stream-cancel-write"  (func $stream-cancel-write  (param i32) (result i32)))
    (import "host" "stream-drop-readable" (func $stream-drop-readable (param i32)))
    (import "host" "stream-drop-writable" (func $stream-drop-writable (param i32)))
    (import "host" "future-new"           (func $future-new           (result i64)))
    (import "host" "future-read"          (func $future-read          (param i32 i32) (result i32)))
    (import "host" "future-write"         (func $future-write         (param i32 i32) (result i32)))
    (import "host" "future-cancel-read"   (func $future-cancel-read   (param i32) (result i32)))
    (import "host" "future-cancel-write"  (func $future-cancel-write  (param i32) (result i32)))
    (import "host" "future-drop-readable" (func $future-drop-readable (param i32)))
    (import "host" "future-drop-writable" (func $future-drop-writable (param i32)))
    (import "host" "ws-new"               (func $ws-new               (result i32)))
    (import "host" "ws-poll"              (func $ws-poll              (param i32 i32) (result i32)))
    (import "host" "ws-drop"              (func $ws-drop              (param i32)))
    (import "host" "bp-inc"               (func $bp-inc))
    (import "host" "bp-dec"               (func $bp-dec))
    (import "host" "resource-new"         (func $resource-new         (param i32) (result i32)))
    (import "host" "resource-drop"        (func $resource-drop        (param i32)))
    (import "host" "async-call"           (func $async-call           (result i32)))
    (import "host" "subtask-cancel"       (func $subtask-cancel       (param i32) (result i32)))
    (import "host" "subtask-drop"         (func $subtask-drop         (param i32)))

    ;; ---------------------------------------------------------------------
    ;; A1: stream.read → stream.cancel-read spin (no waitable-set.wait)
    ;; Reproducer for the OOM in wasmtime test_tcp_read_cancellation.
    ;; ---------------------------------------------------------------------
    (func $a1-stream-read-cancel-spin (export "a1-stream-read-cancel-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      ;; create a stream pair; nothing ever writes, so reads always BLOCKED
      (local.set $packed (call $stream-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          ;; stream.read(rd, ptr=0, len=1) → expected BLOCKED (0xFFFFFFFF)
          (drop (call $stream-read (local.get $rd) (i32.const 0) (i32.const 1)))
          ;; stream.cancel-read(rd) → expected COMPLETED with count=0
          (drop (call $stream-cancel-read (local.get $rd)))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $stream-drop-readable (local.get $rd))
      (call $stream-drop-writable (local.get $wr))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A2: stream.write → stream.cancel-write spin
    ;; Guest fills its own writable end (nobody reads), gets BLOCKED, cancels,
    ;; repeats. Same starvation shape as A1 on the write side.
    ;; ---------------------------------------------------------------------
    (func $a2-stream-write-cancel-spin (export "a2-stream-write-cancel-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (local.set $packed (call $stream-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          ;; flood: write 1 byte; with no reader and tight loop, eventually BLOCKED
          (drop (call $stream-write (local.get $wr) (i32.const 0) (i32.const 1)))
          (drop (call $stream-cancel-write (local.get $wr)))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $stream-drop-readable (local.get $rd))
      (call $stream-drop-writable (local.get $wr))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A3: future.read → future.cancel-read spin
    ;; Future never resolves (no writer), reads always BLOCKED.
    ;; ---------------------------------------------------------------------
    (func $a3-future-read-cancel-spin (export "a3-future-read-cancel-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (local.set $packed (call $future-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          (drop (call $future-read (local.get $rd) (i32.const 0)))
          (drop (call $future-cancel-read (local.get $rd)))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $future-drop-readable (local.get $rd))
      (call $future-drop-writable (local.get $wr))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A4: future.write → future.cancel-write spin
    ;; Guest writes to its own writable end with no reader; canceling and
    ;; retrying with no reader → BLOCKED forever, sync canon both sides.
    ;; ---------------------------------------------------------------------
    (func $a4-future-write-cancel-spin (export "a4-future-write-cancel-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (local.set $packed (call $future-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          (drop (call $future-write (local.get $wr) (i32.const 0)))
          (drop (call $future-cancel-write (local.get $wr)))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $future-drop-readable (local.get $rd))
      (call $future-drop-writable (local.get $wr))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A5: waitable-set.poll spin (no wait, no events ever)
    ;; ---------------------------------------------------------------------
    (func $a5-waitable-poll-spin (export "a5-waitable-poll-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $ws i32)

      (local.set $ws (call $ws-new))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          ;; poll into a 12-byte event slot at memory[0..12]; no joined waitables
          ;; so it returns NONE immediately every iteration
          (drop (call $ws-poll (local.get $ws) (i32.const 0)))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $ws-drop (local.get $ws))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A7: stream.new + drop pair churn (pure resource-table thrash)
    ;; ---------------------------------------------------------------------
    (func $a7-stream-new-drop-churn (export "a7-stream-new-drop-churn")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          (local.set $packed (call $stream-new))
          (local.set $rd (i32.wrap_i64 (local.get $packed)))
          (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))
          (call $stream-drop-readable (local.get $rd))
          (call $stream-drop-writable (local.get $wr))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A8: waitable-set.new + waitable-set.drop churn (table thrash on
    ;; waitable-set ids). Same shape as A7 on a different resource table.
    ;; ---------------------------------------------------------------------
    (func $a8-waitable-set-new-drop-churn (export "a8-waitable-set-new-drop-churn")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $ws i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))

          (local.set $ws (call $ws-new))
          (call $ws-drop (local.get $ws))

          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B1: unbounded stream creation without dropping (resource table grows)
    ;; ---------------------------------------------------------------------
    (func $b1-stream-leak (export "b1-stream-leak")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $stream-new))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B2: unbounded future creation without dropping
    ;; ---------------------------------------------------------------------
    (func $b2-future-leak (export "b2-future-leak")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $future-new))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B3: unbounded waitable-set creation without dropping
    ;; ---------------------------------------------------------------------
    (func $b3-waitable-set-leak (export "b3-waitable-set-leak")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $ws-new))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A9: task.backpressure flip-flop spin
    ;; Toggle backpressure on/off in a tight loop. Each call is O(1) on the
    ;; host (counter increment/decrement). Without yield-throttle the WASM
    ;; never returns to JS.
    ;; ---------------------------------------------------------------------
    (func $a9-backpressure-flip (export "a9-backpressure-flip")
          (param $iterations i32) (result i32)
      (local $i i32)
      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (call $bp-inc)
          (call $bp-dec)
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; D1: read-from-dropped-stream spin
    ;; Drop both ends of a stream, then call stream.read on the dead handle
    ;; in a loop. Each read returns DROPPED sync — the host must still yield
    ;; via the throttle so the JS event loop ticks.
    ;; ---------------------------------------------------------------------
    (func $d1-read-dropped-stream-spin (export "d1-read-dropped-stream-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (local.set $packed (call $stream-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))
      (call $stream-drop-writable (local.get $wr))
      (call $stream-drop-readable (local.get $rd))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $stream-read (local.get $rd) (i32.const 0) (i32.const 1)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; D3: poll-empty-waitable-set spin
    ;; Create one waitable-set, never join anything to it, poll forever.
    ;; ws-poll on an empty set returns NONE sync; without throttle the WASM
    ;; never yields. (Sibling of A5 which polls a populated set.)
    ;; ---------------------------------------------------------------------
    (func $d3-poll-empty-waitable-set (export "d3-poll-empty-waitable-set")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $ws i32)

      (local.set $ws (call $ws-new))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $ws-poll (local.get $ws) (i32.const 0)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (call $ws-drop (local.get $ws))
      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B7: linear memory growth via memory.grow until the host cap traps.
    ;;
    ;; Grow N pages (64 KB each) per iteration up to the iteration cap, then
    ;; call a sync canon op (stream.new) so the host's memory-cap check trips
    ;; on the next guest→host transition. Without the cap the WASM would
    ;; simply allocate 4 GB and OOM the JS process.
    ;; ---------------------------------------------------------------------
    (func $b7-memory-grow-spin (export "b7-memory-grow-spin")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          ;; Grow 16 pages (1 MB) per iteration. Returns -1 on failure
          ;; (engine-side max reached) — we ignore that and let the host
          ;; cap-check on the next canon op be the gate.
          (drop (memory.grow (i32.const 16)))
          ;; Issue any sync canon built-in to force the host's cap check.
          ;; stream.new is cheap and pure (one resource alloc).
          (drop (call $stream-new))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; D2: double-drop on the same readable handle.
    ;; The first drop is legal; the second MUST trap because the handle is
    ;; gone from the table. Without trap behavior a malicious guest could
    ;; spin in a tight loop calling drop on a stale handle, never yielding.
    ;; ---------------------------------------------------------------------
    (func $d2-double-drop-spin (export "d2-double-drop-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i64)
      (local $rd i32) (local $wr i32)

      (local.set $packed (call $stream-new))
      (local.set $rd (i32.wrap_i64 (local.get $packed)))
      (local.set $wr (i32.wrap_i64 (i64.shr_u (local.get $packed) (i64.const 32))))

      ;; First drop — legal.
      (call $stream-drop-readable (local.get $rd))
      (call $stream-drop-writable (local.get $wr))

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          ;; Second drop on the same (now-dead) handle MUST trap.
          (call $stream-drop-readable (local.get $rd))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; A6: subtask.cancel spin. Each iteration creates an async subtask via
    ;; canon.lower (async) of a Promise-returning host import, then cancels
    ;; and drops it. Without yielding the loop monopolizes the WASM thread.
    ;; The host MUST yield via wrapWithThrottle on subtask.cancel/drop and
    ;; the async-lower trampoline.
    ;; ---------------------------------------------------------------------
    (func $a6-subtask-cancel-spin (export "a6-subtask-cancel-spin")
          (param $iterations i32) (result i32)
      (local $i i32)
      (local $packed i32)
      (local $handle i32)
      (local $state i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          ;; async-lower of host fn returning Promise -> packed (handle<<4)|state
          (local.set $packed (call $async-call))
          ;; Extract state (low 4 bits)
          (local.set $state (i32.and (local.get $packed) (i32.const 15)))
          ;; If RETURNED (state=2) the host returned non-Promise — skip cancel/drop.
          (block $skip
            (br_if $skip (i32.eq (local.get $state) (i32.const 2)))
            (local.set $handle (i32.shr_u (local.get $packed) (i32.const 4)))
            (drop (call $subtask-cancel (local.get $handle)))
            (call $subtask-drop  (local.get $handle))
          )
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B4: subtask handle leak. Each iteration creates an async subtask via
    ;; async-lower and NEVER cancels nor drops it. The host MUST throttle
    ;; (yield) and/or cap memory to prevent the JS process from being
    ;; starved while subtasks accumulate.
    ;; ---------------------------------------------------------------------
    (func $b4-subtask-leak (export "b4-subtask-leak")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          (drop (call $async-call))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; B6: component-resource handle leak. Each iteration creates a new
    ;; resource and never drops it. The host MUST cap maxHandles (default
    ;; 10_000) on resource.new and trap when the cap is exceeded.
    ;; ---------------------------------------------------------------------
    (func $b6-resource-leak (export "b6-resource-leak")
          (param $iterations i32) (result i32)
      (local $i i32)

      (block $done
        (loop $L
          (br_if $done (i32.ge_u (local.get $i) (local.get $iterations)))
          ;; resource rep is i32; reuse $i as the rep value.
          (drop (call $resource-new (local.get $i)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)
        )
      )

      (local.get $i)
    )

    ;; ---------------------------------------------------------------------
    ;; C1: string-len-bomb — guest returns string {ptr=0, len=0xFFFFFFFF}
    ;; through the canon-lift retptr. Host must reject with RangeError at
    ;; the canonical-ABI boundary (validateBoundarySize) BEFORE attempting
    ;; to read the bogus byte range from linear memory.
    ;; ---------------------------------------------------------------------
    (func $c1-string-len-bomb (export "c1-string-len-bomb")
          (param $iterations i32) (result i32)
      ;; Write {data_ptr=0, len=0xFFFFFFFF} at memory address 256.
      ;; data_ptr=0 is fine — host should never dereference it.
      (i32.store        (i32.const 256) (i32.const 0))
      (i32.store offset=4 (i32.const 256) (i32.const -1))  ;; -1 = 0xFFFFFFFF
      (i32.const 256)
    )

    ;; ---------------------------------------------------------------------
    ;; C2: list-len-bomb — guest returns list<u8> {ptr=0, len=0xFFFFFFFF}
    ;; through the canon-lift retptr. Host must reject with RangeError at
    ;; the canonical-ABI boundary BEFORE attempting to read the bogus byte
    ;; range from linear memory.
    ;; ---------------------------------------------------------------------
    (func $c2-list-len-bomb (export "c2-list-len-bomb")
          (param $iterations i32) (result i32)
      (i32.store        (i32.const 264) (i32.const 0))
      (i32.store offset=4 (i32.const 264) (i32.const -1))
      (i32.const 264)
    )
  )

  ;; Wire host-imports → core-funcs
  (core instance $host-exports
    (export "memory"               (memory $mem))
    (export "stream-new"           (func $stream-new))
    (export "stream-read"          (func $stream-read))
    (export "stream-write"         (func $stream-write))
    (export "stream-cancel-read"   (func $stream-cancel-read))
    (export "stream-cancel-write"  (func $stream-cancel-write))
    (export "stream-drop-readable" (func $stream-drop-readable))
    (export "stream-drop-writable" (func $stream-drop-writable))
    (export "future-new"           (func $future-new))
    (export "future-read"          (func $future-read))
    (export "future-write"         (func $future-write))
    (export "future-cancel-read"   (func $future-cancel-read))
    (export "future-cancel-write"  (func $future-cancel-write))
    (export "future-drop-readable" (func $future-drop-readable))
    (export "future-drop-writable" (func $future-drop-writable))
    (export "ws-new"               (func $ws-new))
    (export "ws-poll"              (func $ws-poll))
    (export "ws-drop"              (func $ws-drop))
    (export "bp-inc"               (func $bp-inc))
    (export "bp-dec"               (func $bp-dec))
    (export "resource-new"         (func $resource-new))
    (export "resource-drop"        (func $resource-drop))
    (export "async-call"           (func $async-call))
    (export "subtask-cancel"       (func $subtask-cancel))
    (export "subtask-drop"         (func $subtask-drop))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  ;; Lift each attack export as sync (param "iterations" u32) -> u32
  (type $fn-spin (func (param "iterations" u32) (result u32)))

  (alias core export $core "a1-stream-read-cancel-spin"  (core func $a1-core))
  (alias core export $core "a2-stream-write-cancel-spin" (core func $a2-core))
  (alias core export $core "a3-future-read-cancel-spin"  (core func $a3-core))
  (alias core export $core "a4-future-write-cancel-spin" (core func $a4-core))
  (alias core export $core "a5-waitable-poll-spin"       (core func $a5-core))
  (alias core export $core "a7-stream-new-drop-churn"    (core func $a7-core))
  (alias core export $core "a8-waitable-set-new-drop-churn" (core func $a8-core))
  (alias core export $core "b1-stream-leak"              (core func $b1-core))
  (alias core export $core "b2-future-leak"              (core func $b2-core))
  (alias core export $core "b3-waitable-set-leak"        (core func $b3-core))
  (alias core export $core "b7-memory-grow-spin"         (core func $b7-core))
  (alias core export $core "a9-backpressure-flip"        (core func $a9-core))
  (alias core export $core "d1-read-dropped-stream-spin" (core func $d1-core))
  (alias core export $core "d3-poll-empty-waitable-set"  (core func $d3-core))
  (alias core export $core "d2-double-drop-spin"          (core func $d2-core))
  (alias core export $core "a6-subtask-cancel-spin"       (core func $a6-core))
  (alias core export $core "b4-subtask-leak"              (core func $b4-core))
  (alias core export $core "b6-resource-leak"             (core func $b6-core))
  (alias core export $core "c1-string-len-bomb"           (core func $c1-core))
  (alias core export $core "c2-list-len-bomb"             (core func $c2-core))

  (func $a1 (type $fn-spin) (canon lift (core func $a1-core)))
  (func $a2 (type $fn-spin) (canon lift (core func $a2-core)))
  (func $a3 (type $fn-spin) (canon lift (core func $a3-core)))
  (func $a4 (type $fn-spin) (canon lift (core func $a4-core)))
  (func $a5 (type $fn-spin) (canon lift (core func $a5-core)))
  (func $a7 (type $fn-spin) (canon lift (core func $a7-core)))
  (func $a8 (type $fn-spin) (canon lift (core func $a8-core)))
  (func $b1 (type $fn-spin) (canon lift (core func $b1-core)))
  (func $b2 (type $fn-spin) (canon lift (core func $b2-core)))
  (func $b3 (type $fn-spin) (canon lift (core func $b3-core)))
  (func $b7 (type $fn-spin) (canon lift (core func $b7-core)))
  (func $a9 (type $fn-spin) (canon lift (core func $a9-core)))
  (func $d1 (type $fn-spin) (canon lift (core func $d1-core)))
  (func $d3 (type $fn-spin) (canon lift (core func $d3-core)))
  (func $d2 (type $fn-spin) (canon lift (core func $d2-core)))
  (func $a6 (type $fn-spin) (canon lift (core func $a6-core)))
  (func $b4 (type $fn-spin) (canon lift (core func $b4-core)))
  (func $b6 (type $fn-spin) (canon lift (core func $b6-core)))

  ;; Size-bomb lifts use `(memory $mem)` so the canon-lift retptr is read
  ;; from linear memory. Both string and list<u8> have flat result count = 2,
  ;; so the core fn returns one i32 retptr to the {ptr,len} pair.
  (type $fn-string-bomb (func (param "iterations" u32) (result string)))
  (type $fn-list-bomb   (func (param "iterations" u32) (result (list u8))))
  (func $c1 (type $fn-string-bomb) (canon lift (core func $c1-core) (memory $mem)))
  (func $c2 (type $fn-list-bomb)   (canon lift (core func $c2-core) (memory $mem)))

  (instance $attacks
    (export "a1-stream-read-cancel-spin"  (func $a1) (func (type $fn-spin)))
    (export "a2-stream-write-cancel-spin" (func $a2) (func (type $fn-spin)))
    (export "a3-future-read-cancel-spin"  (func $a3) (func (type $fn-spin)))
    (export "a4-future-write-cancel-spin" (func $a4) (func (type $fn-spin)))
    (export "a5-waitable-poll-spin"       (func $a5) (func (type $fn-spin)))
    (export "a7-stream-new-drop-churn"    (func $a7) (func (type $fn-spin)))
    (export "a8-waitable-set-new-drop-churn" (func $a8) (func (type $fn-spin)))
    (export "b1-stream-leak"              (func $b1) (func (type $fn-spin)))
    (export "b2-future-leak"              (func $b2) (func (type $fn-spin)))
    (export "b3-waitable-set-leak"        (func $b3) (func (type $fn-spin)))
    (export "b7-memory-grow-spin"         (func $b7) (func (type $fn-spin)))
    (export "a9-backpressure-flip"        (func $a9) (func (type $fn-spin)))
    (export "d1-read-dropped-stream-spin" (func $d1) (func (type $fn-spin)))
    (export "d3-poll-empty-waitable-set"  (func $d3) (func (type $fn-spin)))
    (export "d2-double-drop-spin"         (func $d2) (func (type $fn-spin)))
    (export "a6-subtask-cancel-spin"      (func $a6) (func (type $fn-spin)))
    (export "b4-subtask-leak"             (func $b4) (func (type $fn-spin)))
    (export "b6-resource-leak"            (func $b6) (func (type $fn-spin)))
    (export "c1-string-len-bomb"          (func $c1) (func (type $fn-string-bomb)))
    (export "c2-list-len-bomb"            (func $c2) (func (type $fn-list-bomb)))
  )
  (export "test:bad-guests/attacks@0.1.0" (instance $attacks))
)
