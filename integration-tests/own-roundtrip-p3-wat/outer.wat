;; S6 outer component — imports the resource interface from inner and wraps it.
;;
;; Imports: test:s6/iface@0.1.0 { r, [constructor]r, [method]r.get-rep,
;;          [resource-drop]r, inner-fn }
;; Exports: test:s6/outer@0.1.0 {
;;   roundtrip(h: own<r>) -> own<r>       — calls inner-fn (pass-through chain)
;;   reconstitute(h: own<r>) -> own<r>    — drops input, creates fresh R(999),
;;                                          forwards through inner-fn
;; }

(component $outer-resource-p3

  ;; Import the interface that inner exports — resource type R is shared.
  ;; Inside (type (instance ...)), exported types use POSITIONAL indices.
  (type $iface-type (instance
    (export "r" (type (sub resource)))                                          ;; idx 0
    (export "[constructor]r" (func (param "rep" u32) (result (own 0))))
    (export "[method]r.get-rep" (func (param "self" (borrow 0)) (result u32)))
    (export "[resource-drop]r" (func (param "self" (own 0))))
    (export "inner-fn" (func (param "r" (own 0)) (result (own 0))))
  ))
  (import "test:s6/iface@0.1.0" (instance $iface (type $iface-type)))

  ;; Alias what we need from the import
  (alias export $iface "r" (type $r))
  (alias export $iface "[constructor]r" (func $r-ctor))
  (alias export $iface "inner-fn" (func $inner-fn))

  ;; Shared linear memory
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; Lower imported component functions to core functions
  (core func $r-ctor-core   (canon lower (func $r-ctor)))
  (core func $inner-fn-core (canon lower (func $inner-fn)))
  ;; Canon resource.drop for the imported R type
  (core func $r-drop-core   (canon resource.drop $r))

  ;; Core implementation
  (core module $impl
    (import "host" "r-ctor"   (func $r-ctor   (param i32) (result i32)))
    (import "host" "inner-fn" (func $inner-fn  (param i32) (result i32)))
    (import "host" "r-drop"   (func $r-drop    (param i32)))

    ;; roundtrip: own<R> → own<R> via inner-fn (pass-through chain)
    (func $roundtrip (export "roundtrip") (param $h i32) (result i32)
      (call $inner-fn (local.get $h))
    )

    ;; reconstitute: drops input, creates a NEW R with rep=999, calls inner-fn,
    ;; returns. Exercises the "middleware reconstitutes via Resource::new" scenario.
    (func $reconstitute (export "reconstitute") (param $h i32) (result i32)
      (local $new i32)
      ;; Drop the input. Per spec, this consumes the handle.
      (call $r-drop (local.get $h))
      ;; Construct a fresh R with rep=999 via imported constructor.
      (local.set $new (call $r-ctor (i32.const 999)))
      ;; Forward the new handle through inner-fn.
      (call $inner-fn (local.get $new))
    )
  )

  (core instance $impl-inst (instantiate $impl
    (with "host" (instance
      (export "r-ctor"   (func $r-ctor-core))
      (export "inner-fn" (func $inner-fn-core))
      (export "r-drop"   (func $r-drop-core))
    ))
  ))

  ;; Alias core exports
  (alias core export $impl-inst "roundtrip"    (core func $roundtrip-core))
  (alias core export $impl-inst "reconstitute" (core func $reconstitute-core))

  ;; Component-level function type (both exports share the same signature)
  (type $fn-own-roundtrip (func (param "h" (own $r)) (result (own $r))))

  ;; Lift to component level
  (func $roundtrip-comp    (type $fn-own-roundtrip) (canon lift (core func $roundtrip-core)))
  (func $reconstitute-comp (type $fn-own-roundtrip) (canon lift (core func $reconstitute-core)))

  ;; Export as interface instance
  (instance $outer
    (export "roundtrip"    (func $roundtrip-comp))
    (export "reconstitute" (func $reconstitute-comp))
  )
  (export "test:s6/outer@0.1.0" (instance $outer))
)
