;; Hand-written component-model WAT for echo-reactor.
;; Exports: jsco:test/echo-primitives@0.1.0, echo-compound@0.1.0, echo-algebraic@0.1.0
;;
;; IMPORTANT: Each section intentionally contains unused "dummy" items
;; before the real items, so that indices are shifted compared to the
;; Rust-compiled echo-reactor. This exercises the resolver's index
;; resolution logic — it must not assume indices start at 0.

(component
  ;; =====================================================================
  ;; Dummy component-level types (shift type indices by 5)
  ;; =====================================================================
  (type $dummy-t0 (func))                                       ;; type 0
  (type $dummy-t1 (func (param "a" u32) (result u32)))          ;; type 1
  (type $dummy-t2 (record (field "unused-x" u8)))               ;; type 2
  (type $dummy-t3 (list u16))                                   ;; type 3
  (type $dummy-t4 (option bool))                                ;; type 4

  ;; =====================================================================
  ;; Real component-level types
  ;; =====================================================================

  ;; --- echo-compound types ---
  (type $point (record (field "x" float64) (field "y" float64)))          ;; type 5
  (type $labeled-point (record                                            ;; type 6
    (field "label" string)
    (field "coords" $point)
    (field "elevation" (option float64))
  ))
  (type $tuple2 (tuple u32 string))                                       ;; type 7
  (type $tuple3 (tuple float32 float32 float32))                          ;; type 8

  ;; --- echo-algebraic types ---
  (type $color (enum "red" "green" "blue" "yellow"))                      ;; type 9
  (type $permissions (flags "read" "write" "execute"))                    ;; type 10
  (type $shape-rect-payload (tuple float64 float64))                      ;; type 11
  (type $shape (variant                                                   ;; type 12
    (case "circle" float64)
    (case "rectangle" $shape-rect-payload)
    (case "named-polygon" string)
    (case "dot")
  ))

  ;; --- Function types for echo-primitives ---
  (type $fn-bool   (func (param "v" bool)    (result bool)))              ;; type 13
  (type $fn-u8     (func (param "v" u8)      (result u8)))                ;; type 14
  (type $fn-u16    (func (param "v" u16)     (result u16)))               ;; type 15
  (type $fn-u32    (func (param "v" u32)     (result u32)))               ;; type 16
  (type $fn-u64    (func (param "v" u64)     (result u64)))               ;; type 17
  (type $fn-s8     (func (param "v" s8)      (result s8)))                ;; type 18
  (type $fn-s16    (func (param "v" s16)     (result s16)))               ;; type 19
  (type $fn-s32    (func (param "v" s32)     (result s32)))               ;; type 20
  (type $fn-s64    (func (param "v" s64)     (result s64)))               ;; type 21
  (type $fn-f32    (func (param "v" float32) (result float32)))           ;; type 22
  (type $fn-f64    (func (param "v" float64) (result float64)))           ;; type 23
  (type $fn-char   (func (param "v" char)    (result char)))              ;; type 24
  (type $fn-string (func (param "v" string)  (result string)))            ;; type 25

  ;; --- Function types for echo-compound ---
  (type $fn-tuple2         (func (param "v" $tuple2)        (result $tuple2)))         ;; type 26
  (type $fn-tuple3         (func (param "v" $tuple3)        (result $tuple3)))         ;; type 27
  (type $fn-record         (func (param "v" $point)         (result $point)))          ;; type 28
  (type $fn-nested-record  (func (param "v" $labeled-point) (result $labeled-point)))  ;; type 29
  (type $fn-list-u8        (func (param "v" (list u8))      (result (list u8))))       ;; type 30
  (type $fn-list-string    (func (param "v" (list string))  (result (list string))))   ;; type 31
  (type $fn-list-record    (func (param "v" (list $point))  (result (list $point))))   ;; type 32
  (type $fn-option-u32     (func (param "v" (option u32))   (result (option u32))))    ;; type 33
  (type $fn-option-string  (func (param "v" (option string)) (result (option string))));; type 34
  (type $fn-result-ok      (func (param "v" (result string (error string))) (result (result string (error string))))) ;; type 35

  ;; --- Function types for echo-algebraic ---
  (type $fn-enum    (func (param "v" $color)       (result $color)))       ;; type 36
  (type $fn-flags   (func (param "v" $permissions) (result $permissions))) ;; type 37
  (type $fn-variant (func (param "v" $shape)       (result $shape)))       ;; type 38

  ;; --- Instance types for exports ---
  (type $echo-primitives-type (instance                                    ;; type 39
    (export "echo-bool"   (func (type $fn-bool)))
    (export "echo-u8"     (func (type $fn-u8)))
    (export "echo-u16"    (func (type $fn-u16)))
    (export "echo-u32"    (func (type $fn-u32)))
    (export "echo-u64"    (func (type $fn-u64)))
    (export "echo-s8"     (func (type $fn-s8)))
    (export "echo-s16"    (func (type $fn-s16)))
    (export "echo-s32"    (func (type $fn-s32)))
    (export "echo-s64"    (func (type $fn-s64)))
    (export "echo-f32"    (func (type $fn-f32)))
    (export "echo-f64"    (func (type $fn-f64)))
    (export "echo-char"   (func (type $fn-char)))
    (export "echo-string" (func (type $fn-string)))
  ))

  (type $echo-compound-type (instance                                     ;; type 40
    (export "echo-tuple2"        (func (type $fn-tuple2)))
    (export "echo-tuple3"        (func (type $fn-tuple3)))
    (export "echo-record"        (func (type $fn-record)))
    (export "echo-nested-record" (func (type $fn-nested-record)))
    (export "echo-list-u8"       (func (type $fn-list-u8)))
    (export "echo-list-string"   (func (type $fn-list-string)))
    (export "echo-list-record"   (func (type $fn-list-record)))
    (export "echo-option-u32"    (func (type $fn-option-u32)))
    (export "echo-option-string" (func (type $fn-option-string)))
    (export "echo-result-ok"     (func (type $fn-result-ok)))
  ))

  (type $echo-algebraic-type (instance                                    ;; type 41
    (export "echo-enum"    (func (type $fn-enum)))
    (export "echo-flags"   (func (type $fn-flags)))
    (export "echo-variant" (func (type $fn-variant)))
  ))

  ;; =====================================================================
  ;; Dummy core module (shift core module index by 1)
  ;; =====================================================================
  (core module $dummy-module
    (func (export "nop"))
  )

  ;; =====================================================================
  ;; Real core module — implements all echo functions
  ;; =====================================================================
  ;; For canon.lift, MAX_FLAT_RESULTS = 1:
  ;;   - 1 flat result value → direct return
  ;;   - >1 flat result values → core returns i32 pointer to result struct in memory
  ;; For echo functions: allocate result struct, store values, return pointer.
  (core module $echo-impl
    (memory (export "memory") 1)

    ;; Bump allocator for cabi_realloc — grows memory as needed, copies on realloc-grow
    (global $heap (mut i32) (i32.const 65536))

    (func $cabi_realloc (export "cabi_realloc")
          (param $old_ptr i32) (param $old_size i32)
          (param $align i32) (param $new_size i32) (result i32)
      (local $ptr i32)
      (local $end i32)
      ;; If old_ptr == 0: fresh allocation (bump heap forward)
      ;; If old_ptr != 0 and new_size > old_size: allocate new block, copy old data
      ;; If old_ptr != 0 and new_size <= old_size: return old_ptr (shrink in-place)
      (if (i32.and
            (i32.ne (local.get $old_ptr) (i32.const 0))
            (i32.le_u (local.get $new_size) (local.get $old_size)))
        (then (return (local.get $old_ptr)))
      )
      ;; Align heap pointer
      global.get $heap
      local.get $align
      i32.const 1
      i32.sub
      i32.add
      local.get $align
      i32.const 1
      i32.sub
      i32.const -1
      i32.xor
      i32.and
      local.set $ptr
      ;; Compute end = ptr + new_size
      local.get $ptr
      local.get $new_size
      i32.add
      local.set $end
      ;; Grow memory if needed: while end > memory.size * 65536
      (block $done
        (loop $grow
          local.get $end
          memory.size
          i32.const 65536
          i32.mul
          i32.le_u
          br_if $done
          i32.const 1
          memory.grow
          i32.const -1
          i32.eq
          (if (then unreachable))
          br $grow
        )
      )
      ;; Update heap
      local.get $end
      global.set $heap
      ;; If old_ptr != 0, copy old data to new location
      (if (i32.ne (local.get $old_ptr) (i32.const 0))
        (then
          local.get $ptr      ;; dest
          local.get $old_ptr   ;; src
          local.get $old_size  ;; len
          memory.copy
        )
      )
      local.get $ptr
    )

    ;; ---------------------------------------------------------------
    ;; Dummy core functions (shift function indices by 3)
    ;; ---------------------------------------------------------------
    (func $dummy-f0 (param i32) (result i32) unreachable)
    (func $dummy-f1 (param i32 i32) unreachable)
    (func $dummy-f2 (result i32) i32.const 0)

    ;; ---------------------------------------------------------------
    ;; echo-primitives: all single-result (direct return)
    ;; ---------------------------------------------------------------
    (func $echo-bool (export "echo-bool") (param i32) (result i32) local.get 0)
    (func $echo-u8 (export "echo-u8") (param i32) (result i32) local.get 0)
    (func $echo-u16 (export "echo-u16") (param i32) (result i32) local.get 0)
    (func $echo-u32 (export "echo-u32") (param i32) (result i32) local.get 0)
    (func $echo-u64 (export "echo-u64") (param i64) (result i64) local.get 0)
    (func $echo-s8 (export "echo-s8") (param i32) (result i32) local.get 0)
    (func $echo-s16 (export "echo-s16") (param i32) (result i32) local.get 0)
    (func $echo-s32 (export "echo-s32") (param i32) (result i32) local.get 0)
    (func $echo-s64 (export "echo-s64") (param i64) (result i64) local.get 0)
    (func $echo-f32 (export "echo-f32") (param f32) (result f32) local.get 0)
    (func $echo-f64 (export "echo-f64") (param f64) (result f64) local.get 0)
    (func $echo-char (export "echo-char") (param i32) (result i32) local.get 0)

    ;; echo-string: string = {ptr:i32, len:i32} → returns i32 pointer to result
    ;; Simply return a result struct pointing to the input string data
    (func $echo-string (export "echo-string") (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      ;; Allocate result struct {ptr:i32, len:i32}
      i32.const 0  i32.const 0  i32.const 4  i32.const 8
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $ptr  i32.store
      local.get $ret  local.get $len  i32.store offset=4
      local.get $ret
    )

    ;; ---------------------------------------------------------------
    ;; echo-compound: all multi-result → return i32 pointer
    ;; ---------------------------------------------------------------

    ;; echo-tuple2: tuple<u32, string> = {u32, ptr, len} align 4, size 12
    (func $echo-tuple2 (export "echo-tuple2")
          (param $v0 i32) (param $v1_ptr i32) (param $v1_len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 12
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $v0      i32.store
      local.get $ret  local.get $v1_ptr  i32.store offset=4
      local.get $ret  local.get $v1_len  i32.store offset=8
      local.get $ret
    )

    ;; echo-tuple3: tuple<f32,f32,f32> = {f32,f32,f32} align 4, size 12
    (func $echo-tuple3 (export "echo-tuple3")
          (param $v0 f32) (param $v1 f32) (param $v2 f32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 12
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $v0  f32.store
      local.get $ret  local.get $v1  f32.store offset=4
      local.get $ret  local.get $v2  f32.store offset=8
      local.get $ret
    )

    ;; echo-record: point {x:f64, y:f64} align 8, size 16
    (func $echo-record (export "echo-record")
          (param $x f64) (param $y f64) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 8  i32.const 16
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $x  f64.store
      local.get $ret  local.get $y  f64.store offset=8
      local.get $ret
    )

    ;; echo-nested-record: labeled-point align 8, size 40
    ;; Memory: {lbl_ptr:0, lbl_len:4, coord_x:8, coord_y:16, elev_disc:24, elev_val:32}
    (func $echo-nested-record (export "echo-nested-record")
          (param $lp i32) (param $ll i32) (param $x f64) (param $y f64)
          (param $ed i32) (param $ev f64) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 8  i32.const 40
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $lp  i32.store
      local.get $ret  local.get $ll  i32.store offset=4
      local.get $ret  local.get $x   f64.store offset=8
      local.get $ret  local.get $y   f64.store offset=16
      local.get $ret  local.get $ed  i32.store8 offset=24
      local.get $ret  local.get $ev  f64.store offset=32
      local.get $ret
    )

    ;; echo-list-u8: list<u8> = {ptr, len} align 4, size 8
    (func $echo-list-u8 (export "echo-list-u8") (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 8
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $ptr  i32.store
      local.get $ret  local.get $len  i32.store offset=4
      local.get $ret
    )

    ;; echo-list-string: list<string> = {ptr, len} align 4, size 8
    (func $echo-list-string (export "echo-list-string") (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 8
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $ptr  i32.store
      local.get $ret  local.get $len  i32.store offset=4
      local.get $ret
    )

    ;; echo-list-record: list<point> = {ptr, len} align 4, size 8
    (func $echo-list-record (export "echo-list-record") (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 8
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $ptr  i32.store
      local.get $ret  local.get $len  i32.store offset=4
      local.get $ret
    )

    ;; echo-option-u32: option<u32> = {disc:u8@0, val:i32@4} align 4, size 8
    (func $echo-option-u32 (export "echo-option-u32") (param $disc i32) (param $val i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 8
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $disc  i32.store8
      local.get $ret  local.get $val   i32.store offset=4
      local.get $ret
    )

    ;; echo-option-string: option<string> = {disc:u8@0, ptr:i32@4, len:i32@8} align 4, size 12
    (func $echo-option-string (export "echo-option-string")
          (param $disc i32) (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 12
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $disc  i32.store8
      local.get $ret  local.get $ptr   i32.store offset=4
      local.get $ret  local.get $len   i32.store offset=8
      local.get $ret
    )

    ;; echo-result-ok: result<string,string> = {disc:u8@0, ptr:i32@4, len:i32@8} align 4, size 12
    (func $echo-result-ok (export "echo-result-ok")
          (param $disc i32) (param $ptr i32) (param $len i32) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 4  i32.const 12
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $disc  i32.store8
      local.get $ret  local.get $ptr   i32.store offset=4
      local.get $ret  local.get $len   i32.store offset=8
      local.get $ret
    )

    ;; ---------------------------------------------------------------
    ;; echo-algebraic
    ;; ---------------------------------------------------------------

    ;; echo-enum: single i32 → direct return
    (func $echo-enum (export "echo-enum") (param i32) (result i32) local.get 0)

    ;; echo-flags: single i32 → direct return
    (func $echo-flags (export "echo-flags") (param i32) (result i32) local.get 0)

    ;; echo-variant: shape = {disc:u8@0, payload@8} align 8, size 24
    ;; Flat params: [i32 disc, i64 val0, i64 val1]
    ;; Cases 0,1,3: store i64 at offsets 8,16 (correct bits for f64 payloads)
    ;; Case 2 (named-polygon/string): store i32 at offsets 8,12
    (func $echo-variant (export "echo-variant")
          (param $disc i32) (param $val0 i64) (param $val1 i64) (result i32)
      (local $ret i32)
      i32.const 0  i32.const 0  i32.const 8  i32.const 24
      call $cabi_realloc
      local.set $ret
      local.get $ret  local.get $disc  i32.store8
      ;; Branch: case 2 (named-polygon) stores i32s; others store i64s
      (if (i32.eq (local.get $disc) (i32.const 2))
        (then
          local.get $ret  local.get $val0  i32.wrap_i64  i32.store offset=8
          local.get $ret  local.get $val1  i32.wrap_i64  i32.store offset=12
        )
        (else
          local.get $ret  local.get $val0  i64.store offset=8
          local.get $ret  local.get $val1  i64.store offset=16
        )
      )
      local.get $ret
    )
  )

  ;; =====================================================================
  ;; Instantiate core module
  ;; =====================================================================
  ;; Dummy instance (shift core instance index by 2)
  (core instance $dummy-inst0 (instantiate $dummy-module))
  (core instance $dummy-inst1 (instantiate $dummy-module))

  ;; Real core instance
  (core instance $core (instantiate $echo-impl))

  ;; Alias memory and realloc from core instance for canon lift options
  (alias core export $core "memory" (core memory $mem))
  (alias core export $core "cabi_realloc" (core func $realloc))

  ;; =====================================================================
  ;; Canonical lifts — convert core functions to component functions
  ;; =====================================================================
  ;; Dummy component functions (shift func index by 4)
  (func $dummy-fn0 (type $dummy-t0) (canon lift (core func $dummy-inst0 "nop")))
  (func $dummy-fn1 (type $dummy-t0) (canon lift (core func $dummy-inst1 "nop")))
  (func $dummy-fn2 (type $dummy-t0) (canon lift (core func $dummy-inst0 "nop")))
  (func $dummy-fn3 (type $dummy-t0) (canon lift (core func $dummy-inst1 "nop")))

  ;; --- echo-primitives lifts ---
  (func $echo-bool (type $fn-bool) (canon lift (core func $core "echo-bool")))
  (func $echo-u8 (type $fn-u8) (canon lift (core func $core "echo-u8")))
  (func $echo-u16 (type $fn-u16) (canon lift (core func $core "echo-u16")))
  (func $echo-u32 (type $fn-u32) (canon lift (core func $core "echo-u32")))
  (func $echo-u64 (type $fn-u64) (canon lift (core func $core "echo-u64")))
  (func $echo-s8 (type $fn-s8) (canon lift (core func $core "echo-s8")))
  (func $echo-s16 (type $fn-s16) (canon lift (core func $core "echo-s16")))
  (func $echo-s32 (type $fn-s32) (canon lift (core func $core "echo-s32")))
  (func $echo-s64 (type $fn-s64) (canon lift (core func $core "echo-s64")))
  (func $echo-f32 (type $fn-f32) (canon lift (core func $core "echo-f32")))
  (func $echo-f64 (type $fn-f64) (canon lift (core func $core "echo-f64")))
  (func $echo-char (type $fn-char) (canon lift (core func $core "echo-char")))
  (func $echo-string (type $fn-string) (canon lift
    (core func $core "echo-string")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))

  ;; --- echo-compound lifts ---
  (func $echo-tuple2 (type $fn-tuple2) (canon lift
    (core func $core "echo-tuple2")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))
  (func $echo-tuple3 (type $fn-tuple3) (canon lift
    (core func $core "echo-tuple3")
    (memory $mem) (realloc $realloc)
  ))
  (func $echo-record (type $fn-record) (canon lift
    (core func $core "echo-record")
    (memory $mem) (realloc $realloc)
  ))
  (func $echo-nested-record (type $fn-nested-record) (canon lift
    (core func $core "echo-nested-record")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))
  (func $echo-list-u8 (type $fn-list-u8) (canon lift
    (core func $core "echo-list-u8")
    (memory $mem) (realloc $realloc)
  ))
  (func $echo-list-string (type $fn-list-string) (canon lift
    (core func $core "echo-list-string")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))
  (func $echo-list-record (type $fn-list-record) (canon lift
    (core func $core "echo-list-record")
    (memory $mem) (realloc $realloc)
  ))
  (func $echo-option-u32 (type $fn-option-u32) (canon lift
    (core func $core "echo-option-u32")
    (memory $mem) (realloc $realloc)
  ))
  (func $echo-option-string (type $fn-option-string) (canon lift
    (core func $core "echo-option-string")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))
  (func $echo-result-ok (type $fn-result-ok) (canon lift
    (core func $core "echo-result-ok")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))

  ;; --- echo-algebraic lifts ---
  (func $echo-enum (type $fn-enum) (canon lift (core func $core "echo-enum")))
  (func $echo-flags (type $fn-flags) (canon lift (core func $core "echo-flags")))
  (func $echo-variant (type $fn-variant) (canon lift
    (core func $core "echo-variant")
    (memory $mem) (realloc $realloc) string-encoding=utf8
  ))

  ;; =====================================================================
  ;; Create interface instances — must include type exports for non-primitive types
  ;; =====================================================================
  (instance $echo-prim-inst
    (export "echo-bool"   (func $echo-bool)   (func (type $fn-bool)))
    (export "echo-u8"     (func $echo-u8)     (func (type $fn-u8)))
    (export "echo-u16"    (func $echo-u16)    (func (type $fn-u16)))
    (export "echo-u32"    (func $echo-u32)    (func (type $fn-u32)))
    (export "echo-u64"    (func $echo-u64)    (func (type $fn-u64)))
    (export "echo-s8"     (func $echo-s8)     (func (type $fn-s8)))
    (export "echo-s16"    (func $echo-s16)    (func (type $fn-s16)))
    (export "echo-s32"    (func $echo-s32)    (func (type $fn-s32)))
    (export "echo-s64"    (func $echo-s64)    (func (type $fn-s64)))
    (export "echo-f32"    (func $echo-f32)    (func (type $fn-f32)))
    (export "echo-f64"    (func $echo-f64)    (func (type $fn-f64)))
    (export "echo-char"   (func $echo-char)   (func (type $fn-char)))
    (export "echo-string" (func $echo-string) (func (type $fn-string)))
  )

  (instance $echo-compound-inst
    (export "point"         (type $point)         (type (eq $point)))
    (export "labeled-point" (type $labeled-point)  (type (eq $labeled-point)))
    (export "echo-tuple2"        (func $echo-tuple2)        (func (type $fn-tuple2)))
    (export "echo-tuple3"        (func $echo-tuple3)        (func (type $fn-tuple3)))
    (export "echo-record"        (func $echo-record)        (func (type $fn-record)))
    (export "echo-nested-record" (func $echo-nested-record) (func (type $fn-nested-record)))
    (export "echo-list-u8"       (func $echo-list-u8)       (func (type $fn-list-u8)))
    (export "echo-list-string"   (func $echo-list-string)   (func (type $fn-list-string)))
    (export "echo-list-record"   (func $echo-list-record)   (func (type $fn-list-record)))
    (export "echo-option-u32"    (func $echo-option-u32)    (func (type $fn-option-u32)))
    (export "echo-option-string" (func $echo-option-string) (func (type $fn-option-string)))
    (export "echo-result-ok"     (func $echo-result-ok)     (func (type $fn-result-ok)))
  )

  (instance $echo-algebraic-inst
    (export "color"       (type $color)       (type (eq $color)))
    (export "permissions" (type $permissions) (type (eq $permissions)))
    (export "shape"       (type $shape)       (type (eq $shape)))
    (export "echo-enum"    (func $echo-enum)    (func (type $fn-enum)))
    (export "echo-flags"   (func $echo-flags)   (func (type $fn-flags)))
    (export "echo-variant" (func $echo-variant) (func (type $fn-variant)))
  )

  ;; =====================================================================
  ;; Exports — export the interface instances
  ;; =====================================================================
  (export "jsco:test/echo-primitives@0.1.0" (instance $echo-prim-inst))
  (export "jsco:test/echo-compound@0.1.0" (instance $echo-compound-inst))
  (export "jsco:test/echo-algebraic@0.1.0" (instance $echo-algebraic-inst))
)
