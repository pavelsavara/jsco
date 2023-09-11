(component
  (type (;0;)
    (instance
      (type (;0;) (record (field "name" string)))
      (export (;1;) "city-info" (type (eq 0)))
      (type (;2;) (func (param "message" string)))
      (export (;0;) "send-message" (func (type 2)))
    )
  )
  (import (interface "hello:city/city") (instance (;0;) (type 0)))
  (core module (;0;)
    (type $.rodata (;0;) (func (param i32 i32 i32) (result i32)))
    (type (;1;) (func (param i32 i32) (result i32)))
    (type (;2;) (func (param i32 i32 i32 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func))
    (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32)))
    (type (;7;) (func (param i32)))
    (type (;8;) (func (param i32 i32 i32 i32 i32) (result i32)))
    (type (;9;) (func (param i32) (result i32)))
    (import "hello:city/city" "send-message" (func $_ZN5hello8bindings5hello4city4city12send_message10wit_import17h343b5b83f1ee0a7bE (;0;) (type 3)))
    (func $__wasm_call_ctors (;1;) (type 4))
    (func $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17he8cd3ece0b998a29E (;2;) (type 1) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load
      local.get 0
      i32.load offset=8
      call $_ZN4core3fmt9Formatter3pad17h0b6da8b5646917dcE
    )
    (func $_ZN4core3fmt9Formatter3pad17h0b6da8b5646917dcE (;3;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 0
            i32.load
            local.tee 3
            local.get 0
            i32.load offset=8
            local.tee 4
            i32.or
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 4
              i32.eqz
              br_if 0 (;@4;)
              local.get 1
              local.get 2
              i32.add
              local.set 5
              local.get 0
              i32.const 12
              i32.add
              i32.load
              i32.const 1
              i32.add
              local.set 6
              i32.const 0
              local.set 7
              local.get 1
              local.set 8
              block ;; label = @5
                loop ;; label = @6
                  local.get 8
                  local.set 4
                  local.get 6
                  i32.const -1
                  i32.add
                  local.tee 6
                  i32.eqz
                  br_if 1 (;@5;)
                  local.get 4
                  local.get 5
                  i32.eq
                  br_if 2 (;@4;)
                  block ;; label = @7
                    block ;; label = @8
                      local.get 4
                      i32.load8_s
                      local.tee 9
                      i32.const -1
                      i32.le_s
                      br_if 0 (;@8;)
                      local.get 4
                      i32.const 1
                      i32.add
                      local.set 8
                      local.get 9
                      i32.const 255
                      i32.and
                      local.set 9
                      br 1 (;@7;)
                    end
                    local.get 4
                    i32.load8_u offset=1
                    i32.const 63
                    i32.and
                    local.set 10
                    local.get 9
                    i32.const 31
                    i32.and
                    local.set 8
                    block ;; label = @8
                      local.get 9
                      i32.const -33
                      i32.gt_u
                      br_if 0 (;@8;)
                      local.get 8
                      i32.const 6
                      i32.shl
                      local.get 10
                      i32.or
                      local.set 9
                      local.get 4
                      i32.const 2
                      i32.add
                      local.set 8
                      br 1 (;@7;)
                    end
                    local.get 10
                    i32.const 6
                    i32.shl
                    local.get 4
                    i32.load8_u offset=2
                    i32.const 63
                    i32.and
                    i32.or
                    local.set 10
                    block ;; label = @8
                      local.get 9
                      i32.const -16
                      i32.ge_u
                      br_if 0 (;@8;)
                      local.get 10
                      local.get 8
                      i32.const 12
                      i32.shl
                      i32.or
                      local.set 9
                      local.get 4
                      i32.const 3
                      i32.add
                      local.set 8
                      br 1 (;@7;)
                    end
                    local.get 10
                    i32.const 6
                    i32.shl
                    local.get 4
                    i32.load8_u offset=3
                    i32.const 63
                    i32.and
                    i32.or
                    local.get 8
                    i32.const 18
                    i32.shl
                    i32.const 1835008
                    i32.and
                    i32.or
                    local.tee 9
                    i32.const 1114112
                    i32.eq
                    br_if 3 (;@4;)
                    local.get 4
                    i32.const 4
                    i32.add
                    local.set 8
                  end
                  local.get 7
                  local.get 4
                  i32.sub
                  local.get 8
                  i32.add
                  local.set 7
                  local.get 9
                  i32.const 1114112
                  i32.ne
                  br_if 0 (;@6;)
                  br 2 (;@4;)
                end
              end
              local.get 4
              local.get 5
              i32.eq
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 4
                i32.load8_s
                local.tee 8
                i32.const -1
                i32.gt_s
                br_if 0 (;@5;)
                local.get 8
                i32.const -32
                i32.lt_u
                br_if 0 (;@5;)
                local.get 8
                i32.const -16
                i32.lt_u
                br_if 0 (;@5;)
                local.get 4
                i32.load8_u offset=2
                i32.const 63
                i32.and
                i32.const 6
                i32.shl
                local.get 4
                i32.load8_u offset=1
                i32.const 63
                i32.and
                i32.const 12
                i32.shl
                i32.or
                local.get 4
                i32.load8_u offset=3
                i32.const 63
                i32.and
                i32.or
                local.get 8
                i32.const 255
                i32.and
                i32.const 18
                i32.shl
                i32.const 1835008
                i32.and
                i32.or
                i32.const 1114112
                i32.eq
                br_if 1 (;@4;)
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 7
                  i32.eqz
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 7
                    local.get 2
                    i32.lt_u
                    br_if 0 (;@7;)
                    i32.const 0
                    local.set 4
                    local.get 7
                    local.get 2
                    i32.eq
                    br_if 1 (;@6;)
                    br 2 (;@5;)
                  end
                  i32.const 0
                  local.set 4
                  local.get 1
                  local.get 7
                  i32.add
                  i32.load8_s
                  i32.const -64
                  i32.lt_s
                  br_if 1 (;@5;)
                end
                local.get 1
                local.set 4
              end
              local.get 7
              local.get 2
              local.get 4
              select
              local.set 2
              local.get 4
              local.get 1
              local.get 4
              select
              local.set 1
            end
            block ;; label = @4
              local.get 3
              br_if 0 (;@4;)
              local.get 0
              i32.load offset=20
              local.get 1
              local.get 2
              local.get 0
              i32.const 24
              i32.add
              i32.load
              i32.load offset=12
              call_indirect (type $.rodata)
              return
            end
            local.get 0
            i32.load offset=4
            local.set 11
            block ;; label = @4
              local.get 2
              i32.const 16
              i32.lt_u
              br_if 0 (;@4;)
              local.get 2
              local.get 1
              i32.const 3
              i32.add
              i32.const -4
              i32.and
              local.tee 9
              local.get 1
              i32.sub
              local.tee 8
              i32.sub
              local.tee 3
              i32.const 3
              i32.and
              local.set 5
              i32.const 0
              local.set 10
              i32.const 0
              local.set 4
              block ;; label = @5
                local.get 9
                local.get 1
                i32.eq
                br_if 0 (;@5;)
                local.get 8
                i32.const 3
                i32.and
                local.set 7
                i32.const 0
                local.set 4
                block ;; label = @6
                  local.get 9
                  local.get 1
                  i32.const -1
                  i32.xor
                  i32.add
                  i32.const 3
                  i32.lt_u
                  br_if 0 (;@6;)
                  i32.const 0
                  local.set 6
                  loop ;; label = @7
                    local.get 4
                    local.get 1
                    local.get 6
                    i32.add
                    local.tee 8
                    i32.load8_s
                    i32.const -65
                    i32.gt_s
                    i32.add
                    local.get 8
                    i32.const 1
                    i32.add
                    i32.load8_s
                    i32.const -65
                    i32.gt_s
                    i32.add
                    local.get 8
                    i32.const 2
                    i32.add
                    i32.load8_s
                    i32.const -65
                    i32.gt_s
                    i32.add
                    local.get 8
                    i32.const 3
                    i32.add
                    i32.load8_s
                    i32.const -65
                    i32.gt_s
                    i32.add
                    local.set 4
                    local.get 6
                    i32.const 4
                    i32.add
                    local.tee 6
                    br_if 0 (;@7;)
                  end
                end
                local.get 7
                i32.eqz
                br_if 0 (;@5;)
                local.get 1
                local.set 8
                loop ;; label = @6
                  local.get 4
                  local.get 8
                  i32.load8_s
                  i32.const -65
                  i32.gt_s
                  i32.add
                  local.set 4
                  local.get 8
                  i32.const 1
                  i32.add
                  local.set 8
                  local.get 7
                  i32.const -1
                  i32.add
                  local.tee 7
                  br_if 0 (;@6;)
                end
              end
              block ;; label = @5
                local.get 5
                i32.eqz
                br_if 0 (;@5;)
                local.get 9
                local.get 3
                i32.const -4
                i32.and
                i32.add
                local.tee 8
                i32.load8_s
                i32.const -65
                i32.gt_s
                local.set 10
                local.get 5
                i32.const 1
                i32.eq
                br_if 0 (;@5;)
                local.get 10
                local.get 8
                i32.load8_s offset=1
                i32.const -65
                i32.gt_s
                i32.add
                local.set 10
                local.get 5
                i32.const 2
                i32.eq
                br_if 0 (;@5;)
                local.get 10
                local.get 8
                i32.load8_s offset=2
                i32.const -65
                i32.gt_s
                i32.add
                local.set 10
              end
              local.get 3
              i32.const 2
              i32.shr_u
              local.set 5
              local.get 10
              local.get 4
              i32.add
              local.set 7
              loop ;; label = @5
                local.get 9
                local.set 3
                local.get 5
                i32.eqz
                br_if 4 (;@1;)
                local.get 5
                i32.const 192
                local.get 5
                i32.const 192
                i32.lt_u
                select
                local.tee 10
                i32.const 3
                i32.and
                local.set 12
                local.get 10
                i32.const 2
                i32.shl
                local.set 13
                block ;; label = @6
                  block ;; label = @7
                    local.get 10
                    i32.const 252
                    i32.and
                    local.tee 14
                    br_if 0 (;@7;)
                    i32.const 0
                    local.set 8
                    br 1 (;@6;)
                  end
                  local.get 3
                  local.get 14
                  i32.const 2
                  i32.shl
                  i32.add
                  local.set 6
                  i32.const 0
                  local.set 8
                  local.get 3
                  local.set 4
                  loop ;; label = @7
                    local.get 4
                    i32.eqz
                    br_if 1 (;@6;)
                    local.get 4
                    i32.const 12
                    i32.add
                    i32.load
                    local.tee 9
                    i32.const -1
                    i32.xor
                    i32.const 7
                    i32.shr_u
                    local.get 9
                    i32.const 6
                    i32.shr_u
                    i32.or
                    i32.const 16843009
                    i32.and
                    local.get 4
                    i32.const 8
                    i32.add
                    i32.load
                    local.tee 9
                    i32.const -1
                    i32.xor
                    i32.const 7
                    i32.shr_u
                    local.get 9
                    i32.const 6
                    i32.shr_u
                    i32.or
                    i32.const 16843009
                    i32.and
                    local.get 4
                    i32.const 4
                    i32.add
                    i32.load
                    local.tee 9
                    i32.const -1
                    i32.xor
                    i32.const 7
                    i32.shr_u
                    local.get 9
                    i32.const 6
                    i32.shr_u
                    i32.or
                    i32.const 16843009
                    i32.and
                    local.get 4
                    i32.load
                    local.tee 9
                    i32.const -1
                    i32.xor
                    i32.const 7
                    i32.shr_u
                    local.get 9
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
                    local.get 4
                    i32.const 16
                    i32.add
                    local.tee 4
                    local.get 6
                    i32.ne
                    br_if 0 (;@7;)
                  end
                end
                local.get 5
                local.get 10
                i32.sub
                local.set 5
                local.get 3
                local.get 13
                i32.add
                local.set 9
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
                local.get 7
                i32.add
                local.set 7
                local.get 12
                i32.eqz
                br_if 0 (;@5;)
              end
              block ;; label = @5
                local.get 3
                br_if 0 (;@5;)
                i32.const 0
                local.set 4
                br 3 (;@2;)
              end
              local.get 3
              local.get 14
              i32.const 2
              i32.shl
              i32.add
              local.tee 8
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
              local.set 4
              local.get 12
              i32.const 1
              i32.eq
              br_if 2 (;@2;)
              local.get 8
              i32.load offset=4
              local.tee 9
              i32.const -1
              i32.xor
              i32.const 7
              i32.shr_u
              local.get 9
              i32.const 6
              i32.shr_u
              i32.or
              i32.const 16843009
              i32.and
              local.get 4
              i32.add
              local.set 4
              local.get 12
              i32.const 2
              i32.eq
              br_if 2 (;@2;)
              local.get 8
              i32.load offset=8
              local.tee 8
              i32.const -1
              i32.xor
              i32.const 7
              i32.shr_u
              local.get 8
              i32.const 6
              i32.shr_u
              i32.or
              i32.const 16843009
              i32.and
              local.get 4
              i32.add
              local.set 4
              br 2 (;@2;)
            end
            block ;; label = @4
              local.get 2
              br_if 0 (;@4;)
              i32.const 0
              local.set 7
              br 3 (;@1;)
            end
            local.get 2
            i32.const 3
            i32.and
            local.set 8
            block ;; label = @4
              block ;; label = @5
                local.get 2
                i32.const 4
                i32.ge_u
                br_if 0 (;@5;)
                i32.const 0
                local.set 7
                i32.const 0
                local.set 6
                br 1 (;@4;)
              end
              i32.const 0
              local.set 7
              local.get 1
              local.set 4
              local.get 2
              i32.const -4
              i32.and
              local.tee 6
              local.set 9
              loop ;; label = @5
                local.get 7
                local.get 4
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 4
                i32.const 1
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 4
                i32.const 2
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 4
                i32.const 3
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.set 7
                local.get 4
                i32.const 4
                i32.add
                local.set 4
                local.get 9
                i32.const -4
                i32.add
                local.tee 9
                br_if 0 (;@5;)
              end
            end
            local.get 8
            i32.eqz
            br_if 2 (;@1;)
            local.get 1
            local.get 6
            i32.add
            local.set 4
            loop ;; label = @4
              local.get 7
              local.get 4
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.set 7
              local.get 4
              i32.const 1
              i32.add
              local.set 4
              local.get 8
              i32.const -1
              i32.add
              local.tee 8
              br_if 0 (;@4;)
              br 3 (;@1;)
            end
          end
          local.get 0
          i32.load offset=20
          local.get 1
          local.get 2
          local.get 0
          i32.const 24
          i32.add
          i32.load
          i32.load offset=12
          call_indirect (type $.rodata)
          return
        end
        local.get 4
        i32.const 8
        i32.shr_u
        i32.const 459007
        i32.and
        local.get 4
        i32.const 16711935
        i32.and
        i32.add
        i32.const 65537
        i32.mul
        i32.const 16
        i32.shr_u
        local.get 7
        i32.add
        local.set 7
      end
      block ;; label = @1
        local.get 11
        local.get 7
        i32.le_u
        br_if 0 (;@1;)
        i32.const 0
        local.set 4
        local.get 11
        local.get 7
        i32.sub
        local.tee 8
        local.set 7
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.load8_u offset=32
              br_table 2 (;@2;) 0 (;@4;) 1 (;@3;) 2 (;@2;) 2 (;@2;)
            end
            i32.const 0
            local.set 7
            local.get 8
            local.set 4
            br 1 (;@2;)
          end
          local.get 8
          i32.const 1
          i32.shr_u
          local.set 4
          local.get 8
          i32.const 1
          i32.add
          i32.const 1
          i32.shr_u
          local.set 7
        end
        local.get 4
        i32.const 1
        i32.add
        local.set 4
        local.get 0
        i32.const 24
        i32.add
        i32.load
        local.set 9
        local.get 0
        i32.const 20
        i32.add
        i32.load
        local.set 6
        local.get 0
        i32.load offset=16
        local.set 8
        block ;; label = @2
          loop ;; label = @3
            local.get 4
            i32.const -1
            i32.add
            local.tee 4
            i32.eqz
            br_if 1 (;@2;)
            local.get 6
            local.get 8
            local.get 9
            i32.load offset=16
            call_indirect (type 1)
            i32.eqz
            br_if 0 (;@3;)
          end
          i32.const 1
          return
        end
        i32.const 1
        local.set 4
        block ;; label = @2
          local.get 8
          i32.const 1114112
          i32.eq
          br_if 0 (;@2;)
          local.get 6
          local.get 1
          local.get 2
          local.get 9
          i32.load offset=12
          call_indirect (type $.rodata)
          br_if 0 (;@2;)
          i32.const 0
          local.set 4
          block ;; label = @3
            loop ;; label = @4
              block ;; label = @5
                local.get 7
                local.get 4
                i32.ne
                br_if 0 (;@5;)
                local.get 7
                local.set 4
                br 2 (;@3;)
              end
              local.get 4
              i32.const 1
              i32.add
              local.set 4
              local.get 6
              local.get 8
              local.get 9
              i32.load offset=16
              call_indirect (type 1)
              i32.eqz
              br_if 0 (;@4;)
            end
            local.get 4
            i32.const -1
            i32.add
            local.set 4
          end
          local.get 4
          local.get 7
          i32.lt_u
          local.set 4
        end
        local.get 4
        return
      end
      local.get 0
      i32.load offset=20
      local.get 1
      local.get 2
      local.get 0
      i32.const 24
      i32.add
      i32.load
      i32.load offset=12
      call_indirect (type $.rodata)
    )
    (func $__rust_realloc (;4;) (type 5) (param i32 i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        local.get 2
        local.get 3
        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E
        local.tee 4
        i32.eqz
        br_if 0 (;@1;)
        local.get 4
        local.get 0
        local.get 1
        local.get 3
        local.get 1
        local.get 3
        i32.lt_u
        select
        call $memcpy
        drop
        local.get 0
        local.get 2
        local.get 1
        call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17h99d2ac0baabef269E
      end
      local.get 4
    )
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E (;5;) (type 1) (param i32 i32) (result i32)
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
          local.get 0
          i32.const 5
          i32.ge_u
          br_if 0 (;@2;)
          local.get 1
          i32.const -1
          i32.add
          local.tee 3
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 2
          i32.const 17824
          i32.store offset=4
          local.get 2
          local.get 3
          i32.const 2
          i32.shl
          i32.const 16800
          i32.add
          local.tee 3
          i32.load
          i32.store offset=12
          local.get 1
          local.get 0
          local.get 2
          i32.const 12
          i32.add
          local.get 2
          i32.const 4
          i32.add
          i32.const 16752
          call $_ZN9wee_alloc17alloc_with_refill17h2cac2b5012f8a08cE
          local.set 0
          local.get 3
          local.get 2
          i32.load offset=12
          i32.store
          br 1 (;@1;)
        end
        local.get 2
        i32.const 0
        i32.load offset=17824
        i32.store offset=8
        local.get 1
        local.get 0
        local.get 2
        i32.const 8
        i32.add
        i32.const 16752
        i32.const 16776
        call $_ZN9wee_alloc17alloc_with_refill17h2cac2b5012f8a08cE
        local.set 0
        i32.const 0
        local.get 2
        i32.load offset=8
        i32.store offset=17824
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17h99d2ac0baabef269E (;6;) (type 6) (param i32 i32 i32)
      (local i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          i32.const 5
          i32.ge_u
          br_if 1 (;@1;)
          local.get 2
          i32.const 3
          i32.add
          i32.const 2
          i32.shr_u
          i32.const -1
          i32.add
          local.tee 1
          i32.const 255
          i32.gt_u
          br_if 1 (;@1;)
          local.get 0
          local.get 1
          i32.const 2
          i32.shl
          i32.const 16800
          i32.add
          local.tee 1
          i32.load
          i32.store
          local.get 0
          i32.const -8
          i32.add
          local.tee 0
          local.get 0
          i32.load
          i32.const -2
          i32.and
          i32.store
          local.get 1
          local.get 0
          i32.store
        end
        return
      end
      local.get 0
      i32.const 0
      i32.store
      local.get 0
      i32.const -8
      i32.add
      local.tee 1
      local.get 1
      i32.load
      local.tee 2
      i32.const -2
      i32.and
      i32.store
      i32.const 0
      i32.load offset=17824
      local.set 3
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 1
                  i32.const 4
                  i32.add
                  local.tee 4
                  i32.load
                  i32.const -4
                  i32.and
                  local.tee 5
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 5
                  i32.load
                  local.tee 6
                  i32.const 1
                  i32.and
                  br_if 0 (;@6;)
                  local.get 2
                  i32.const -4
                  i32.and
                  local.tee 0
                  i32.eqz
                  br_if 1 (;@5;)
                  local.get 2
                  i32.const 2
                  i32.and
                  br_if 1 (;@5;)
                  local.get 0
                  local.get 0
                  i32.load offset=4
                  i32.const 3
                  i32.and
                  local.get 5
                  i32.or
                  i32.store offset=4
                  local.get 4
                  i32.load
                  local.tee 0
                  i32.const -4
                  i32.and
                  local.tee 2
                  i32.eqz
                  br_if 3 (;@3;)
                  local.get 1
                  i32.load
                  i32.const -4
                  i32.and
                  local.set 0
                  local.get 2
                  i32.load
                  local.set 6
                  br 2 (;@4;)
                end
                block ;; label = @6
                  block ;; label = @7
                    local.get 2
                    i32.const -4
                    i32.and
                    local.tee 5
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 2
                    i32.const 2
                    i32.and
                    br_if 0 (;@7;)
                    local.get 5
                    i32.load8_u
                    i32.const 1
                    i32.and
                    i32.eqz
                    br_if 1 (;@6;)
                  end
                  local.get 0
                  local.get 3
                  i32.store
                  br 5 (;@1;)
                end
                local.get 0
                local.get 5
                i32.load offset=8
                i32.const -4
                i32.and
                i32.store
                local.get 5
                local.get 1
                i32.const 1
                i32.or
                i32.store offset=8
                br 3 (;@2;)
              end
              local.get 5
              local.set 2
            end
            local.get 2
            local.get 6
            i32.const 3
            i32.and
            local.get 0
            i32.or
            i32.store
            local.get 4
            i32.load
            local.set 0
          end
          local.get 4
          local.get 0
          i32.const 3
          i32.and
          i32.store
          local.get 1
          local.get 1
          i32.load
          local.tee 0
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
        local.set 1
      end
      i32.const 0
      local.get 1
      i32.store offset=17824
    )
    (func $hello:city/greeter#run (;7;) (type 3) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        i32.const 0
        i32.load8_u offset=17842
        br_if 0 (;@1;)
        call $__wasm_call_ctors
        i32.const 0
        i32.const 1
        i32.store8 offset=17842
      end
      local.get 2
      local.get 1
      i32.store offset=8
      local.get 2
      local.get 1
      i32.store offset=4
      local.get 2
      local.get 0
      i32.store
      local.get 2
      i32.const 1
      i32.store offset=20
      i32.const 0
      i32.load8_u offset=17841
      drop
      local.get 2
      local.get 2
      i32.store offset=16
      block ;; label = @1
        block ;; label = @2
          i32.const 1
          i32.const 34
          call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E
          local.tee 1
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          i64.const 34
          i64.store offset=28 align=4
          local.get 2
          local.get 1
          i32.store offset=24
          local.get 2
          local.get 2
          i32.const 24
          i32.add
          i32.store offset=36
          local.get 2
          i64.const 1
          i64.store offset=52 align=4
          local.get 2
          i32.const 2
          i32.store offset=44
          local.get 2
          i32.const 16404
          i32.store offset=40
          local.get 2
          local.get 2
          i32.const 16
          i32.add
          i32.store offset=48
          local.get 2
          i32.const 36
          i32.add
          i32.const 16420
          local.get 2
          i32.const 40
          i32.add
          call $_ZN4core3fmt5write17hce4d120ebbfb2b82E
          br_if 1 (;@1;)
          local.get 2
          i32.load offset=28
          local.set 1
          local.get 2
          i32.load offset=24
          local.tee 0
          local.get 2
          i32.load offset=32
          call $_ZN5hello8bindings5hello4city4city12send_message10wit_import17h343b5b83f1ee0a7bE
          block ;; label = @3
            local.get 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            i32.const 1
            local.get 1
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17h99d2ac0baabef269E
          end
          block ;; label = @3
            local.get 2
            i32.load offset=4
            local.tee 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 2
            i32.load
            i32.const 1
            local.get 1
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$7dealloc17h99d2ac0baabef269E
          end
          local.get 2
          i32.const 64
          i32.add
          global.set $__stack_pointer
          return
        end
        unreachable
        unreachable
      end
      local.get 2
      i32.const 40
      i32.add
      call $_ZN4core6result13unwrap_failed17h7ed8731a69ab17a3E
      unreachable
    )
    (func $_ZN4core3fmt5write17hce4d120ebbfb2b82E (;8;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 32
      i32.add
      local.get 1
      i32.store
      local.get 3
      i32.const 3
      i32.store8 offset=40
      local.get 3
      i32.const 32
      i32.store offset=24
      i32.const 0
      local.set 4
      local.get 3
      i32.const 0
      i32.store offset=36
      local.get 3
      local.get 0
      i32.store offset=28
      local.get 3
      i32.const 0
      i32.store offset=16
      local.get 3
      i32.const 0
      i32.store offset=8
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.load offset=16
              local.tee 5
              br_if 0 (;@4;)
              local.get 2
              i32.const 12
              i32.add
              i32.load
              local.tee 0
              i32.eqz
              br_if 1 (;@3;)
              local.get 2
              i32.load offset=8
              local.set 1
              local.get 0
              i32.const 3
              i32.shl
              local.set 6
              local.get 0
              i32.const -1
              i32.add
              i32.const 536870911
              i32.and
              i32.const 1
              i32.add
              local.set 4
              local.get 2
              i32.load
              local.set 0
              loop ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.const 4
                  i32.add
                  i32.load
                  local.tee 7
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 3
                  i32.load offset=28
                  local.get 0
                  i32.load
                  local.get 7
                  local.get 3
                  i32.load offset=32
                  i32.load offset=12
                  call_indirect (type $.rodata)
                  br_if 4 (;@2;)
                end
                local.get 1
                i32.load
                local.get 3
                i32.const 8
                i32.add
                local.get 1
                i32.const 4
                i32.add
                i32.load
                call_indirect (type 1)
                br_if 3 (;@2;)
                local.get 1
                i32.const 8
                i32.add
                local.set 1
                local.get 0
                i32.const 8
                i32.add
                local.set 0
                local.get 6
                i32.const -8
                i32.add
                local.tee 6
                br_if 0 (;@5;)
                br 2 (;@3;)
              end
            end
            local.get 2
            i32.const 20
            i32.add
            i32.load
            local.tee 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 1
            i32.const 5
            i32.shl
            local.set 8
            local.get 1
            i32.const -1
            i32.add
            i32.const 134217727
            i32.and
            i32.const 1
            i32.add
            local.set 4
            local.get 2
            i32.load
            local.set 0
            i32.const 0
            local.set 6
            loop ;; label = @4
              block ;; label = @5
                local.get 0
                i32.const 4
                i32.add
                i32.load
                local.tee 1
                i32.eqz
                br_if 0 (;@5;)
                local.get 3
                i32.load offset=28
                local.get 0
                i32.load
                local.get 1
                local.get 3
                i32.load offset=32
                i32.load offset=12
                call_indirect (type $.rodata)
                br_if 3 (;@2;)
              end
              local.get 3
              local.get 5
              local.get 6
              i32.add
              local.tee 1
              i32.const 16
              i32.add
              i32.load
              i32.store offset=24
              local.get 3
              local.get 1
              i32.const 28
              i32.add
              i32.load8_u
              i32.store8 offset=40
              local.get 3
              local.get 1
              i32.const 24
              i32.add
              i32.load
              i32.store offset=36
              local.get 1
              i32.const 12
              i32.add
              i32.load
              local.set 9
              local.get 2
              i32.load offset=8
              local.set 10
              i32.const 0
              local.set 11
              i32.const 0
              local.set 7
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    local.get 1
                    i32.const 8
                    i32.add
                    i32.load
                    br_table 1 (;@6;) 0 (;@7;) 2 (;@5;) 1 (;@6;)
                  end
                  local.get 9
                  i32.const 3
                  i32.shl
                  local.set 12
                  i32.const 0
                  local.set 7
                  local.get 10
                  local.get 12
                  i32.add
                  local.tee 12
                  i32.load offset=4
                  i32.const 2
                  i32.ne
                  br_if 1 (;@5;)
                  local.get 12
                  i32.load
                  i32.load
                  local.set 9
                end
                i32.const 1
                local.set 7
              end
              local.get 3
              local.get 9
              i32.store offset=12
              local.get 3
              local.get 7
              i32.store offset=8
              local.get 1
              i32.const 4
              i32.add
              i32.load
              local.set 7
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    local.get 1
                    i32.load
                    br_table 1 (;@6;) 0 (;@7;) 2 (;@5;) 1 (;@6;)
                  end
                  local.get 7
                  i32.const 3
                  i32.shl
                  local.set 9
                  local.get 10
                  local.get 9
                  i32.add
                  local.tee 9
                  i32.load offset=4
                  i32.const 2
                  i32.ne
                  br_if 1 (;@5;)
                  local.get 9
                  i32.load
                  i32.load
                  local.set 7
                end
                i32.const 1
                local.set 11
              end
              local.get 3
              local.get 7
              i32.store offset=20
              local.get 3
              local.get 11
              i32.store offset=16
              local.get 10
              local.get 1
              i32.const 20
              i32.add
              i32.load
              i32.const 3
              i32.shl
              i32.add
              local.tee 1
              i32.load
              local.get 3
              i32.const 8
              i32.add
              local.get 1
              i32.load offset=4
              call_indirect (type 1)
              br_if 2 (;@2;)
              local.get 0
              i32.const 8
              i32.add
              local.set 0
              local.get 8
              local.get 6
              i32.const 32
              i32.add
              local.tee 6
              i32.ne
              br_if 0 (;@4;)
            end
          end
          block ;; label = @3
            local.get 4
            local.get 2
            i32.load offset=4
            i32.ge_u
            br_if 0 (;@3;)
            local.get 3
            i32.load offset=28
            local.get 2
            i32.load
            local.get 4
            i32.const 3
            i32.shl
            i32.add
            local.tee 1
            i32.load
            local.get 1
            i32.load offset=4
            local.get 3
            i32.load offset=32
            i32.load offset=12
            call_indirect (type $.rodata)
            br_if 1 (;@2;)
          end
          i32.const 0
          local.set 1
          br 1 (;@1;)
        end
        i32.const 1
        local.set 1
      end
      local.get 3
      i32.const 48
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN4core6result13unwrap_failed17h7ed8731a69ab17a3E (;9;) (type 7) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 51
      i32.store offset=12
      local.get 1
      i32.const 16516
      i32.store offset=8
      local.get 1
      i32.const 16568
      i32.store offset=20
      local.get 1
      local.get 0
      i32.store offset=16
      local.get 1
      i32.const 24
      i32.add
      i32.const 12
      i32.add
      i64.const 2
      i64.store align=4
      local.get 1
      i32.const 48
      i32.add
      i32.const 12
      i32.add
      i32.const 3
      i32.store
      local.get 1
      i32.const 2
      i32.store offset=28
      local.get 1
      i32.const 16644
      i32.store offset=24
      local.get 1
      i32.const 4
      i32.store offset=52
      local.get 1
      local.get 1
      i32.const 48
      i32.add
      i32.store offset=32
      local.get 1
      local.get 1
      i32.const 16
      i32.add
      i32.store offset=56
      local.get 1
      local.get 1
      i32.const 8
      i32.add
      i32.store offset=48
      local.get 1
      i32.const 24
      i32.add
      i32.const 16608
      call $_ZN4core9panicking9panic_fmt17h6dad0405f48e39e2E
      unreachable
    )
    (func $_ZN5alloc7raw_vec17capacity_overflow17h69391d2b6a90e408E (;10;) (type 4)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      local.get 0
      i32.const 20
      i32.add
      i64.const 0
      i64.store align=4
      local.get 0
      i32.const 1
      i32.store offset=12
      local.get 0
      i32.const 16492
      i32.store offset=8
      local.get 0
      i32.const 16752
      i32.store offset=16
      local.get 0
      i32.const 8
      i32.add
      i32.const 16500
      call $_ZN4core9panicking9panic_fmt17h6dad0405f48e39e2E
      unreachable
    )
    (func $_ZN4core9panicking9panic_fmt17h6dad0405f48e39e2E (;11;) (type 3) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      local.get 0
      i32.store offset=20
      local.get 2
      i32.const 16624
      i32.store offset=12
      local.get 2
      i32.const 16752
      i32.store offset=8
      local.get 2
      i32.const 1
      i32.store8 offset=24
      local.get 2
      local.get 1
      i32.store offset=16
      local.get 2
      i32.const 8
      i32.add
      call $rust_begin_unwind
      unreachable
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h65113c45b2745902E (;12;) (type 6) (param i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 1
          local.get 2
          i32.add
          local.tee 2
          local.get 1
          i32.lt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const 4
          i32.add
          i32.load
          local.tee 1
          i32.const 1
          i32.shl
          local.tee 4
          local.get 2
          local.get 4
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
          i32.const -1
          i32.xor
          i32.const 31
          i32.shr_u
          local.set 4
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.eqz
              br_if 0 (;@4;)
              local.get 3
              local.get 1
              i32.store offset=24
              local.get 3
              i32.const 1
              i32.store offset=20
              local.get 3
              local.get 0
              i32.load
              i32.store offset=16
              br 1 (;@3;)
            end
            local.get 3
            i32.const 0
            i32.store offset=20
          end
          local.get 3
          local.get 4
          local.get 2
          local.get 3
          i32.const 16
          i32.add
          call $_ZN5alloc7raw_vec11finish_grow17hbecdce00a583a218E
          local.get 3
          i32.load offset=4
          local.set 1
          block ;; label = @3
            local.get 3
            i32.load
            br_if 0 (;@3;)
            local.get 0
            local.get 1
            i32.store
            local.get 0
            i32.const 4
            i32.add
            local.get 2
            i32.store
            br 2 (;@1;)
          end
          local.get 1
          i32.const -2147483647
          i32.eq
          br_if 1 (;@1;)
          local.get 1
          i32.eqz
          br_if 0 (;@2;)
          unreachable
          unreachable
        end
        call $_ZN5alloc7raw_vec17capacity_overflow17h69391d2b6a90e408E
        unreachable
      end
      local.get 3
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc7raw_vec11finish_grow17hbecdce00a583a218E (;13;) (type 2) (param i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          i32.const -1
          i32.le_s
          br_if 1 (;@1;)
          block ;; label = @3
            block ;; label = @4
              local.get 3
              i32.load offset=4
              i32.eqz
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 3
                i32.const 8
                i32.add
                i32.load
                local.tee 1
                br_if 0 (;@5;)
                i32.const 0
                i32.load8_u offset=17841
                drop
                i32.const 1
                local.get 2
                call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E
                local.set 1
                br 2 (;@3;)
              end
              local.get 3
              i32.load
              local.get 1
              i32.const 1
              local.get 2
              call $__rust_realloc
              local.set 1
              br 1 (;@3;)
            end
            i32.const 0
            i32.load8_u offset=17841
            drop
            i32.const 1
            local.get 2
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E
            local.set 1
          end
          block ;; label = @3
            local.get 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 1
            i32.store offset=4
            local.get 0
            i32.const 8
            i32.add
            local.get 2
            i32.store
            local.get 0
            i32.const 0
            i32.store
            return
          end
          local.get 0
          i32.const 1
          i32.store offset=4
          local.get 0
          i32.const 8
          i32.add
          local.get 2
          i32.store
          local.get 0
          i32.const 1
          i32.store
          return
        end
        local.get 0
        i32.const 0
        i32.store offset=4
        local.get 0
        i32.const 8
        i32.add
        local.get 2
        i32.store
        local.get 0
        i32.const 1
        i32.store
        return
      end
      local.get 0
      i32.const 0
      i32.store offset=4
      local.get 0
      i32.const 1
      i32.store
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$16reserve_for_push17hb61919fa8918a326E (;14;) (type 3) (param i32 i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.const 1
          i32.add
          local.tee 1
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          i32.const 4
          i32.add
          i32.load
          local.tee 3
          i32.const 1
          i32.shl
          local.tee 4
          local.get 1
          local.get 4
          local.get 1
          i32.gt_u
          select
          local.tee 1
          i32.const 8
          local.get 1
          i32.const 8
          i32.gt_u
          select
          local.tee 1
          i32.const -1
          i32.xor
          i32.const 31
          i32.shr_u
          local.set 4
          block ;; label = @3
            block ;; label = @4
              local.get 3
              i32.eqz
              br_if 0 (;@4;)
              local.get 2
              local.get 3
              i32.store offset=24
              local.get 2
              i32.const 1
              i32.store offset=20
              local.get 2
              local.get 0
              i32.load
              i32.store offset=16
              br 1 (;@3;)
            end
            local.get 2
            i32.const 0
            i32.store offset=20
          end
          local.get 2
          local.get 4
          local.get 1
          local.get 2
          i32.const 16
          i32.add
          call $_ZN5alloc7raw_vec11finish_grow17hbecdce00a583a218E
          local.get 2
          i32.load offset=4
          local.set 3
          block ;; label = @3
            local.get 2
            i32.load
            br_if 0 (;@3;)
            local.get 0
            local.get 3
            i32.store
            local.get 0
            i32.const 4
            i32.add
            local.get 1
            i32.store
            br 2 (;@1;)
          end
          local.get 3
          i32.const -2147483647
          i32.eq
          br_if 1 (;@1;)
          local.get 3
          i32.eqz
          br_if 0 (;@2;)
          unreachable
          unreachable
        end
        call $_ZN5alloc7raw_vec17capacity_overflow17h69391d2b6a90e408E
        unreachable
      end
      local.get 2
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN4core3ptr26drop_in_place$LT$usize$GT$17h58a2c0218f0be954E (;15;) (type 7) (param i32))
    (func $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$9write_str17hda9d1ffcaf7e2362E (;16;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 0
        i32.load offset=4
        local.get 0
        i32.load offset=8
        local.tee 3
        i32.sub
        local.get 2
        i32.ge_u
        br_if 0 (;@1;)
        local.get 0
        local.get 3
        local.get 2
        call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h65113c45b2745902E
        local.get 0
        i32.load offset=8
        local.set 3
      end
      local.get 0
      i32.load
      local.get 3
      i32.add
      local.get 1
      local.get 2
      call $memcpy
      drop
      local.get 0
      local.get 3
      local.get 2
      i32.add
      i32.store offset=8
      i32.const 0
    )
    (func $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$10write_char17h3670014ad85a5bfbE (;17;) (type 1) (param i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 0
      i32.load
      local.set 0
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 128
              i32.lt_u
              br_if 0 (;@4;)
              local.get 2
              i32.const 0
              i32.store offset=12
              local.get 1
              i32.const 2048
              i32.lt_u
              br_if 1 (;@3;)
              block ;; label = @5
                local.get 1
                i32.const 65536
                i32.ge_u
                br_if 0 (;@5;)
                local.get 2
                local.get 1
                i32.const 63
                i32.and
                i32.const 128
                i32.or
                i32.store8 offset=14
                local.get 2
                local.get 1
                i32.const 12
                i32.shr_u
                i32.const 224
                i32.or
                i32.store8 offset=12
                local.get 2
                local.get 1
                i32.const 6
                i32.shr_u
                i32.const 63
                i32.and
                i32.const 128
                i32.or
                i32.store8 offset=13
                i32.const 3
                local.set 1
                br 3 (;@2;)
              end
              local.get 2
              local.get 1
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=15
              local.get 2
              local.get 1
              i32.const 6
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=14
              local.get 2
              local.get 1
              i32.const 12
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=13
              local.get 2
              local.get 1
              i32.const 18
              i32.shr_u
              i32.const 7
              i32.and
              i32.const 240
              i32.or
              i32.store8 offset=12
              i32.const 4
              local.set 1
              br 2 (;@2;)
            end
            block ;; label = @4
              local.get 0
              i32.load offset=8
              local.tee 3
              local.get 0
              i32.load offset=4
              i32.ne
              br_if 0 (;@4;)
              local.get 0
              local.get 3
              call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$16reserve_for_push17hb61919fa8918a326E
              local.get 0
              i32.load offset=8
              local.set 3
            end
            local.get 0
            local.get 3
            i32.const 1
            i32.add
            i32.store offset=8
            local.get 0
            i32.load
            local.get 3
            i32.add
            local.get 1
            i32.store8
            br 2 (;@1;)
          end
          local.get 2
          local.get 1
          i32.const 63
          i32.and
          i32.const 128
          i32.or
          i32.store8 offset=13
          local.get 2
          local.get 1
          i32.const 6
          i32.shr_u
          i32.const 192
          i32.or
          i32.store8 offset=12
          i32.const 2
          local.set 1
        end
        block ;; label = @2
          local.get 0
          i32.load offset=4
          local.get 0
          i32.load offset=8
          local.tee 3
          i32.sub
          local.get 1
          i32.ge_u
          br_if 0 (;@2;)
          local.get 0
          local.get 3
          local.get 1
          call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h65113c45b2745902E
          local.get 0
          i32.load offset=8
          local.set 3
        end
        local.get 0
        i32.load
        local.get 3
        i32.add
        local.get 2
        i32.const 12
        i32.add
        local.get 1
        call $memcpy
        drop
        local.get 0
        local.get 3
        local.get 1
        i32.add
        i32.store offset=8
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      i32.const 0
    )
    (func $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$9write_fmt17h18b79f54c5839d64E (;18;) (type 1) (param i32 i32) (result i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 0
      i32.load
      local.set 0
      local.get 2
      i32.const 8
      i32.add
      i32.const 16
      i32.add
      local.get 1
      i32.const 16
      i32.add
      i64.load align=4
      i64.store
      local.get 2
      i32.const 8
      i32.add
      i32.const 8
      i32.add
      local.get 1
      i32.const 8
      i32.add
      i64.load align=4
      i64.store
      local.get 2
      local.get 1
      i64.load align=4
      i64.store offset=8
      local.get 2
      local.get 0
      i32.store offset=4
      local.get 2
      i32.const 4
      i32.add
      i32.const 16420
      local.get 2
      i32.const 8
      i32.add
      call $_ZN4core3fmt5write17hce4d120ebbfb2b82E
      local.set 1
      local.get 2
      i32.const 32
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN4core3ops8function6FnOnce9call_once17h76067c467ab7d853E (;19;) (type 1) (param i32 i32) (result i32)
      local.get 0
      i32.load
      drop
      loop (result i32) ;; label = @1
        br 0 (;@1;)
      end
    )
    (func $rust_begin_unwind (;20;) (type 7) (param i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        i32.load offset=12
        local.tee 2
        br_if 0 (;@1;)
        call $_ZN4core9panicking5panic17hfd6e422134ee8ce5E
        unreachable
      end
      local.get 1
      local.get 0
      i32.load offset=8
      i32.store offset=8
      local.get 1
      local.get 0
      i32.store offset=4
      local.get 1
      local.get 2
      i32.store
      local.get 1
      call $_ZN3std10sys_common9backtrace26__rust_end_short_backtrace17h04fac26f88d230dfE
      unreachable
    )
    (func $_ZN4core3ptr37drop_in_place$LT$core..fmt..Error$GT$17h20c52a201febd195E (;21;) (type 7) (param i32))
    (func $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17hfb753db928a637b4E (;22;) (type 3) (param i32 i32)
      local.get 0
      i64.const 6709583872402221221
      i64.store offset=8
      local.get 0
      i64.const -517914840449640987
      i64.store
    )
    (func $_ZN4core9panicking5panic17hfd6e422134ee8ce5E (;23;) (type 4)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      local.get 0
      i32.const 12
      i32.add
      i64.const 0
      i64.store align=4
      local.get 0
      i32.const 1
      i32.store offset=4
      local.get 0
      i32.const 16752
      i32.store offset=8
      local.get 0
      i32.const 43
      i32.store offset=28
      local.get 0
      i32.const 16665
      i32.store offset=24
      local.get 0
      local.get 0
      i32.const 24
      i32.add
      i32.store
      local.get 0
      i32.const 16736
      call $_ZN4core9panicking9panic_fmt17h6dad0405f48e39e2E
      unreachable
    )
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb73b6a73788677afE (;24;) (type 1) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load
      local.get 0
      i32.load offset=4
      call $_ZN4core3fmt9Formatter3pad17h0b6da8b5646917dcE
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h492aa3edaecea1b7E (;25;) (type 1) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      local.get 0
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 1)
    )
    (func $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17h6624c0bc755aa54fE (;26;) (type 1) (param i32 i32) (result i32)
      local.get 1
      i32.load offset=20
      i32.const 16660
      i32.const 5
      local.get 1
      i32.const 24
      i32.add
      i32.load
      i32.load offset=12
      call_indirect (type $.rodata)
    )
    (func $rust_panic (;27;) (type 4)
      unreachable
      unreachable
    )
    (func $_ZN3std10sys_common9backtrace26__rust_end_short_backtrace17h04fac26f88d230dfE (;28;) (type 7) (param i32)
      local.get 0
      call $_ZN3std9panicking19begin_panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17he405aaeb801d5772E
      unreachable
    )
    (func $_ZN3std9panicking19begin_panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17he405aaeb801d5772E (;29;) (type 7) (param i32)
      (local i32 i32)
      local.get 0
      i32.load
      local.tee 1
      i32.const 12
      i32.add
      i32.load
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.load offset=4
          br_table 0 (;@2;) 0 (;@2;) 1 (;@1;)
        end
        local.get 2
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=4
        i32.load8_u offset=16
        call $_ZN3std9panicking20rust_panic_with_hook17h7601402c0a383194E
        unreachable
      end
      local.get 0
      i32.load offset=4
      i32.load8_u offset=16
      call $_ZN3std9panicking20rust_panic_with_hook17h7601402c0a383194E
      unreachable
    )
    (func $_ZN3std9panicking20rust_panic_with_hook17h7601402c0a383194E (;30;) (type 7) (param i32)
      (local i32)
      i32.const 0
      i32.const 0
      i32.load offset=17832
      local.tee 1
      i32.const 1
      i32.add
      i32.store offset=17832
      block ;; label = @1
        local.get 1
        i32.const 0
        i32.lt_s
        br_if 0 (;@1;)
        i32.const 0
        i32.load8_u offset=17840
        i32.const 1
        i32.and
        br_if 0 (;@1;)
        i32.const 0
        i32.const 1
        i32.store8 offset=17840
        i32.const 0
        i32.const 0
        i32.load offset=17836
        i32.const 1
        i32.add
        i32.store offset=17836
        i32.const 0
        i32.load offset=17828
        i32.const -1
        i32.le_s
        br_if 0 (;@1;)
        i32.const 0
        i32.const 0
        i32.store8 offset=17840
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        call $rust_panic
        unreachable
      end
      unreachable
      unreachable
    )
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd196fc5ba7fb8b5dE (;31;) (type 2) (param i32 i32 i32 i32)
      (local i32 i32)
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
      i32.const 16752
      i32.const 16776
      call $_ZN9wee_alloc17alloc_with_refill17h2cac2b5012f8a08cE
      local.set 1
      local.get 5
      local.get 4
      i32.load offset=12
      i32.store
      block ;; label = @1
        block ;; label = @2
          local.get 1
          br_if 0 (;@2;)
          i32.const 1
          local.set 2
          br 1 (;@1;)
        end
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
        local.set 2
      end
      local.get 0
      local.get 1
      i32.store offset=4
      local.get 0
      local.get 2
      i32.store
      local.get 4
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN9wee_alloc17alloc_with_refill17h2cac2b5012f8a08cE (;32;) (type 8) (param i32 i32 i32 i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 5
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        call $_ZN9wee_alloc15alloc_first_fit17h65332e42075ac249E
        local.tee 6
        br_if 0 (;@1;)
        local.get 5
        i32.const 8
        i32.add
        local.get 3
        local.get 0
        local.get 1
        local.get 4
        i32.load offset=12
        call_indirect (type 2)
        i32.const 0
        local.set 6
        local.get 5
        i32.load offset=8
        br_if 0 (;@1;)
        local.get 5
        i32.load offset=12
        local.tee 6
        local.get 2
        i32.load
        i32.store offset=8
        local.get 2
        local.get 6
        i32.store
        local.get 0
        local.get 1
        local.get 2
        local.get 3
        local.get 4
        call $_ZN9wee_alloc15alloc_first_fit17h65332e42075ac249E
        local.set 6
      end
      local.get 5
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 6
    )
    (func $_ZN9wee_alloc15alloc_first_fit17h65332e42075ac249E (;33;) (type 8) (param i32 i32 i32 i32 i32) (result i32)
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
        block ;; label = @2
          block ;; label = @3
            loop ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 5
                  i32.load offset=8
                  local.tee 1
                  i32.const 1
                  i32.and
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 8
                  i32.add
                  local.set 9
                  br 1 (;@5;)
                end
                loop ;; label = @6
                  local.get 5
                  local.get 1
                  i32.const -2
                  i32.and
                  i32.store offset=8
                  block ;; label = @7
                    block ;; label = @8
                      local.get 5
                      i32.load offset=4
                      local.tee 10
                      i32.const -4
                      i32.and
                      local.tee 1
                      br_if 0 (;@8;)
                      i32.const 0
                      local.set 11
                      br 1 (;@7;)
                    end
                    i32.const 0
                    local.get 1
                    local.get 1
                    i32.load8_u
                    i32.const 1
                    i32.and
                    select
                    local.set 11
                  end
                  block ;; label = @7
                    local.get 5
                    i32.load
                    local.tee 12
                    i32.const -4
                    i32.and
                    local.tee 9
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 12
                    i32.const 2
                    i32.and
                    br_if 0 (;@7;)
                    local.get 9
                    local.get 9
                    i32.load offset=4
                    i32.const 3
                    i32.and
                    local.get 1
                    i32.or
                    i32.store offset=4
                    local.get 5
                    i32.load offset=4
                    local.tee 10
                    i32.const -4
                    i32.and
                    local.set 1
                  end
                  block ;; label = @7
                    local.get 1
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 1
                    local.get 1
                    i32.load
                    i32.const 3
                    i32.and
                    local.get 5
                    i32.load
                    i32.const -4
                    i32.and
                    i32.or
                    i32.store
                    local.get 5
                    i32.load offset=4
                    local.set 10
                  end
                  local.get 5
                  local.get 10
                  i32.const 3
                  i32.and
                  i32.store offset=4
                  local.get 5
                  local.get 5
                  i32.load
                  local.tee 1
                  i32.const 3
                  i32.and
                  i32.store
                  block ;; label = @7
                    local.get 1
                    i32.const 2
                    i32.and
                    i32.eqz
                    br_if 0 (;@7;)
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
                  br_if 0 (;@6;)
                end
                local.get 11
                i32.const 8
                i32.add
                local.set 9
                local.get 11
                local.set 5
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 5
                  i32.load
                  i32.const -4
                  i32.and
                  local.tee 10
                  local.get 5
                  i32.const 8
                  i32.add
                  local.tee 11
                  i32.sub
                  local.get 8
                  i32.lt_u
                  br_if 0 (;@6;)
                  local.get 11
                  local.get 3
                  local.get 0
                  local.get 4
                  i32.load offset=16
                  call_indirect (type 1)
                  i32.const 2
                  i32.shl
                  i32.add
                  i32.const 8
                  i32.add
                  local.get 10
                  local.get 8
                  i32.sub
                  local.get 7
                  i32.and
                  local.tee 1
                  i32.le_u
                  br_if 1 (;@5;)
                  local.get 6
                  local.get 11
                  i32.and
                  i32.eqz
                  br_if 3 (;@3;)
                  local.get 9
                  i32.load
                  local.set 1
                end
                local.get 2
                local.get 1
                i32.store
                local.get 1
                local.set 5
                local.get 1
                i32.eqz
                br_if 4 (;@1;)
                br 1 (;@4;)
              end
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
            block ;; label = @4
              local.get 5
              i32.load
              local.tee 9
              i32.const -4
              i32.and
              local.tee 10
              i32.eqz
              br_if 0 (;@4;)
              local.get 9
              i32.const 2
              i32.and
              br_if 0 (;@4;)
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
            local.get 5
            local.get 5
            i32.load offset=8
            i32.const -2
            i32.and
            i32.store offset=8
            local.get 5
            local.get 5
            i32.load
            local.tee 11
            i32.const 3
            i32.and
            local.get 1
            i32.or
            local.tee 10
            i32.store
            block ;; label = @4
              local.get 11
              i32.const 2
              i32.and
              br_if 0 (;@4;)
              local.get 1
              i32.load
              local.set 11
              br 2 (;@2;)
            end
            local.get 5
            local.get 10
            i32.const -3
            i32.and
            i32.store
            local.get 1
            i32.load
            i32.const 2
            i32.or
            local.set 11
            br 1 (;@2;)
          end
          local.get 2
          local.get 5
          i32.load offset=8
          i32.const -4
          i32.and
          i32.store
          local.get 5
          i32.load
          local.set 11
          local.get 5
          local.set 1
        end
        local.get 1
        local.get 11
        i32.const 1
        i32.or
        i32.store
        local.get 1
        i32.const 8
        i32.add
        return
      end
      i32.const 0
    )
    (func $_ZN4core3ptr48drop_in_place$LT$wee_alloc..LargeAllocPolicy$GT$17he9f02a2a997b4d5bE (;34;) (type 7) (param i32))
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h0a4244c614fe8736E (;35;) (type 2) (param i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.const 2
          i32.shl
          local.tee 2
          local.get 3
          i32.const 3
          i32.shl
          i32.const 16384
          i32.add
          local.tee 3
          local.get 2
          local.get 3
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
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h73782367e7a0c779E (;36;) (type 1) (param i32 i32) (result i32)
      i32.const 512
    )
    (func $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$32should_merge_adjacent_free_cells17hebba7691d26af005E (;37;) (type 9) (param i32) (result i32)
      i32.const 1
    )
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h838e9e4e71124a04E (;38;) (type 1) (param i32 i32) (result i32)
      local.get 1
    )
    (func $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$32should_merge_adjacent_free_cells17h9614e341fcf423e9E (;39;) (type 9) (param i32) (result i32)
      i32.const 0
    )
    (func $_ZN4core3ptr66drop_in_place$LT$wee_alloc..size_classes..SizeClassAllocPolicy$GT$17h70d1b16986156199E (;40;) (type 7) (param i32))
    (func $cabi_realloc (;41;) (type 5) (param i32 i32 i32 i32) (result i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            br_if 0 (;@3;)
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            i32.const 0
            i32.load8_u offset=17841
            drop
            local.get 2
            local.get 3
            call $_ZN72_$LT$wee_alloc..WeeAlloc$u20$as$u20$core..alloc..global..GlobalAlloc$GT$5alloc17h01d737b562481ea6E
            local.set 2
            br 1 (;@2;)
          end
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          call $__rust_realloc
          local.set 2
        end
        local.get 2
        br_if 0 (;@1;)
        unreachable
        unreachable
      end
      local.get 2
    )
    (func $_ZN17compiler_builtins3mem6memcpy17ha02d5535b4a2d57fE (;42;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.const 15
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          br 1 (;@1;)
        end
        local.get 0
        i32.const 0
        local.get 0
        i32.sub
        i32.const 3
        i32.and
        local.tee 4
        i32.add
        local.set 5
        block ;; label = @2
          local.get 4
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          local.get 1
          local.set 6
          loop ;; label = @3
            local.get 3
            local.get 6
            i32.load8_u
            i32.store8
            local.get 6
            i32.const 1
            i32.add
            local.set 6
            local.get 3
            i32.const 1
            i32.add
            local.tee 3
            local.get 5
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 5
        local.get 2
        local.get 4
        i32.sub
        local.tee 7
        i32.const -4
        i32.and
        local.tee 8
        i32.add
        local.set 3
        block ;; label = @2
          block ;; label = @3
            local.get 1
            local.get 4
            i32.add
            local.tee 9
            i32.const 3
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 8
            i32.const 1
            i32.lt_s
            br_if 1 (;@2;)
            local.get 9
            i32.const 3
            i32.shl
            local.tee 6
            i32.const 24
            i32.and
            local.set 2
            local.get 9
            i32.const -4
            i32.and
            local.tee 10
            i32.const 4
            i32.add
            local.set 1
            i32.const 0
            local.get 6
            i32.sub
            i32.const 24
            i32.and
            local.set 4
            local.get 10
            i32.load
            local.set 6
            loop ;; label = @4
              local.get 5
              local.get 6
              local.get 2
              i32.shr_u
              local.get 1
              i32.load
              local.tee 6
              local.get 4
              i32.shl
              i32.or
              i32.store
              local.get 1
              i32.const 4
              i32.add
              local.set 1
              local.get 5
              i32.const 4
              i32.add
              local.tee 5
              local.get 3
              i32.lt_u
              br_if 0 (;@4;)
              br 2 (;@2;)
            end
          end
          local.get 8
          i32.const 1
          i32.lt_s
          br_if 0 (;@2;)
          local.get 9
          local.set 1
          loop ;; label = @3
            local.get 5
            local.get 1
            i32.load
            i32.store
            local.get 1
            i32.const 4
            i32.add
            local.set 1
            local.get 5
            i32.const 4
            i32.add
            local.tee 5
            local.get 3
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 7
        i32.const 3
        i32.and
        local.set 2
        local.get 9
        local.get 8
        i32.add
        local.set 1
      end
      block ;; label = @1
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        local.get 2
        i32.add
        local.set 5
        loop ;; label = @2
          local.get 3
          local.get 1
          i32.load8_u
          i32.store8
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 3
          i32.const 1
          i32.add
          local.tee 3
          local.get 5
          i32.lt_u
          br_if 0 (;@2;)
        end
      end
      local.get 0
    )
    (func $memcpy (;43;) (type $.rodata) (param i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      call $_ZN17compiler_builtins3mem6memcpy17ha02d5535b4a2d57fE
    )
    (table (;0;) 20 20 funcref)
    (memory (;0;) 1 10)
    (global $__stack_pointer (;0;) (mut i32) i32.const 16384)
    (global (;1;) i32 i32.const 17843)
    (global (;2;) i32 i32.const 17856)
    (export "memory" (memory 0))
    (export "hello:city/greeter#run" (func $hello:city/greeter#run))
    (export "cabi_realloc" (func $cabi_realloc))
    (export "__data_end" (global 1))
    (export "__heap_base" (global 2))
    (elem (;0;) (i32.const 1) func $_ZN60_$LT$alloc..string..String$u20$as$u20$core..fmt..Display$GT$3fmt17he8cd3ece0b998a29E $_ZN4core3ops8function6FnOnce9call_once17h76067c467ab7d853E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h492aa3edaecea1b7E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hb73b6a73788677afE $_ZN4core3ptr26drop_in_place$LT$usize$GT$17h58a2c0218f0be954E $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$9write_str17hda9d1ffcaf7e2362E $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$10write_char17h3670014ad85a5bfbE $_ZN50_$LT$$RF$mut$u20$W$u20$as$u20$core..fmt..Write$GT$9write_fmt17h18b79f54c5839d64E $_ZN4core3ptr37drop_in_place$LT$core..fmt..Error$GT$17h20c52a201febd195E $_ZN53_$LT$core..fmt..Error$u20$as$u20$core..fmt..Debug$GT$3fmt17h6624c0bc755aa54fE $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17hfb753db928a637b4E $_ZN4core3ptr66drop_in_place$LT$wee_alloc..size_classes..SizeClassAllocPolicy$GT$17h70d1b16986156199E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17hd196fc5ba7fb8b5dE $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h838e9e4e71124a04E $_ZN88_$LT$wee_alloc..size_classes..SizeClassAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$32should_merge_adjacent_free_cells17h9614e341fcf423e9E $_ZN4core3ptr48drop_in_place$LT$wee_alloc..LargeAllocPolicy$GT$17he9f02a2a997b4d5bE $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$22new_cell_for_free_list17h0a4244c614fe8736E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$13min_cell_size17h73782367e7a0c779E $_ZN70_$LT$wee_alloc..LargeAllocPolicy$u20$as$u20$wee_alloc..AllocPolicy$GT$32should_merge_adjacent_free_cells17hebba7691d26af005E)
    (data (;0;) (i32.const 16384) "Hello  from rust!\00\00\00\00@\00\00\06\00\00\00\06@\00\00\0b\00\00\00\05\00\00\00\04\00\00\00\04\00\00\00\06\00\00\00\07\00\00\00\08\00\00\00library/alloc/src/raw_vec.rscapacity overflow\00\00\00X@\00\00\11\00\00\00<@\00\00\1c\00\00\00\0c\02\00\00\05\00\00\00a formatting trait implementation returned an error\00\09\00\00\00\00\00\00\00\01\00\00\00\0a\00\00\00library/alloc/src/fmt.rs\c8@\00\00\18\00\00\00b\02\00\00 \00\00\00\09\00\00\00\00\00\00\00\01\00\00\00\0b\00\00\00: \00\00pA\00\00\00\00\00\00\00A\00\00\02\00\00\00Errorcalled `Option::unwrap()` on a `None` valuelibrary/std/src/panicking.rsDA\00\00\1c\00\00\00P\02\00\00\1e\00\00\00\0c\00\00\00\04\00\00\00\04\00\00\00\0d\00\00\00\0e\00\00\00\0f\00\00\00\10\00\00\00\00\00\00\00\01\00\00\00\11\00\00\00\12\00\00\00\13\00\00\00")
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.72.0 (5680fa18f 2023-08-23)")
      (processed-by "wit-component" "0.14.0")
      (processed-by "wit-bindgen-rust" "0.11.0")
    )
  )
  (core module (;1;)
    (type (;0;) (func (param i32 i32)))
    (func $indirect-hello:city/city-send-message (;0;) (type 0) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 0
      call_indirect (type 0)
    )
    (table (;0;) 1 1 funcref)
    (export "0" (func $indirect-hello:city/city-send-message))
    (export "$imports" (table 0))
    (@producers
      (processed-by "wit-component" "0.14.0")
    )
  )
  (core module (;2;)
    (type (;0;) (func (param i32 i32)))
    (import "" "0" (func (;0;) (type 0)))
    (import "" "$imports" (table (;0;) 1 1 funcref))
    (elem (;0;) (i32.const 0) func 0)
    (@producers
      (processed-by "wit-component" "0.14.0")
    )
  )
  (core instance (;0;) (instantiate 1))
  (alias core export 0 "0" (core func (;0;)))
  (core instance (;1;)
    (export "send-message" (func 0))
  )
  (core instance (;2;) (instantiate 0
      (with "hello:city/city" (instance 1))
    )
  )
  (alias core export 2 "memory" (core memory (;0;)))
  (alias core export 2 "cabi_realloc" (core func (;1;)))
  (alias core export 0 "$imports" (core table (;0;)))
  (alias export 0 "send-message" (func (;0;)))
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
  (alias core export 2 "hello:city/greeter#run" (core func (;3;)))
  (func (;1;) (type 2) (canon lift (core func 3) (memory 0) (realloc 1) string-encoding=utf8))
  (alias export 0 "city-info" (type (;3;)))
  (component (;0;)
    (type (;0;) (record (field "name" string)))
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
  (export (;2;) (interface "hello:city/greeter") (instance 1))
  (@producers
    (processed-by "wit-component" "0.14.0")
    (processed-by "cargo-component" "0.1.0 (36c221e 2023-09-07 wasi:134dddc)")
  )
)