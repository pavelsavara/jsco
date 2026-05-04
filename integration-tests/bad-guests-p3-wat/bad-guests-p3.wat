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
  (core func $future-cancel-read  (canon future.cancel-read   $future-u8 async))
  (core func $future-drop-readable (canon future.drop-readable $future-u8))
  (core func $future-drop-writable (canon future.drop-writable $future-u8))

  ;; Canon waitable-set ops
  (core func $ws-new              (canon waitable-set.new))
  (core func $ws-poll             (canon waitable-set.poll  (memory $mem)))
  (core func $ws-drop             (canon waitable-set.drop))

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
    (import "host" "future-cancel-read"   (func $future-cancel-read   (param i32) (result i32)))
    (import "host" "future-drop-readable" (func $future-drop-readable (param i32)))
    (import "host" "future-drop-writable" (func $future-drop-writable (param i32)))
    (import "host" "ws-new"               (func $ws-new               (result i32)))
    (import "host" "ws-poll"              (func $ws-poll              (param i32 i32) (result i32)))
    (import "host" "ws-drop"              (func $ws-drop              (param i32)))

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
    (export "future-cancel-read"   (func $future-cancel-read))
    (export "future-drop-readable" (func $future-drop-readable))
    (export "future-drop-writable" (func $future-drop-writable))
    (export "ws-new"               (func $ws-new))
    (export "ws-poll"              (func $ws-poll))
    (export "ws-drop"              (func $ws-drop))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  ;; Lift each attack export as sync (param "iterations" u32) -> u32
  (type $fn-spin (func (param "iterations" u32) (result u32)))

  (alias core export $core "a1-stream-read-cancel-spin"  (core func $a1-core))
  (alias core export $core "a2-stream-write-cancel-spin" (core func $a2-core))
  (alias core export $core "a3-future-read-cancel-spin"  (core func $a3-core))
  (alias core export $core "a5-waitable-poll-spin"       (core func $a5-core))
  (alias core export $core "a7-stream-new-drop-churn"    (core func $a7-core))
  (alias core export $core "b1-stream-leak"              (core func $b1-core))
  (alias core export $core "b3-waitable-set-leak"        (core func $b3-core))

  (func $a1 (type $fn-spin) (canon lift (core func $a1-core)))
  (func $a2 (type $fn-spin) (canon lift (core func $a2-core)))
  (func $a3 (type $fn-spin) (canon lift (core func $a3-core)))
  (func $a5 (type $fn-spin) (canon lift (core func $a5-core)))
  (func $a7 (type $fn-spin) (canon lift (core func $a7-core)))
  (func $b1 (type $fn-spin) (canon lift (core func $b1-core)))
  (func $b3 (type $fn-spin) (canon lift (core func $b3-core)))

  (instance $attacks
    (export "a1-stream-read-cancel-spin"  (func $a1) (func (type $fn-spin)))
    (export "a2-stream-write-cancel-spin" (func $a2) (func (type $fn-spin)))
    (export "a3-future-read-cancel-spin"  (func $a3) (func (type $fn-spin)))
    (export "a5-waitable-poll-spin"       (func $a5) (func (type $fn-spin)))
    (export "a7-stream-new-drop-churn"    (func $a7) (func (type $fn-spin)))
    (export "b1-stream-leak"              (func $b1) (func (type $fn-spin)))
    (export "b3-waitable-set-leak"        (func $b3) (func (type $fn-spin)))
  )
  (export "test:bad-guests/attacks@0.1.0" (instance $attacks))
)
