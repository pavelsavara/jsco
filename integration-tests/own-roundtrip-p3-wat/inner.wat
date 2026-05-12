;; S6 inner component — defines a resource R and exports it via an interface.
;;
;; Exports: test:s6/iface@0.1.0 {
;;   resource r
;;   [constructor]r(rep: u32) -> own<r>
;;   [method]r.get-rep(self: borrow<r>) -> u32
;;   inner-fn(r: own<r>) -> own<r>        — pure pass-through
;; }

(component $inner-resource-p3

  ;; Component-level resource type (representation = i32)
  (type $r (resource (rep i32)))

  ;; Shared linear memory (required by wasm-tools even if unused directly)
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; Canonical resource operations
  (core func $r-new  (canon resource.new  $r))
  (core func $r-rep  (canon resource.rep  $r))
  (core func $r-drop (canon resource.drop $r))

  ;; Core implementation module
  (core module $impl
    (import "host" "r-new"  (func $r-new  (param i32) (result i32)))
    (import "host" "r-rep"  (func $r-rep  (param i32) (result i32)))
    (import "host" "r-drop" (func $r-drop (param i32)))

    ;; [constructor]r(rep: u32) -> own<r>
    ;; Calls resource.new with the rep value → returns handle.
    (func $ctor (export "ctor") (param $rep i32) (result i32)
      (call $r-new (local.get $rep))
    )

    ;; [method]r.get-rep(self: borrow<r>) -> u32
    ;; For own-instance resources, borrow lifting passes the rep directly
    ;; (not a table handle), so we just return the input.
    (func $get-rep (export "get-rep") (param $h i32) (result i32)
      (local.get $h)
    )

    ;; inner-fn(r: own<r>) -> own<r>
    ;; Pure pass-through: returns the same handle it received.
    (func $inner-fn (export "inner-fn") (param $h i32) (result i32)
      (local.get $h)
    )

    ;; [resource-drop]r destructor — just calls canon resource.drop.
    (func $r-dtor (export "r-dtor") (param $h i32)
      (call $r-drop (local.get $h))
    )
  )

  ;; Bundle canon ops into a core instance for the core module's imports
  (core instance $host-exports
    (export "r-new"  (func $r-new))
    (export "r-rep"  (func $r-rep))
    (export "r-drop" (func $r-drop))
  )
  (core instance $impl-inst (instantiate $impl
    (with "host" (instance $host-exports))
  ))

  ;; Alias core exports
  (alias core export $impl-inst "ctor"     (core func $ctor-core))
  (alias core export $impl-inst "get-rep"  (core func $get-rep-core))
  (alias core export $impl-inst "inner-fn" (core func $inner-fn-core))
  (alias core export $impl-inst "r-dtor"   (core func $r-dtor-core))

  ;; Component-level function types
  (type $fn-ctor     (func (param "rep" u32) (result (own $r))))
  (type $fn-get-rep  (func (param "self" (borrow $r)) (result u32)))
  (type $fn-inner-fn (func (param "r" (own $r)) (result (own $r))))
  (type $fn-r-dtor   (func (param "self" (own $r))))

  ;; Lift core functions to component level
  (func $ctor-comp     (type $fn-ctor)     (canon lift (core func $ctor-core)))
  (func $get-rep-comp  (type $fn-get-rep)  (canon lift (core func $get-rep-core)))
  (func $inner-fn-comp (type $fn-inner-fn) (canon lift (core func $inner-fn-core)))
  (func $r-dtor-comp   (type $fn-r-dtor)   (canon lift (core func $r-dtor-core)))

  ;; Export as interface instance
  (instance $iface
    (export "r" (type $r))
    (export "[constructor]r" (func $ctor-comp))
    (export "[method]r.get-rep" (func $get-rep-comp))
    (export "[resource-drop]r" (func $r-dtor-comp))
    (export "inner-fn" (func $inner-fn-comp))
  )
  (export "test:s6/iface@0.1.0" (instance $iface))
)
