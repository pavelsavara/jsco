;; Minimal component that exports two sync functions:
;;   do-trap():         hits `unreachable` → traps
;;   do-ok() -> u32:    returns 42 → used to verify poisoned state after trap
;;
;; Interface: test:trap/sync@0.1.0

(component $trap-sync-wat

  ;; Core module — implements both functions
  (core module $impl
    (func $do-trap (export "do-trap")
      unreachable
    )
    (func $do-ok (export "do-ok") (result i32)
      i32.const 42
    )
  )
  (core instance $core (instantiate $impl))

  ;; Component-level types
  (type $fn-do-trap (func))
  (type $fn-do-ok (func (result u32)))

  ;; Lift core functions to component functions
  (alias core export $core "do-trap" (core func $core-do-trap))
  (func $do-trap (type $fn-do-trap) (canon lift (core func $core-do-trap)))

  (alias core export $core "do-ok" (core func $core-do-ok))
  (func $do-ok (type $fn-do-ok) (canon lift (core func $core-do-ok)))

  ;; Export as test:trap/sync@0.1.0
  (instance $sync-inst
    (export "do-trap" (func $do-trap) (func (type $fn-do-trap)))
    (export "do-ok" (func $do-ok) (func (type $fn-do-ok)))
  )
  (export "test:trap/sync@0.1.0" (instance $sync-inst))
)
