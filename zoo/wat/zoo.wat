(component $zoo
  (type (;0;)
    (instance
      (type (;0;) (tuple s8 u8))
      (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" float32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
      (export (;2;) "food-info" (type (eq 1)))
      (type (;3;) (enum "carbohyrdate" "protein" "vitamin"))
      (export (;4;) "nutrition-type" (type (eq 3)))
      (type (;5;) (record (field "percentage" float64) (field "nutrition-type" 4)))
      (export (;6;) "nutrition-info" (type (eq 5)))
      (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
      (export (;8;) "material-type" (type (eq 7)))
      (type (;9;) (enum "opened" "closed" "damaged"))
      (export (;10;) "sealing-state" (type (eq 9)))
      (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
      (export (;12;) "package-info" (type (eq 11)))
      (type (;13;) (func (param "food" 2) (param "message" string)))
      (export (;0;) "hide-food" (func (type 13)))
      (type (;14;) (func (param "foodinfo" 2) (param "packageinfo" 12) (param "message" string)))
      (export (;1;) "consume-food" (func (type 14)))
      (type (;15;) (func (param "sealingstate" 10) (param "packageinfo" 12) (param "message" string)))
      (export (;2;) "open-package" (func (type 15)))
      (type (;16;) (list 12))
      (type (;17;) (func (param "trashed" 16) (param "message" string) (result bool)))
      (export (;3;) "trash-package" (func (type 17)))
    )
  )
  (import "zoo:food/food@0.1.0" (instance (;0;) (type 0)))
  (core module (;0;)
    (type (;0;) (func (param i32 i32 i32) (result i32)))
    (type (;1;) (func (param i32 i32) (result i32)))
    (type (;2;) (func (param i32 i32 i32 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func (param i32 f64 i32 i32 i32 i32 i32)))
    (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
    (type (;7;) (func (param i32)))
    (type (;8;) (func))
    (type (;9;) (func (param i32 i32 i32)))
    (type (;10;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)))
    (type (;11;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
    (type (;12;) (func (param i32 i32 i32 i32 i32) (result i32)))
    (import "zoo:food/food@0.1.0" "open-package" (func $_ZN3zoo8bindings3zoo4food4food12open_package11wit_import417h1890370d54baa0f8E (;0;) (type 4)))
    (import "zoo:food/food@0.1.0" "trash-package" (func $_ZN3zoo8bindings3zoo4food4food13trash_package11wit_import417h622e3c4f77f110ddE (;1;) (type 5)))
    (import "zoo:food/food@0.1.0" "hide-food" (func $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417had62a38e1d70ac82E (;2;) (type 6)))
    (import "zoo:food/food@0.1.0" "consume-food" (func $_ZN3zoo8bindings3zoo4food4food12consume_food11wit_import717he6227480a82c8aefE (;3;) (type 7)))
    (func $__wasm_call_ctors (;4;) (type 8))
    (func $_RNvCsdBezzDwma51_7___rustc14___rust_realloc (;5;) (type 5) (param i32 i32 i32 i32) (result i32)
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
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE (;6;) (type 1) (param i32 i32) (result i32)
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
          i32.load offset=17872
          i32.store offset=8
          local.get 1
          local.get 0
          local.get 2
          i32.const 8
          i32.add
          i32.const 16844
          i32.const 1
          i32.const 2
          call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
          local.set 0
          i32.const 0
          local.get 2
          i32.load offset=8
          i32.store offset=17872
          br 1 (;@1;)
        end
        local.get 2
        i32.const 17872
        i32.store offset=4
        local.get 2
        local.get 3
        i32.const 2
        i32.shl
        local.tee 3
        i32.load offset=16848
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
        i32.store offset=16848
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E (;7;) (type 9) (param i32 i32 i32)
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
                    i32.load offset=17872
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
                  i32.load offset=16848
                  i32.store
                  local.get 2
                  local.get 0
                  i32.const -8
                  i32.add
                  local.tee 0
                  i32.store offset=16848
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
      i32.store offset=17872
    )
    (func $_ZN3zoo8bindings40__link_custom_section_describing_imports17h00e3d3666c116a9cE (;8;) (type 8))
    (func $_ZN3zoo93_$LT$impl$u20$core..fmt..Display$u20$for$u20$zoo..bindings..zoo..food..food..MaterialType$GT$3fmt17h0b59a3508dd3bf02E (;9;) (type 1) (param i32 i32) (result i32)
      local.get 1
      i32.load
      i32.const 16403
      i32.const 16392
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
      call_indirect (type 0)
    )
    (func $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E (;10;) (type 1) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load offset=4
      local.get 0
      i32.load offset=8
      call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
    )
    (func $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E (;11;) (type 0) (param i32 i32 i32) (result i32)
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
              call_indirect (type 1)
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
          call_indirect (type 0)
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
            call_indirect (type 1)
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
        call_indirect (type 0)
        local.set 8
      end
      local.get 8
    )
    (func $zoo:food/eater@0.1.0#feed (;12;) (type 10) (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 f64 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 160
      i32.sub
      local.tee 16
      global.set $__stack_pointer
      block ;; label = @1
        i32.const 0
        i32.load8_u offset=17896
        br_if 0 (;@1;)
        call $__wasm_call_ctors
        i32.const 0
        i32.const 1
        i32.store8 offset=17896
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
      local.tee 11
      i32.const 0
      i32.ne
      i32.store8 offset=46
      local.get 16
      local.get 14
      i32.const 0
      i32.ne
      local.tee 9
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
      i32.const 64
      i32.add
      local.set 14
      local.get 16
      i32.const 20
      i32.add
      local.set 10
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            local.get 15
                            i32.const 255
                            i32.and
                            i32.const -1
                            i32.add
                            br_table 0 (;@11;) 1 (;@10;) 2 (;@9;)
                          end
                          local.get 16
                          i32.const 5
                          i32.store offset=76
                          local.get 16
                          local.get 14
                          i32.store offset=72
                          local.get 16
                          i32.const 80
                          i32.add
                          i32.const 16486
                          local.get 16
                          i32.const 72
                          i32.add
                          call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                          local.get 16
                          i32.load offset=80
                          local.set 1
                          i32.const 1
                          local.get 16
                          f64.load offset=48
                          local.get 16
                          i32.load8_u offset=56
                          local.get 16
                          i32.load8_u offset=64
                          i32.const 1
                          local.get 16
                          i32.load offset=84
                          local.tee 0
                          local.get 16
                          i32.load offset=88
                          call $_ZN3zoo8bindings3zoo4food4food12open_package11wit_import417h1890370d54baa0f8E
                          block ;; label = @11
                            local.get 1
                            i32.eqz
                            br_if 0 (;@11;)
                            local.get 0
                            i32.const 1
                            local.get 1
                            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                          end
                          local.get 11
                          i32.eqz
                          br_if 2 (;@8;)
                          local.get 5
                          i64.const 1000
                          i64.le_u
                          br_if 2 (;@8;)
                          br 4 (;@6;)
                        end
                        local.get 16
                        i32.const 5
                        i32.store offset=76
                        local.get 16
                        local.get 14
                        i32.store offset=72
                        local.get 16
                        i32.const 80
                        i32.add
                        i32.const 16562
                        local.get 16
                        i32.const 72
                        i32.add
                        call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                        local.get 16
                        i32.load offset=80
                        local.set 6
                        local.get 16
                        i32.load offset=84
                        local.set 14
                        local.get 16
                        i32.load offset=88
                        local.set 11
                        local.get 16
                        i32.const 0
                        i32.load offset=17872
                        i32.store offset=80
                        i32.const 6
                        i32.const 8
                        local.get 16
                        i32.const 80
                        i32.add
                        i32.const 16844
                        i32.const 1
                        i32.const 2
                        call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
                        local.set 15
                        i32.const 0
                        local.get 16
                        i32.load offset=80
                        i32.store offset=17872
                        local.get 15
                        i32.eqz
                        br_if 5 (;@4;)
                        local.get 15
                        i32.const 2
                        i32.store8 offset=17
                        local.get 15
                        local.get 9
                        i32.store8 offset=16
                        local.get 15
                        local.get 13
                        i32.store8 offset=8
                        local.get 15
                        local.get 12
                        f64.store
                        local.get 15
                        i32.const 1
                        local.get 14
                        local.get 11
                        call $_ZN3zoo8bindings3zoo4food4food13trash_package11wit_import417h622e3c4f77f110ddE
                        drop
                        local.get 15
                        i32.const 8
                        i32.const 24
                        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                        block ;; label = @10
                          local.get 6
                          i32.eqz
                          br_if 0 (;@10;)
                          local.get 14
                          i32.const 1
                          local.get 6
                          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                        end
                        local.get 1
                        i32.eqz
                        br_if 8 (;@1;)
                        br 7 (;@2;)
                      end
                      local.get 11
                      i32.eqz
                      br_if 0 (;@8;)
                      local.get 5
                      i64.const 1000
                      i64.gt_u
                      br_if 1 (;@7;)
                    end
                    block ;; label = @8
                      local.get 6
                      i32.const 65535
                      i32.and
                      i32.const 100
                      i32.gt_u
                      br_if 0 (;@8;)
                      local.get 16
                      i32.const 6
                      i32.store offset=76
                      local.get 16
                      local.get 10
                      i32.store offset=72
                      local.get 16
                      i32.const 80
                      i32.add
                      i32.const 16618
                      local.get 16
                      i32.const 72
                      i32.add
                      call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                      local.get 16
                      i32.load offset=80
                      local.set 1
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
                      i32.load offset=84
                      local.tee 0
                      local.get 16
                      i32.load offset=88
                      call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417had62a38e1d70ac82E
                      local.get 1
                      i32.eqz
                      br_if 5 (;@3;)
                      local.get 0
                      i32.const 1
                      local.get 1
                      call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                      br 5 (;@3;)
                    end
                    local.get 16
                    i32.const 6
                    i32.store offset=76
                    local.get 16
                    local.get 10
                    i32.store offset=72
                    local.get 16
                    i32.const 80
                    i32.add
                    i32.const 16627
                    local.get 16
                    i32.const 72
                    i32.add
                    call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                    local.get 16
                    i32.load offset=80
                    local.set 1
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
                    i32.load offset=84
                    local.tee 0
                    local.get 16
                    i32.load offset=88
                    call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417had62a38e1d70ac82E
                    local.get 1
                    i32.eqz
                    br_if 4 (;@3;)
                    local.get 0
                    i32.const 1
                    local.get 1
                    call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                    br 4 (;@3;)
                  end
                  local.get 12
                  f64.const 0x1.ep+4 (;=30;)
                  f64.gt
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 13
                  i32.const 255
                  i32.and
                  i32.const 1
                  i32.eq
                  br_if 1 (;@5;)
                end
                local.get 16
                i32.const 6
                i32.store offset=76
                local.get 16
                local.get 10
                i32.store offset=72
                local.get 16
                i32.const 80
                i32.add
                i32.const 16525
                local.get 16
                i32.const 72
                i32.add
                call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
                local.get 16
                i32.load offset=80
                local.set 1
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
                i32.load offset=84
                local.tee 0
                local.get 16
                i32.load offset=88
                call $_ZN3zoo8bindings3zoo4food4food9hide_food11wit_import417had62a38e1d70ac82E
                local.get 1
                i32.eqz
                br_if 2 (;@3;)
                local.get 0
                i32.const 1
                local.get 1
                call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
                br 2 (;@3;)
              end
              local.get 16
              i32.const 6
              i32.store offset=76
              local.get 16
              local.get 10
              i32.store offset=72
              local.get 16
              i32.const 80
              i32.add
              i32.const 16412
              local.get 16
              i32.const 72
              i32.add
              call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
              local.get 16
              i32.load offset=80
              local.set 1
              local.get 16
              i32.load offset=84
              local.set 0
              local.get 16
              i32.load offset=88
              local.set 15
              local.get 16
              local.get 16
              i64.load offset=24
              i64.store offset=80
              local.get 16
              local.get 16
              i32.load offset=16
              i32.store offset=88
              local.get 16
              local.get 16
              f32.load offset=32
              f32.store offset=92
              local.get 16
              local.get 16
              i32.load8_u offset=46
              i32.store8 offset=96
              local.get 16
              local.get 16
              i64.load offset=8
              i64.store offset=104
              local.get 16
              local.get 16
              i32.load16_u offset=40
              i32.store16 offset=112
              local.get 16
              local.get 16
              i32.load16_u offset=42
              i32.store16 offset=114
              local.get 16
              local.get 16
              i32.load8_u offset=47
              i32.store8 offset=116
              local.get 16
              local.get 16
              i32.load8_u offset=44
              i32.store8 offset=117
              local.get 16
              local.get 16
              i32.load8_u offset=45
              i32.store8 offset=118
              local.get 16
              local.get 16
              i32.load offset=36
              i32.store offset=120
              local.get 16
              i32.load8_u offset=64
              local.set 13
              local.get 16
              local.get 15
              i32.store offset=156
              local.get 16
              i32.const 0
              i32.store8 offset=145
              local.get 16
              local.get 13
              i32.store8 offset=144
              local.get 16
              i32.const 1
              i32.store8 offset=136
              local.get 16
              local.get 12
              f64.store offset=128
              local.get 16
              local.get 0
              i32.store offset=152
              local.get 16
              i32.const 80
              i32.add
              call $_ZN3zoo8bindings3zoo4food4food12consume_food11wit_import717he6227480a82c8aefE
              local.get 1
              i32.eqz
              br_if 1 (;@3;)
              local.get 0
              i32.const 1
              local.get 1
              call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
              br 1 (;@3;)
            end
            i32.const 8
            i32.const 24
            call $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E
            unreachable
          end
          local.get 16
          i32.load offset=20
          local.tee 1
          i32.eqz
          br_if 1 (;@1;)
          local.get 16
          i32.load offset=24
          local.set 0
        end
        local.get 0
        i32.const 1
        local.get 1
        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
      end
      local.get 16
      i32.const 160
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E (;13;) (type 9) (param i32 i32 i32)
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
          i32.const 16664
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
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E (;14;) (type 2) (param i32 i32 i32 i32)
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
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE (;15;) (type 1) (param i32 i32) (result i32)
      i32.const 512
    )
    (func $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E (;16;) (type 11) (param i32 i32 i32 i32 i32 i32) (result i32)
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
    (func $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E (;17;) (type 3) (param i32 i32)
      local.get 1
      local.get 0
      call $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler
      unreachable
    )
    (func $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler (;18;) (type 3) (param i32 i32)
      local.get 1
      local.get 0
      call $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E
      unreachable
    )
    (func $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E (;19;) (type 3) (param i32 i32)
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
    (func $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E (;20;) (type 8)
      i32.const 16808
      i32.const 35
      i32.const 16828
      call $_ZN4core9panicking9panic_fmt17h806e647715990138E
      unreachable
    )
    (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$7reserve21do_reserve_and_handle17hca3eeb1f3c76a318E (;21;) (type 9) (param i32 i32 i32)
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
    (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h515e10d71c75ae0aE (;22;) (type 2) (param i32 i32 i32 i32)
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
            local.get 1
            i32.const 1
            local.get 3
            call $_RNvCsdBezzDwma51_7___rustc14___rust_realloc
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
    (func $_ZN4core9panicking9panic_fmt17h806e647715990138E (;23;) (type 9) (param i32 i32 i32)
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
    (func $_ZN4core3fmt5write17h57d28834308ddab7E (;24;) (type 5) (param i32 i32 i32 i32) (result i32)
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
          call_indirect (type 0)
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
                        call_indirect (type 0)
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
                      call_indirect (type 0)
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
                  call_indirect (type 1)
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
                call_indirect (type 1)
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
    (func $_ZN4core6result13unwrap_failed17h28bb9ae37aca2287E (;25;) (type 7) (param i32)
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
      i32.const 16704
      i32.store
      local.get 1
      i32.const 16688
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
      i32.const 16422
      local.get 1
      i32.const 16
      i32.add
      i32.const 16792
      call $_ZN4core9panicking9panic_fmt17h806e647715990138E
      unreachable
    )
    (func $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E (;26;) (type 1) (param i32 i32) (result i32)
      local.get 1
      i32.load
      i32.const 16657
      i32.const 5
      local.get 1
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 0)
    )
    (func $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E (;27;) (type 7) (param i32)
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
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E (;28;) (type 0) (param i32 i32 i32) (result i32)
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
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE (;29;) (type 1) (param i32 i32) (result i32)
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
    (func $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E (;30;) (type 0) (param i32 i32 i32) (result i32)
      local.get 0
      i32.const 16664
      local.get 1
      local.get 2
      call $_ZN4core3fmt5write17h57d28834308ddab7E
    )
    (func $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind (;31;) (type 7) (param i32)
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
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE (;32;) (type 1) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load
      local.get 0
      i32.load offset=4
      call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E (;33;) (type 1) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      local.get 0
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 1)
    )
    (func $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E (;34;) (type 3) (param i32 i32)
      local.get 0
      i32.const 0
      i32.store
    )
    (func $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E (;35;) (type 2) (param i32 i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      i32.const 0
      i32.const 0
      i32.load offset=17888
      local.tee 5
      i32.const 1
      i32.add
      i32.store offset=17888
      block ;; label = @1
        local.get 5
        i32.const 0
        i32.lt_s
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load8_u offset=17884
            br_if 0 (;@3;)
            i32.const 0
            i32.const 0
            i32.load offset=17880
            i32.const 1
            i32.add
            i32.store offset=17880
            i32.const 0
            i32.load offset=17892
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
        i32.store8 offset=17884
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        call $_RNvCsdBezzDwma51_7___rustc10rust_panic
        unreachable
      end
      unreachable
    )
    (func $_RNvCsdBezzDwma51_7___rustc10rust_panic (;36;) (type 8)
      unreachable
    )
    (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E (;37;) (type 7) (param i32)
      local.get 0
      call $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE
      unreachable
    )
    (func $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE (;38;) (type 7) (param i32)
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
    (func $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E (;39;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i64.load align=4
      i64.store
    )
    (func $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E (;40;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE
      unreachable
    )
    (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE (;41;) (type 3) (param i32 i32)
      i32.const 0
      i32.const 1
      i32.store8 offset=17876
      unreachable
    )
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E (;42;) (type 2) (param i32 i32 i32 i32)
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
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E (;43;) (type 1) (param i32 i32) (result i32)
      local.get 1
    )
    (func $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE (;44;) (type 12) (param i32 i32 i32 i32 i32) (result i32)
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
                call_indirect (type 1)
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
    (func $cabi_realloc_wit_bindgen_0_24_0 (;45;) (type 5) (param i32 i32 i32 i32) (result i32)
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
    (func $cabi_realloc (;46;) (type 5) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $cabi_realloc_wit_bindgen_0_24_0
    )
    (table (;0;) 18 18 funcref)
    (memory (;0;) 1 10)
    (global $__stack_pointer (;0;) (mut i32) i32.const 16384)
    (global (;1;) i32 i32.const 17897)
    (global (;2;) i32 i32.const 17904)
    (export "memory" (memory 0))
    (export "zoo:food/eater@0.1.0#feed" (func $zoo:food/eater@0.1.0#feed))
    (export "cabi_realloc_wit_bindgen_0_24_0" (func $cabi_realloc_wit_bindgen_0_24_0))
    (export "cabi_realloc" (func $cabi_realloc))
    (export "__data_end" (global 1))
    (export "__heap_base" (global 2))
    (elem (;0;) (i32.const 1) func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E $_ZN3zoo93_$LT$impl$u20$core..fmt..Display$u20$for$u20$zoo..bindings..zoo..food..food..MaterialType$GT$3fmt17h0b59a3508dd3bf02E $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E $_ZN3zoo8bindings40__link_custom_section_describing_imports17h00e3d3666c116a9cE $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E $cabi_realloc)
    (data $.rodata (;0;) (i32.const 16384) "\0b\00\00\00\0b\00\00\00plastic bagmetal can\07Eating \c0\00\c0\02: \c0\00library/alloc/src/fmt.rs\00library/alloc/src/raw_vec/mod.rs\00\0dPackage type \c0\16 is now opened. Enjoy.\00\05Yum, \c0\1c should be hidden for later.\00\0dPackage type \c0' was damaged, you cannot eat this food.\00\c0\06? Yuk!\00\c0\1b, come and have a bear hug!\00Error\00\00\0c\00\00\00\0c\00\00\00\04\00\00\00\0d\00\00\00\0e\00\00\00\0f\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00\10\00\00\00a formatting trait implementation returned an error when the underlying stream did not\00\00,@\00\00\18\00\00\00\8a\02\00\00\0e\00\00\00capacity overflow\00\00\00E@\00\00 \00\00\00\1c\00\00\00\05\00\00\00\11\00\00\00")
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.93.1 (01f6ddf75 2026-02-11)")
      (processed-by "wit-component" "0.227.1")
      (processed-by "wit-bindgen-rust" "0.41.0")
    )
  )
  (core module (;1;)
    (type (;0;) (func (param i32 f64 i32 i32 i32 i32 i32)))
    (type (;1;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;2;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
    (type (;3;) (func (param i32)))
    (func $indirect-zoo:food/food@0.1.0-open-package (;0;) (type 0) (param i32 f64 i32 i32 i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      local.get 4
      local.get 5
      local.get 6
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
    (func $indirect-zoo:food/food@0.1.0-hide-food (;2;) (type 2) (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)
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
      i32.const 2
      call_indirect (type 2)
    )
    (func $indirect-zoo:food/food@0.1.0-consume-food (;3;) (type 3) (param i32)
      local.get 0
      i32.const 3
      call_indirect (type 3)
    )
    (table (;0;) 4 4 funcref)
    (export "0" (func $indirect-zoo:food/food@0.1.0-open-package))
    (export "1" (func $indirect-zoo:food/food@0.1.0-trash-package))
    (export "2" (func $indirect-zoo:food/food@0.1.0-hide-food))
    (export "3" (func $indirect-zoo:food/food@0.1.0-consume-food))
    (export "$imports" (table 0))
    (@producers
      (processed-by "wit-component" "0.227.1")
    )
  )
  (core module (;2;)
    (type (;0;) (func (param i32 f64 i32 i32 i32 i32 i32)))
    (type (;1;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;2;) (func (param i32 i32 i32 f32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32)))
    (type (;3;) (func (param i32)))
    (import "" "0" (func (;0;) (type 0)))
    (import "" "1" (func (;1;) (type 1)))
    (import "" "2" (func (;2;) (type 2)))
    (import "" "3" (func (;3;) (type 3)))
    (import "" "$imports" (table (;0;) 4 4 funcref))
    (elem (;0;) (i32.const 0) func 0 1 2 3)
    (@producers
      (processed-by "wit-component" "0.227.1")
    )
  )
  (core instance (;0;) (instantiate 1))
  (alias core export 0 "0" (core func (;0;)))
  (alias core export 0 "1" (core func (;1;)))
  (alias core export 0 "2" (core func (;2;)))
  (alias core export 0 "3" (core func (;3;)))
  (core instance (;1;)
    (export "open-package" (func 0))
    (export "trash-package" (func 1))
    (export "hide-food" (func 2))
    (export "consume-food" (func 3))
  )
  (core instance (;2;) (instantiate 0
      (with "zoo:food/food@0.1.0" (instance 1))
    )
  )
  (alias core export 2 "memory" (core memory (;0;)))
  (alias core export 0 "$imports" (core table (;0;)))
  (alias export 0 "open-package" (func (;0;)))
  (alias core export 2 "cabi_realloc" (core func (;4;)))
  (core func (;5;) (canon lower (func 0) (memory 0) string-encoding=utf8))
  (alias export 0 "trash-package" (func (;1;)))
  (core func (;6;) (canon lower (func 1) (memory 0) string-encoding=utf8))
  (alias export 0 "hide-food" (func (;2;)))
  (core func (;7;) (canon lower (func 2) (memory 0) string-encoding=utf8))
  (alias export 0 "consume-food" (func (;3;)))
  (core func (;8;) (canon lower (func 3) (memory 0) string-encoding=utf8))
  (core instance (;3;)
    (export "$imports" (table 0))
    (export "0" (func 5))
    (export "1" (func 6))
    (export "2" (func 7))
    (export "3" (func 8))
  )
  (core instance (;4;) (instantiate 2
      (with "" (instance 3))
    )
  )
  (alias export 0 "food-info" (type (;1;)))
  (alias export 0 "package-info" (type (;2;)))
  (type (;3;) (func (param "foodinfo" 1) (param "packageinfo" 2)))
  (alias core export 2 "zoo:food/eater@0.1.0#feed" (core func (;9;)))
  (func (;4;) (type 3) (canon lift (core func 9) (memory 0) (realloc 4) string-encoding=utf8))
  (alias export 0 "food-info" (type (;4;)))
  (alias export 0 "nutrition-type" (type (;5;)))
  (alias export 0 "nutrition-info" (type (;6;)))
  (alias export 0 "material-type" (type (;7;)))
  (alias export 0 "sealing-state" (type (;8;)))
  (alias export 0 "package-info" (type (;9;)))
  (component (;0;)
    (type (;0;) (tuple s8 u8))
    (type (;1;) (record (field "name" string) (field "iso-code" char) (field "weight" float32) (field "healthy" bool) (field "calories" u64) (field "cost" u16) (field "rating" s16) (field "pieces" u8) (field "shelf-temperature" 0) (field "cook-time-in-minutes" s32)))
    (import "import-type-food-info" (type (;2;) (eq 1)))
    (type (;3;) (enum "carbohyrdate" "protein" "vitamin"))
    (import "import-type-nutrition-type" (type (;4;) (eq 3)))
    (type (;5;) (record (field "percentage" float64) (field "nutrition-type" 4)))
    (import "import-type-nutrition-info" (type (;6;) (eq 5)))
    (type (;7;) (variant (case "plastic-bag") (case "metal-can")))
    (import "import-type-material-type" (type (;8;) (eq 7)))
    (type (;9;) (enum "opened" "closed" "damaged"))
    (import "import-type-sealing-state" (type (;10;) (eq 9)))
    (type (;11;) (record (field "nutrition" 6) (field "material" 8) (field "sealing" 10)))
    (import "import-type-package-info" (type (;12;) (eq 11)))
    (import "import-type-food-info0" (type (;13;) (eq 2)))
    (import "import-type-package-info0" (type (;14;) (eq 12)))
    (type (;15;) (func (param "foodinfo" 13) (param "packageinfo" 14)))
    (import "import-func-feed" (func (;0;) (type 15)))
    (export (;16;) "food-info" (type 2))
    (export (;17;) "package-info" (type 12))
    (type (;18;) (func (param "foodinfo" 16) (param "packageinfo" 17)))
    (export (;1;) "feed" (func 0) (func (type 18)))
  )
  (instance (;1;) (instantiate 0
      (with "import-func-feed" (func 4))
      (with "import-type-food-info" (type 4))
      (with "import-type-nutrition-type" (type 5))
      (with "import-type-nutrition-info" (type 6))
      (with "import-type-material-type" (type 7))
      (with "import-type-sealing-state" (type 8))
      (with "import-type-package-info" (type 9))
      (with "import-type-food-info0" (type 1))
      (with "import-type-package-info0" (type 2))
    )
  )
  (export (;2;) "zoo:food/eater@0.1.0" (instance 1))
  (@producers
    (processed-by "wit-component" "0.227.1")
    (processed-by "cargo-component" "0.21.1 (1495f61 2025-07-14)")
    (language "Rust" "")
  )
)