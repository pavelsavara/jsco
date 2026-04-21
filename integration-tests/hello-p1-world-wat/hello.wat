;; Hand-written WASI Preview 1 (wasi_snapshot_preview1) core module.
;; Minimal module that prints "hello from jsco\n" to stdout via fd_write.
;;
;; This is a plain core WebAssembly module (NOT a component).
;; Imports: wasi_snapshot_preview1.fd_write, wasi_snapshot_preview1.proc_exit
;; Exports: _start, memory

(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; "hello from jsco\n" at offset 0 (16 bytes)
  (data (i32.const 0) "hello from jsco\n")

  ;; ciovec at offset 100: { buf_ptr: 0, buf_len: 16 }
  (data (i32.const 100) "\00\00\00\00\10\00\00\00")

  (func $_start (export "_start")
    ;; fd_write(fd=1, iovs_ptr=100, iovs_count=1, nwritten_ptr=200)
    (call $fd_write
      (i32.const 1)    ;; fd: stdout
      (i32.const 100)  ;; iovs pointer
      (i32.const 1)    ;; iovs count
      (i32.const 200)  ;; nwritten output pointer
    )
    drop

    ;; proc_exit(0)
    (call $proc_exit (i32.const 0))
  )
)
