;; P3 async component for testing dispose/abort mid-wait.
;;
;; Imports: test:trap/host@0.1.0 { block-me() }
;; Exports: test:trap/async-runner@0.1.0 { run(), do-ok() -> u32 }

(component $dispose-async-p3-wat

  (type $fn-block-me (func))
  (type $host-iface (instance
    (export "block-me" (func (type $fn-block-me)))
  ))
  (import "test:trap/host@0.1.0" (instance $host (type $host-iface)))

  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  (alias export $host "block-me" (func $block-me-comp))
  (core func $block-me-core (canon lower (func $block-me-comp) async (memory $mem)))

  (core func $ws-new (canon waitable-set.new))
  (core func $ws-poll (canon waitable-set.poll (memory $mem)))
  (core func $ws-drop (canon waitable-set.drop))
  (core func $waitable-join (canon waitable.join))

  (core func $ctx-get-0 (canon context.get i32 0))
  (core func $ctx-set-0 (canon context.set i32 0))

  (core func $subtask-drop (canon subtask.drop))

  (type $result-void (result))
  (core func $task-return (canon task.return (result $result-void)))

  (core module $impl
    (import "host" "memory"          (memory 0))
    (import "host" "block-me"        (func $block-me (result i32)))
    (import "host" "ws-new"          (func $ws-new (result i32)))
    (import "host" "ws-poll"         (func $ws-poll (param i32 i32) (result i32)))
    (import "host" "ws-drop"         (func $ws-drop (param i32)))
    (import "host" "waitable-join"   (func $waitable-join (param i32 i32)))
    (import "host" "ctx-get-0"       (func $ctx-get-0 (result i32)))
    (import "host" "ctx-set-0"       (func $ctx-set-0 (param i32)))
    (import "host" "subtask-drop"    (func $subtask-drop (param i32)))
    (import "host" "task-return"     (func $task-return (param i32)))

    ;; SubtaskState: STARTING=0, STARTED=1, RETURNED=2
    ;; Async lower returns: state | (handle << 4)
    ;; Callback return: EXIT=0, YIELD=1, WAIT=2|(ws_id<<4)

    (func $start (export "start") (result i32)
      (local $subtask-result i32)
      (local $subtask-handle i32)
      (local $subtask-state i32)
      (local $ws-id i32)

      call $block-me
      local.set $subtask-result

      ;; Extract state (low 4 bits) and handle (bits 4+)
      local.get $subtask-result
      i32.const 15
      i32.and
      local.set $subtask-state

      local.get $subtask-result
      i32.const 4
      i32.shr_u
      local.set $subtask-handle

      ;; If RETURNED (state=2), subtask completed synchronously
      ;; No subtask handle was created — don't drop
      local.get $subtask-state
      i32.const 2  ;; RETURNED
      i32.eq
      if
        ;; task.return ok (discriminant=0)
        i32.const 0
        call $task-return

        ;; EXIT
        i32.const 0
        return
      end

      ;; STARTED (state=1) — host returned Promise, need to wait
      call $ws-new
      local.set $ws-id

      ;; Pack: (subtask_handle << 16) | ws_id
      local.get $subtask-handle
      i32.const 16
      i32.shl
      local.get $ws-id
      i32.or
      call $ctx-set-0

      ;; Join subtask to waitable set
      local.get $subtask-handle
      local.get $ws-id
      call $waitable-join

      ;; Return WAIT: 2 | (ws_id << 4)
      i32.const 2
      local.get $ws-id
      i32.const 4
      i32.shl
      i32.or
    )

    (func $callback (export "callback") (param $event-code i32) (param $handle i32) (param $return-code i32) (result i32)
      (local $ctx i32)
      (local $ws-id i32)
      (local $subtask-handle i32)

      call $ctx-get-0
      local.set $ctx
      local.get $ctx
      i32.const 0xFFFF
      i32.and
      local.set $ws-id
      local.get $ctx
      i32.const 16
      i32.shr_u
      local.set $subtask-handle

      ;; task.return ok
      i32.const 0
      call $task-return

      ;; Drop subtask and waitable set
      local.get $subtask-handle
      call $subtask-drop
      local.get $ws-id
      call $ws-drop

      ;; EXIT
      i32.const 0
    )

    (func $do-ok (export "do-ok") (result i32)
      i32.const 42
    )

    (global $heap (mut i32) (i32.const 1024))
    (func $cabi_realloc (export "cabi_realloc")
          (param $old_ptr i32) (param $old_size i32)
          (param $align i32) (param $new_size i32) (result i32)
      (local $ptr i32)
      global.get $heap
      local.set $ptr
      local.get $ptr
      local.get $new_size
      i32.add
      global.set $heap
      local.get $ptr
    )
  )

  (core instance $host-exports
    (export "memory"          (memory $mem))
    (export "block-me"        (func $block-me-core))
    (export "ws-new"          (func $ws-new))
    (export "ws-poll"         (func $ws-poll))
    (export "ws-drop"         (func $ws-drop))
    (export "waitable-join"   (func $waitable-join))
    (export "ctx-get-0"       (func $ctx-get-0))
    (export "ctx-set-0"       (func $ctx-set-0))
    (export "subtask-drop"    (func $subtask-drop))
    (export "task-return"     (func $task-return))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  (alias core export $core "start" (core func $core-start))
  (alias core export $core "callback" (core func $core-callback))
  (alias core export $core "cabi_realloc" (core func $realloc))

  (type $fn-run (func async (result $result-void)))
  (func $run (type $fn-run)
    (canon lift (core func $core-start) async (callback $core-callback)
      (memory $mem) (realloc $realloc) string-encoding=utf8
    )
  )

  (type $fn-do-ok (func (result u32)))
  (alias core export $core "do-ok" (core func $core-do-ok))
  (func $do-ok (type $fn-do-ok) (canon lift (core func $core-do-ok)))

  (instance $runner-inst
    (export "run" (func $run) (func (type $fn-run)))
    (export "do-ok" (func $do-ok) (func (type $fn-do-ok)))
  )
  (export "test:trap/async-runner@0.1.0" (instance $runner-inst))
)
