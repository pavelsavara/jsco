;; Hand-written component-model WAT for hello-p2-world.
;; Minimal WASI component that prints "hello from jsco" to stdout.
;;
;; Imports: wasi:io/error@0.2.11, wasi:io/streams@0.2.11, wasi:cli/stdout@0.2.11
;; Exports: wasi:cli/run@0.2.11

(component $hello-p2-world-wat
  ;; =====================================================================
  ;; Import WASI interfaces (minimal subset for stdout writing)
  ;; =====================================================================

  ;; --- wasi:io/error@0.2.11 (need error resource for stream-error type) ---
  (type $io-error-iface (instance
    (export "error" (type (sub resource)))
  ))
  (import "wasi:io/error@0.2.11" (instance $io-error (type $io-error-iface)))
  (alias export $io-error "error" (type $error))

  ;; --- wasi:io/streams@0.2.11 (output-stream + blocking-write-and-flush) ---
  (type $io-streams-iface (instance
    (export "output-stream" (type (sub resource)))                        ;; type 0
    (alias outer $hello-p2-world-wat $error (type))                          ;; type 1
    (export "error" (type (eq 1)))                                        ;; type 2
    (type (own 2))                                                        ;; type 3 = own<error>
    (type (variant (case "last-operation-failed" 3) (case "closed")))      ;; type 4 = stream-error
    (export "stream-error" (type (eq 4)))                                 ;; type 5
    (type (borrow 0))                                                     ;; type 6 = borrow<output-stream>
    (type (list u8))                                                      ;; type 7
    (type (result (error 5)))                                             ;; type 8 = result<_, stream-error>
    (type (func (param "self" 6) (param "contents" 7) (result 8)))        ;; type 9
    (export "[method]output-stream.blocking-write-and-flush" (func (type 9)))
  ))
  (import "wasi:io/streams@0.2.11" (instance $io-streams (type $io-streams-iface)))

  ;; --- wasi:cli/stdout@0.2.11 (get-stdout) ---
  (alias export $io-streams "output-stream" (type $output-stream))
  (type $stdout-iface (instance
    (alias outer $hello-p2-world-wat $output-stream (type))                  ;; type 0
    (export "output-stream" (type (eq 0)))                                ;; type 1
    (type (own 1))                                                        ;; type 2 = own<output-stream>
    (type (func (result 2)))                                              ;; type 3
    (export "get-stdout" (func (type 3)))
  ))
  (import "wasi:cli/stdout@0.2.11" (instance $stdout (type $stdout-iface)))

  ;; =====================================================================
  ;; Memory module — provides shared linear memory with the greeting string
  ;; =====================================================================
  (core module $mem-module
    (memory (export "memory") 1)
    (data (i32.const 0) "hello from jsco\n")
  )
  (core instance $mem-inst (instantiate $mem-module))
  (alias core export $mem-inst "memory" (core memory $mem))

  ;; =====================================================================
  ;; Canon lower — lower WASI component imports to core functions
  ;; =====================================================================

  ;; get-stdout: () -> own<output-stream>  =>  core: () -> i32
  (alias export $stdout "get-stdout" (func $get-stdout-comp))
  (core func $get-stdout-core (canon lower (func $get-stdout-comp)))

  ;; [method]output-stream.blocking-write-and-flush:
  ;;   component: (borrow<output-stream>, list<u8>) -> result<_, stream-error>
  ;;   core:      (i32, i32, i32, i32) -> ()   [4th param = retptr]
  (alias export $io-streams "[method]output-stream.blocking-write-and-flush" (func $bwf-comp))
  (core func $bwf-core (canon lower (func $bwf-comp) (memory $mem)))

  ;; resource.drop output-stream: (own<output-stream>) -> ()
  ;;   core: (i32) -> ()
  (core func $drop-os-core (canon resource.drop $output-stream))

  ;; =====================================================================
  ;; Core module — implements the run() function
  ;; =====================================================================
  (core module $hello-impl
    (import "host" "memory" (memory 0))
    (import "host" "get-stdout" (func $get-stdout (result i32)))
    (import "host" "blocking-write-and-flush" (func $bwf (param i32 i32 i32 i32)))
    (import "host" "drop-output-stream" (func $drop-os (param i32)))

    ;; run: () -> i32   (0 = Ok, 1 = Err)
    (func $run (export "run") (result i32)
      (local $handle i32)
      ;; 1. Get stdout stream handle
      call $get-stdout
      local.set $handle
      ;; 2. Write "hello from jsco\n" (offset 0, length 16) to stdout
      ;;    Core ABI: (self:i32, ptr:i32, len:i32, retptr:i32)
      local.get $handle
      i32.const 0      ;; ptr to greeting in shared memory
      i32.const 16     ;; length of "hello from jsco\n"
      i32.const 256    ;; retptr scratch area (unused)
      call $bwf
      ;; 3. Drop the output-stream handle
      local.get $handle
      call $drop-os
      ;; 4. Return Ok
      i32.const 0
    )
  )

  ;; =====================================================================
  ;; Instantiate core module with lowered WASI imports
  ;; =====================================================================
  (core instance $host-exports
    (export "memory" (memory $mem))
    (export "get-stdout" (func $get-stdout-core))
    (export "blocking-write-and-flush" (func $bwf-core))
    (export "drop-output-stream" (func $drop-os-core))
  )
  (core instance $core (instantiate $hello-impl
    (with "host" (instance $host-exports))
  ))

  ;; =====================================================================
  ;; Canon lift — core run() -> component function
  ;; =====================================================================
  (type $result-type (result))
  (type $run-func-type (func (result $result-type)))
  (alias core export $core "run" (core func $core-run))
  (func $run (type $run-func-type) (canon lift (core func $core-run)))

  ;; =====================================================================
  ;; Export wasi:cli/run@0.2.11
  ;; =====================================================================
  (instance $run-inst
    (export "run" (func $run) (func (type $run-func-type)))
  )
  (export "wasi:cli/run@0.2.11" (instance $run-inst))
)
