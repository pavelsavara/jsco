;; Hand-written component-model WAT for hello-city.
;; Imports: hello:city/logger@0.1.0   { log(string) }
;; Exports: hello:city/greeter@0.1.0  { run(city-info) }
;;
;; The component receives a city-info record {name, head-count, budget},
;; builds the greeting "Welcome to {name}, we invite you for a drink!",
;; and calls the imported log function.
;;
;; See hello-city.wit for the WIT definition.

(component $hello-city-wat
  ;; =====================================================================
  ;; Core module — implements greeting logic
  ;; =====================================================================
  (core module $hello-impl
    (import "host" "memory" (memory 0))
    (import "host" "log" (func $log (param i32 i32)))

    ;; run(city-info): core ABI receives flattened record
    ;; city-info = {name: string, head-count: u32, budget: u64}
    ;; Flat params: (name_ptr:i32, name_len:i32, head_count:i32, budget:i64)
    (func $run (export "run")
          (param $name_ptr i32) (param $name_len i32)
          (param $head_count i32) (param $budget i64)
      (local $prefix_len i32)
      (local $suffix_len i32)
      (local $total_len i32)
      (local $buf i32)

      ;; prefix = "Welcome to " (11 bytes)
      i32.const 11
      local.set $prefix_len
      ;; suffix = ", we invite you for a drink!" (28 bytes)
      i32.const 28
      local.set $suffix_len

      ;; total = prefix + name + suffix
      local.get $prefix_len
      local.get $name_len
      i32.add
      local.get $suffix_len
      i32.add
      local.set $total_len

      ;; Allocate buffer for the concatenated greeting
      i32.const 0  i32.const 0  i32.const 1  local.get $total_len
      call $cabi_realloc
      local.set $buf

      ;; Copy prefix: "Welcome to "
      local.get $buf             ;; dest
      i32.const 0                ;; src: data offset 0
      local.get $prefix_len      ;; len
      memory.copy

      ;; Copy name
      local.get $buf
      local.get $prefix_len
      i32.add                    ;; dest: buf + prefix_len
      local.get $name_ptr        ;; src: incoming name
      local.get $name_len        ;; len
      memory.copy

      ;; Copy suffix: ", we invite you for a drink!"
      local.get $buf
      local.get $prefix_len
      i32.add
      local.get $name_len
      i32.add                    ;; dest: buf + prefix_len + name_len
      i32.const 11               ;; src: data offset 11
      local.get $suffix_len      ;; len
      memory.copy

      ;; Call log(greeting_ptr, greeting_len)
      local.get $buf
      local.get $total_len
      call $log
    )

    ;; Static strings (active data segments write to imported memory)
    ;; offset 0:  "Welcome to " (11 bytes)
    ;; offset 11: ", we invite you for a drink!" (28 bytes)
    (data (i32.const 0) "Welcome to ")
    (data (i32.const 11) ", we invite you for a drink!")

    ;; Simple bump allocator — starts at 1024 to avoid overwriting static data
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

  ;; =====================================================================
  ;; Component-level types
  ;; =====================================================================
  (type $city-info (record
    (field "name" string)
    (field "head-count" u32)
    (field "budget" u64)
  ))
  (type $fn-log (func (param "msg" string)))
  (type $fn-run (func (param "info" $city-info)))

  ;; --- Import logger interface ---
  (type $logger-iface (instance
    (export "log" (func (type $fn-log)))
  ))
  (import "hello:city/logger@0.1.0" (instance $logger (type $logger-iface)))

  ;; =====================================================================
  ;; Memory module — shared linear memory (needed before canon lower)
  ;; =====================================================================
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; =====================================================================
  ;; Wire it all together: lower imports, instantiate, lift exports
  ;; =====================================================================
  (alias export $logger "log" (func $log-comp))
  (core func $log-core (canon lower (func $log-comp) (memory $mem) string-encoding=utf8))

  (core instance $core (instantiate $hello-impl
    (with "host" (instance
      (export "memory" (memory $mem))
      (export "log" (func $log-core))
    ))
  ))

  (alias core export $core "cabi_realloc" (core func $realloc))
  (alias core export $core "run" (core func $core-run))
  (func $run (type $fn-run) (canon lift
    (core func $core-run)
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))

  ;; =====================================================================
  ;; Export hello:city/greeter@0.1.0
  ;; =====================================================================
  (instance $greeter-inst
    (export "city-info" (type $city-info) (type (eq $city-info)))
    (export "run" (func $run) (func (type $fn-run)))
  )
  (export "hello:city/greeter@0.1.0" (instance $greeter-inst))
)
