(component
  (type (;0;)
    (instance
      (type (;0;) (tuple s8 u8))
      (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" f32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
      (export (;2;) "food-info" (type (eq 1)))
      (type (;3;) (enum "carbohydrate" "protein" "vitamin"))
      (export (;4;) "nutrition-type" (type (eq 3)))
      (type (;5;) (record (field "percentage" f64) (field "nutrition-type" 4)))
      (export (;6;) "nutrition-info" (type (eq 5)))
      (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
      (export (;8;) "material-type" (type (eq 7)))
      (type (;9;) (flags "opened" "closed" "damaged"))
      (export (;10;) "sealing-state" (type (eq 9)))
      (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
      (export (;12;) "package-info" (type (eq 11)))
      (type (;13;) (list 2))
      (type (;14;) (option string))
      (type (;15;) (record (field "foods" 13) (field "label" 14)))
      (export (;16;) "meal-plan" (type (eq 15)))
      (type (;17;) (func (param "food" 2) (param "message" string)))
      (export (;0;) "hide-food" (func (type 17)))
      (type (;18;) (func (param "foodinfo" 2) (param "packageinfo" 12) (param "message" string)))
      (export (;1;) "consume-food" (func (type 18)))
      (type (;19;) (func (param "sealingstate" 10) (param "packageinfo" 12) (param "message" string)))
      (export (;2;) "open-package" (func (type 19)))
      (type (;20;) (list 12))
      (type (;21;) (func (param "trashed" 20) (param "message" string) (result bool)))
      (export (;3;) "trash-package" (func (type 21)))
      (type (;22;) (result string (error string)))
      (type (;23;) (func (param "plan" 16) (result 22)))
      (export (;4;) "plan-meal" (func (type 23)))
    )
  )
  (import "zoo:food/food@0.1.0" (instance (;0;) (type 0)))
  (component (;0;)
    (type (;0;)
      (instance
        (type (;0;) (tuple s8 u8))
        (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" f32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
        (export (;2;) "food-info" (type (eq 1)))
        (type (;3;) (enum "carbohydrate" "protein" "vitamin"))
        (export (;4;) "nutrition-type" (type (eq 3)))
        (type (;5;) (record (field "percentage" f64) (field "nutrition-type" 4)))
        (export (;6;) "nutrition-info" (type (eq 5)))
        (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
        (export (;8;) "material-type" (type (eq 7)))
        (type (;9;) (flags "opened" "closed" "damaged"))
        (export (;10;) "sealing-state" (type (eq 9)))
        (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
        (export (;12;) "package-info" (type (eq 11)))
        (type (;13;) (list 2))
        (type (;14;) (option string))
        (type (;15;) (record (field "foods" 13) (field "label" 14)))
        (export (;16;) "meal-plan" (type (eq 15)))
      )
    )
    (import "zoo:food/food@0.1.0" (instance (;0;) (type 0)))
    (alias export 0 "food-info" (type (;1;)))
    (alias export 0 "package-info" (type (;2;)))
    (alias export 0 "meal-plan" (type (;3;)))
    (type (;4;)
      (instance
        (alias outer $city 1 (type (;0;)))
        (export (;1;) "food-info" (type (eq 0)))
        (alias outer $city 2 (type (;2;)))
        (export (;3;) "package-info" (type (eq 2)))
        (alias outer $city 3 (type (;4;)))
        (export (;5;) "meal-plan" (type (eq 4)))
        (type (;6;) (func (param "foodinfo" 1) (param "packageinfo" 3)))
        (export (;0;) "feed" (func (type 6)))
        (type (;7;) (result string (error string)))
        (type (;8;) (func (param "plan" 5) (result 7)))
        (export (;1;) "schedule" (func (type 8)))
      )
    )
    (import "zoo:food/eater@0.1.0" (instance (;1;) (type 4)))
    (core module (;0;)
      (type (;0;) (func (param i32 i32 i32 i32)))
      (type (;1;) (func (param i32 i32)))
      (type (;2;) (func (param i32 i32) (result i32)))
      (type (;3;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)))
      (type (;4;) (func (param i32 i32 i32 i32 i32 i32)))
      (type (;5;) (func))
      (type (;6;) (func (param i32 i32 i32 i32) (result i32)))
      (type (;7;) (func (param i32 i32 i32)))
      (type (;8;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
      (type (;9;) (func (param i32)))
      (type (;10;) (func (param i32 i32 i32 i32 i32) (result i32)))
      (import "zoo:food/eater@0.1.0" "feed" (func $_ZN4city8bindings3zoo4food5eater4feed11wit_import817h658228b42151e6e6E (;0;) (type 3)))
      (import "zoo:food/eater@0.1.0" "schedule" (func $_ZN4city8bindings3zoo4food5eater8schedule11wit_import817h025e7507fbcdc93bE (;1;) (type 4)))
      (table (;0;) 9 9 funcref)
      (memory (;0;) 17)
      (global $__stack_pointer (;0;) (mut i32) i32.const 1048576)
      (global (;1;) i32 i32.const 1049725)
      (global (;2;) i32 i32.const 1049728)
      (export "memory" (memory 0))
      (export "city:runner/runner@0.1.0#run" (func $city:runner/runner@0.1.0#run))
      (export "cabi_realloc_wit_bindgen_0_24_0" (func $cabi_realloc_wit_bindgen_0_24_0))
      (export "cabi_realloc" (func $cabi_realloc))
      (export "__data_end" (global 1))
      (export "__heap_base" (global 2))
      (elem (;0;) (i32.const 1) func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E $_ZN4city8bindings40__link_custom_section_describing_imports17hf8cf21b32a36abdaE $cabi_realloc)
      (func $__wasm_call_ctors (;2;) (type 5))
      (func $_RNvCsdBezzDwma51_7___rustc14___rust_realloc (;3;) (type 6) (param i32 i32 i32 i32) (result i32)
        (local i32)
        block ;; label = @1
          local.get 2
          local.get 3
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
          local.tee 4
          i32.eqz
          br_if 0 (;@1;)
          block ;; label = @2
            local.get 3
            local.get 1
            local.get 3
            local.get 1
            i32.lt_u
            select
            local.tee 3
            i32.eqz
            br_if 0 (;@2;)
            local.get 4
            local.get 0
            local.get 3
            memory.copy
          end
          local.get 0
          local.get 2
          local.get 1
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
        end
        local.get 4
      )
      (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE (;4;) (type 2) (param i32 i32) (result i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 2
        global.set $__stack_pointer
        block ;; label = @1
          local.get 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i32.const 3
          i32.add
          i32.const 2
          i32.shr_u
          local.set 1
          block ;; label = @2
            block ;; label = @3
              local.get 0
              i32.const 4
              i32.gt_u
              br_if 0 (;@3;)
              local.get 1
              i32.const -1
              i32.add
              local.tee 3
              i32.const 256
              i32.lt_u
              br_if 1 (;@2;)
            end
            local.get 2
            i32.const 0
            i32.load offset=1049700
            i32.store offset=8
            local.get 1
            local.get 0
            local.get 2
            i32.const 8
            i32.add
            i32.const 1048672
            i32.const 1
            i32.const 2
            call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
            local.set 0
            i32.const 0
            local.get 2
            i32.load offset=8
            i32.store offset=1049700
            br 1 (;@1;)
          end
          local.get 2
          i32.const 1049700
          i32.store offset=4
          local.get 2
          local.get 3
          i32.const 2
          i32.shl
          local.tee 3
          i32.load offset=1048676
          i32.store offset=12
          local.get 1
          local.get 0
          local.get 2
          i32.const 12
          i32.add
          local.get 2
          i32.const 4
          i32.add
          i32.const 3
          i32.const 4
          call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
          local.set 0
          local.get 3
          local.get 2
          i32.load offset=12
          i32.store offset=1048676
        end
        local.get 2
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 0
      )
      (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E (;5;) (type 7) (param i32 i32 i32)
        (local i32 i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    local.get 0
                    i32.eqz
                    br_if 0 (;@6;)
                    local.get 2
                    i32.eqz
                    br_if 0 (;@6;)
                    block ;; label = @7
                      block ;; label = @8
                        local.get 1
                        i32.const 4
                        i32.gt_u
                        br_if 0 (;@8;)
                        local.get 2
                        i32.const 3
                        i32.add
                        i32.const 2
                        i32.shr_u
                        i32.const -1
                        i32.add
                        local.tee 2
                        i32.const 255
                        i32.le_u
                        br_if 1 (;@7;)
                      end
                      local.get 0
                      i32.const 0
                      i32.store
                      local.get 0
                      i32.const -8
                      i32.add
                      local.tee 2
                      local.get 2
                      i32.load
                      local.tee 1
                      i32.const -2
                      i32.and
                      i32.store
                      i32.const 0
                      i32.load offset=1049700
                      local.set 3
                      block ;; label = @8
                        local.get 0
                        i32.const -4
                        i32.add
                        local.tee 4
                        i32.load
                        i32.const -4
                        i32.and
                        local.tee 5
                        i32.eqz
                        br_if 0 (;@8;)
                        local.get 5
                        i32.load
                        local.tee 6
                        i32.const 1
                        i32.and
                        br_if 0 (;@8;)
                        local.get 1
                        i32.const -4
                        i32.and
                        local.set 0
                        local.get 1
                        i32.const 2
                        i32.and
                        br_if 3 (;@5;)
                        local.get 0
                        i32.eqz
                        br_if 3 (;@5;)
                        local.get 0
                        local.get 0
                        i32.load offset=4
                        i32.const 3
                        i32.and
                        local.get 5
                        i32.or
                        i32.store offset=4
                        local.get 2
                        i32.load
                        local.set 0
                        local.get 4
                        i32.load
                        local.tee 1
                        i32.const -4
                        i32.and
                        local.tee 7
                        i32.eqz
                        br_if 5 (;@3;)
                        local.get 0
                        i32.const -4
                        i32.and
                        local.set 0
                        local.get 7
                        i32.load
                        local.set 6
                        br 4 (;@4;)
                      end
                      block ;; label = @8
                        block ;; label = @9
                          local.get 1
                          i32.const 2
                          i32.and
                          br_if 0 (;@9;)
                          local.get 1
                          i32.const -4
                          i32.and
                          local.tee 1
                          i32.eqz
                          br_if 0 (;@9;)
                          local.get 1
                          i32.load8_u
                          i32.const 1
                          i32.and
                          i32.eqz
                          br_if 1 (;@8;)
                        end
                        local.get 0
                        local.get 3
                        i32.store
                        br 7 (;@1;)
                      end
                      local.get 0
                      local.get 1
                      i32.load offset=8
                      i32.const -4
                      i32.and
                      i32.store
                      local.get 1
                      local.get 2
                      i32.const 1
                      i32.or
                      i32.store offset=8
                      br 5 (;@2;)
                    end
                    local.get 0
                    local.get 2
                    i32.const 2
                    i32.shl
                    local.tee 2
                    i32.load offset=1048676
                    i32.store
                    local.get 2
                    local.get 0
                    i32.const -8
                    i32.add
                    local.tee 0
                    i32.store offset=1048676
                    local.get 0
                    local.get 0
                    i32.load
                    i32.const -2
                    i32.and
                    i32.store
                  end
                  return
                end
                local.get 5
                local.set 7
              end
              local.get 7
              local.get 6
              i32.const 3
              i32.and
              local.get 0
              i32.or
              i32.store
              local.get 4
              i32.load
              local.set 1
              local.get 2
              i32.load
              local.set 0
            end
            local.get 4
            local.get 1
            i32.const 3
            i32.and
            i32.store
            local.get 2
            local.get 0
            i32.const 3
            i32.and
            i32.store
            local.get 0
            i32.const 2
            i32.and
            i32.eqz
            br_if 0 (;@2;)
            local.get 5
            local.get 5
            i32.load
            i32.const 2
            i32.or
            i32.store
          end
          local.get 3
          local.set 2
        end
        i32.const 0
        local.get 2
        i32.store offset=1049700
      )
      (func $_ZN4city8bindings40__link_custom_section_describing_imports17hf8cf21b32a36abdaE (;6;) (type 5))
      (func $city:runner/runner@0.1.0#run (;7;) (type 5)
        (local i32 i32 i32 i32 i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 0
        global.set $__stack_pointer
        block ;; label = @1
          i32.const 0
          i32.load8_u offset=1049724
          br_if 0 (;@1;)
          call $__wasm_call_ctors
          i32.const 0
          i32.const 1
          i32.store8 offset=1049724
        end
        local.get 0
        i32.const 1049700
        i32.store offset=12
        local.get 0
        i32.const 0
        i32.load offset=1048680
        i32.store
        i32.const 2
        i32.const 1
        local.get 0
        local.get 0
        i32.const 12
        i32.add
        i32.const 3
        i32.const 4
        call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
        local.set 1
        i32.const 0
        local.get 0
        i32.load
        i32.store offset=1048680
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                local.get 1
                i32.eqz
                br_if 0 (;@4;)
                local.get 1
                i32.const 4
                i32.add
                i32.const 0
                i32.load8_u offset=1048592
                i32.store8
                local.get 1
                i32.const 0
                i32.load offset=1048588 align=1
                i32.store align=1
                local.get 1
                i32.const 5
                i32.const 115
                f32.const 0x1p-1 (;=0.5;)
                i32.const 1
                i64.const 2000
                i32.const 200
                i32.const 10
                i32.const 1
                i32.const 4
                i32.const 39
                i32.const 20
                f64.const 0x1.4p+6 (;=80;)
                i32.const 1
                i32.const 0
                i32.const 1
                call $_ZN4city8bindings3zoo4food5eater4feed11wit_import817h658228b42151e6e6E
                local.get 0
                i32.const 0
                i32.load offset=1049700
                i32.store
                i32.const 10
                i32.const 8
                local.get 0
                i32.const 1048672
                i32.const 1
                i32.const 2
                call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                local.set 2
                i32.const 0
                local.get 0
                i32.load
                i32.store offset=1049700
                local.get 2
                i32.eqz
                br_if 1 (;@3;)
                local.get 2
                i64.const 21474836595
                i64.store offset=8
                local.get 2
                i64.const 2000
                i64.store
                local.get 2
                i32.const 16852740
                i32.store offset=36
                local.get 2
                i64.const 2815608760565780
                i64.store offset=28 align=4
                local.get 2
                i64.const 4539628424389459973
                i64.store offset=20 align=4
                local.get 2
                local.get 1
                i32.store offset=16
                local.get 0
                i32.const 1049700
                i32.store offset=12
                local.get 0
                i32.const 0
                i32.load offset=1048684
                i32.store
                i32.const 3
                i32.const 1
                local.get 0
                local.get 0
                i32.const 12
                i32.add
                i32.const 3
                i32.const 4
                call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                local.set 3
                i32.const 0
                local.get 0
                i32.load
                i32.store offset=1048684
                local.get 3
                i32.eqz
                br_if 2 (;@2;)
                local.get 3
                i32.const 7
                i32.add
                i32.const 0
                i32.load offset=1048600 align=1
                i32.store align=1
                local.get 3
                i32.const 0
                i64.load offset=1048593 align=1
                i64.store align=1
                local.get 0
                i32.const 0
                i32.load offset=1049700
                i32.store
                i32.const 12
                i32.const 8
                local.get 0
                i32.const 1048672
                i32.const 1
                i32.const 2
                call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                local.set 4
                i32.const 0
                local.get 0
                i32.load
                i32.store offset=1049700
                local.get 4
                i32.eqz
                br_if 3 (;@1;)
                local.get 4
                i32.const 20
                i32.store offset=40
                local.get 4
                i32.const 39
                i32.store8 offset=38
                local.get 4
                i32.const 1025
                i32.store16 offset=36 align=1
                local.get 4
                i32.const 655560
                i32.store offset=32 align=2
                local.get 4
                i64.const 2000
                i64.store offset=24
                local.get 4
                i32.const 1
                i32.store8 offset=16
                local.get 4
                i32.const 1056964608
                i32.store offset=12
                local.get 4
                local.get 1
                i32.store
                local.get 4
                i64.const 493921239045
                i64.store offset=4 align=4
                local.get 4
                i32.const 1
                i32.const 1
                local.get 3
                i32.const 11
                local.get 0
                call $_ZN4city8bindings3zoo4food5eater8schedule11wit_import817h025e7507fbcdc93bE
                local.get 0
                i32.load offset=8
                local.set 5
                local.get 0
                i32.load offset=4
                local.set 6
                local.get 4
                i32.const 8
                i32.const 48
                call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                block ;; label = @5
                  local.get 5
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 6
                  i32.const 1
                  local.get 5
                  call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                end
                local.get 1
                i32.const 0
                i32.load offset=1048680
                i32.store
                i32.const 0
                local.get 1
                i32.const -8
                i32.add
                local.tee 4
                i32.store offset=1048680
                local.get 4
                local.get 4
                i32.load
                i32.const -2
                i32.and
                i32.store
                local.get 2
                i32.const 8
                i32.const 40
                call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                local.get 3
                i32.const 0
                i32.load offset=1048684
                i32.store
                i32.const 0
                local.get 3
                i32.const -8
                i32.add
                local.tee 4
                i32.store offset=1048684
                local.get 4
                local.get 4
                i32.load
                i32.const -2
                i32.and
                i32.store
                local.get 0
                i32.const 16
                i32.add
                global.set $__stack_pointer
                return
              end
              i32.const 1
              i32.const 5
              call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
              unreachable
            end
            i32.const 8
            i32.const 40
            call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
            unreachable
          end
          i32.const 1
          i32.const 11
          call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
          unreachable
        end
        i32.const 8
        i32.const 48
        call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
        unreachable
      )
      (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E (;8;) (type 0) (param i32 i32 i32 i32)
        (local i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        local.get 4
        local.get 1
        i32.load
        local.tee 5
        i32.load
        i32.store offset=12
        i32.const 1
        local.set 6
        local.get 2
        i32.const 2
        i32.add
        local.tee 1
        local.get 1
        i32.mul
        local.tee 1
        i32.const 2048
        local.get 1
        i32.const 2048
        i32.gt_u
        select
        local.tee 2
        i32.const 4
        local.get 4
        i32.const 12
        i32.add
        i32.const 1
        i32.const 1
        i32.const 2
        call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
        local.set 1
        local.get 5
        local.get 4
        i32.load offset=12
        i32.store
        block ;; label = @1
          local.get 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i64.const 0
          i64.store offset=4 align=4
          local.get 1
          local.get 1
          local.get 2
          i32.const 2
          i32.shl
          i32.add
          i32.const 2
          i32.or
          i32.store
          i32.const 0
          local.set 6
        end
        local.get 0
        local.get 1
        i32.store offset=4
        local.get 0
        local.get 6
        i32.store
        local.get 4
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E (;9;) (type 2) (param i32 i32) (result i32)
        local.get 1
      )
      (func $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E (;10;) (type 8) (param i32 i32 i32 i32 i32 i32) (result i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 6
        global.set $__stack_pointer
        block ;; label = @1
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          local.get 5
          call $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE
          local.tee 7
          br_if 0 (;@1;)
          local.get 6
          i32.const 8
          i32.add
          local.get 3
          local.get 0
          local.get 1
          local.get 4
          call_indirect (type 0)
          i32.const 0
          local.set 7
          local.get 6
          i32.load offset=8
          i32.const 1
          i32.and
          br_if 0 (;@1;)
          local.get 6
          i32.load offset=12
          local.tee 7
          local.get 2
          i32.load
          i32.store offset=8
          local.get 2
          local.get 7
          i32.store
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          local.get 5
          call $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE
          local.set 7
        end
        local.get 6
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 7
      )
      (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E (;11;) (type 0) (param i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            local.get 3
            i32.const 3
            i32.shl
            i32.const 16384
            i32.add
            local.tee 3
            local.get 2
            i32.const 2
            i32.shl
            local.tee 2
            local.get 3
            local.get 2
            i32.gt_u
            select
            i32.const 65543
            i32.add
            local.tee 3
            i32.const 16
            i32.shr_u
            memory.grow
            local.tee 2
            i32.const -1
            i32.ne
            br_if 0 (;@2;)
            i32.const 1
            local.set 3
            i32.const 0
            local.set 2
            br 1 (;@1;)
          end
          local.get 2
          i32.const 16
          i32.shl
          local.tee 2
          i64.const 0
          i64.store offset=4 align=4
          local.get 2
          local.get 2
          local.get 3
          i32.const -65536
          i32.and
          i32.add
          i32.const 2
          i32.or
          i32.store
          i32.const 0
          local.set 3
        end
        local.get 0
        local.get 2
        i32.store offset=4
        local.get 0
        local.get 3
        i32.store
      )
      (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE (;12;) (type 2) (param i32 i32) (result i32)
        i32.const 512
      )
      (func $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E (;13;) (type 1) (param i32 i32)
        block ;; label = @1
          local.get 0
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          local.get 1
          call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
          unreachable
        end
        call $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E
        unreachable
      )
      (func $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E (;14;) (type 1) (param i32 i32)
        local.get 1
        local.get 0
        call $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler
        unreachable
      )
      (func $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler (;15;) (type 1) (param i32 i32)
        local.get 1
        local.get 0
        call $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E
        unreachable
      )
      (func $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E (;16;) (type 5)
        i32.const 1048604
        i32.const 35
        i32.const 1048656
        call $_ZN4core9panicking9panic_fmt17h806e647715990138E
        unreachable
      )
      (func $_ZN4core9panicking9panic_fmt17h806e647715990138E (;17;) (type 7) (param i32 i32 i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 32
        i32.sub
        local.tee 3
        global.set $__stack_pointer
        local.get 3
        local.get 1
        i32.store offset=16
        local.get 3
        local.get 0
        i32.store offset=12
        local.get 3
        i32.const 1
        i32.store16 offset=28
        local.get 3
        local.get 2
        i32.store offset=24
        local.get 3
        local.get 3
        i32.const 12
        i32.add
        i32.store offset=20
        local.get 3
        i32.const 20
        i32.add
        call $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind
        unreachable
      )
      (func $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind (;18;) (type 9) (param i32)
        (local i32 i64)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        local.get 0
        i64.load align=4
        local.set 2
        local.get 1
        local.get 0
        i32.store offset=12
        local.get 1
        local.get 2
        i64.store offset=4 align=4
        local.get 1
        i32.const 4
        i32.add
        call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E
        unreachable
      )
      (func $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E (;19;) (type 1) (param i32 i32)
        local.get 0
        i32.const 0
        i32.store
      )
      (func $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E (;20;) (type 0) (param i32 i32 i32 i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        i32.const 0
        i32.const 0
        i32.load offset=1049716
        local.tee 5
        i32.const 1
        i32.add
        i32.store offset=1049716
        block ;; label = @1
          local.get 5
          i32.const 0
          i32.lt_s
          br_if 0 (;@1;)
          block ;; label = @2
            block ;; label = @3
              i32.const 0
              i32.load8_u offset=1049712
              br_if 0 (;@3;)
              i32.const 0
              i32.const 0
              i32.load offset=1049708
              i32.const 1
              i32.add
              i32.store offset=1049708
              i32.const 0
              i32.load offset=1049720
              i32.const -1
              i32.gt_s
              br_if 1 (;@2;)
              br 2 (;@1;)
            end
            local.get 4
            i32.const 8
            i32.add
            local.get 0
            local.get 1
            call_indirect (type 1)
            unreachable
          end
          i32.const 0
          i32.const 0
          i32.store8 offset=1049712
          local.get 2
          i32.eqz
          br_if 0 (;@1;)
          call $_RNvCsdBezzDwma51_7___rustc10rust_panic
          unreachable
        end
        unreachable
      )
      (func $_RNvCsdBezzDwma51_7___rustc10rust_panic (;21;) (type 5)
        unreachable
      )
      (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E (;22;) (type 9) (param i32)
        local.get 0
        call $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE
        unreachable
      )
      (func $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE (;23;) (type 9) (param i32)
        (local i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        block ;; label = @1
          local.get 0
          i32.load
          local.tee 2
          i32.load offset=4
          local.tee 3
          i32.const 1
          i32.and
          br_if 0 (;@1;)
          local.get 1
          i32.const -2147483648
          i32.store
          local.get 1
          local.get 0
          i32.store offset=12
          local.get 1
          i32.const 5
          local.get 0
          i32.load offset=8
          local.tee 0
          i32.load8_u offset=8
          local.get 0
          i32.load8_u offset=9
          call $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E
          unreachable
        end
        local.get 2
        i32.load
        local.set 2
        local.get 1
        local.get 3
        i32.const 1
        i32.shr_u
        i32.store offset=4
        local.get 1
        local.get 2
        i32.store
        local.get 1
        i32.const 6
        local.get 0
        i32.load offset=8
        local.tee 0
        i32.load8_u offset=8
        local.get 0
        i32.load8_u offset=9
        call $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E
        unreachable
      )
      (func $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E (;24;) (type 1) (param i32 i32)
        local.get 0
        local.get 1
        i64.load align=4
        i64.store
      )
      (func $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E (;25;) (type 1) (param i32 i32)
        local.get 0
        local.get 1
        call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE
        unreachable
      )
      (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE (;26;) (type 1) (param i32 i32)
        i32.const 0
        i32.const 1
        i32.store8 offset=1049704
        unreachable
      )
      (func $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE (;27;) (type 10) (param i32 i32 i32 i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32 i32 i32)
        block ;; label = @1
          local.get 2
          i32.load
          local.tee 5
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i32.const -1
          i32.add
          local.set 6
          i32.const 0
          local.get 1
          i32.sub
          local.set 7
          local.get 0
          i32.const 2
          i32.shl
          local.set 8
          loop ;; label = @2
            block ;; label = @3
              block ;; label = @4
                local.get 5
                i32.load offset=8
                local.tee 1
                i32.const 1
                i32.and
                br_if 0 (;@4;)
                local.get 5
                i32.const 8
                i32.add
                local.set 9
                br 1 (;@3;)
              end
              loop ;; label = @4
                local.get 5
                local.get 1
                i32.const -2
                i32.and
                i32.store offset=8
                block ;; label = @5
                  block ;; label = @6
                    local.get 5
                    i32.load offset=4
                    local.tee 10
                    i32.const -4
                    i32.and
                    local.tee 9
                    br_if 0 (;@6;)
                    i32.const 0
                    local.set 11
                    br 1 (;@5;)
                  end
                  i32.const 0
                  local.get 9
                  local.get 9
                  i32.load8_u
                  i32.const 1
                  i32.and
                  select
                  local.set 11
                end
                block ;; label = @5
                  local.get 5
                  i32.load
                  local.tee 1
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 1
                  i32.const -4
                  i32.and
                  local.tee 12
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 12
                  local.get 12
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.get 9
                  i32.or
                  i32.store offset=4
                  local.get 5
                  i32.load offset=4
                  local.tee 10
                  i32.const -4
                  i32.and
                  local.set 9
                  local.get 5
                  i32.load
                  local.set 1
                end
                block ;; label = @5
                  local.get 9
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 9
                  local.get 9
                  i32.load
                  i32.const 3
                  i32.and
                  local.get 1
                  i32.const -4
                  i32.and
                  i32.or
                  i32.store
                  local.get 5
                  i32.load offset=4
                  local.set 10
                  local.get 5
                  i32.load
                  local.set 1
                end
                local.get 5
                local.get 10
                i32.const 3
                i32.and
                i32.store offset=4
                local.get 5
                local.get 1
                i32.const 3
                i32.and
                i32.store
                block ;; label = @5
                  local.get 1
                  i32.const 2
                  i32.and
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 11
                  local.get 11
                  i32.load
                  i32.const 2
                  i32.or
                  i32.store
                end
                local.get 2
                local.get 11
                i32.store
                local.get 11
                local.set 5
                local.get 11
                i32.load offset=8
                local.tee 1
                i32.const 1
                i32.and
                br_if 0 (;@4;)
              end
              local.get 11
              i32.const 8
              i32.add
              local.set 9
              local.get 11
              local.set 5
            end
            block ;; label = @3
              local.get 5
              i32.load
              i32.const -4
              i32.and
              local.tee 11
              local.get 9
              i32.sub
              local.get 8
              i32.lt_u
              br_if 0 (;@3;)
              block ;; label = @4
                block ;; label = @5
                  local.get 9
                  local.get 3
                  local.get 0
                  local.get 4
                  call_indirect (type 2)
                  i32.const 2
                  i32.shl
                  i32.add
                  i32.const 8
                  i32.add
                  local.get 11
                  local.get 8
                  i32.sub
                  local.get 7
                  i32.and
                  local.tee 1
                  i32.le_u
                  br_if 0 (;@5;)
                  local.get 9
                  i32.load
                  local.set 1
                  local.get 6
                  local.get 9
                  i32.and
                  br_if 2 (;@3;)
                  local.get 2
                  local.get 1
                  i32.const -4
                  i32.and
                  i32.store
                  local.get 5
                  i32.load
                  local.set 9
                  local.get 5
                  local.set 1
                  br 1 (;@4;)
                end
                i32.const 0
                local.set 11
                local.get 1
                i32.const 0
                i32.store
                local.get 1
                i32.const -8
                i32.add
                local.tee 1
                i64.const 0
                i64.store align=4
                local.get 1
                local.get 5
                i32.load
                i32.const -4
                i32.and
                i32.store
                block ;; label = @5
                  local.get 5
                  i32.load
                  local.tee 10
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 10
                  i32.const -4
                  i32.and
                  local.tee 10
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 10
                  local.get 10
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.get 1
                  i32.or
                  i32.store offset=4
                  local.get 1
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.set 11
                end
                local.get 1
                local.get 11
                local.get 5
                i32.or
                i32.store offset=4
                local.get 9
                local.get 9
                i32.load
                i32.const -2
                i32.and
                i32.store
                local.get 5
                local.get 5
                i32.load
                local.tee 9
                i32.const 3
                i32.and
                local.get 1
                i32.or
                local.tee 11
                i32.store
                block ;; label = @5
                  local.get 9
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 1
                  i32.load
                  local.set 9
                  br 1 (;@4;)
                end
                local.get 5
                local.get 11
                i32.const -3
                i32.and
                i32.store
                local.get 1
                i32.load
                i32.const 2
                i32.or
                local.set 9
              end
              local.get 1
              local.get 9
              i32.const 1
              i32.or
              i32.store
              local.get 1
              i32.const 8
              i32.add
              return
            end
            local.get 2
            local.get 1
            i32.store
            local.get 1
            local.set 5
            local.get 1
            br_if 0 (;@2;)
          end
        end
        i32.const 0
      )
      (func $cabi_realloc_wit_bindgen_0_24_0 (;28;) (type 6) (param i32 i32 i32 i32) (result i32)
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              local.get 1
              i32.eqz
              br_if 0 (;@3;)
              local.get 0
              local.get 1
              local.get 2
              local.get 3
              call $_RNvCsdBezzDwma51_7___rustc14___rust_realloc
              local.set 2
              br 1 (;@2;)
            end
            local.get 3
            i32.eqz
            br_if 1 (;@1;)
            local.get 2
            local.get 3
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
            local.set 2
          end
          local.get 2
          br_if 0 (;@1;)
          unreachable
        end
        local.get 2
      )
      (func $cabi_realloc (;29;) (type 6) (param i32 i32 i32 i32) (result i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        call $cabi_realloc_wit_bindgen_0_24_0
      )
      (data $.rodata (;0;) (i32.const 1048576) "\07\00\00\00\07\00\00\00\07\00\00\00steakcity dinnercapacity overflowlibrary/alloc/src/raw_vec/mod.rs\00\00\00-\00\10\00 \00\00\00\1c\00\00\00\05\00\00\00\08\00\00\00")
      (@producers
        (language "Rust" "")
        (processed-by "rustc" "1.93.1 (01f6ddf75 2026-02-11)")
        (processed-by "wit-component" "0.227.1")
        (processed-by "wit-bindgen-rust" "0.41.0")
      )
      (@custom "target_features" (after data) "\08+\0bbulk-memory+\0fbulk-memory-opt+\16call-indirect-overlong+\0amultivalue+\0fmutable-globals+\13nontrapping-fptoint+\0freference-types+\08sign-ext")
    )
    (core module (;1;)
      (type (;0;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)))
      (type (;1;) (func (param i32 i32 i32 i32 i32 i32)))
      (table (;0;) 2 2 funcref)
      (export "0" (func $indirect-zoo:food/eater@0.1.0-feed))
      (export "1" (func $indirect-zoo:food/eater@0.1.0-schedule))
      (export "$imports" (table 0))
      (func $indirect-zoo:food/eater@0.1.0-feed (;0;) (type 0) (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        local.get 5
        local.get 6
        local.get 7
        local.get 8
        local.get 9
        local.get 10
        local.get 11
        local.get 12
        local.get 13
        local.get 14
        local.get 15
        i32.const 0
        call_indirect (type 0)
      )
      (func $indirect-zoo:food/eater@0.1.0-schedule (;1;) (type 1) (param i32 i32 i32 i32 i32 i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        local.get 5
        i32.const 1
        call_indirect (type 1)
      )
      (@producers
        (processed-by "wit-component" "0.227.1")
      )
    )
    (core module (;2;)
      (type (;0;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)))
      (type (;1;) (func (param i32 i32 i32 i32 i32 i32)))
      (import "" "0" (func (;0;) (type 0)))
      (import "" "1" (func (;1;) (type 1)))
      (import "" "$imports" (table (;0;) 2 2 funcref))
      (elem (;0;) (i32.const 0) func 0 1)
      (@producers
        (processed-by "wit-component" "0.227.1")
      )
    )
    (core instance (;0;) (instantiate 1))
    (alias core export 0 "0" (core func (;0;)))
    (alias core export 0 "1" (core func (;1;)))
    (core instance (;1;)
      (export "feed" (func 0))
      (export "schedule" (func 1))
    )
    (core instance (;2;) (instantiate 0
        (with "zoo:food/eater@0.1.0" (instance 1))
      )
    )
    (alias core export 2 "memory" (core memory (;0;)))
    (alias core export 0 "$imports" (core table (;0;)))
    (alias export 1 "feed" (func (;0;)))
    (alias core export 2 "cabi_realloc" (core func (;2;)))
    (core func (;3;) (canon lower (func 0) (memory 0) string-encoding=utf8))
    (alias export 1 "schedule" (func (;1;)))
    (core func (;4;) (canon lower (func 1) (memory 0) (realloc 2) string-encoding=utf8))
    (core instance (;3;)
      (export "$imports" (table 0))
      (export "0" (func 3))
      (export "1" (func 4))
    )
    (core instance (;4;) (instantiate 2
        (with "" (instance 3))
      )
    )
    (type (;5;) (func))
    (alias core export 2 "city:runner/runner@0.1.0#run" (core func (;5;)))
    (func (;2;) (type 5) (canon lift (core func 5)))
    (component (;0;)
      (type (;0;) (func))
      (import "import-func-run" (func (;0;) (type 0)))
      (type (;1;) (func))
      (export (;1;) "run" (func 0) (func (type 1)))
    )
    (instance (;2;) (instantiate 0
        (with "import-func-run" (func 2))
      )
    )
    (export (;3;) "city:runner/runner@0.1.0" (instance 2))
    (@producers
      (processed-by "wit-component" "0.227.1")
      (processed-by "cargo-component" "0.21.1 (1495f61 2025-07-14)")
      (language "Rust" "")
    )
    (@custom "authors" "pavel.savara@gmail.com")
    (@custom "revision" "f9e6f1fc5836e6da347dac8f9b98117aa0b4978c")
    (@custom "version" "0.1.0")
  )
  (component (;1;)
    (type (;0;)
      (instance
        (type (;0;) (tuple s8 u8))
        (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" f32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
        (export (;2;) "food-info" (type (eq 1)))
        (type (;3;) (enum "carbohydrate" "protein" "vitamin"))
        (export (;4;) "nutrition-type" (type (eq 3)))
        (type (;5;) (record (field "percentage" f64) (field "nutrition-type" 4)))
        (export (;6;) "nutrition-info" (type (eq 5)))
        (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
        (export (;8;) "material-type" (type (eq 7)))
        (type (;9;) (flags "opened" "closed" "damaged"))
        (export (;10;) "sealing-state" (type (eq 9)))
        (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
        (export (;12;) "package-info" (type (eq 11)))
        (type (;13;) (list 2))
        (type (;14;) (option string))
        (type (;15;) (record (field "foods" 13) (field "label" 14)))
        (export (;16;) "meal-plan" (type (eq 15)))
        (type (;17;) (func (param "food" 2) (param "message" string)))
        (export (;0;) "hide-food" (func (type 17)))
        (type (;18;) (func (param "foodinfo" 2) (param "packageinfo" 12) (param "message" string)))
        (export (;1;) "consume-food" (func (type 18)))
        (type (;19;) (func (param "sealingstate" 10) (param "packageinfo" 12) (param "message" string)))
        (export (;2;) "open-package" (func (type 19)))
        (type (;20;) (list 12))
        (type (;21;) (func (param "trashed" 20) (param "message" string) (result bool)))
        (export (;3;) "trash-package" (func (type 21)))
        (type (;22;) (result string (error string)))
        (type (;23;) (func (param "plan" 16) (result 22)))
        (export (;4;) "plan-meal" (func (type 23)))
      )
    )
    (import "zoo:food/food@0.1.0" (instance (;0;) (type 0)))
    (core module (;0;)
      (type (;0;) (func (param i32 i32) (result i32)))
      (type (;1;) (func (param i32 i32 i32) (result i32)))
      (type (;2;) (func (param i32 i32 i32 i32)))
      (type (;3;) (func (param i32 i32)))
      (type (;4;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
      (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
      (type (;6;) (func (param i32)))
      (type (;7;) (func (param i32 f64 i32 i32 i32 i32 i32)))
      (type (;8;) (func (param i32 i32 i32 i32 i32 i32)))
      (type (;9;) (func))
      (type (;10;) (func (param i32 i32 i32)))
      (type (;11;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)))
      (type (;12;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
      (type (;13;) (func (param i32 i32 i32 i32 i32) (result i32)))
      (import "zoo:food/food@0.1.0" "hide-food" (func $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417h6624bffeb8c3fc50E (;0;) (type 4)))
      (import "zoo:food/food@0.1.0" "trash-package" (func $_ZN3zoo8bindings3zoo4food4food13trash_package11wit_import517h709841659cc952d5E (;1;) (type 5)))
      (import "zoo:food/food@0.1.0" "consume-food" (func $_ZN3zoo8bindings3zoo4food4food12consume_food11wit_import817hc4130d629814c9d1E (;2;) (type 6)))
      (import "zoo:food/food@0.1.0" "open-package" (func $_ZN3zoo8bindings3zoo4food4food12open_package11wit_import617h45d16345cd4f747dE (;3;) (type 7)))
      (import "zoo:food/food@0.1.0" "plan-meal" (func $_ZN3zoo8bindings3zoo4food4food9plan_meal11wit_import817h4693f5281da37edcE (;4;) (type 8)))
      (table (;0;) 18 18 funcref)
      (memory (;0;) 1 10)
      (global $__stack_pointer (;0;) (mut i32) i32.const 16384)
      (global (;1;) i32 i32.const 17976)
      (global (;2;) i32 i32.const 17984)
      (export "memory" (memory 0))
      (export "cabi_post_zoo:food/eater@0.1.0#schedule" (func $cabi_post_zoo:food/eater@0.1.0#schedule))
      (export "zoo:food/eater@0.1.0#feed" (func $zoo:food/eater@0.1.0#feed))
      (export "zoo:food/eater@0.1.0#schedule" (func $zoo:food/eater@0.1.0#schedule))
      (export "cabi_realloc_wit_bindgen_0_24_0" (func $cabi_realloc_wit_bindgen_0_24_0))
      (export "cabi_realloc" (func $cabi_realloc))
      (export "__data_end" (global 1))
      (export "__heap_base" (global 2))
      (elem (;0;) (i32.const 1) func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E $_ZN3zoo93_$LT$impl$u20$core..fmt..Display$u20$for$u20$zoo..bindings..zoo..food..food..MaterialType$GT$3fmt17hd19d39ca98dec6a9E $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E $cabi_realloc $_ZN3zoo8bindings40__link_custom_section_describing_imports17hde9e1f059f3f9070E)
      (func $__wasm_call_ctors (;5;) (type 9))
      (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17h8f70bbda1af6c91aE (;6;) (type 6) (param i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        local.get 1
        i32.const 8
        i32.add
        local.get 0
        local.get 0
        i32.load
        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$14grow_amortized17h8552c7700614404cE
        block ;; label = @1
          local.get 1
          i32.load offset=8
          local.tee 0
          i32.const -2147483647
          i32.eq
          br_if 0 (;@1;)
          local.get 0
          local.get 1
          i32.load offset=12
          call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
          unreachable
        end
        local.get 1
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$14grow_amortized17h8552c7700614404cE (;7;) (type 10) (param i32 i32 i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 3
        global.set $__stack_pointer
        local.get 3
        i32.const 4
        i32.add
        local.get 1
        i32.load
        local.tee 4
        local.get 1
        i32.load offset=4
        local.get 2
        i32.const 1
        i32.add
        local.tee 2
        local.get 4
        i32.const 1
        i32.shl
        local.tee 4
        local.get 2
        local.get 4
        i32.gt_u
        select
        local.tee 2
        i32.const 4
        local.get 2
        i32.const 4
        i32.gt_u
        select
        local.tee 2
        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h5781bc43aa0b5108E
        block ;; label = @1
          block ;; label = @2
            local.get 3
            i32.load offset=4
            i32.const 1
            i32.ne
            br_if 0 (;@2;)
            local.get 3
            i32.load offset=12
            local.set 1
            local.get 3
            i32.load offset=8
            local.set 2
            br 1 (;@1;)
          end
          local.get 3
          i32.load offset=8
          local.set 4
          local.get 1
          local.get 2
          i32.store
          local.get 1
          local.get 4
          i32.store offset=4
          i32.const -2147483647
          local.set 2
        end
        local.get 0
        local.get 1
        i32.store offset=4
        local.get 0
        local.get 2
        i32.store
        local.get 3
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E (;8;) (type 3) (param i32 i32)
        block ;; label = @1
          local.get 0
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          local.get 1
          call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
          unreachable
        end
        call $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E
        unreachable
      )
      (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE (;9;) (type 2) (param i32 i32 i32 i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        block ;; label = @1
          block ;; label = @2
            local.get 0
            br_if 0 (;@2;)
            i32.const 0
            local.set 0
            local.get 4
            i32.const 12
            i32.add
            local.set 3
            br 1 (;@1;)
          end
          local.get 4
          local.get 2
          i32.store offset=12
          local.get 0
          local.get 3
          i32.mul
          local.set 0
          local.get 4
          i32.const 8
          i32.add
          local.set 3
        end
        local.get 3
        local.get 0
        i32.store
        block ;; label = @1
          local.get 4
          i32.load offset=12
          local.tee 0
          i32.eqz
          br_if 0 (;@1;)
          local.get 4
          i32.load offset=8
          local.tee 3
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          local.get 0
          local.get 3
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
        end
        local.get 4
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E (;10;) (type 10) (param i32 i32 i32)
        (local i32 i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    local.get 0
                    i32.eqz
                    br_if 0 (;@6;)
                    local.get 2
                    i32.eqz
                    br_if 0 (;@6;)
                    block ;; label = @7
                      block ;; label = @8
                        local.get 1
                        i32.const 4
                        i32.gt_u
                        br_if 0 (;@8;)
                        local.get 2
                        i32.const 3
                        i32.add
                        i32.const 2
                        i32.shr_u
                        i32.const -1
                        i32.add
                        local.tee 2
                        i32.const 255
                        i32.le_u
                        br_if 1 (;@7;)
                      end
                      local.get 0
                      i32.const 0
                      i32.store
                      local.get 0
                      i32.const -8
                      i32.add
                      local.tee 2
                      local.get 2
                      i32.load
                      local.tee 1
                      i32.const -2
                      i32.and
                      i32.store
                      i32.const 0
                      i32.load offset=17936
                      local.set 3
                      block ;; label = @8
                        local.get 0
                        i32.const -4
                        i32.add
                        local.tee 4
                        i32.load
                        i32.const -4
                        i32.and
                        local.tee 5
                        i32.eqz
                        br_if 0 (;@8;)
                        local.get 5
                        i32.load
                        local.tee 6
                        i32.const 1
                        i32.and
                        br_if 0 (;@8;)
                        local.get 1
                        i32.const -4
                        i32.and
                        local.set 0
                        local.get 1
                        i32.const 2
                        i32.and
                        br_if 3 (;@5;)
                        local.get 0
                        i32.eqz
                        br_if 3 (;@5;)
                        local.get 0
                        local.get 0
                        i32.load offset=4
                        i32.const 3
                        i32.and
                        local.get 5
                        i32.or
                        i32.store offset=4
                        local.get 2
                        i32.load
                        local.set 0
                        local.get 4
                        i32.load
                        local.tee 1
                        i32.const -4
                        i32.and
                        local.tee 7
                        i32.eqz
                        br_if 5 (;@3;)
                        local.get 0
                        i32.const -4
                        i32.and
                        local.set 0
                        local.get 7
                        i32.load
                        local.set 6
                        br 4 (;@4;)
                      end
                      block ;; label = @8
                        block ;; label = @9
                          local.get 1
                          i32.const 2
                          i32.and
                          br_if 0 (;@9;)
                          local.get 1
                          i32.const -4
                          i32.and
                          local.tee 1
                          i32.eqz
                          br_if 0 (;@9;)
                          local.get 1
                          i32.load8_u
                          i32.const 1
                          i32.and
                          i32.eqz
                          br_if 1 (;@8;)
                        end
                        local.get 0
                        local.get 3
                        i32.store
                        br 7 (;@1;)
                      end
                      local.get 0
                      local.get 1
                      i32.load offset=8
                      i32.const -4
                      i32.and
                      i32.store
                      local.get 1
                      local.get 2
                      i32.const 1
                      i32.or
                      i32.store offset=8
                      br 5 (;@2;)
                    end
                    local.get 0
                    local.get 2
                    i32.const 2
                    i32.shl
                    local.tee 2
                    i32.load offset=16912
                    i32.store
                    local.get 2
                    local.get 0
                    i32.const -8
                    i32.add
                    local.tee 0
                    i32.store offset=16912
                    local.get 0
                    local.get 0
                    i32.load
                    i32.const -2
                    i32.and
                    i32.store
                  end
                  return
                end
                local.get 5
                local.set 7
              end
              local.get 7
              local.get 6
              i32.const 3
              i32.and
              local.get 0
              i32.or
              i32.store
              local.get 4
              i32.load
              local.set 1
              local.get 2
              i32.load
              local.set 0
            end
            local.get 4
            local.get 1
            i32.const 3
            i32.and
            i32.store
            local.get 2
            local.get 0
            i32.const 3
            i32.and
            i32.store
            local.get 0
            i32.const 2
            i32.and
            i32.eqz
            br_if 0 (;@2;)
            local.get 5
            local.get 5
            i32.load
            i32.const 2
            i32.or
            i32.store
          end
          local.get 3
          local.set 2
        end
        i32.const 0
        local.get 2
        i32.store offset=17936
      )
      (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h5781bc43aa0b5108E (;11;) (type 2) (param i32 i32 i32 i32)
        (local i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        i32.const 1
        local.set 5
        block ;; label = @1
          block ;; label = @2
            local.get 3
            i32.const 53687091
            i32.le_u
            br_if 0 (;@2;)
            i32.const 0
            local.set 3
            i32.const 4
            local.set 1
            br 1 (;@1;)
          end
          block ;; label = @2
            block ;; label = @3
              local.get 1
              br_if 0 (;@3;)
              i32.const 0
              local.set 1
              local.get 4
              i32.const 12
              i32.add
              local.set 6
              br 1 (;@2;)
            end
            local.get 4
            i32.const 8
            i32.store offset=12
            local.get 1
            i32.const 40
            i32.mul
            local.set 1
            local.get 4
            i32.const 8
            i32.add
            local.set 6
          end
          local.get 3
          i32.const 40
          i32.mul
          local.set 3
          local.get 6
          local.get 1
          i32.store
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                local.get 4
                i32.load offset=12
                i32.eqz
                br_if 0 (;@4;)
                block ;; label = @5
                  local.get 4
                  i32.load offset=8
                  local.tee 1
                  br_if 0 (;@5;)
                  block ;; label = @6
                    local.get 3
                    br_if 0 (;@6;)
                    i32.const 8
                    local.set 1
                    br 3 (;@3;)
                  end
                  i32.const 8
                  local.get 3
                  call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
                  local.set 1
                  br 2 (;@3;)
                end
                local.get 2
                i32.const 8
                local.get 1
                local.get 3
                call $_ZN4core5alloc6global11GlobalAlloc7realloc17h2f5334da4d3fba08E
                local.set 1
                br 1 (;@3;)
              end
              block ;; label = @4
                local.get 3
                br_if 0 (;@4;)
                i32.const 8
                local.set 1
                br 2 (;@2;)
              end
              i32.const 8
              local.get 3
              call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
              local.set 1
            end
            local.get 1
            br_if 0 (;@2;)
            i32.const 8
            local.set 1
            local.get 0
            i32.const 8
            i32.store offset=4
            br 1 (;@1;)
          end
          local.get 0
          local.get 1
          i32.store offset=4
          i32.const 0
          local.set 5
          i32.const 8
          local.set 1
        end
        local.get 0
        local.get 1
        i32.add
        local.get 3
        i32.store
        local.get 0
        local.get 5
        i32.store
        local.get 4
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE (;12;) (type 0) (param i32 i32) (result i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 2
        global.set $__stack_pointer
        block ;; label = @1
          local.get 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i32.const 3
          i32.add
          i32.const 2
          i32.shr_u
          local.set 1
          block ;; label = @2
            block ;; label = @3
              local.get 0
              i32.const 4
              i32.gt_u
              br_if 0 (;@3;)
              local.get 1
              i32.const -1
              i32.add
              local.tee 3
              i32.const 256
              i32.lt_u
              br_if 1 (;@2;)
            end
            local.get 2
            i32.const 0
            i32.load offset=17936
            i32.store offset=8
            local.get 1
            local.get 0
            local.get 2
            i32.const 8
            i32.add
            i32.const 16880
            i32.const 1
            i32.const 2
            call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
            local.set 0
            i32.const 0
            local.get 2
            i32.load offset=8
            i32.store offset=17936
            br 1 (;@1;)
          end
          local.get 2
          i32.const 17936
          i32.store offset=4
          local.get 2
          local.get 3
          i32.const 2
          i32.shl
          local.tee 3
          i32.load offset=16912
          i32.store offset=12
          local.get 1
          local.get 0
          local.get 2
          i32.const 12
          i32.add
          local.get 2
          i32.const 4
          i32.add
          i32.const 3
          i32.const 4
          call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
          local.set 0
          local.get 3
          local.get 2
          i32.load offset=12
          i32.store offset=16912
        end
        local.get 2
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 0
      )
      (func $_ZN4core5alloc6global11GlobalAlloc7realloc17h2f5334da4d3fba08E (;13;) (type 5) (param i32 i32 i32 i32) (result i32)
        (local i32)
        block ;; label = @1
          local.get 1
          local.get 3
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
          local.tee 4
          i32.eqz
          br_if 0 (;@1;)
          block ;; label = @2
            local.get 3
            local.get 2
            local.get 3
            local.get 2
            i32.lt_u
            select
            local.tee 3
            i32.eqz
            br_if 0 (;@2;)
            local.get 4
            local.get 0
            local.get 3
            memory.copy
          end
          local.get 0
          local.get 1
          local.get 2
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
        end
        local.get 4
      )
      (func $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E (;14;) (type 0) (param i32 i32) (result i32)
        local.get 1
        local.get 0
        i32.load offset=4
        local.get 0
        i32.load offset=8
        call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
      )
      (func $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E (;15;) (type 1) (param i32 i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            local.get 0
            i32.load offset=8
            local.tee 3
            i32.const 402653184
            i32.and
            i32.eqz
            br_if 0 (;@2;)
            block ;; label = @3
              block ;; label = @4
                local.get 3
                i32.const 268435456
                i32.and
                br_if 0 (;@4;)
                block ;; label = @5
                  local.get 2
                  i32.const 16
                  i32.lt_u
                  br_if 0 (;@5;)
                  local.get 2
                  local.get 1
                  local.get 1
                  i32.const 3
                  i32.add
                  i32.const -4
                  i32.and
                  local.tee 4
                  i32.sub
                  local.tee 5
                  i32.add
                  local.tee 6
                  i32.const 3
                  i32.and
                  local.set 7
                  i32.const 0
                  local.set 8
                  i32.const 0
                  local.set 9
                  block ;; label = @6
                    local.get 1
                    local.get 4
                    i32.eq
                    br_if 0 (;@6;)
                    i32.const 0
                    local.set 9
                    local.get 1
                    local.set 10
                    loop ;; label = @7
                      local.get 9
                      local.get 10
                      i32.load8_s
                      i32.const -65
                      i32.gt_s
                      i32.add
                      local.set 9
                      local.get 10
                      i32.const 1
                      i32.add
                      local.set 10
                      local.get 5
                      i32.const 1
                      i32.add
                      local.tee 5
                      br_if 0 (;@7;)
                    end
                  end
                  block ;; label = @6
                    local.get 7
                    i32.eqz
                    br_if 0 (;@6;)
                    local.get 4
                    local.get 6
                    i32.const 2147483644
                    i32.and
                    i32.add
                    local.set 10
                    i32.const 0
                    local.set 8
                    loop ;; label = @7
                      local.get 8
                      local.get 10
                      i32.load8_s
                      i32.const -65
                      i32.gt_s
                      i32.add
                      local.set 8
                      local.get 10
                      i32.const 1
                      i32.add
                      local.set 10
                      local.get 7
                      i32.const -1
                      i32.add
                      local.tee 7
                      br_if 0 (;@7;)
                    end
                  end
                  local.get 6
                  i32.const 2
                  i32.shr_u
                  local.set 5
                  local.get 8
                  local.get 9
                  i32.add
                  local.set 9
                  loop ;; label = @6
                    local.get 4
                    local.set 11
                    local.get 5
                    i32.eqz
                    br_if 3 (;@3;)
                    local.get 5
                    i32.const 192
                    local.get 5
                    i32.const 192
                    i32.lt_u
                    select
                    local.tee 6
                    i32.const 3
                    i32.and
                    local.set 12
                    i32.const 0
                    local.set 8
                    block ;; label = @7
                      local.get 6
                      i32.const 2
                      i32.shl
                      local.tee 13
                      i32.const 1008
                      i32.and
                      local.tee 7
                      i32.eqz
                      br_if 0 (;@7;)
                      local.get 11
                      local.set 10
                      loop ;; label = @8
                        local.get 10
                        i32.const 12
                        i32.add
                        i32.load
                        local.tee 4
                        i32.const -1
                        i32.xor
                        i32.const 7
                        i32.shr_u
                        local.get 4
                        i32.const 6
                        i32.shr_u
                        i32.or
                        i32.const 16843009
                        i32.and
                        local.get 10
                        i32.const 8
                        i32.add
                        i32.load
                        local.tee 4
                        i32.const -1
                        i32.xor
                        i32.const 7
                        i32.shr_u
                        local.get 4
                        i32.const 6
                        i32.shr_u
                        i32.or
                        i32.const 16843009
                        i32.and
                        local.get 10
                        i32.const 4
                        i32.add
                        i32.load
                        local.tee 4
                        i32.const -1
                        i32.xor
                        i32.const 7
                        i32.shr_u
                        local.get 4
                        i32.const 6
                        i32.shr_u
                        i32.or
                        i32.const 16843009
                        i32.and
                        local.get 10
                        i32.load
                        local.tee 4
                        i32.const -1
                        i32.xor
                        i32.const 7
                        i32.shr_u
                        local.get 4
                        i32.const 6
                        i32.shr_u
                        i32.or
                        i32.const 16843009
                        i32.and
                        local.get 8
                        i32.add
                        i32.add
                        i32.add
                        i32.add
                        local.set 8
                        local.get 10
                        i32.const 16
                        i32.add
                        local.set 10
                        local.get 7
                        i32.const -16
                        i32.add
                        local.tee 7
                        br_if 0 (;@8;)
                      end
                    end
                    local.get 5
                    local.get 6
                    i32.sub
                    local.set 5
                    local.get 11
                    local.get 13
                    i32.add
                    local.set 4
                    local.get 8
                    i32.const 8
                    i32.shr_u
                    i32.const 16711935
                    i32.and
                    local.get 8
                    i32.const 16711935
                    i32.and
                    i32.add
                    i32.const 65537
                    i32.mul
                    i32.const 16
                    i32.shr_u
                    local.get 9
                    i32.add
                    local.set 9
                    local.get 12
                    i32.eqz
                    br_if 0 (;@6;)
                  end
                  local.get 12
                  i32.const 2
                  i32.shl
                  local.set 7
                  local.get 11
                  local.get 6
                  i32.const 252
                  i32.and
                  i32.const 2
                  i32.shl
                  i32.add
                  local.set 10
                  i32.const 0
                  local.set 8
                  loop ;; label = @6
                    local.get 10
                    i32.load
                    local.tee 4
                    i32.const -1
                    i32.xor
                    i32.const 7
                    i32.shr_u
                    local.get 4
                    i32.const 6
                    i32.shr_u
                    i32.or
                    i32.const 16843009
                    i32.and
                    local.get 8
                    i32.add
                    local.set 8
                    local.get 10
                    i32.const 4
                    i32.add
                    local.set 10
                    local.get 7
                    i32.const -4
                    i32.add
                    local.tee 7
                    br_if 0 (;@6;)
                  end
                  local.get 8
                  i32.const 8
                  i32.shr_u
                  i32.const 16711935
                  i32.and
                  local.get 8
                  i32.const 16711935
                  i32.and
                  i32.add
                  i32.const 65537
                  i32.mul
                  i32.const 16
                  i32.shr_u
                  local.get 9
                  i32.add
                  local.set 9
                  br 2 (;@3;)
                end
                block ;; label = @5
                  local.get 2
                  br_if 0 (;@5;)
                  i32.const 0
                  local.set 9
                  i32.const 0
                  local.set 2
                  br 2 (;@3;)
                end
                i32.const 0
                local.set 10
                i32.const 0
                local.set 9
                loop ;; label = @5
                  local.get 9
                  local.get 1
                  local.get 10
                  i32.add
                  i32.load8_s
                  i32.const -65
                  i32.gt_s
                  i32.add
                  local.set 9
                  local.get 2
                  local.get 10
                  i32.const 1
                  i32.add
                  local.tee 10
                  i32.ne
                  br_if 0 (;@5;)
                  br 2 (;@3;)
                end
              end
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    local.get 0
                    i32.load16_u offset=14
                    local.tee 9
                    br_if 0 (;@6;)
                    i32.const 0
                    local.set 2
                    br 1 (;@5;)
                  end
                  local.get 1
                  local.get 2
                  i32.add
                  local.set 4
                  i32.const 0
                  local.set 2
                  local.get 1
                  local.set 8
                  local.get 9
                  local.set 7
                  loop ;; label = @6
                    local.get 8
                    local.tee 10
                    local.get 4
                    i32.eq
                    br_if 2 (;@4;)
                    block ;; label = @7
                      block ;; label = @8
                        local.get 10
                        i32.load8_s
                        local.tee 8
                        i32.const -1
                        i32.le_s
                        br_if 0 (;@8;)
                        local.get 10
                        i32.const 1
                        i32.add
                        local.set 8
                        br 1 (;@7;)
                      end
                      block ;; label = @8
                        local.get 8
                        i32.const -32
                        i32.ge_u
                        br_if 0 (;@8;)
                        local.get 10
                        i32.const 2
                        i32.add
                        local.set 8
                        br 1 (;@7;)
                      end
                      block ;; label = @8
                        local.get 8
                        i32.const -16
                        i32.ge_u
                        br_if 0 (;@8;)
                        local.get 10
                        i32.const 3
                        i32.add
                        local.set 8
                        br 1 (;@7;)
                      end
                      local.get 10
                      i32.const 4
                      i32.add
                      local.set 8
                    end
                    local.get 8
                    local.get 10
                    i32.sub
                    local.get 2
                    i32.add
                    local.set 2
                    local.get 7
                    i32.const -1
                    i32.add
                    local.tee 7
                    br_if 0 (;@6;)
                  end
                end
                i32.const 0
                local.set 7
              end
              local.get 9
              local.get 7
              i32.sub
              local.set 9
            end
            local.get 9
            local.get 0
            i32.load16_u offset=12
            local.tee 10
            i32.ge_u
            br_if 0 (;@2;)
            local.get 10
            local.get 9
            i32.sub
            local.set 6
            i32.const 0
            local.set 10
            i32.const 0
            local.set 5
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  local.get 3
                  i32.const 29
                  i32.shr_u
                  i32.const 3
                  i32.and
                  br_table 2 (;@3;) 0 (;@5;) 1 (;@4;) 2 (;@3;) 2 (;@3;)
                end
                local.get 6
                local.set 5
                br 1 (;@3;)
              end
              local.get 6
              i32.const 65534
              i32.and
              i32.const 1
              i32.shr_u
              local.set 5
            end
            local.get 3
            i32.const 2097151
            i32.and
            local.set 9
            local.get 0
            i32.load offset=4
            local.set 7
            local.get 0
            i32.load
            local.set 4
            block ;; label = @3
              loop ;; label = @4
                local.get 10
                i32.const 65535
                i32.and
                local.get 5
                i32.const 65535
                i32.and
                i32.ge_u
                br_if 1 (;@3;)
                i32.const 1
                local.set 8
                local.get 10
                i32.const 1
                i32.add
                local.set 10
                local.get 4
                local.get 9
                local.get 7
                i32.load offset=16
                call_indirect (type 0)
                i32.eqz
                br_if 0 (;@4;)
                br 3 (;@1;)
              end
            end
            i32.const 1
            local.set 8
            local.get 4
            local.get 1
            local.get 2
            local.get 7
            i32.load offset=12
            call_indirect (type 1)
            br_if 1 (;@1;)
            local.get 6
            local.get 5
            i32.sub
            i32.const 65535
            i32.and
            local.set 5
            i32.const 0
            local.set 10
            loop ;; label = @3
              block ;; label = @4
                local.get 10
                i32.const 65535
                i32.and
                local.get 5
                i32.lt_u
                br_if 0 (;@4;)
                i32.const 0
                return
              end
              i32.const 1
              local.set 8
              local.get 10
              i32.const 1
              i32.add
              local.set 10
              local.get 4
              local.get 9
              local.get 7
              i32.load offset=16
              call_indirect (type 0)
              i32.eqz
              br_if 0 (;@3;)
              br 2 (;@1;)
            end
          end
          local.get 0
          i32.load
          local.get 1
          local.get 2
          local.get 0
          i32.load offset=4
          i32.load offset=12
          call_indirect (type 1)
          local.set 8
        end
        local.get 8
      )
      (func $cabi_post_zoo:food/eater@0.1.0#schedule (;16;) (type 6) (param i32)
        (local i32)
        block ;; label = @1
          local.get 0
          i32.load offset=8
          local.tee 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          i32.load offset=4
          i32.const 1
          local.get 1
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
        end
      )
      (func $zoo:food/eater@0.1.0#feed (;17;) (type 11) (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 176
        i32.sub
        local.tee 16
        global.set $__stack_pointer
        block ;; label = @1
          i32.const 0
          i32.load8_u offset=17960
          br_if 0 (;@1;)
          call $__wasm_call_ctors
          i32.const 0
          i32.const 1
          i32.store8 offset=17960
        end
        local.get 16
        local.get 1
        i32.store offset=28
        local.get 16
        local.get 0
        i32.store offset=24
        local.get 16
        local.get 1
        i32.store offset=20
        local.get 16
        local.get 3
        f32.store offset=32
        local.get 16
        local.get 2
        i32.store offset=16
        local.get 16
        local.get 8
        i32.store8 offset=47
        local.get 16
        local.get 7
        i32.store16 offset=42
        local.get 16
        local.get 6
        i32.store16 offset=40
        local.get 16
        local.get 5
        i64.store offset=8
        local.get 16
        local.get 10
        i32.store8 offset=45
        local.get 16
        local.get 9
        i32.store8 offset=44
        local.get 16
        local.get 11
        i32.store offset=36
        local.get 16
        local.get 4
        i32.const 255
        i32.and
        local.tee 1
        i32.const 0
        i32.ne
        i32.store8 offset=46
        local.get 16
        local.get 14
        i32.const 0
        i32.ne
        i32.store8 offset=64
        local.get 16
        local.get 13
        i32.store8 offset=56
        local.get 16
        local.get 12
        f64.store offset=48
        local.get 16
        local.get 15
        i32.store8 offset=65
        local.get 16
        i32.const 5
        i32.store offset=100
        local.get 16
        local.get 16
        i32.const 64
        i32.add
        i32.store offset=96
        local.get 16
        i32.const 72
        i32.add
        i32.const 16436
        local.get 16
        i32.const 96
        i32.add
        call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                local.get 15
                i32.const 2
                i32.and
                br_if 0 (;@4;)
                block ;; label = @5
                  block ;; label = @6
                    block ;; label = @7
                      local.get 15
                      i32.const 4
                      i32.and
                      br_if 0 (;@7;)
                      local.get 16
                      i32.const 20
                      i32.add
                      local.set 14
                      block ;; label = @8
                        local.get 1
                        i32.eqz
                        br_if 0 (;@8;)
                        local.get 5
                        i64.const 1000
                        i64.gt_u
                        br_if 3 (;@5;)
                      end
                      local.get 6
                      i32.const 65535
                      i32.and
                      i32.const 100
                      i32.gt_u
                      br_if 1 (;@6;)
                      local.get 16
                      i32.const 6
                      i32.store offset=88
                      local.get 16
                      local.get 14
                      i32.store offset=84
                      local.get 16
                      i32.const 96
                      i32.add
                      i32.const 16628
                      local.get 16
                      i32.const 84
                      i32.add
                      call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                      local.get 16
                      i32.load offset=24
                      local.get 16
                      i32.load offset=28
                      local.get 16
                      i32.load offset=16
                      local.get 16
                      f32.load offset=32
                      local.get 16
                      i32.load8_u offset=46
                      local.get 16
                      i64.load offset=8
                      local.get 16
                      i32.load16_u offset=40
                      local.get 16
                      i32.load16_s offset=42
                      local.get 16
                      i32.load8_u offset=47
                      local.get 16
                      i32.load8_s offset=44
                      local.get 16
                      i32.load8_u offset=45
                      local.get 16
                      i32.load offset=36
                      local.get 16
                      i32.load offset=100
                      local.tee 15
                      local.get 16
                      i32.load offset=104
                      call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417h6624bffeb8c3fc50E
                      local.get 16
                      i32.load offset=96
                      local.get 15
                      i32.const 1
                      i32.const 1
                      call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                      br 6 (;@1;)
                    end
                    local.get 16
                    i32.const 6
                    i32.store offset=88
                    local.get 16
                    local.get 16
                    i32.const 72
                    i32.add
                    i32.store offset=84
                    local.get 16
                    i32.const 96
                    i32.add
                    i32.const 16572
                    local.get 16
                    i32.const 84
                    i32.add
                    call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                    local.get 16
                    i32.const 0
                    i32.load offset=17936
                    i32.store offset=84
                    i32.const 6
                    i32.const 8
                    local.get 16
                    i32.const 84
                    i32.add
                    i32.const 16880
                    i32.const 1
                    i32.const 2
                    call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                    local.set 15
                    i32.const 0
                    local.get 16
                    i32.load offset=84
                    i32.store offset=17936
                    local.get 15
                    i32.eqz
                    br_if 3 (;@3;)
                    local.get 15
                    local.get 16
                    i64.load offset=48
                    i64.store
                    local.get 15
                    i32.const 16
                    i32.add
                    local.get 16
                    i32.const 48
                    i32.add
                    i32.const 16
                    i32.add
                    i64.load
                    i64.store
                    local.get 15
                    i32.const 8
                    i32.add
                    local.get 16
                    i32.const 48
                    i32.add
                    i32.const 8
                    i32.add
                    i64.load
                    i64.store
                    local.get 16
                    i32.load offset=100
                    local.set 6
                    local.get 16
                    i32.load offset=104
                    local.set 14
                    local.get 16
                    i32.const 0
                    i32.load offset=17936
                    i32.store offset=84
                    i32.const 6
                    i32.const 8
                    local.get 16
                    i32.const 84
                    i32.add
                    i32.const 16880
                    i32.const 1
                    i32.const 2
                    call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                    local.set 1
                    i32.const 0
                    local.get 16
                    i32.load offset=84
                    i32.store offset=17936
                    local.get 1
                    i32.eqz
                    br_if 4 (;@2;)
                    local.get 1
                    local.get 15
                    f64.load
                    f64.store
                    local.get 1
                    local.get 15
                    i32.load8_u offset=8
                    i32.store8 offset=8
                    local.get 1
                    local.get 15
                    i32.load16_u offset=16
                    i32.store16 offset=16
                    local.get 1
                    i32.const 1
                    local.get 6
                    local.get 14
                    call $_ZN3zoo8bindings3zoo4food4food13trash_package11wit_import517h709841659cc952d5E
                    drop
                    local.get 1
                    i32.const 8
                    i32.const 24
                    call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                    local.get 15
                    i32.const 8
                    i32.const 24
                    call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                    local.get 16
                    i32.load offset=96
                    local.get 6
                    i32.const 1
                    i32.const 1
                    call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                    br 5 (;@1;)
                  end
                  local.get 16
                  i32.const 6
                  i32.store offset=88
                  local.get 16
                  local.get 14
                  i32.store offset=84
                  local.get 16
                  i32.const 96
                  i32.add
                  i32.const 16637
                  local.get 16
                  i32.const 84
                  i32.add
                  call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                  local.get 16
                  i32.load offset=24
                  local.get 16
                  i32.load offset=28
                  local.get 16
                  i32.load offset=16
                  local.get 16
                  f32.load offset=32
                  local.get 16
                  i32.load8_u offset=46
                  local.get 16
                  i64.load offset=8
                  local.get 16
                  i32.load16_u offset=40
                  local.get 16
                  i32.load16_s offset=42
                  local.get 16
                  i32.load8_u offset=47
                  local.get 16
                  i32.load8_s offset=44
                  local.get 16
                  i32.load8_u offset=45
                  local.get 16
                  i32.load offset=36
                  local.get 16
                  i32.load offset=100
                  local.tee 15
                  local.get 16
                  i32.load offset=104
                  call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417h6624bffeb8c3fc50E
                  local.get 16
                  i32.load offset=96
                  local.get 15
                  i32.const 1
                  i32.const 1
                  call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                  br 4 (;@1;)
                end
                block ;; label = @5
                  block ;; label = @6
                    local.get 15
                    i32.const 1
                    i32.and
                    i32.eqz
                    br_if 0 (;@6;)
                    local.get 16
                    i32.load8_u offset=56
                    i32.const 1
                    i32.ne
                    br_if 0 (;@6;)
                    local.get 16
                    f64.load offset=48
                    f64.const 0x1.ep+4 (;=30;)
                    f64.gt
                    br_if 1 (;@5;)
                  end
                  local.get 16
                  i32.const 6
                  i32.store offset=88
                  local.get 16
                  local.get 14
                  i32.store offset=84
                  local.get 16
                  i32.const 96
                  i32.add
                  i32.const 16535
                  local.get 16
                  i32.const 84
                  i32.add
                  call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                  local.get 16
                  i32.load offset=24
                  local.get 16
                  i32.load offset=28
                  local.get 16
                  i32.load offset=16
                  local.get 16
                  f32.load offset=32
                  local.get 16
                  i32.load8_u offset=46
                  local.get 16
                  i64.load offset=8
                  local.get 16
                  i32.load16_u offset=40
                  local.get 16
                  i32.load16_s offset=42
                  local.get 16
                  i32.load8_u offset=47
                  local.get 16
                  i32.load8_s offset=44
                  local.get 16
                  i32.load8_u offset=45
                  local.get 16
                  i32.load offset=36
                  local.get 16
                  i32.load offset=100
                  local.tee 15
                  local.get 16
                  i32.load offset=104
                  call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417h6624bffeb8c3fc50E
                  local.get 16
                  i32.load offset=96
                  local.get 15
                  i32.const 1
                  i32.const 1
                  call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                  br 4 (;@1;)
                end
                local.get 16
                i32.const 6
                i32.store offset=100
                local.get 16
                local.get 14
                i32.store offset=96
                local.get 16
                i32.const 84
                i32.add
                i32.const 16384
                local.get 16
                i32.const 96
                i32.add
                call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                local.get 16
                i32.load offset=88
                local.set 15
                local.get 16
                i32.load offset=92
                local.set 1
                local.get 16
                local.get 16
                i64.load offset=24
                i64.store offset=96
                local.get 16
                local.get 16
                i32.load offset=16
                i32.store offset=104
                local.get 16
                local.get 16
                f32.load offset=32
                f32.store offset=108
                local.get 16
                local.get 16
                i32.load8_u offset=46
                i32.store8 offset=112
                local.get 16
                local.get 16
                i64.load offset=8
                i64.store offset=120
                local.get 16
                local.get 16
                i32.load offset=40
                i32.store offset=128
                local.get 16
                local.get 16
                i32.load8_u offset=47
                i32.store8 offset=132
                local.get 16
                local.get 16
                i32.load8_u offset=44
                i32.store8 offset=133
                local.get 16
                local.get 16
                i32.load8_u offset=45
                i32.store8 offset=134
                local.get 16
                local.get 16
                i32.load offset=36
                i32.store offset=136
                local.get 16
                f64.load offset=48
                local.set 12
                local.get 16
                i32.load8_u offset=56
                local.set 6
                local.get 16
                i32.load16_u offset=64
                local.set 14
                local.get 16
                local.get 1
                i32.store offset=172
                local.get 16
                local.get 14
                i32.store16 offset=160
                local.get 16
                local.get 6
                i32.store8 offset=152
                local.get 16
                local.get 12
                f64.store offset=144
                local.get 16
                local.get 15
                i32.store offset=168
                local.get 16
                i32.const 96
                i32.add
                call $_ZN3zoo8bindings3zoo4food4food12consume_food11wit_import817hc4130d629814c9d1E
                local.get 16
                i32.load offset=84
                local.get 15
                i32.const 1
                i32.const 1
                call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                br 3 (;@1;)
              end
              local.get 16
              i32.const 6
              i32.store offset=88
              local.get 16
              local.get 16
              i32.const 72
              i32.add
              i32.store offset=84
              local.get 16
              i32.const 96
              i32.add
              i32.const 16496
              local.get 16
              i32.const 84
              i32.add
              call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
              local.get 15
              i32.const 255
              i32.and
              local.get 16
              f64.load offset=48
              local.get 16
              i32.load8_u offset=56
              local.get 16
              i32.load8_u offset=64
              local.get 16
              i32.load8_u offset=65
              local.get 16
              i32.load offset=100
              local.tee 15
              local.get 16
              i32.load offset=104
              call $_ZN3zoo8bindings3zoo4food4food12open_package11wit_import617h45d16345cd4f747dE
              local.get 16
              i32.load offset=96
              local.get 15
              i32.const 1
              i32.const 1
              call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
              br 2 (;@1;)
            end
            i32.const 8
            i32.const 24
            call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
            unreachable
          end
          i32.const 8
          i32.const 24
          call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
          unreachable
        end
        local.get 16
        i32.load offset=72
        local.get 16
        i32.load offset=76
        i32.const 1
        i32.const 1
        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
        local.get 16
        i32.load offset=20
        local.get 16
        i32.load offset=24
        i32.const 1
        i32.const 1
        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
        local.get 16
        i32.const 176
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN3zoo93_$LT$impl$u20$core..fmt..Display$u20$for$u20$zoo..bindings..zoo..food..food..MaterialType$GT$3fmt17hd19d39ca98dec6a9E (;18;) (type 0) (param i32 i32) (result i32)
        local.get 1
        i32.load
        i32.const 16903
        i32.const 16892
        local.get 0
        i32.load8_u
        local.tee 0
        select
        i32.const 9
        i32.const 11
        local.get 0
        select
        local.get 1
        i32.load offset=4
        i32.load offset=12
        call_indirect (type 1)
      )
      (func $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E (;19;) (type 10) (param i32 i32 i32)
        (local i32 i32 i32 i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 3
        global.set $__stack_pointer
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    block ;; label = @7
                      local.get 2
                      i32.const 1
                      i32.and
                      br_if 0 (;@7;)
                      local.get 1
                      i32.load8_u
                      local.tee 4
                      i32.eqz
                      br_if 2 (;@5;)
                      i32.const 0
                      local.set 5
                      local.get 1
                      local.set 6
                      i32.const 0
                      local.set 7
                      loop ;; label = @8
                        local.get 6
                        i32.const 1
                        i32.add
                        local.set 6
                        block ;; label = @9
                          block ;; label = @10
                            local.get 4
                            i32.extend8_s
                            i32.const -1
                            i32.gt_s
                            br_if 0 (;@10;)
                            block ;; label = @11
                              local.get 4
                              i32.const 255
                              i32.and
                              i32.const 128
                              i32.eq
                              br_if 0 (;@11;)
                              local.get 6
                              local.get 4
                              i32.const 3
                              i32.and
                              i32.const 24
                              i32.rotl
                              local.tee 8
                              i32.const 5
                              i32.shl
                              i32.const 1073741824
                              i32.and
                              local.get 8
                              i32.const 16777216
                              i32.and
                              i32.const 7
                              i32.shl
                              local.get 8
                              i32.const 536870912
                              i32.and
                              i32.or
                              i32.or
                              i32.const 29
                              i32.shr_u
                              i32.add
                              local.get 4
                              i32.const 1
                              i32.shr_u
                              i32.const 2
                              i32.and
                              i32.add
                              local.get 4
                              i32.const 2
                              i32.shr_u
                              i32.const 2
                              i32.and
                              i32.add
                              local.set 6
                              local.get 7
                              i32.eqz
                              local.get 5
                              i32.or
                              local.set 5
                              br 2 (;@9;)
                            end
                            local.get 7
                            local.get 6
                            i32.load16_u align=1
                            local.tee 4
                            i32.add
                            local.set 7
                            local.get 6
                            local.get 4
                            i32.add
                            i32.const 2
                            i32.add
                            local.set 6
                            br 1 (;@9;)
                          end
                          local.get 6
                          local.get 4
                          i32.const 255
                          i32.and
                          local.tee 4
                          i32.add
                          local.set 6
                          local.get 7
                          local.get 4
                          i32.add
                          local.set 7
                        end
                        local.get 6
                        i32.load8_u
                        local.tee 4
                        br_if 0 (;@8;)
                      end
                      i32.const 0
                      local.set 4
                      local.get 5
                      local.get 7
                      i32.const 16
                      i32.lt_u
                      i32.and
                      br_if 1 (;@6;)
                      local.get 7
                      i32.const 1
                      i32.shl
                      local.tee 4
                      i32.const -1
                      i32.gt_s
                      br_if 1 (;@6;)
                      call $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E
                      unreachable
                    end
                    local.get 2
                    i32.const 1
                    i32.shr_u
                    local.set 4
                  end
                  local.get 4
                  br_if 1 (;@4;)
                end
                i32.const 1
                local.set 6
                i32.const 0
                local.set 4
                br 1 (;@3;)
              end
              i32.const 1
              local.get 4
              call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
              local.tee 6
              i32.eqz
              br_if 1 (;@2;)
            end
            local.get 3
            i32.const 0
            i32.store offset=8
            local.get 3
            local.get 6
            i32.store offset=4
            local.get 3
            local.get 4
            i32.store
            local.get 3
            i32.const 16700
            local.get 1
            local.get 2
            call $_ZN4core3fmt5write17h57d28834308ddab7E
            i32.eqz
            br_if 1 (;@1;)
            local.get 3
            i32.const 15
            i32.add
            call $_ZN4core6result13unwrap_failed17h28bb9ae37aca2287E
            unreachable
          end
          i32.const 1
          local.get 4
          call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
          unreachable
        end
        local.get 0
        local.get 3
        i64.load align=4
        i64.store align=4
        local.get 0
        i32.const 8
        i32.add
        local.get 3
        i32.const 8
        i32.add
        i32.load
        i32.store
        local.get 3
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E (;20;) (type 2) (param i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            local.get 3
            i32.const 3
            i32.shl
            i32.const 16384
            i32.add
            local.tee 3
            local.get 2
            i32.const 2
            i32.shl
            local.tee 2
            local.get 3
            local.get 2
            i32.gt_u
            select
            i32.const 65543
            i32.add
            local.tee 3
            i32.const 16
            i32.shr_u
            memory.grow
            local.tee 2
            i32.const -1
            i32.ne
            br_if 0 (;@2;)
            i32.const 1
            local.set 3
            i32.const 0
            local.set 2
            br 1 (;@1;)
          end
          local.get 2
          i32.const 16
          i32.shl
          local.tee 2
          i64.const 0
          i64.store offset=4 align=4
          local.get 2
          local.get 2
          local.get 3
          i32.const -65536
          i32.and
          i32.add
          i32.const 2
          i32.or
          i32.store
          i32.const 0
          local.set 3
        end
        local.get 0
        local.get 2
        i32.store offset=4
        local.get 0
        local.get 3
        i32.store
      )
      (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE (;21;) (type 0) (param i32 i32) (result i32)
        i32.const 512
      )
      (func $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E (;22;) (type 12) (param i32 i32 i32 i32 i32 i32) (result i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 6
        global.set $__stack_pointer
        block ;; label = @1
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          local.get 5
          call $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE
          local.tee 7
          br_if 0 (;@1;)
          local.get 6
          i32.const 8
          i32.add
          local.get 3
          local.get 0
          local.get 1
          local.get 4
          call_indirect (type 2)
          i32.const 0
          local.set 7
          local.get 6
          i32.load offset=8
          i32.const 1
          i32.and
          br_if 0 (;@1;)
          local.get 6
          i32.load offset=12
          local.tee 7
          local.get 2
          i32.load
          i32.store offset=8
          local.get 2
          local.get 7
          i32.store
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          local.get 5
          call $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE
          local.set 7
        end
        local.get 6
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 7
      )
      (func $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E (;23;) (type 3) (param i32 i32)
        local.get 1
        local.get 0
        call $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler
        unreachable
      )
      (func $zoo:food/eater@0.1.0#schedule (;24;) (type 13) (param i32 i32 i32 i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 f32 i32 i32)
        global.get $__stack_pointer
        i32.const 96
        i32.sub
        local.tee 5
        global.set $__stack_pointer
        i32.const 0
        local.set 6
        block ;; label = @1
          i32.const 0
          i32.load8_u offset=17960
          br_if 0 (;@1;)
          call $__wasm_call_ctors
          i32.const 0
          i32.const 1
          i32.store8 offset=17960
        end
        local.get 1
        i32.const 40
        i32.mul
        local.set 7
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    local.get 1
                    i32.const 53687091
                    i32.gt_u
                    br_if 0 (;@6;)
                    i32.const 0
                    local.set 8
                    block ;; label = @7
                      block ;; label = @8
                        local.get 7
                        br_if 0 (;@8;)
                        i32.const 8
                        local.set 9
                        i32.const 0
                        local.set 10
                        br 1 (;@7;)
                      end
                      i32.const 8
                      local.set 6
                      local.get 1
                      local.set 10
                      i32.const 8
                      local.get 7
                      call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
                      local.tee 9
                      i32.eqz
                      br_if 1 (;@6;)
                    end
                    local.get 5
                    i32.const 0
                    i32.store offset=36
                    local.get 5
                    local.get 9
                    i32.store offset=32
                    local.get 5
                    local.get 10
                    i32.store offset=28
                    block ;; label = @7
                      local.get 1
                      i32.eqz
                      br_if 0 (;@7;)
                      i32.const 0
                      local.set 10
                      i32.const 0
                      local.set 11
                      i32.const 0
                      local.set 6
                      loop ;; label = @8
                        local.get 0
                        local.get 11
                        i32.add
                        local.tee 7
                        i32.const 16
                        i32.add
                        i32.load8_u
                        i32.const 0
                        i32.ne
                        local.set 12
                        local.get 7
                        i32.load
                        local.set 13
                        local.get 7
                        i32.const 40
                        i32.add
                        i32.load
                        local.set 8
                        local.get 7
                        i32.const 38
                        i32.add
                        i32.load8_u
                        local.set 14
                        local.get 7
                        i32.const 37
                        i32.add
                        i32.load8_u
                        local.set 15
                        local.get 7
                        i32.const 36
                        i32.add
                        i32.load8_u
                        local.set 16
                        local.get 7
                        i32.const 34
                        i32.add
                        i32.load16_u
                        local.set 17
                        local.get 7
                        i32.const 32
                        i32.add
                        i32.load16_u
                        local.set 18
                        local.get 7
                        i32.const 24
                        i32.add
                        i64.load
                        local.set 19
                        local.get 7
                        i32.const 12
                        i32.add
                        f32.load
                        local.set 20
                        local.get 7
                        i32.const 8
                        i32.add
                        i32.load
                        local.set 21
                        local.get 7
                        i32.const 4
                        i32.add
                        i32.load
                        local.set 22
                        block ;; label = @9
                          local.get 6
                          local.get 5
                          i32.load offset=28
                          i32.ne
                          br_if 0 (;@9;)
                          local.get 5
                          i32.const 28
                          i32.add
                          call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17h8f70bbda1af6c91aE
                          local.get 5
                          i32.load offset=32
                          local.set 9
                        end
                        local.get 9
                        local.get 10
                        i32.add
                        local.tee 7
                        local.get 19
                        i64.store
                        local.get 7
                        i32.const 39
                        i32.add
                        local.get 16
                        i32.store8
                        local.get 7
                        i32.const 38
                        i32.add
                        local.get 12
                        i32.store8
                        local.get 7
                        i32.const 37
                        i32.add
                        local.get 14
                        i32.store8
                        local.get 7
                        i32.const 36
                        i32.add
                        local.get 15
                        i32.store8
                        local.get 7
                        i32.const 34
                        i32.add
                        local.get 17
                        i32.store16
                        local.get 7
                        i32.const 32
                        i32.add
                        local.get 18
                        i32.store16
                        local.get 7
                        i32.const 28
                        i32.add
                        local.get 8
                        i32.store
                        local.get 7
                        i32.const 24
                        i32.add
                        local.get 20
                        f32.store
                        local.get 7
                        i32.const 20
                        i32.add
                        local.get 22
                        i32.store
                        local.get 7
                        i32.const 16
                        i32.add
                        local.get 13
                        i32.store
                        local.get 7
                        i32.const 12
                        i32.add
                        local.get 22
                        i32.store
                        local.get 7
                        i32.const 8
                        i32.add
                        local.get 21
                        i32.store
                        local.get 5
                        local.get 6
                        i32.const 1
                        i32.add
                        local.tee 6
                        i32.store offset=36
                        local.get 10
                        i32.const 40
                        i32.add
                        local.set 10
                        local.get 11
                        i32.const 48
                        i32.add
                        local.set 11
                        local.get 1
                        local.get 6
                        i32.ne
                        br_if 0 (;@8;)
                      end
                      local.get 0
                      i32.const 8
                      local.get 1
                      i32.const 48
                      i32.mul
                      call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                      local.get 1
                      local.set 8
                    end
                    block ;; label = @7
                      block ;; label = @8
                        local.get 2
                        br_if 0 (;@8;)
                        i32.const -2147483648
                        local.set 4
                        br 1 (;@7;)
                      end
                      local.get 4
                      i64.extend_i32_u
                      i64.const 32
                      i64.shl
                      local.get 3
                      i64.extend_i32_u
                      i64.or
                      local.set 19
                    end
                    local.get 19
                    i32.wrap_i64
                    local.set 15
                    local.get 5
                    i32.load offset=32
                    local.set 22
                    local.get 5
                    i32.load offset=28
                    local.set 14
                    block ;; label = @7
                      block ;; label = @8
                        local.get 8
                        i32.eqz
                        br_if 0 (;@8;)
                        i32.const 8
                        local.get 8
                        i32.const 48
                        i32.mul
                        local.tee 17
                        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
                        local.tee 12
                        i32.eqz
                        br_if 3 (;@5;)
                        local.get 19
                        i64.const 32
                        i64.shr_u
                        i32.wrap_i64
                        local.set 16
                        local.get 8
                        i32.const 40
                        i32.mul
                        local.set 13
                        i32.const 0
                        local.set 10
                        i32.const 0
                        local.set 11
                        loop ;; label = @9
                          local.get 12
                          local.get 11
                          i32.add
                          local.tee 7
                          local.get 22
                          local.get 10
                          i32.add
                          local.tee 6
                          i32.const 16
                          i32.add
                          i64.load align=4
                          i64.store
                          local.get 7
                          i32.const 8
                          i32.add
                          local.get 6
                          i32.const 8
                          i32.add
                          i32.load
                          i32.store
                          local.get 7
                          i32.const 12
                          i32.add
                          local.get 6
                          i32.const 24
                          i32.add
                          f32.load
                          f32.store
                          local.get 7
                          i32.const 16
                          i32.add
                          local.get 6
                          i32.const 38
                          i32.add
                          i32.load8_u
                          i32.store8
                          local.get 7
                          i32.const 24
                          i32.add
                          local.get 6
                          i64.load
                          i64.store
                          local.get 7
                          i32.const 32
                          i32.add
                          local.get 6
                          i32.const 32
                          i32.add
                          i32.load16_u
                          i32.store16
                          local.get 7
                          i32.const 34
                          i32.add
                          local.get 6
                          i32.const 34
                          i32.add
                          i32.load16_u
                          i32.store16
                          local.get 7
                          i32.const 36
                          i32.add
                          local.get 6
                          i32.const 39
                          i32.add
                          i32.load8_u
                          i32.store8
                          local.get 7
                          i32.const 37
                          i32.add
                          local.get 6
                          i32.const 36
                          i32.add
                          i32.load8_u
                          i32.store8
                          local.get 7
                          i32.const 38
                          i32.add
                          local.get 6
                          i32.const 37
                          i32.add
                          i32.load8_u
                          i32.store8
                          local.get 7
                          i32.const 40
                          i32.add
                          local.get 6
                          i32.const 28
                          i32.add
                          i32.load
                          i32.store
                          local.get 11
                          i32.const 48
                          i32.add
                          local.set 11
                          local.get 13
                          local.get 10
                          i32.const 40
                          i32.add
                          local.tee 10
                          i32.ne
                          br_if 0 (;@9;)
                        end
                        i32.const 0
                        local.set 7
                        i32.const 0
                        local.set 6
                        i32.const 0
                        local.set 10
                        block ;; label = @9
                          local.get 4
                          i32.const -2147483648
                          i32.eq
                          br_if 0 (;@9;)
                          i32.const 1
                          local.set 10
                          local.get 16
                          local.set 7
                          local.get 15
                          local.set 6
                        end
                        local.get 12
                        local.get 8
                        local.get 10
                        local.get 6
                        local.get 7
                        local.get 5
                        i32.const 80
                        i32.add
                        call $_ZN3zoo8bindings3zoo4food4food9plan_meal11wit_import817h4693f5281da37edcE
                        local.get 5
                        i32.load offset=88
                        local.set 7
                        local.get 5
                        i32.load offset=84
                        local.set 6
                        local.get 5
                        i32.load8_u offset=80
                        local.set 10
                        local.get 12
                        i32.const 8
                        local.get 17
                        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                        local.get 10
                        i32.eqz
                        br_if 1 (;@7;)
                        local.get 5
                        local.get 7
                        i32.store offset=88
                        local.get 5
                        local.get 6
                        i32.store offset=84
                        local.get 5
                        local.get 7
                        i32.store offset=80
                        local.get 5
                        i32.const 6
                        i32.store offset=72
                        local.get 5
                        local.get 5
                        i32.const 80
                        i32.add
                        i32.store offset=68
                        local.get 5
                        i32.const 44
                        i32.add
                        i32.const 16394
                        local.get 5
                        i32.const 68
                        i32.add
                        call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                        local.get 5
                        i32.load offset=80
                        local.get 5
                        i32.load offset=84
                        i32.const 1
                        i32.const 1
                        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                        local.get 22
                        local.get 8
                        call $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hec2fc06aae0f0b6dE
                        local.get 14
                        local.get 22
                        i32.const 8
                        i32.const 40
                        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                        local.get 4
                        i32.const -2147483648
                        i32.eq
                        br_if 6 (;@2;)
                        local.get 4
                        local.get 15
                        i32.const 1
                        i32.const 1
                        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                        br 6 (;@2;)
                      end
                      local.get 5
                      i32.const 17936
                      i32.store offset=40
                      local.get 5
                      i32.const 0
                      i32.load offset=16932
                      i32.store offset=80
                      i32.const 6
                      i32.const 1
                      local.get 5
                      i32.const 80
                      i32.add
                      local.get 5
                      i32.const 40
                      i32.add
                      i32.const 3
                      i32.const 4
                      call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                      local.set 7
                      i32.const 0
                      local.get 5
                      i32.load offset=80
                      i32.store offset=16932
                      local.get 7
                      i32.eqz
                      br_if 3 (;@4;)
                      local.get 7
                      i32.const 13
                      i32.add
                      i32.const 0
                      i64.load offset=16680 align=1
                      i64.store align=1
                      local.get 7
                      i32.const 8
                      i32.add
                      i32.const 0
                      i64.load offset=16675 align=1
                      i64.store align=1
                      local.get 7
                      i32.const 0
                      i64.load offset=16667 align=1
                      i64.store align=1
                      local.get 5
                      i32.const 21
                      i32.store offset=52
                      local.get 5
                      local.get 7
                      i32.store offset=48
                      local.get 5
                      i32.const 21
                      i32.store offset=44
                      local.get 22
                      i32.const 0
                      call $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hec2fc06aae0f0b6dE
                      local.get 14
                      local.get 22
                      i32.const 8
                      i32.const 40
                      call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                      local.get 4
                      i32.const -2147483648
                      i32.eq
                      br_if 5 (;@2;)
                      local.get 4
                      local.get 15
                      i32.const 1
                      i32.const 1
                      call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                      br 5 (;@2;)
                    end
                    local.get 5
                    local.get 7
                    i32.store offset=64
                    local.get 5
                    local.get 6
                    i32.store offset=60
                    local.get 5
                    local.get 7
                    i32.store offset=56
                    block ;; label = @7
                      block ;; label = @8
                        local.get 4
                        i32.const -2147483648
                        i32.eq
                        br_if 0 (;@8;)
                        local.get 5
                        local.get 15
                        i32.store offset=72
                        local.get 5
                        local.get 4
                        i32.store offset=68
                        br 1 (;@7;)
                      end
                      local.get 5
                      i32.const 17936
                      i32.store offset=40
                      local.get 5
                      i32.const 0
                      i32.load offset=16916
                      i32.store offset=80
                      i32.const 2
                      i32.const 1
                      local.get 5
                      i32.const 80
                      i32.add
                      local.get 5
                      i32.const 40
                      i32.add
                      i32.const 3
                      i32.const 4
                      call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                      local.set 7
                      i32.const 0
                      local.get 5
                      i32.load offset=80
                      i32.store offset=16916
                      local.get 7
                      i32.eqz
                      br_if 4 (;@3;)
                      local.get 7
                      i32.const 3
                      i32.add
                      i32.const 0
                      i32.load offset=16691 align=1
                      i32.store align=1
                      local.get 7
                      i32.const 0
                      i32.load offset=16688 align=1
                      i32.store align=1
                      local.get 5
                      local.get 7
                      i32.store offset=72
                      i32.const 7
                      local.set 16
                      local.get 5
                      i32.const 7
                      i32.store offset=68
                    end
                    local.get 5
                    local.get 16
                    i32.store offset=76
                    local.get 5
                    i32.const 6
                    i32.store offset=92
                    local.get 5
                    i32.const 6
                    i32.store offset=84
                    local.get 5
                    local.get 5
                    i32.const 56
                    i32.add
                    i32.store offset=88
                    local.get 5
                    local.get 5
                    i32.const 68
                    i32.add
                    i32.store offset=80
                    local.get 5
                    i32.const 44
                    i32.add
                    i32.const 16413
                    local.get 5
                    i32.const 80
                    i32.add
                    call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                    local.get 5
                    i32.load offset=68
                    local.get 5
                    i32.load offset=72
                    i32.const 1
                    i32.const 1
                    call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                    local.get 5
                    i32.load offset=56
                    local.get 5
                    i32.load offset=60
                    i32.const 1
                    i32.const 1
                    call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                    local.get 22
                    local.get 8
                    call $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hec2fc06aae0f0b6dE
                    local.get 14
                    local.get 22
                    i32.const 8
                    i32.const 40
                    call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
                    local.get 5
                    i32.const 80
                    i32.add
                    i32.const 8
                    i32.add
                    local.get 5
                    i32.const 52
                    i32.add
                    i32.load
                    i32.store
                    i32.const 0
                    i32.const 0
                    i32.store8 offset=17964
                    local.get 5
                    local.get 5
                    i64.load offset=44 align=4
                    i64.store offset=80
                    local.get 5
                    i32.const 16
                    i32.add
                    local.get 5
                    i32.const 80
                    i32.add
                    call $_ZN5alloc3vec16Vec$LT$T$C$A$GT$16into_boxed_slice17he923401a8c4cc9f0E
                    local.get 5
                    i32.load offset=20
                    local.set 7
                    local.get 5
                    i32.load offset=16
                    local.set 6
                    br 5 (;@1;)
                  end
                  local.get 6
                  local.get 7
                  call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
                  unreachable
                end
                i32.const 8
                local.get 17
                call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
                unreachable
              end
              i32.const 1
              i32.const 21
              call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
              unreachable
            end
            i32.const 1
            i32.const 7
            call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
            unreachable
          end
          i32.const 0
          i32.const 1
          i32.store8 offset=17964
          local.get 5
          i32.const 88
          i32.add
          local.get 5
          i32.const 52
          i32.add
          i32.load
          i32.store
          local.get 5
          local.get 5
          i64.load offset=44 align=4
          i64.store offset=80
          local.get 5
          i32.const 8
          i32.add
          local.get 5
          i32.const 80
          i32.add
          call $_ZN5alloc3vec16Vec$LT$T$C$A$GT$16into_boxed_slice17he923401a8c4cc9f0E
          local.get 5
          i32.load offset=12
          local.set 7
          local.get 5
          i32.load offset=8
          local.set 6
        end
        i32.const 0
        local.get 6
        i32.store offset=17968
        i32.const 0
        local.get 7
        i32.store offset=17972
        local.get 5
        i32.const 96
        i32.add
        global.set $__stack_pointer
        i32.const 17964
      )
      (func $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hec2fc06aae0f0b6dE (;25;) (type 3) (param i32 i32)
        block ;; label = @1
          local.get 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          i32.const 16
          i32.add
          local.set 0
          loop ;; label = @2
            local.get 0
            i32.const -4
            i32.add
            i32.load
            local.get 0
            i32.load
            i32.const 1
            i32.const 1
            call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$10deallocate17hd52cf63ed3aeb84fE
            local.get 0
            i32.const 40
            i32.add
            local.set 0
            local.get 1
            i32.const -1
            i32.add
            local.tee 1
            br_if 0 (;@2;)
          end
        end
      )
      (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E (;26;) (type 2) (param i32 i32 i32 i32)
        (local i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        local.get 4
        local.get 1
        i32.load
        local.tee 5
        i32.load
        i32.store offset=12
        i32.const 1
        local.set 6
        local.get 2
        i32.const 2
        i32.add
        local.tee 1
        local.get 1
        i32.mul
        local.tee 1
        i32.const 2048
        local.get 1
        i32.const 2048
        i32.gt_u
        select
        local.tee 2
        i32.const 4
        local.get 4
        i32.const 12
        i32.add
        i32.const 1
        i32.const 1
        i32.const 2
        call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
        local.set 1
        local.get 5
        local.get 4
        i32.load offset=12
        i32.store
        block ;; label = @1
          local.get 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i64.const 0
          i64.store offset=4 align=4
          local.get 1
          local.get 1
          local.get 2
          i32.const 2
          i32.shl
          i32.add
          i32.const 2
          i32.or
          i32.store
          i32.const 0
          local.set 6
        end
        local.get 0
        local.get 1
        i32.store offset=4
        local.get 0
        local.get 6
        i32.store
        local.get 4
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E (;27;) (type 0) (param i32 i32) (result i32)
        local.get 1
      )
      (func $_ZN5alloc3vec16Vec$LT$T$C$A$GT$16into_boxed_slice17he923401a8c4cc9f0E (;28;) (type 3) (param i32 i32)
        (local i32 i32 i32 i32)
        block ;; label = @1
          block ;; label = @2
            local.get 1
            i32.load
            local.tee 2
            local.get 1
            i32.load offset=8
            local.tee 3
            i32.le_u
            br_if 0 (;@2;)
            local.get 1
            i32.load offset=4
            local.set 4
            block ;; label = @3
              block ;; label = @4
                local.get 3
                br_if 0 (;@4;)
                i32.const 1
                local.set 5
                local.get 4
                i32.const 1
                local.get 2
                call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                br 1 (;@3;)
              end
              local.get 4
              i32.const 1
              local.get 2
              local.get 3
              call $_ZN4core5alloc6global11GlobalAlloc7realloc17h2f5334da4d3fba08E
              local.tee 5
              i32.eqz
              br_if 2 (;@1;)
            end
            local.get 1
            local.get 5
            i32.store offset=4
          end
          local.get 0
          local.get 3
          i32.store offset=4
          local.get 0
          local.get 1
          i32.load offset=4
          i32.store
          return
        end
        i32.const 1
        local.get 3
        call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
        unreachable
      )
      (func $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler (;29;) (type 3) (param i32 i32)
        local.get 1
        local.get 0
        call $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E
        unreachable
      )
      (func $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E (;30;) (type 9)
        i32.const 16844
        i32.const 35
        i32.const 16864
        call $_ZN4core9panicking9panic_fmt17h806e647715990138E
        unreachable
      )
      (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$7reserve21do_reserve_and_handle17hca3eeb1f3c76a318E (;31;) (type 10) (param i32 i32 i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 3
        global.set $__stack_pointer
        block ;; label = @1
          local.get 2
          local.get 1
          i32.add
          local.tee 1
          local.get 2
          i32.ge_u
          br_if 0 (;@1;)
          i32.const 0
          i32.const 0
          call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
          unreachable
        end
        local.get 3
        i32.const 4
        i32.add
        local.get 0
        i32.load
        local.tee 2
        local.get 0
        i32.load offset=4
        local.get 1
        local.get 2
        i32.const 1
        i32.shl
        local.tee 2
        local.get 1
        local.get 2
        i32.gt_u
        select
        local.tee 2
        i32.const 8
        local.get 2
        i32.const 8
        i32.gt_u
        select
        local.tee 2
        call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h515e10d71c75ae0aE
        block ;; label = @1
          local.get 3
          i32.load offset=4
          i32.const 1
          i32.ne
          br_if 0 (;@1;)
          local.get 3
          i32.load offset=8
          local.get 3
          i32.load offset=12
          call $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E
          unreachable
        end
        local.get 3
        i32.load offset=8
        local.set 1
        local.get 0
        local.get 2
        i32.store
        local.get 0
        local.get 1
        i32.store offset=4
        local.get 3
        i32.const 16
        i32.add
        global.set $__stack_pointer
      )
      (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h515e10d71c75ae0aE (;32;) (type 2) (param i32 i32 i32 i32)
        (local i32)
        i32.const 0
        local.set 4
        block ;; label = @1
          block ;; label = @2
            local.get 3
            i32.const 0
            i32.ge_s
            br_if 0 (;@2;)
            i32.const 1
            local.set 1
            i32.const 4
            local.set 2
            br 1 (;@1;)
          end
          block ;; label = @2
            block ;; label = @3
              local.get 1
              i32.eqz
              br_if 0 (;@3;)
              local.get 2
              i32.const 1
              local.get 1
              local.get 3
              call $_ZN4core5alloc6global11GlobalAlloc7realloc17h2f5334da4d3fba08E
              local.set 4
              br 1 (;@2;)
            end
            i32.const 1
            local.get 3
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
            local.set 4
          end
          block ;; label = @2
            block ;; label = @3
              local.get 4
              br_if 0 (;@3;)
              i32.const 1
              local.set 1
              local.get 0
              i32.const 1
              i32.store offset=4
              br 1 (;@2;)
            end
            local.get 0
            local.get 4
            i32.store offset=4
            i32.const 0
            local.set 1
          end
          i32.const 8
          local.set 2
          local.get 3
          local.set 4
        end
        local.get 0
        local.get 2
        i32.add
        local.get 4
        i32.store
        local.get 0
        local.get 1
        i32.store
      )
      (func $_ZN4core9panicking9panic_fmt17h806e647715990138E (;33;) (type 10) (param i32 i32 i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 32
        i32.sub
        local.tee 3
        global.set $__stack_pointer
        local.get 3
        local.get 1
        i32.store offset=16
        local.get 3
        local.get 0
        i32.store offset=12
        local.get 3
        i32.const 1
        i32.store16 offset=28
        local.get 3
        local.get 2
        i32.store offset=24
        local.get 3
        local.get 3
        i32.const 12
        i32.add
        i32.store offset=20
        local.get 3
        i32.const 20
        i32.add
        call $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind
        unreachable
      )
      (func $_ZN4core3fmt5write17h57d28834308ddab7E (;34;) (type 5) (param i32 i32 i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              local.get 3
              i32.const 1
              i32.and
              br_if 0 (;@3;)
              local.get 2
              i32.load8_u
              local.tee 5
              br_if 1 (;@2;)
              i32.const 0
              local.set 5
              br 2 (;@1;)
            end
            local.get 0
            local.get 2
            local.get 3
            i32.const 1
            i32.shr_u
            local.get 1
            i32.load offset=12
            call_indirect (type 1)
            local.set 5
            br 1 (;@1;)
          end
          local.get 1
          i32.load offset=12
          local.set 6
          i32.const 0
          local.set 7
          loop ;; label = @2
            local.get 2
            i32.const 1
            i32.add
            local.set 8
            block ;; label = @3
              block ;; label = @4
                block ;; label = @5
                  block ;; label = @6
                    block ;; label = @7
                      block ;; label = @8
                        block ;; label = @9
                          local.get 5
                          i32.extend8_s
                          i32.const -1
                          i32.gt_s
                          br_if 0 (;@9;)
                          local.get 5
                          i32.const 255
                          i32.and
                          local.tee 9
                          i32.const 128
                          i32.eq
                          br_if 1 (;@8;)
                          local.get 9
                          i32.const 192
                          i32.eq
                          br_if 2 (;@7;)
                          i32.const 1610612768
                          local.set 10
                          block ;; label = @10
                            local.get 5
                            i32.const 1
                            i32.and
                            i32.eqz
                            br_if 0 (;@10;)
                            local.get 2
                            i32.const 5
                            i32.add
                            local.set 8
                            local.get 2
                            i32.load offset=1 align=1
                            local.set 10
                          end
                          i32.const 0
                          local.set 9
                          local.get 5
                          i32.const 2
                          i32.and
                          br_if 3 (;@6;)
                          local.get 8
                          local.set 2
                          i32.const 0
                          local.set 8
                          br 4 (;@5;)
                        end
                        block ;; label = @9
                          local.get 0
                          local.get 8
                          local.get 5
                          i32.const 255
                          i32.and
                          local.tee 5
                          local.get 6
                          call_indirect (type 1)
                          br_if 0 (;@9;)
                          local.get 8
                          local.get 5
                          i32.add
                          local.set 2
                          br 6 (;@3;)
                        end
                        i32.const 1
                        local.set 5
                        br 7 (;@1;)
                      end
                      block ;; label = @8
                        local.get 0
                        local.get 2
                        i32.const 3
                        i32.add
                        local.tee 5
                        local.get 2
                        i32.load16_u offset=1 align=1
                        local.tee 2
                        local.get 6
                        call_indirect (type 1)
                        br_if 0 (;@8;)
                        local.get 5
                        local.get 2
                        i32.add
                        local.set 2
                        br 5 (;@3;)
                      end
                      i32.const 1
                      local.set 5
                      br 6 (;@1;)
                    end
                    local.get 4
                    local.get 1
                    i32.store offset=4
                    local.get 4
                    local.get 0
                    i32.store
                    local.get 4
                    i64.const 1610612768
                    i64.store offset=8 align=4
                    local.get 3
                    local.get 7
                    i32.const 3
                    i32.shl
                    i32.add
                    local.tee 5
                    i32.load
                    local.get 4
                    local.get 5
                    i32.load offset=4
                    call_indirect (type 0)
                    i32.eqz
                    br_if 2 (;@4;)
                    i32.const 1
                    local.set 5
                    br 5 (;@1;)
                  end
                  local.get 8
                  i32.const 2
                  i32.add
                  local.set 2
                  local.get 8
                  i32.load16_u align=1
                  local.set 8
                end
                block ;; label = @5
                  block ;; label = @6
                    local.get 5
                    i32.const 4
                    i32.and
                    br_if 0 (;@6;)
                    local.get 2
                    local.set 11
                    br 1 (;@5;)
                  end
                  local.get 2
                  i32.const 2
                  i32.add
                  local.set 11
                  local.get 2
                  i32.load16_u align=1
                  local.set 9
                end
                block ;; label = @5
                  block ;; label = @6
                    local.get 5
                    i32.const 8
                    i32.and
                    br_if 0 (;@6;)
                    local.get 11
                    local.set 2
                    br 1 (;@5;)
                  end
                  local.get 11
                  i32.const 2
                  i32.add
                  local.set 2
                  local.get 11
                  i32.load16_u align=1
                  local.set 7
                end
                block ;; label = @5
                  local.get 5
                  i32.const 16
                  i32.and
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 3
                  local.get 8
                  i32.const 65535
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  i32.load16_u offset=4
                  local.set 8
                end
                block ;; label = @5
                  local.get 5
                  i32.const 32
                  i32.and
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 3
                  local.get 9
                  i32.const 65535
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  i32.load16_u offset=4
                  local.set 9
                end
                local.get 4
                local.get 9
                i32.store16 offset=14
                local.get 4
                local.get 8
                i32.store16 offset=12
                local.get 4
                local.get 10
                i32.store offset=8
                local.get 4
                local.get 1
                i32.store offset=4
                local.get 4
                local.get 0
                i32.store
                block ;; label = @5
                  local.get 3
                  local.get 7
                  i32.const 3
                  i32.shl
                  i32.add
                  local.tee 5
                  i32.load
                  local.get 4
                  local.get 5
                  i32.load offset=4
                  call_indirect (type 0)
                  i32.eqz
                  br_if 0 (;@5;)
                  i32.const 1
                  local.set 5
                  br 4 (;@1;)
                end
                local.get 7
                i32.const 1
                i32.add
                local.set 7
                br 1 (;@3;)
              end
              local.get 7
              i32.const 1
              i32.add
              local.set 7
              local.get 8
              local.set 2
            end
            local.get 2
            i32.load8_u
            local.tee 5
            br_if 0 (;@2;)
          end
          i32.const 0
          local.set 5
        end
        local.get 4
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 5
      )
      (func $_ZN4core6result13unwrap_failed17h28bb9ae37aca2287E (;35;) (type 6) (param i32)
        (local i32)
        global.get $__stack_pointer
        i32.const 32
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        local.get 1
        i32.const 86
        i32.store offset=4
        local.get 1
        i32.const 16740
        i32.store
        local.get 1
        i32.const 16724
        i32.store offset=12
        local.get 1
        local.get 0
        i32.store offset=8
        local.get 1
        i32.const 7
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 1
        i32.const 8
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=24
        local.get 1
        i32.const 8
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 1
        i64.extend_i32_u
        i64.or
        i64.store offset=16
        i32.const 16432
        local.get 1
        i32.const 16
        i32.add
        i32.const 16828
        call $_ZN4core9panicking9panic_fmt17h806e647715990138E
        unreachable
      )
      (func $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E (;36;) (type 0) (param i32 i32) (result i32)
        local.get 1
        i32.load
        i32.const 16695
        i32.const 5
        local.get 1
        i32.load offset=4
        i32.load offset=12
        call_indirect (type 1)
      )
      (func $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E (;37;) (type 6) (param i32)
        (local i32)
        block ;; label = @1
          local.get 0
          i32.load
          local.tee 1
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          i32.load offset=4
          i32.const 1
          local.get 1
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
        end
      )
      (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E (;38;) (type 1) (param i32 i32 i32) (result i32)
        (local i32)
        block ;; label = @1
          local.get 2
          local.get 0
          i32.load
          local.get 0
          i32.load offset=8
          local.tee 3
          i32.sub
          i32.le_u
          br_if 0 (;@1;)
          local.get 0
          local.get 3
          local.get 2
          call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$7reserve21do_reserve_and_handle17hca3eeb1f3c76a318E
          local.get 0
          i32.load offset=8
          local.set 3
        end
        block ;; label = @1
          local.get 2
          i32.eqz
          br_if 0 (;@1;)
          local.get 0
          i32.load offset=4
          local.get 3
          i32.add
          local.get 1
          local.get 2
          memory.copy
        end
        local.get 0
        local.get 3
        local.get 2
        i32.add
        i32.store offset=8
        i32.const 0
      )
      (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE (;39;) (type 0) (param i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32)
        local.get 0
        i32.load offset=8
        local.set 2
        block ;; label = @1
          block ;; label = @2
            local.get 1
            i32.const 128
            i32.ge_u
            br_if 0 (;@2;)
            i32.const 1
            local.set 3
            br 1 (;@1;)
          end
          block ;; label = @2
            local.get 1
            i32.const 2048
            i32.ge_u
            br_if 0 (;@2;)
            i32.const 2
            local.set 3
            br 1 (;@1;)
          end
          i32.const 3
          i32.const 4
          local.get 1
          i32.const 65536
          i32.lt_u
          select
          local.set 3
        end
        local.get 2
        local.set 4
        block ;; label = @1
          local.get 3
          local.get 0
          i32.load
          local.get 2
          i32.sub
          i32.le_u
          br_if 0 (;@1;)
          local.get 0
          local.get 2
          local.get 3
          call $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$7reserve21do_reserve_and_handle17hca3eeb1f3c76a318E
          local.get 0
          i32.load offset=8
          local.set 4
        end
        local.get 0
        i32.load offset=4
        local.get 4
        i32.add
        local.set 4
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              local.get 1
              i32.const 128
              i32.lt_u
              br_if 0 (;@3;)
              local.get 1
              i32.const 63
              i32.and
              i32.const -128
              i32.or
              local.set 5
              local.get 1
              i32.const 6
              i32.shr_u
              local.set 6
              local.get 1
              i32.const 2048
              i32.lt_u
              br_if 1 (;@2;)
              local.get 1
              i32.const 12
              i32.shr_u
              local.set 7
              local.get 6
              i32.const 63
              i32.and
              i32.const -128
              i32.or
              local.set 6
              block ;; label = @4
                local.get 1
                i32.const 65536
                i32.lt_u
                br_if 0 (;@4;)
                local.get 4
                local.get 5
                i32.store8 offset=3
                local.get 4
                local.get 6
                i32.store8 offset=2
                local.get 4
                local.get 7
                i32.const 63
                i32.and
                i32.const -128
                i32.or
                i32.store8 offset=1
                local.get 4
                local.get 1
                i32.const 18
                i32.shr_u
                i32.const -16
                i32.or
                i32.store8
                br 3 (;@1;)
              end
              local.get 4
              local.get 5
              i32.store8 offset=2
              local.get 4
              local.get 6
              i32.store8 offset=1
              local.get 4
              local.get 7
              i32.const 224
              i32.or
              i32.store8
              br 2 (;@1;)
            end
            local.get 4
            local.get 1
            i32.store8
            br 1 (;@1;)
          end
          local.get 4
          local.get 5
          i32.store8 offset=1
          local.get 4
          local.get 6
          i32.const 192
          i32.or
          i32.store8
        end
        local.get 0
        local.get 3
        local.get 2
        i32.add
        i32.store offset=8
        i32.const 0
      )
      (func $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E (;40;) (type 1) (param i32 i32 i32) (result i32)
        local.get 0
        i32.const 16700
        local.get 1
        local.get 2
        call $_ZN4core3fmt5write17h57d28834308ddab7E
      )
      (func $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind (;41;) (type 6) (param i32)
        (local i32 i64)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        local.get 0
        i64.load align=4
        local.set 2
        local.get 1
        local.get 0
        i32.store offset=12
        local.get 1
        local.get 2
        i64.store offset=4 align=4
        local.get 1
        i32.const 4
        i32.add
        call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E
        unreachable
      )
      (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE (;42;) (type 0) (param i32 i32) (result i32)
        local.get 1
        local.get 0
        i32.load
        local.get 0
        i32.load offset=4
        call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
      )
      (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E (;43;) (type 0) (param i32 i32) (result i32)
        local.get 0
        i32.load
        local.get 1
        local.get 0
        i32.load offset=4
        i32.load offset=12
        call_indirect (type 0)
      )
      (func $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E (;44;) (type 3) (param i32 i32)
        local.get 0
        i32.const 0
        i32.store
      )
      (func $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E (;45;) (type 2) (param i32 i32 i32 i32)
        (local i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 4
        global.set $__stack_pointer
        i32.const 0
        i32.const 0
        i32.load offset=17952
        local.tee 5
        i32.const 1
        i32.add
        i32.store offset=17952
        block ;; label = @1
          local.get 5
          i32.const 0
          i32.lt_s
          br_if 0 (;@1;)
          block ;; label = @2
            block ;; label = @3
              i32.const 0
              i32.load8_u offset=17948
              br_if 0 (;@3;)
              i32.const 0
              i32.const 0
              i32.load offset=17944
              i32.const 1
              i32.add
              i32.store offset=17944
              i32.const 0
              i32.load offset=17956
              i32.const -1
              i32.gt_s
              br_if 1 (;@2;)
              br 2 (;@1;)
            end
            local.get 4
            i32.const 8
            i32.add
            local.get 0
            local.get 1
            call_indirect (type 3)
            unreachable
          end
          i32.const 0
          i32.const 0
          i32.store8 offset=17948
          local.get 2
          i32.eqz
          br_if 0 (;@1;)
          call $_RNvCsdBezzDwma51_7___rustc10rust_panic
          unreachable
        end
        unreachable
      )
      (func $_RNvCsdBezzDwma51_7___rustc10rust_panic (;46;) (type 9)
        unreachable
      )
      (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E (;47;) (type 6) (param i32)
        local.get 0
        call $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE
        unreachable
      )
      (func $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE (;48;) (type 6) (param i32)
        (local i32 i32 i32)
        global.get $__stack_pointer
        i32.const 16
        i32.sub
        local.tee 1
        global.set $__stack_pointer
        block ;; label = @1
          local.get 0
          i32.load
          local.tee 2
          i32.load offset=4
          local.tee 3
          i32.const 1
          i32.and
          br_if 0 (;@1;)
          local.get 1
          i32.const -2147483648
          i32.store
          local.get 1
          local.get 0
          i32.store offset=12
          local.get 1
          i32.const 9
          local.get 0
          i32.load offset=8
          local.tee 0
          i32.load8_u offset=8
          local.get 0
          i32.load8_u offset=9
          call $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E
          unreachable
        end
        local.get 2
        i32.load
        local.set 2
        local.get 1
        local.get 3
        i32.const 1
        i32.shr_u
        i32.store offset=4
        local.get 1
        local.get 2
        i32.store
        local.get 1
        i32.const 10
        local.get 0
        i32.load offset=8
        local.tee 0
        i32.load8_u offset=8
        local.get 0
        i32.load8_u offset=9
        call $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E
        unreachable
      )
      (func $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E (;49;) (type 3) (param i32 i32)
        local.get 0
        local.get 1
        i64.load align=4
        i64.store
      )
      (func $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E (;50;) (type 3) (param i32 i32)
        local.get 0
        local.get 1
        call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE
        unreachable
      )
      (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE (;51;) (type 3) (param i32 i32)
        i32.const 0
        i32.const 1
        i32.store8 offset=17940
        unreachable
      )
      (func $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE (;52;) (type 13) (param i32 i32 i32 i32 i32) (result i32)
        (local i32 i32 i32 i32 i32 i32 i32 i32)
        block ;; label = @1
          local.get 2
          i32.load
          local.tee 5
          i32.eqz
          br_if 0 (;@1;)
          local.get 1
          i32.const -1
          i32.add
          local.set 6
          i32.const 0
          local.get 1
          i32.sub
          local.set 7
          local.get 0
          i32.const 2
          i32.shl
          local.set 8
          loop ;; label = @2
            block ;; label = @3
              block ;; label = @4
                local.get 5
                i32.load offset=8
                local.tee 1
                i32.const 1
                i32.and
                br_if 0 (;@4;)
                local.get 5
                i32.const 8
                i32.add
                local.set 9
                br 1 (;@3;)
              end
              loop ;; label = @4
                local.get 5
                local.get 1
                i32.const -2
                i32.and
                i32.store offset=8
                block ;; label = @5
                  block ;; label = @6
                    local.get 5
                    i32.load offset=4
                    local.tee 10
                    i32.const -4
                    i32.and
                    local.tee 9
                    br_if 0 (;@6;)
                    i32.const 0
                    local.set 11
                    br 1 (;@5;)
                  end
                  i32.const 0
                  local.get 9
                  local.get 9
                  i32.load8_u
                  i32.const 1
                  i32.and
                  select
                  local.set 11
                end
                block ;; label = @5
                  local.get 5
                  i32.load
                  local.tee 1
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 1
                  i32.const -4
                  i32.and
                  local.tee 12
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 12
                  local.get 12
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.get 9
                  i32.or
                  i32.store offset=4
                  local.get 5
                  i32.load offset=4
                  local.tee 10
                  i32.const -4
                  i32.and
                  local.set 9
                  local.get 5
                  i32.load
                  local.set 1
                end
                block ;; label = @5
                  local.get 9
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 9
                  local.get 9
                  i32.load
                  i32.const 3
                  i32.and
                  local.get 1
                  i32.const -4
                  i32.and
                  i32.or
                  i32.store
                  local.get 5
                  i32.load offset=4
                  local.set 10
                  local.get 5
                  i32.load
                  local.set 1
                end
                local.get 5
                local.get 10
                i32.const 3
                i32.and
                i32.store offset=4
                local.get 5
                local.get 1
                i32.const 3
                i32.and
                i32.store
                block ;; label = @5
                  local.get 1
                  i32.const 2
                  i32.and
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 11
                  local.get 11
                  i32.load
                  i32.const 2
                  i32.or
                  i32.store
                end
                local.get 2
                local.get 11
                i32.store
                local.get 11
                local.set 5
                local.get 11
                i32.load offset=8
                local.tee 1
                i32.const 1
                i32.and
                br_if 0 (;@4;)
              end
              local.get 11
              i32.const 8
              i32.add
              local.set 9
              local.get 11
              local.set 5
            end
            block ;; label = @3
              local.get 5
              i32.load
              i32.const -4
              i32.and
              local.tee 11
              local.get 9
              i32.sub
              local.get 8
              i32.lt_u
              br_if 0 (;@3;)
              block ;; label = @4
                block ;; label = @5
                  local.get 9
                  local.get 3
                  local.get 0
                  local.get 4
                  call_indirect (type 0)
                  i32.const 2
                  i32.shl
                  i32.add
                  i32.const 8
                  i32.add
                  local.get 11
                  local.get 8
                  i32.sub
                  local.get 7
                  i32.and
                  local.tee 1
                  i32.le_u
                  br_if 0 (;@5;)
                  local.get 9
                  i32.load
                  local.set 1
                  local.get 6
                  local.get 9
                  i32.and
                  br_if 2 (;@3;)
                  local.get 2
                  local.get 1
                  i32.const -4
                  i32.and
                  i32.store
                  local.get 5
                  i32.load
                  local.set 9
                  local.get 5
                  local.set 1
                  br 1 (;@4;)
                end
                i32.const 0
                local.set 11
                local.get 1
                i32.const 0
                i32.store
                local.get 1
                i32.const -8
                i32.add
                local.tee 1
                i64.const 0
                i64.store align=4
                local.get 1
                local.get 5
                i32.load
                i32.const -4
                i32.and
                i32.store
                block ;; label = @5
                  local.get 5
                  i32.load
                  local.tee 10
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 10
                  i32.const -4
                  i32.and
                  local.tee 10
                  i32.eqz
                  br_if 0 (;@5;)
                  local.get 10
                  local.get 10
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.get 1
                  i32.or
                  i32.store offset=4
                  local.get 1
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.set 11
                end
                local.get 1
                local.get 11
                local.get 5
                i32.or
                i32.store offset=4
                local.get 9
                local.get 9
                i32.load
                i32.const -2
                i32.and
                i32.store
                local.get 5
                local.get 5
                i32.load
                local.tee 9
                i32.const 3
                i32.and
                local.get 1
                i32.or
                local.tee 11
                i32.store
                block ;; label = @5
                  local.get 9
                  i32.const 2
                  i32.and
                  br_if 0 (;@5;)
                  local.get 1
                  i32.load
                  local.set 9
                  br 1 (;@4;)
                end
                local.get 5
                local.get 11
                i32.const -3
                i32.and
                i32.store
                local.get 1
                i32.load
                i32.const 2
                i32.or
                local.set 9
              end
              local.get 1
              local.get 9
              i32.const 1
              i32.or
              i32.store
              local.get 1
              i32.const 8
              i32.add
              return
            end
            local.get 2
            local.get 1
            i32.store
            local.get 1
            local.set 5
            local.get 1
            br_if 0 (;@2;)
          end
        end
        i32.const 0
      )
      (func $cabi_realloc_wit_bindgen_0_24_0 (;53;) (type 5) (param i32 i32 i32 i32) (result i32)
        block ;; label = @1
          block ;; label = @2
            block ;; label = @3
              local.get 1
              i32.eqz
              br_if 0 (;@3;)
              local.get 0
              local.get 2
              local.get 1
              local.get 3
              call $_ZN4core5alloc6global11GlobalAlloc7realloc17h2f5334da4d3fba08E
              local.set 2
              br 1 (;@2;)
            end
            local.get 3
            i32.eqz
            br_if 1 (;@1;)
            local.get 2
            local.get 3
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE
            local.set 2
          end
          local.get 2
          br_if 0 (;@1;)
          unreachable
        end
        local.get 2
      )
      (func $_ZN3zoo8bindings40__link_custom_section_describing_imports17hde9e1f059f3f9070E (;54;) (type 9))
      (func $cabi_realloc (;55;) (type 5) (param i32 i32 i32 i32) (result i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        call $cabi_realloc_wit_bindgen_0_24_0
      )
      (data $.rodata (;0;) (i32.const 16384) "\07Eating \c0\00\10Failed to plan: \c0\00\0bScheduled '\c0\03': \c0\00\c0\02: \c0\00library/alloc/src/fmt.rs\00library/alloc/src/raw_vec/mod.rs\00\0dPackage type \c0\16 is now opened. Enjoy.\00\05Yum, \c0\1c should be hidden for later.\00\0dPackage type \c0' was damaged, you cannot eat this food.\00\c0\06? Yuk!\00\c0\1b, come and have a bear hug!\00No foods in meal planunnamedError\0b\00\00\00\0c\00\00\00\04\00\00\00\0c\00\00\00\0d\00\00\00\0e\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00\0f\00\00\00a formatting trait implementation returned an error when the underlying stream did not\00\006@\00\00\18\00\00\00\8a\02\00\00\0e\00\00\00capacity overflow\00\00\00O@\00\00 \00\00\00\1c\00\00\00\05\00\00\00\10\00\00\00\11\00\00\00\11\00\00\00plastic bagmetal can")
      (@producers
        (language "Rust" "")
        (processed-by "rustc" "1.93.1 (01f6ddf75 2026-02-11)")
        (processed-by "wit-component" "0.227.1")
        (processed-by "wit-bindgen-rust" "0.41.0")
      )
      (@custom "target_features" (after data) "\08+\0bbulk-memory+\0fbulk-memory-opt+\16call-indirect-overlong+\0amultivalue+\0fmutable-globals+\13nontrapping-fptoint+\0freference-types+\08sign-ext")
    )
    (core module (;1;)
      (type (;0;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
      (type (;1;) (func (param i32 i32 i32 i32) (result i32)))
      (type (;2;) (func (param i32)))
      (type (;3;) (func (param i32 f64 i32 i32 i32 i32 i32)))
      (type (;4;) (func (param i32 i32 i32 i32 i32 i32)))
      (table (;0;) 5 5 funcref)
      (export "0" (func $indirect-zoo:food/food@0.1.0-hide-food))
      (export "1" (func $indirect-zoo:food/food@0.1.0-trash-package))
      (export "2" (func $indirect-zoo:food/food@0.1.0-consume-food))
      (export "3" (func $indirect-zoo:food/food@0.1.0-open-package))
      (export "4" (func $indirect-zoo:food/food@0.1.0-plan-meal))
      (export "$imports" (table 0))
      (func $indirect-zoo:food/food@0.1.0-hide-food (;0;) (type 0) (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        local.get 5
        local.get 6
        local.get 7
        local.get 8
        local.get 9
        local.get 10
        local.get 11
        local.get 12
        local.get 13
        i32.const 0
        call_indirect (type 0)
      )
      (func $indirect-zoo:food/food@0.1.0-trash-package (;1;) (type 1) (param i32 i32 i32 i32) (result i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        i32.const 1
        call_indirect (type 1)
      )
      (func $indirect-zoo:food/food@0.1.0-consume-food (;2;) (type 2) (param i32)
        local.get 0
        i32.const 2
        call_indirect (type 2)
      )
      (func $indirect-zoo:food/food@0.1.0-open-package (;3;) (type 3) (param i32 f64 i32 i32 i32 i32 i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        local.get 5
        local.get 6
        i32.const 3
        call_indirect (type 3)
      )
      (func $indirect-zoo:food/food@0.1.0-plan-meal (;4;) (type 4) (param i32 i32 i32 i32 i32 i32)
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        local.get 5
        i32.const 4
        call_indirect (type 4)
      )
      (@producers
        (processed-by "wit-component" "0.227.1")
      )
    )
    (core module (;2;)
      (type (;0;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
      (type (;1;) (func (param i32 i32 i32 i32) (result i32)))
      (type (;2;) (func (param i32)))
      (type (;3;) (func (param i32 f64 i32 i32 i32 i32 i32)))
      (type (;4;) (func (param i32 i32 i32 i32 i32 i32)))
      (import "" "0" (func (;0;) (type 0)))
      (import "" "1" (func (;1;) (type 1)))
      (import "" "2" (func (;2;) (type 2)))
      (import "" "3" (func (;3;) (type 3)))
      (import "" "4" (func (;4;) (type 4)))
      (import "" "$imports" (table (;0;) 5 5 funcref))
      (elem (;0;) (i32.const 0) func 0 1 2 3 4)
      (@producers
        (processed-by "wit-component" "0.227.1")
      )
    )
    (core instance (;0;) (instantiate 1))
    (alias core export 0 "0" (core func (;0;)))
    (alias core export 0 "1" (core func (;1;)))
    (alias core export 0 "2" (core func (;2;)))
    (alias core export 0 "3" (core func (;3;)))
    (alias core export 0 "4" (core func (;4;)))
    (core instance (;1;)
      (export "hide-food" (func 0))
      (export "trash-package" (func 1))
      (export "consume-food" (func 2))
      (export "open-package" (func 3))
      (export "plan-meal" (func 4))
    )
    (core instance (;2;) (instantiate 0
        (with "zoo:food/food@0.1.0" (instance 1))
      )
    )
    (alias core export 2 "memory" (core memory (;0;)))
    (alias core export 0 "$imports" (core table (;0;)))
    (alias export 0 "hide-food" (func (;0;)))
    (alias core export 2 "cabi_realloc" (core func (;5;)))
    (core func (;6;) (canon lower (func 0) (memory 0) string-encoding=utf8))
    (alias export 0 "trash-package" (func (;1;)))
    (core func (;7;) (canon lower (func 1) (memory 0) string-encoding=utf8))
    (alias export 0 "consume-food" (func (;2;)))
    (core func (;8;) (canon lower (func 2) (memory 0) string-encoding=utf8))
    (alias export 0 "open-package" (func (;3;)))
    (core func (;9;) (canon lower (func 3) (memory 0) string-encoding=utf8))
    (alias export 0 "plan-meal" (func (;4;)))
    (core func (;10;) (canon lower (func 4) (memory 0) (realloc 5) string-encoding=utf8))
    (core instance (;3;)
      (export "$imports" (table 0))
      (export "0" (func 6))
      (export "1" (func 7))
      (export "2" (func 8))
      (export "3" (func 9))
      (export "4" (func 10))
    )
    (core instance (;4;) (instantiate 2
        (with "" (instance 3))
      )
    )
    (alias export 0 "food-info" (type (;1;)))
    (alias export 0 "package-info" (type (;2;)))
    (type (;3;) (func (param "foodinfo" 1) (param "packageinfo" 2)))
    (alias core export 2 "zoo:food/eater@0.1.0#feed" (core func (;11;)))
    (func (;5;) (type 3) (canon lift (core func 11) (memory 0) (realloc 5) string-encoding=utf8))
    (alias export 0 "meal-plan" (type (;4;)))
    (type (;5;) (result string (error string)))
    (type (;6;) (func (param "plan" 4) (result 5)))
    (alias core export 2 "zoo:food/eater@0.1.0#schedule" (core func (;12;)))
    (alias core export 2 "cabi_post_zoo:food/eater@0.1.0#schedule" (core func (;13;)))
    (func (;6;) (type 6) (canon lift (core func 12) (memory 0) (realloc 5) string-encoding=utf8 (post-return 13)))
    (alias export 0 "food-info" (type (;7;)))
    (alias export 0 "nutrition-type" (type (;8;)))
    (alias export 0 "nutrition-info" (type (;9;)))
    (alias export 0 "material-type" (type (;10;)))
    (alias export 0 "sealing-state" (type (;11;)))
    (alias export 0 "package-info" (type (;12;)))
    (alias export 0 "meal-plan" (type (;13;)))
    (component (;0;)
      (type (;0;) (tuple s8 u8))
      (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" f32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
      (import "import-type-food-info" (type (;2;) (eq 1)))
      (type (;3;) (enum "carbohydrate" "protein" "vitamin"))
      (import "import-type-nutrition-type" (type (;4;) (eq 3)))
      (type (;5;) (record (field "percentage" f64) (field "nutrition-type" 4)))
      (import "import-type-nutrition-info" (type (;6;) (eq 5)))
      (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
      (import "import-type-material-type" (type (;8;) (eq 7)))
      (type (;9;) (flags "opened" "closed" "damaged"))
      (import "import-type-sealing-state" (type (;10;) (eq 9)))
      (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
      (import "import-type-package-info" (type (;12;) (eq 11)))
      (type (;13;) (list 2))
      (type (;14;) (option string))
      (type (;15;) (record (field "foods" 13) (field "label" 14)))
      (import "import-type-meal-plan" (type (;16;) (eq 15)))
      (import "import-type-food-info0" (type (;17;) (eq 2)))
      (import "import-type-package-info0" (type (;18;) (eq 12)))
      (type (;19;) (func (param "foodinfo" 17) (param "packageinfo" 18)))
      (import "import-func-feed" (func (;0;) (type 19)))
      (import "import-type-meal-plan0" (type (;20;) (eq 16)))
      (type (;21;) (result string (error string)))
      (type (;22;) (func (param "plan" 20) (result 21)))
      (import "import-func-schedule" (func (;1;) (type 22)))
      (export (;23;) "food-info" (type 2))
      (export (;24;) "package-info" (type 12))
      (export (;25;) "meal-plan" (type 16))
      (type (;26;) (func (param "foodinfo" 23) (param "packageinfo" 24)))
      (export (;2;) "feed" (func 0) (func (type 26)))
      (type (;27;) (result string (error string)))
      (type (;28;) (func (param "plan" 25) (result 27)))
      (export (;3;) "schedule" (func 1) (func (type 28)))
    )
    (instance (;1;) (instantiate 0
        (with "import-func-feed" (func 5))
        (with "import-func-schedule" (func 6))
        (with "import-type-food-info" (type 7))
        (with "import-type-nutrition-type" (type 8))
        (with "import-type-nutrition-info" (type 9))
        (with "import-type-material-type" (type 10))
        (with "import-type-sealing-state" (type 11))
        (with "import-type-package-info" (type 12))
        (with "import-type-meal-plan" (type 13))
        (with "import-type-food-info0" (type 1))
        (with "import-type-package-info0" (type 2))
        (with "import-type-meal-plan0" (type 4))
      )
    )
    (export (;2;) "zoo:food/eater@0.1.0" (instance 1))
    (@producers
      (processed-by "wit-component" "0.227.1")
      (processed-by "cargo-component" "0.21.1 (1495f61 2025-07-14)")
      (language "Rust" "")
    )
    (@custom "authors" "pavel.savara@gmail.com")
    (@custom "revision" "f9e6f1fc5836e6da347dac8f9b98117aa0b4978c")
    (@custom "version" "0.1.0")
  )
  (instance (;1;) (instantiate 1
      (with "zoo:food/food@0.1.0" (instance 0))
    )
  )
  (alias export 1 "zoo:food/eater@0.1.0" (instance (;2;)))
  (instance (;3;) (instantiate 0
      (with "zoo:food/eater@0.1.0" (instance 2))
      (with "zoo:food/food@0.1.0" (instance 0))
    )
  )
  (alias export 3 "city:runner/runner@0.1.0" (instance (;4;)))
  (export (;5;) "city:runner/runner@0.1.0" (instance 4))
)
