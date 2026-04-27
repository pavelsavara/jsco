;; Hand-written component-model WAT for a minimal wasi:http P3 handler.
;;
;; Goal: end-to-end coverage of the async-lift export path with an `own<resource>`
;; parameter and a Spilled `result<own<resource>, variant>` return delivered via
;; `task.return`. Validates the F1 (param lifting) + F2 (task.return result
;; delivery) jsco fixes for `createAsyncLiftWrapper` /
;; `resolveCanonicalFunctionTaskReturn`.
;;
;; Imports:
;;   wasi:http/types@0.3.0-rc-2026-03-15  — request, response resources only
;;   test:hello-http/helper@0.1.0         — make-hello-response() -> own<response>
;;   test:hello-http/helper@0.1.0         — fail-mode() -> u8 (host-driven flag)
;;
;; Exports:
;;   wasi:http/handler@0.3.0-rc-2026-03-15 { handle: async func(request) -> result<response, error-code> }
;;
;; Behaviour:
;;   - drop the incoming request immediately (no body / headers reads)
;;   - if fail-mode() returns 0: build a response via the helper, return Ok(resp)
;;   - if fail-mode() returns 1: return Err(internal-error) without calling helper
;;
;; The error-code variant is intentionally a 1-case stub; this WAT does not aim
;; to model the full wasi-http error-code (40+ cases) — only the canonical-ABI
;; spilled-result encoding path matters for this test.

(component $hello-http-p3-wat

  ;; --- Import wasi:http/types: request + response resources only ---
  (type $http-types-iface (instance
    (export "request"  (type (sub resource)))
    (export "response" (type (sub resource)))
  ))
  (import "wasi:http/types@0.3.0-rc-2026-03-15"
          (instance $http-types (type $http-types-iface)))
  (alias export $http-types "request"  (type $request))
  (alias export $http-types "response" (type $response))

  ;; --- Custom helper interface: make-hello-response() -> own<response>, fail-mode() -> u8 ---
  (type $helper-iface (instance
    (alias outer $hello-http-p3-wat $response (type))            ;; type 0
    (export "response" (type (eq 0)))                            ;; type 1
    (type (own 1))                                               ;; type 2 = own<response>
    (type (func (result 2)))                                     ;; type 3
    (export "make-hello-response" (func (type 3)))
    (type (func (result u8)))                                    ;; type 4
    (export "fail-mode" (func (type 4)))
  ))
  (import "test:hello-http/helper@0.1.0"
          (instance $helper (type $helper-iface)))

  ;; --- Linear memory (shared between core impl and canon abi via memory option) ---
  (core module $mem-module
    (memory (export "memory") 1)
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; --- Canon lower the helper imports to core funcs ---
  (alias export $helper "make-hello-response" (func $mhr-comp))
  (core func $mhr-core (canon lower (func $mhr-comp)))         ;; () -> i32

  (alias export $helper "fail-mode" (func $fm-comp))
  (core func $fm-core (canon lower (func $fm-comp)))           ;; () -> i32 (u8 zero-extended)

  ;; --- Canonical resource.drop for incoming request ---
  (core func $drop-request-core (canon resource.drop $request))   ;; (param i32)

  ;; --- task.return: takes a single i32 (pointer) for the spilled result ---
  ;; result type: result<own<response>, error-code>
  ;; error-code is an intentional 1-case stub; the canon abi only cares about its
  ;; flat layout (1 byte disc, no payload) when computing the result struct size.
  (type $error-code (variant (case "internal-error")))
  (type $result-type (result (own $response) (error $error-code)))
  (core func $task-return-core
    (canon task.return (result $result-type) (memory $mem)))

  ;; =====================================================================
  ;; Core module — implements handle-start and handle-cb.
  ;; =====================================================================
  ;;
  ;; Result struct layout in linear memory at fixed offset 0 (8 bytes total):
  ;;   offset 0: discriminant byte (0 = Ok, 1 = Err)
  ;;   offset 4: payload (own<response> handle for Ok; unused for Err)
  ;;
  ;; flat(result) = 1 + max(flat(own<response>), flat(error-code))
  ;;              = 1 + max(1, 1) = 2  → Spilled (>MAX_FLAT_RESULTS=1)
  ;; align(result) = max(align(own<response>), align(error-code), 1) = 4
  ;; size(result) = 4 (disc + padding) + max(4, 1) = 8
  ;;
  (core module $impl
    (import "host" "memory"              (memory 0))
    (import "host" "make-hello-response" (func $mhr (result i32)))
    (import "host" "fail-mode"           (func $fm  (result i32)))
    (import "host" "drop-request"        (func $drop-req     (param i32)))
    (import "host" "task-return"         (func $task-return  (param i32)))

    ;; handle-start(request_handle: i32) -> i32 (initial async status)
    (func $handle-start (export "handle-start") (param $req i32) (result i32)
      (local $resp i32)

      ;; 1. Drop the incoming request resource handle (we don't inspect it).
      (call $drop-req (local.get $req))

      ;; 2. Branch on the host-driven fail-mode flag (0 = Ok, 1 = Err).
      (if (i32.eqz (call $fm))
        (then
          ;; --- Ok branch: get response handle, encode Ok(resp) ---
          (local.set $resp (call $mhr))
          (i32.store8 (i32.const 0) (i32.const 0))         ;; disc = Ok
          (i32.store  (i32.const 4) (local.get $resp)))    ;; payload = resp handle
        (else
          ;; --- Err branch: encode Err(internal-error). 1-case variant has
          ;; no payload, so only the discriminant byte is meaningful. ---
          (i32.store8 (i32.const 0) (i32.const 1))         ;; disc = Err
          (i32.store  (i32.const 4) (i32.const 0))))       ;; payload zeroed

      ;; 3. Deliver the result via task.return.
      (call $task-return (i32.const 0))

      ;; 4. EXIT — no async work to wait for, callback never fires.
      (i32.const 0)
    )

    ;; handle-cb is required by `canon lift ... (callback $cb)` even when start
    ;; immediately EXITs. It is never invoked in this WAT but must exist.
    (func $handle-cb (export "handle-cb")
          (param $event i32) (param $handle i32) (param $rc i32) (result i32)
      (i32.const 0)  ;; EXIT
    )
  )

  ;; --- Wire imports + instantiate the core module ---
  (core instance $host-exports
    (export "memory"              (memory $mem))
    (export "make-hello-response" (func $mhr-core))
    (export "fail-mode"           (func $fm-core))
    (export "drop-request"        (func $drop-request-core))
    (export "task-return"         (func $task-return-core))
  )
  (core instance $core (instantiate $impl
    (with "host" (instance $host-exports))
  ))
  (alias core export $core "handle-start" (core func $handle-start-core))
  (alias core export $core "handle-cb"    (core func $handle-cb-core))

  ;; --- Canon lift handle as async ---
  (type $handle-func
    (func async (param "request" (own $request)) (result $result-type)))
  (func $handle (type $handle-func)
    (canon lift (core func $handle-start-core) async
      (callback $handle-cb-core) (memory $mem)))

  ;; --- Export wasi:http/handler@0.3.0-rc-2026-03-15 ---
  (instance $handler-inst
    (export "handle" (func $handle) (func (type $handle-func)))
  )
  (export "wasi:http/handler@0.3.0-rc-2026-03-15" (instance $handler-inst))
)
