(component $hello
  (type (;0;)
    (instance
      (type (;0;) (record (field "name" string) (field "head-count" u32) (field "budget" s64)))
      (export (;1;) "city-info" (type (eq 0)))
      (type (;2;) (func (param "message" string)))
      (export (;0;) "send-message" (func (type 2)))
    )
  )
  (import "hello:city/city@0.1.0" (instance (;0;) (type 0)))
  (core module (;0;)
    (type (;0;) (func (param i32 i32) (result i32)))
    (type (;1;) (func (param i32 i32 i32) (result i32)))
    (type (;2;) (func (param i32 i32)))
    (type (;3;) (func (param i32 i32 i32 i32)))
    (type (;4;) (func))
    (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32)))
    (type (;7;) (func (param i32 i32 i32 i64)))
    (type (;8;) (func (param i32)))
    (type (;9;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
    (type (;10;) (func (param i32 i32 i32 i32 i32) (result i32)))
    (import "hello:city/city@0.1.0" "send-message" (func $_ZN5hello8bindings5hello4city4city12send_message11wit_import117h80d674a0cec8bbceE (;0;) (type 2)))
    (func $__wasm_call_ctors (;1;) (type 4))
    (func $_RNvCsdBezzDwma51_7___rustc14___rust_realloc (;2;) (type 5) (param i32 i32 i32 i32) (result i32)
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
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h6a8809a0ebefa6feE (;3;) (type 0) (param i32 i32) (result i32)
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
          i32.load offset=17756
          i32.store offset=8
          local.get 1
          local.get 0
          local.get 2
          i32.const 8
          i32.add
          i32.const 16728
          i32.const 1
          i32.const 2
          call $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E
          local.set 0
          i32.const 0
          local.get 2
          i32.load offset=8
          i32.store offset=17756
          br 1 (;@1;)
        end
        local.get 2
        i32.const 17756
        i32.store offset=4
        local.get 2
        local.get 3
        i32.const 2
        i32.shl
        local.tee 3
        i32.load offset=16732
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
        i32.store offset=16732
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E (;4;) (type 6) (param i32 i32 i32)
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
                    i32.load offset=17756
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
                  i32.load offset=16732
                  i32.store
                  local.get 2
                  local.get 0
                  i32.const -8
                  i32.add
                  local.tee 0
                  i32.store offset=16732
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
      i32.store offset=17756
    )
    (func $_ZN5hello8bindings40__link_custom_section_describing_imports17h94e6ae32db31611aE (;5;) (type 4))
    (func $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E (;6;) (type 0) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load offset=4
      local.get 0
      i32.load offset=8
      call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
    )
    (func $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E (;7;) (type 1) (param i32 i32 i32) (result i32)
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
    (func $hello:city/greeter@0.1.0#run (;8;) (type 7) (param i32 i32 i32 i64)
      (local i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      block ;; label = @1
        i32.const 0
        i32.load8_u offset=17780
        br_if 0 (;@1;)
        call $__wasm_call_ctors
        i32.const 0
        i32.const 1
        i32.store8 offset=17780
      end
      local.get 4
      local.get 1
      i32.store offset=16
      local.get 4
      local.get 0
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      local.get 2
      i32.store offset=20
      local.get 4
      local.get 3
      i64.store
      local.get 4
      i32.const 8
      i32.add
      local.set 1
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 3
            f64.convert_i64_s
            local.get 2
            f64.convert_i32_u
            f64.div
            f64.const 0x1.9p+6 (;=100;)
            f64.gt
            br_if 0 (;@3;)
            local.get 2
            i32.const 1000000
            i32.gt_u
            br_if 1 (;@2;)
            local.get 4
            i32.const 5
            i32.store offset=44
            local.get 4
            local.get 1
            i32.store offset=40
            local.get 4
            i32.const 28
            i32.add
            i32.const 16526
            local.get 4
            i32.const 40
            i32.add
            call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
            local.get 4
            i32.load offset=28
            local.set 2
            local.get 4
            i32.load offset=32
            local.tee 1
            local.get 4
            i32.load offset=36
            call $_ZN5hello8bindings5hello4city4city12send_message11wit_import117h80d674a0cec8bbceE
            local.get 2
            i32.eqz
            br_if 2 (;@1;)
            local.get 1
            i32.const 1
            local.get 2
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
            br 2 (;@1;)
          end
          local.get 4
          i32.const 5
          i32.store offset=44
          local.get 4
          local.get 1
          i32.store offset=40
          local.get 4
          i32.const 28
          i32.add
          i32.const 16483
          local.get 4
          i32.const 40
          i32.add
          call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
          local.get 4
          i32.load offset=28
          local.set 2
          local.get 4
          i32.load offset=32
          local.tee 1
          local.get 4
          i32.load offset=36
          call $_ZN5hello8bindings5hello4city4city12send_message11wit_import117h80d674a0cec8bbceE
          local.get 2
          i32.eqz
          br_if 1 (;@1;)
          local.get 1
          i32.const 1
          local.get 2
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
          br 1 (;@1;)
        end
        local.get 4
        i32.const 5
        i32.store offset=44
        local.get 4
        local.get 1
        i32.store offset=40
        local.get 4
        i32.const 28
        i32.add
        i32.const 16456
        local.get 4
        i32.const 40
        i32.add
        call $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E
        local.get 4
        i32.load offset=28
        local.set 2
        local.get 4
        i32.load offset=32
        local.tee 1
        local.get 4
        i32.load offset=36
        call $_ZN5hello8bindings5hello4city4city12send_message11wit_import117h80d674a0cec8bbceE
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 1
        i32.const 1
        local.get 2
        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
      end
      block ;; label = @1
        local.get 4
        i32.load offset=8
        local.tee 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 4
        i32.load offset=12
        i32.const 1
        local.get 2
        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17ha5fb01168569c016E
      end
      local.get 4
      i32.const 48
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc3fmt6format12format_inner17hfa268b37f2bfae95E (;9;) (type 6) (param i32 i32 i32)
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
          i32.const 16548
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
    (func $_ZN5alloc5alloc18handle_alloc_error17h7ab1a3ded05ec771E (;10;) (type 2) (param i32 i32)
      local.get 1
      local.get 0
      call $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler
      unreachable
    )
    (func $_RNvCsdBezzDwma51_7___rustc26___rust_alloc_error_handler (;11;) (type 2) (param i32 i32)
      local.get 1
      local.get 0
      call $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E
      unreachable
    )
    (func $_ZN5alloc7raw_vec12handle_error17h1e129ea5932d8aa8E (;12;) (type 2) (param i32 i32)
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
    (func $_ZN5alloc7raw_vec17capacity_overflow17hdde6cda57832ffc2E (;13;) (type 4)
      i32.const 16692
      i32.const 35
      i32.const 16712
      call $_ZN4core9panicking9panic_fmt17h806e647715990138E
      unreachable
    )
    (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$7reserve21do_reserve_and_handle17hca3eeb1f3c76a318E (;14;) (type 6) (param i32 i32 i32)
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
    (func $_ZN5alloc7raw_vec20RawVecInner$LT$A$GT$11finish_grow17h515e10d71c75ae0aE (;15;) (type 3) (param i32 i32 i32 i32)
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
    (func $_ZN4core9panicking9panic_fmt17h806e647715990138E (;16;) (type 6) (param i32 i32 i32)
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
    (func $_ZN4core3fmt5write17h57d28834308ddab7E (;17;) (type 5) (param i32 i32 i32 i32) (result i32)
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
    (func $_ZN4core6result13unwrap_failed17h28bb9ae37aca2287E (;18;) (type 8) (param i32)
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
      i32.const 16588
      i32.store
      local.get 1
      i32.const 16572
      i32.store offset=12
      local.get 1
      local.get 0
      i32.store offset=8
      local.get 1
      i32.const 6
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
      i32.const 7
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 1
      i64.extend_i32_u
      i64.or
      i64.store offset=16
      i32.const 16392
      local.get 1
      i32.const 16
      i32.add
      i32.const 16676
      call $_ZN4core9panicking9panic_fmt17h806e647715990138E
      unreachable
    )
    (func $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E (;19;) (type 0) (param i32 i32) (result i32)
      local.get 1
      i32.load
      i32.const 16542
      i32.const 5
      local.get 1
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 1)
    )
    (func $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E (;20;) (type 8) (param i32)
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
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E (;21;) (type 1) (param i32 i32 i32) (result i32)
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
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE (;22;) (type 0) (param i32 i32) (result i32)
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
    (func $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E (;23;) (type 1) (param i32 i32 i32) (result i32)
      local.get 0
      i32.const 16548
      local.get 1
      local.get 2
      call $_ZN4core3fmt5write17h57d28834308ddab7E
    )
    (func $_RNvCsdBezzDwma51_7___rustc17rust_begin_unwind (;24;) (type 8) (param i32)
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
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE (;25;) (type 0) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load
      local.get 0
      i32.load offset=4
      call $_ZN4core3fmt9Formatter3pad17h4629c8683eb45619E
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E (;26;) (type 0) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      local.get 0
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 0)
    )
    (func $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E (;27;) (type 2) (param i32 i32)
      local.get 0
      i32.const 0
      i32.store
    )
    (func $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E (;28;) (type 3) (param i32 i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      i32.const 0
      i32.const 0
      i32.load offset=17772
      local.tee 5
      i32.const 1
      i32.add
      i32.store offset=17772
      block ;; label = @1
        local.get 5
        i32.const 0
        i32.lt_s
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load8_u offset=17768
            br_if 0 (;@3;)
            i32.const 0
            i32.const 0
            i32.load offset=17764
            i32.const 1
            i32.add
            i32.store offset=17764
            i32.const 0
            i32.load offset=17776
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
          call_indirect (type 2)
          unreachable
        end
        i32.const 0
        i32.const 0
        i32.store8 offset=17768
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        call $_RNvCsdBezzDwma51_7___rustc10rust_panic
        unreachable
      end
      unreachable
    )
    (func $_RNvCsdBezzDwma51_7___rustc10rust_panic (;29;) (type 4)
      unreachable
    )
    (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h88020ccf76d2d661E (;30;) (type 8) (param i32)
      local.get 0
      call $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE
      unreachable
    )
    (func $_ZN3std9panicking13panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17hdf8d658790ccee4cE (;31;) (type 8) (param i32)
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
        i32.const 8
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
      i32.const 9
      local.get 0
      i32.load offset=8
      local.tee 0
      i32.load8_u offset=8
      local.get 0
      i32.load8_u offset=9
      call $_ZN3std9panicking15panic_with_hook17h51c5edeeb48e69d3E
      unreachable
    )
    (func $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E (;32;) (type 2) (param i32 i32)
      local.get 0
      local.get 1
      i64.load align=4
      i64.store
    )
    (func $_ZN3std5alloc8rust_oom17h2d70867a012ca8b8E (;33;) (type 2) (param i32 i32)
      local.get 0
      local.get 1
      call $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE
      unreachable
    )
    (func $_ZN3std3sys9backtrace26__rust_end_short_backtrace17h8fa691e23be9a1adE (;34;) (type 2) (param i32 i32)
      i32.const 0
      i32.const 1
      i32.store8 offset=17760
      unreachable
    )
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E (;35;) (type 3) (param i32 i32 i32 i32)
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
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE (;36;) (type 0) (param i32 i32) (result i32)
      i32.const 512
    )
    (func $_ZN9wee_alloc17alloc_with_refill17hf9e2abf53810d679E (;37;) (type 9) (param i32 i32 i32 i32 i32 i32) (result i32)
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
        call_indirect (type 3)
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
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E (;38;) (type 3) (param i32 i32 i32 i32)
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
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E (;39;) (type 0) (param i32 i32) (result i32)
      local.get 1
    )
    (func $_ZN9wee_alloc15alloc_first_fit17h4ccfc5123f04c83cE (;40;) (type 10) (param i32 i32 i32 i32 i32) (result i32)
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
    (func $cabi_realloc_wit_bindgen_0_24_0 (;41;) (type 5) (param i32 i32 i32 i32) (result i32)
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
    (func $cabi_realloc (;42;) (type 5) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $cabi_realloc_wit_bindgen_0_24_0
    )
    (table (;0;) 17 17 funcref)
    (memory (;0;) 1 10)
    (global $__stack_pointer (;0;) (mut i32) i32.const 16384)
    (global (;1;) i32 i32.const 17781)
    (global (;2;) i32 i32.const 17792)
    (export "memory" (memory 0))
    (export "hello:city/greeter@0.1.0#run" (func $hello:city/greeter@0.1.0#run))
    (export "cabi_realloc_wit_bindgen_0_24_0" (func $cabi_realloc_wit_bindgen_0_24_0))
    (export "cabi_realloc" (func $cabi_realloc))
    (export "__data_end" (global 1))
    (export "__heap_base" (global 2))
    (elem (;0;) (i32.const 1) func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd0b8a1b1ae9cb167E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h46ef81435b46877dE $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h462ad1d8f6effcf7E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h4761b5d314e58517E $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17hb758933c73d698d9E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h1f8c447cc5fddbd2E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb242ba8e0a99e7ebE $_ZN4core5panic12PanicPayload6as_str17h03adfd6584a68df8E $_ZN93_$LT$std..panicking..panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$6as_str17hca9d7ce818ccbef9E $_ZN5hello8bindings40__link_custom_section_describing_imports17h94e6ae32db31611aE $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17h43331b38240f9429E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h5e2146c598670080E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hf35eb0dc49290c0fE $_ZN4core3fmt5Write9write_fmt17h15e242451b1aa5d6E $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17ha43f43b23d980ff2E $cabi_realloc)
    (data $.rodata (;0;) (i32.const 16384) "\0a\00\00\00\0a\00\00\00\c0\02: \c0\00library/alloc/src/fmt.rs\00library/alloc/src/raw_vec/mod.rs\00\0bWelcome to \c0\0c mega polis!\00\0bWelcome to \c0\1c, we invite you for a drink!\00\0bWelcome to \c0\01!\00Error\00\0b\00\00\00\0c\00\00\00\04\00\00\00\0c\00\00\00\0d\00\00\00\0e\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00\0f\00\00\00a formatting trait implementation returned an error when the underlying stream did not\00\00\0e@\00\00\18\00\00\00\8a\02\00\00\0e\00\00\00capacity overflow\00\00\00'@\00\00 \00\00\00\1c\00\00\00\05\00\00\00\10\00\00\00")
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.93.1 (01f6ddf75 2026-02-11)")
      (processed-by "wit-component" "0.227.1")
      (processed-by "wit-bindgen-rust" "0.41.0")
    )
  )
  (core module (;1;)
    (type (;0;) (func (param i32 i32)))
    (func $indirect-hello:city/city@0.1.0-send-message (;0;) (type 0) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 0
      call_indirect (type 0)
    )
    (table (;0;) 1 1 funcref)
    (export "0" (func $indirect-hello:city/city@0.1.0-send-message))
    (export "$imports" (table 0))
    (@producers
      (processed-by "wit-component" "0.227.1")
    )
  )
  (core module (;2;)
    (type (;0;) (func (param i32 i32)))
    (import "" "0" (func (;0;) (type 0)))
    (import "" "$imports" (table (;0;) 1 1 funcref))
    (elem (;0;) (i32.const 0) func 0)
    (@producers
      (processed-by "wit-component" "0.227.1")
    )
  )
  (core instance (;0;) (instantiate 1))
  (alias core export 0 "0" (core func (;0;)))
  (core instance (;1;)
    (export "send-message" (func 0))
  )
  (core instance (;2;) (instantiate 0
      (with "hello:city/city@0.1.0" (instance 1))
    )
  )
  (alias core export 2 "memory" (core memory (;0;)))
  (alias core export 0 "$imports" (core table (;0;)))
  (alias export 0 "send-message" (func (;0;)))
  (alias core export 2 "cabi_realloc" (core func (;1;)))
  (core func (;2;) (canon lower (func 0) (memory 0) string-encoding=utf8))
  (core instance (;3;)
    (export "$imports" (table 0))
    (export "0" (func 2))
  )
  (core instance (;4;) (instantiate 2
      (with "" (instance 3))
    )
  )
  (alias export 0 "city-info" (type (;1;)))
  (type (;2;) (func (param "info" 1)))
  (alias core export 2 "hello:city/greeter@0.1.0#run" (core func (;3;)))
  (func (;1;) (type 2) (canon lift (core func 3) (memory 0) (realloc 1) string-encoding=utf8))
  (alias export 0 "city-info" (type (;3;)))
  (component (;0;)
    (type (;0;) (record (field "name" string) (field "head-count" u32) (field "budget" s64)))
    (import "import-type-city-info" (type (;1;) (eq 0)))
    (import "import-type-city-info0" (type (;2;) (eq 1)))
    (type (;3;) (func (param "info" 2)))
    (import "import-func-run" (func (;0;) (type 3)))
    (export (;4;) "city-info" (type 1))
    (type (;5;) (func (param "info" 4)))
    (export (;1;) "run" (func 0) (func (type 5)))
  )
  (instance (;1;) (instantiate 0
      (with "import-func-run" (func 1))
      (with "import-type-city-info" (type 3))
      (with "import-type-city-info0" (type 1))
    )
  )
  (export (;2;) "hello:city/greeter@0.1.0" (instance 1))
  (@producers
    (processed-by "wit-component" "0.227.1")
    (processed-by "cargo-component" "0.21.1 (1495f61 2025-07-14)")
    (language "Rust" "")
  )
)