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

  (core func $ws-new        (canon waitable-set.new))
  (core func $ws-drop       (canon waitable-set.drop))
  (core func $waitable-join (canon waitable.join))

  (core func $ctx-get-0 (canon context.get i32 0))
  (core func $ctx-set-0 (canon context.set i32 0))

  (core func $subtask-drop (canon subtask.drop))

  (type $result-void (result))
  (core func $task-return (canon task.return (result $result-void)))

  (core module $impl
    (import "host" "memory"        (memory 0))
    (import "host" "slow-fn"       (func $slow-fn       (result i32)))
    (import "host" "ws-new"        (func $ws-new        (result i32)))
    (import "host" "ws-drop"       (func $ws-drop       (param i32)))
    (import "host" "waitable-join" (func $waitable-join (param i32 i32)))
    (import "host" "ctx-get-0"     (func $ctx-get-0     (result i32)))
    (import "host" "ctx-set-0"     (func $ctx-set-0     (param i32)))
    (import "host" "subtask-drop"  (func $subtask-drop  (param i32)))
    (import "host" "task-return"   (func $task-return   (param i32)))

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
  )

  (core instance $host-exports
    (export "memory"        (memory $mem))
    (export "slow-fn"       (func $slow-fn-core))
    (export "ws-new"        (func $ws-new))
    (export "ws-drop"       (func $ws-drop))
    (export "waitable-join" (func $waitable-join))
    (export "ctx-get-0"     (func $ctx-get-0))
    (export "ctx-set-0"     (func $ctx-set-0))
    (export "subtask-drop"  (func $subtask-drop))
    (export "task-return"   (func $task-return))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  (alias core export $core "wait-once-start" (core func $wait-once-start-core))
  (alias core export $core "wait-once-cb"    (core func $wait-once-cb-core))
  (alias core export $core "wait-two-start"  (core func $wait-two-start-core))
  (alias core export $core "wait-two-cb"     (core func $wait-two-cb-core))

  (type $fn-async-void (func async (result $result-void)))

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

  (instance $runner-inst
    (export "wait-once"          (func $wait-once)         (func (type $fn-async-void)))
    (export "wait-two-parallel"  (func $wait-two-parallel) (func (type $fn-async-void)))
  )
  (export "test:multi/runner@0.1.0" (instance $runner-inst))
)
