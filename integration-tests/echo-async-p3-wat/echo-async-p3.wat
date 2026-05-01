;; Hand-written component-model WAT exercising the P3 `error-context`
;; canonical built-ins documented in
;; D:\component-model\design\mvp\Explainer.md (lines 1465-1467,
;; 2262-2300) and implemented in jsco's resolver at
;; src/resolver/core-functions.ts (`resolveCanonicalFunctionErrorContext*`).
;;
;; This is the first slice of the `jsco:test/echo-async@0.1.0` interface
;; declared in wit/jsco-echo.wit. Streams, futures, async lift/lower and
;; subtask.cancel coverage will be added in sibling WATs (one feature per
;; component, mirroring `dispose-async-p3-wat` / `multi-async-p3-wat`).
;;
;; Exports (all sync lift):
;;   * make-error-context(message: string) -> error-context
;;       Calls `error-context.new` directly with the inbound string ptr/len.
;;   * echo-error-context(e: error-context) -> error-context
;;       Identity at the core level. The lift wrapper inserts the JS-side
;;       value into `mctx.errorContexts` (`add`), the guest returns the
;;       same handle, the lower wrapper extracts it (`remove`). End-to-end
;;       this exercises the value-form crossing of the table.
;;
;; The component takes no imports: error-context.new and error-context.drop
;; are canon built-ins, not host imports.

(component $echo-async-p3-wat

  ;; Linear memory shared with all canonical built-ins that touch strings.
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; Canon built-ins.
  ;;   error-context.new takes (msg_ptr i32, tagged_code_units i32) -> i32 handle.
  ;;   error-context.drop takes (handle i32) -> ().
  (core func $error-context-new
    (canon error-context.new (memory $mem) string-encoding=utf8))
  (core func $error-context-drop
    (canon error-context.drop))

  ;; Bump allocator — required by the canon string-lifting path even
  ;; though our core functions never call cabi_realloc themselves; the
  ;; runtime asserts a non-zero memory and a present cabi_realloc when
  ;; preparing the string lifter for the inbound `message` argument.
  (core module $impl
    (import "host" "memory" (memory 0))
    (import "host" "error-context-new"  (func $ec-new  (param i32 i32) (result i32)))
    (import "host" "error-context-drop" (func $ec-drop (param i32)))

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

    ;; make(message_ptr, message_len) -> error-context handle
    (func $make (export "make") (param $ptr i32) (param $len i32) (result i32)
      local.get $ptr
      local.get $len
      call $ec-new
    )

    ;; echo(handle) -> handle  (pure identity; the lift/lower wrappers
    ;; do all the table-level work).
    (func $echo (export "echo") (param $handle i32) (result i32)
      local.get $handle
    )

    ;; drop(handle) -> ()  (explicit drop, not used by the value-form
    ;; round-trip but exposed so the test suite can drive
    ;; `error-context.drop` directly).
    (func $drop (export "drop") (param $handle i32)
      local.get $handle
      call $ec-drop
    )
  )

  (core instance $host-exports
    (export "memory"              (memory $mem))
    (export "error-context-new"   (func $error-context-new))
    (export "error-context-drop"  (func $error-context-drop))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))
  (alias core export $core "make"           (core func $core-make))
  (alias core export $core "echo"           (core func $core-echo))
  (alias core export $core "drop"           (core func $core-drop))
  (alias core export $core "cabi_realloc"   (core func $realloc))

  ;; Component-level function types.
  (type $fn-make (func (param "message" string) (result error-context)))
  (type $fn-echo (func (param "e" error-context) (result error-context)))
  (type $fn-drop (func (param "e" error-context)))

  (func $make-error-context (type $fn-make)
    (canon lift (core func $core-make)
      (memory $mem) (realloc $realloc) string-encoding=utf8))

  (func $echo-error-context (type $fn-echo)
    (canon lift (core func $core-echo)))

  (func $drop-error-context (type $fn-drop)
    (canon lift (core func $core-drop)))

  (instance $iface
    (export "make-error-context" (func $make-error-context))
    (export "echo-error-context" (func $echo-error-context))
    (export "drop-error-context" (func $drop-error-context))
  )
  (export "jsco:test/echo-async@0.1.0" (instance $iface))
)
