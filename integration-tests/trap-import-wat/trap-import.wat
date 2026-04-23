;; Component that imports a host function and calls it.
;; Used to test: host import throws → instance poisoned.
;;
;; Imports: test:trap/host@0.1.0 { call-me() -> u32 }
;; Exports: test:trap/caller@0.1.0 { call-host() -> u32, do-ok() -> u32 }

(component $trap-import-wat

  ;; Component-level types
  (type $fn-call-me (func (result u32)))
  (type $fn-call-host (func (result u32)))
  (type $fn-do-ok (func (result u32)))

  ;; Import host interface
  (type $host-iface (instance
    (export "call-me" (func (type $fn-call-me)))
  ))
  (import "test:trap/host@0.1.0" (instance $host (type $host-iface)))

  ;; Memory module
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; Lower the host import
  (alias export $host "call-me" (func $call-me-comp))
  (core func $call-me-core (canon lower (func $call-me-comp)))

  ;; Core module — calls the host import
  (core module $impl
    (import "host" "call-me" (func $call-me (result i32)))

    (func $call-host (export "call-host") (result i32)
      call $call-me
    )
    (func $do-ok (export "do-ok") (result i32)
      i32.const 42
    )
  )
  (core instance $core (instantiate $impl
    (with "host" (instance
      (export "call-me" (func $call-me-core))
    ))
  ))

  ;; Lift core functions
  (alias core export $core "call-host" (core func $core-call-host))
  (func $call-host (type $fn-call-host) (canon lift (core func $core-call-host)))

  (alias core export $core "do-ok" (core func $core-do-ok))
  (func $do-ok (type $fn-do-ok) (canon lift (core func $core-do-ok)))

  ;; Export
  (instance $caller-inst
    (export "call-host" (func $call-host) (func (type $fn-call-host)))
    (export "do-ok" (func $do-ok) (func (type $fn-do-ok)))
  )
  (export "test:trap/caller@0.1.0" (instance $caller-inst))
)
