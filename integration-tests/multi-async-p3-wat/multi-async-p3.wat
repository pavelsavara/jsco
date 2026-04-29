;; P3 async component for testing concurrent host-call patterns.
;;
;; Imports: test:multi/host@0.1.0 { slow-fn() }
;; Exports: test:multi/runner@0.1.0 {
;;   wait-once()              — single async call, waits for completion
;;   wait-two-parallel()      — two async calls joined to one waitable-set
;; }
;;
;; `wait-once` is meant to be invoked many times *concurrently* by JS to
;; verify that multiple in-flight guest tasks do not interfere via shared
;; per-instance state (waitable-set table, ctx slots, subtask table, …).
;;
;; `wait-two-parallel` exercises the canonical "two subtasks joined to one
;; waitable-set" pattern: the callback fires once per resolved subtask,
;; drops it, and only EXITs once both have returned.

(component $multi-async-p3-wat

  (type $fn-slow (func))
  (type $host-iface (instance
    (export "slow-fn" (func (type $fn-slow)))
  ))
  (import "test:multi/host@0.1.0" (instance $host (type $host-iface)))

  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  (alias export $host "slow-fn" (func $slow-fn-comp))
  (core func $slow-fn-core (canon lower (func $slow-fn-comp) async (memory $mem)))
  ;; P4: sync canon.lower of the same component fn — host import is wrapped
  ;; with `WebAssembly.Suspending` so the wasm caller suspends until the JS
  ;; Promise resolves (no subtask is created). Lets P4 mix async-lower
  ;; (slow-fn) and sync-lower-with-JSPI (sync-fn) on one instance.
  (core func $sync-fn-core (canon lower (func $slow-fn-comp)))

  (core func $ws-new        (canon waitable-set.new))
  (core func $ws-drop       (canon waitable-set.drop))
  (core func $waitable-join (canon waitable.join))

  (core func $ctx-get-0 (canon context.get i32 0))
  (core func $ctx-set-0 (canon context.set i32 0))
  ;; P5: ctx slot 1 stores the resource handle so it survives the suspend
  ;; (the task.context block is per-task so reading it back in the callback
  ;; verifies per-task state survived).
  (core func $ctx-get-1 (canon context.get i32 1))
  (core func $ctx-set-1 (canon context.set i32 1))

  (core func $subtask-drop (canon subtask.drop))

  ;; Canon backpressure ops (component-level; no params/results).
  (core func $bp-inc (canon backpressure.inc))
  (core func $bp-dec (canon backpressure.dec))

  ;; P5: component-defined resource so we can verify the resource handle
  ;; table survives a JSPI/async-lower suspend on the same instance. Each
  ;; `survive-resource` invocation creates one resource (rep marker) before
  ;; suspending, then re-reads the rep in the callback after wake-up.
  (type $p5-res (resource (rep i32)))
  (core func $p5-res-new  (canon resource.new  $p5-res))
  (core func $p5-res-rep  (canon resource.rep  $p5-res))
  (core func $p5-res-drop (canon resource.drop $p5-res))

  (type $result-void (result))
  (core func $task-return (canon task.return (result $result-void)))

  (core module $impl
    (import "host" "memory"        (memory 0))
    (import "host" "slow-fn"       (func $slow-fn       (result i32)))
    (import "host" "sync-fn"       (func $sync-fn))
    (import "host" "ws-new"        (func $ws-new        (result i32)))
    (import "host" "ws-drop"       (func $ws-drop       (param i32)))
    (import "host" "waitable-join" (func $waitable-join (param i32 i32)))
    (import "host" "ctx-get-0"     (func $ctx-get-0     (result i32)))
    (import "host" "ctx-set-0"     (func $ctx-set-0     (param i32)))
    (import "host" "ctx-get-1"     (func $ctx-get-1     (result i32)))
    (import "host" "ctx-set-1"     (func $ctx-set-1     (param i32)))
    (import "host" "subtask-drop"  (func $subtask-drop  (param i32)))
    (import "host" "task-return"   (func $task-return   (param i32)))
    (import "host" "bp-inc"        (func $bp-inc))
    (import "host" "bp-dec"        (func $bp-dec))
    (import "host" "p5-res-new"    (func $p5-res-new    (param i32) (result i32)))
    (import "host" "p5-res-rep"   (func $p5-res-rep    (param i32) (result i32)))
    (import "host" "p5-res-drop"   (func $p5-res-drop   (param i32)))

    ;; SubtaskState: STARTING=0, STARTED=1, RETURNED=2
    ;; Async lower returns: state | (handle << 4)
    ;; Callback return: EXIT=0, YIELD=1, WAIT=2|(ws_id<<4)

    ;; ------------------------------------------------------------------
    ;; wait-once: single async slow-fn call, suspend until completion.
    ;; ctx-0 layout: (subtask_handle << 16) | ws_id   (both fit in 16 bits)
    ;; ------------------------------------------------------------------
    (func $wait-once-start (export "wait-once-start") (result i32)
      (local $r i32)
      (local $h i32)
      (local $ws i32)

      (local.set $r (call $slow-fn))

      ;; Sync completion (state=RETURNED): nothing to wait on.
      (if (i32.eq (i32.and (local.get $r) (i32.const 15)) (i32.const 2))
        (then
          (call $task-return (i32.const 0))
          (return (i32.const 0)) ;; EXIT
        )
      )

      (local.set $h  (i32.shr_u (local.get $r) (i32.const 4)))
      (local.set $ws (call $ws-new))

      (call $ctx-set-0
        (i32.or
          (i32.shl (local.get $h) (i32.const 16))
          (local.get $ws)))

      (call $waitable-join (local.get $h) (local.get $ws))

      ;; WAIT | (ws<<4)
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4)))
    )

    (func $wait-once-cb (export "wait-once-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (local $ctx i32)
      (local.set $ctx (call $ctx-get-0))

      (call $subtask-drop (i32.shr_u (local.get $ctx) (i32.const 16)))
      (call $ws-drop      (i32.and   (local.get $ctx) (i32.const 0xFFFF)))
      (call $task-return  (i32.const 0))
      (i32.const 0) ;; EXIT
    )

    ;; ------------------------------------------------------------------
    ;; wait-two-parallel: two async slow-fn calls joined to ONE waitable-set.
    ;; ctx-0 layout: (remaining_count << 24) | ws_id
    ;; remaining_count starts at how many calls returned STARTED (0..2).
    ;; ------------------------------------------------------------------
    (func $wait-two-start (export "wait-two-start") (result i32)
      (local $r i32)
      (local $h i32)
      (local $ws i32)
      (local $count i32)

      (local.set $count (i32.const 0))
      (local.set $ws (call $ws-new))

      ;; ---- first call ----
      (local.set $r (call $slow-fn))
      (if (i32.ne (i32.and (local.get $r) (i32.const 15)) (i32.const 2))
        (then
          (local.set $h (i32.shr_u (local.get $r) (i32.const 4)))
          (call $waitable-join (local.get $h) (local.get $ws))
          (local.set $count (i32.add (local.get $count) (i32.const 1)))
        )
      )

      ;; ---- second call ----
      (local.set $r (call $slow-fn))
      (if (i32.ne (i32.and (local.get $r) (i32.const 15)) (i32.const 2))
        (then
          (local.set $h (i32.shr_u (local.get $r) (i32.const 4)))
          (call $waitable-join (local.get $h) (local.get $ws))
          (local.set $count (i32.add (local.get $count) (i32.const 1)))
        )
      )

      ;; If everything returned synchronously, exit immediately.
      (if (i32.eqz (local.get $count))
        (then
          (call $ws-drop (local.get $ws))
          (call $task-return (i32.const 0))
          (return (i32.const 0)) ;; EXIT
        )
      )

      (call $ctx-set-0
        (i32.or
          (i32.shl (local.get $count) (i32.const 24))
          (local.get $ws)))

      ;; WAIT | (ws<<4)
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4)))
    )

    (func $wait-two-cb (export "wait-two-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (local $ctx i32)
      (local $ws i32)
      (local $remaining i32)

      (local.set $ctx (call $ctx-get-0))
      (local.set $ws        (i32.and (local.get $ctx) (i32.const 0x00FFFFFF)))
      (local.set $remaining (i32.shr_u (local.get $ctx) (i32.const 24)))

      ;; Drop the subtask whose event we just received.
      (call $subtask-drop (local.get $handle))

      (local.set $remaining (i32.sub (local.get $remaining) (i32.const 1)))

      (if (i32.eqz (local.get $remaining))
        (then
          (call $ws-drop     (local.get $ws))
          (call $task-return (i32.const 0))
          (return (i32.const 0)) ;; EXIT
        )
      )

      ;; Persist updated count and keep waiting.
      (call $ctx-set-0
        (i32.or
          (i32.shl (local.get $remaining) (i32.const 24))
          (local.get $ws)))

      ;; WAIT | (ws<<4)
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4)))
    )

    ;; ------------------------------------------------------------------
    ;; return-early (P3): start slow-fn, task.return BEFORE the subtask
    ;; completes, then keep waiting in the callback until the subtask
    ;; resolves before EXITing. The JS-side Promise must resolve as soon
    ;; as task.return is invoked (per the createAsyncLiftWrapper G3 fix);
    ;; the in-flight subtask is then drained in the background.
    ;; ctx-0 layout matches wait-once: (subtask_handle << 16) | ws_id
    ;; ------------------------------------------------------------------
    (func $return-early-start (export "return-early-start") (result i32)
      (local $r i32)
      (local $h i32)
      (local $ws i32)

      (local.set $r (call $slow-fn))

      ;; Sync completion: deliver and exit.
      (if (i32.eq (i32.and (local.get $r) (i32.const 15)) (i32.const 2))
        (then
          (call $task-return (i32.const 0))
          (return (i32.const 0)) ;; EXIT
        )
      )

      (local.set $h  (i32.shr_u (local.get $r) (i32.const 4)))
      (local.set $ws (call $ws-new))

      (call $ctx-set-0
        (i32.or
          (i32.shl (local.get $h) (i32.const 16))
          (local.get $ws)))

      (call $waitable-join (local.get $h) (local.get $ws))

      ;; Deliver result to JS *before* the subtask completes.
      (call $task-return (i32.const 0))

      ;; Continue waiting in the background until the subtask resolves.
      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4)))
    )

    (func $return-early-cb (export "return-early-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (local $ctx i32)
      (local.set $ctx (call $ctx-get-0))

      (call $subtask-drop (i32.shr_u (local.get $ctx) (i32.const 16)))
      (call $ws-drop      (i32.and   (local.get $ctx) (i32.const 0xFFFF)))
      ;; NOTE: no task-return here — already delivered in start.
      (i32.const 0) ;; EXIT
    )

    ;; ------------------------------------------------------------------
    ;; bp-bump (P6): start slow-fn, then call backpressure.inc/dec a few
    ;; times before suspending on the waitable-set. Verifies that
    ;; toggling backpressure on one task does not corrupt other in-flight
    ;; suspended tasks on the same instance. The callback restores the
    ;; backpressure delta to zero before EXIT.
    ;; ctx-0 layout matches wait-once.
    ;; ------------------------------------------------------------------
    (func $bp-bump-start (export "bp-bump-start") (result i32)
      (local $r i32)
      (local $h i32)
      (local $ws i32)

      (local.set $r (call $slow-fn))

      (if (i32.eq (i32.and (local.get $r) (i32.const 15)) (i32.const 2))
        (then
          (call $task-return (i32.const 0))
          (return (i32.const 0)) ;; EXIT
        )
      )

      (local.set $h  (i32.shr_u (local.get $r) (i32.const 4)))
      (local.set $ws (call $ws-new))

      (call $ctx-set-0
        (i32.or
          (i32.shl (local.get $h) (i32.const 16))
          (local.get $ws)))

      (call $waitable-join (local.get $h) (local.get $ws))

      ;; Touch backpressure: net +1 across the wait.
      (call $bp-inc)
      (call $bp-inc)
      (call $bp-dec)

      (i32.or (i32.const 2) (i32.shl (local.get $ws) (i32.const 4)))
    )

    (func $bp-bump-cb (export "bp-bump-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (local $ctx i32)
      (local.set $ctx (call $ctx-get-0))

      (call $subtask-drop (i32.shr_u (local.get $ctx) (i32.const 16)))
      (call $ws-drop      (i32.and   (local.get $ctx) (i32.const 0xFFFF)))

      ;; Restore: cancel the net +1 from start so backpressure ends at 0.
      (call $bp-dec)

      (call $task-return (i32.const 0))
      (i32.const 0) ;; EXIT
    )

    ;; ------------------------------------------------------------------
    ;; wait-once-sync (P4, P8): SYNC canon.lower path — the host import
    ;; is wrapped with `WebAssembly.Suspending` so calling $sync-fn
    ;; suspends the wasm continuation until the JS Promise resolves.
    ;; No subtask, no waitable-set. The export uses a SYNC lift so the
    ;; wasm body runs straight through one Suspending host call. Multiple
    ;; concurrent invocations on the same instance must each suspend on
    ;; their own JSPI continuation (P8 deadlock-freedom positive control).
    ;; ------------------------------------------------------------------
    (func $wait-once-sync (export "wait-once-sync")
      (call $sync-fn)
    )

    ;; ------------------------------------------------------------------
    ;; survive-resource (P5): create a component-defined resource, hold
    ;; its handle in a wasm LOCAL across a JSPI Suspending sync-fn call,
    ;; then verify resource.rep still returns the original marker before
    ;; dropping. Sync lift + sync-canon-lower means the wasm continuation
    ;; is paused by JSPI — locals survive naturally, no per-task ctx slot
    ;; juggling required. Traps via `unreachable` if the rep changed.
    ;; ------------------------------------------------------------------
    (func $survive-resource (export "survive-resource")
      (local $rh i32)
      ;; Create resource with rep=0x42; remember handle in a LOCAL.
      (local.set $rh (call $p5-res-new (i32.const 0x42)))
      ;; Suspend the wasm continuation via JSPI sync-canon-lower.
      (call $sync-fn)
      ;; After resume, $rh still holds the original handle.
      (if (i32.ne (call $p5-res-rep (local.get $rh)) (i32.const 0x42))
        (then unreachable))
      (call $p5-res-drop (local.get $rh))
    )

    ;; ------------------------------------------------------------------
    ;; c2-double-return (proposals.md C2): async-lift export that calls
    ;; `task.return` twice in the same task. Spec invariant: the second
    ;; call must trap (Wasmtime: Trap::TaskCancelOrReturnTwice).
    ;; ------------------------------------------------------------------
    (func $c2-double-return-start (export "c2-double-return-start") (result i32)
      (call $task-return (i32.const 0))   ;; first call: delivers void result.
      (call $task-return (i32.const 0))   ;; second call: must trap.
      (i32.const 0) ;; EXIT (unreachable when the runtime correctly traps).
    )
    (func $c2-double-return-cb (export "c2-double-return-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (i32.const 0) ;; EXIT — never reached because start traps before WAIT.
    )
  )

  (core instance $host-exports
    (export "memory"        (memory $mem))
    (export "slow-fn"       (func $slow-fn-core))
    (export "sync-fn"       (func $sync-fn-core))
    (export "ws-new"        (func $ws-new))
    (export "ws-drop"       (func $ws-drop))
    (export "waitable-join" (func $waitable-join))
    (export "ctx-get-0"     (func $ctx-get-0))
    (export "ctx-set-0"     (func $ctx-set-0))
    (export "ctx-get-1"     (func $ctx-get-1))
    (export "ctx-set-1"     (func $ctx-set-1))
    (export "subtask-drop"  (func $subtask-drop))
    (export "task-return"   (func $task-return))
    (export "bp-inc"        (func $bp-inc))
    (export "bp-dec"        (func $bp-dec))
    (export "p5-res-new"    (func $p5-res-new))
    (export "p5-res-rep"    (func $p5-res-rep))
    (export "p5-res-drop"   (func $p5-res-drop))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  (alias core export $core "wait-once-start"    (core func $wait-once-start-core))
  (alias core export $core "wait-once-cb"       (core func $wait-once-cb-core))
  (alias core export $core "wait-two-start"     (core func $wait-two-start-core))
  (alias core export $core "wait-two-cb"        (core func $wait-two-cb-core))
  (alias core export $core "return-early-start" (core func $return-early-start-core))
  (alias core export $core "return-early-cb"    (core func $return-early-cb-core))
  (alias core export $core "bp-bump-start"      (core func $bp-bump-start-core))
  (alias core export $core "bp-bump-cb"         (core func $bp-bump-cb-core))
  (alias core export $core "wait-once-sync"     (core func $wait-once-sync-core))
  (alias core export $core "survive-resource"   (core func $survive-resource-core))
  (alias core export $core "c2-double-return-start" (core func $c2-double-return-start-core))
  (alias core export $core "c2-double-return-cb"    (core func $c2-double-return-cb-core))

  (type $fn-async-void (func async (result $result-void)))
  ;; SYNC lift type for wait-once-sync (no `async`, no callback).
  (type $fn-sync-void (func (result $result-void)))

  (func $wait-once (type $fn-async-void)
    (canon lift (core func $wait-once-start-core) async
      (callback $wait-once-cb-core) (memory $mem)
    )
  )
  (func $wait-two-parallel (type $fn-async-void)
    (canon lift (core func $wait-two-start-core) async
      (callback $wait-two-cb-core) (memory $mem)
    )
  )
  (func $return-early (type $fn-async-void)
    (canon lift (core func $return-early-start-core) async
      (callback $return-early-cb-core) (memory $mem)
    )
  )
  (func $bp-bump (type $fn-async-void)
    (canon lift (core func $bp-bump-start-core) async
      (callback $bp-bump-cb-core) (memory $mem)
    )
  )
  ;; Sync lift: the export returns synchronously to the wasm caller (which
  ;; itself is JSPI-wrapped, so JS sees a Promise). The body suspends via
  ;; the Suspending-wrapped sync-fn host import.
  (func $wait-once-sync (type $fn-sync-void)
    (canon lift (core func $wait-once-sync-core))
  )
  (func $survive-resource (type $fn-sync-void)
    (canon lift (core func $survive-resource-core))
  )
  (func $c2-double-return (type $fn-async-void)
    (canon lift (core func $c2-double-return-start-core) async
      (callback $c2-double-return-cb-core) (memory $mem)
    )
  )

  (instance $runner-inst
    (export "wait-once"          (func $wait-once)         (func (type $fn-async-void)))
    (export "wait-two-parallel"  (func $wait-two-parallel) (func (type $fn-async-void)))
    (export "return-early"       (func $return-early)      (func (type $fn-async-void)))
    (export "bp-bump"            (func $bp-bump)           (func (type $fn-async-void)))
    (export "wait-once-sync"     (func $wait-once-sync)    (func (type $fn-sync-void)))
    (export "survive-resource"   (func $survive-resource)  (func (type $fn-sync-void)))
    (export "c2-double-return"   (func $c2-double-return)  (func (type $fn-async-void)))
  )
  (export "test:multi/runner@0.1.0" (instance $runner-inst))
)
