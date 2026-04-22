;; WASI Preview 1 test: args and environment variables.
;; Reads args and env vars, writes them to stdout.
;;
;; Expected invocation config:
;;   args: ["program", "hello-arg"]
;;   env:  [["MY_VAR", "my_value"]]
;;
;; Stdout output on success: "hello-arg\nMY_VAR=my_value\n"
;; Exit code: 0 on success, 10-90 on failure at various stages.

(module
  (import "wasi_snapshot_preview1" "args_sizes_get"
    (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get"
    (func $args_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_sizes_get"
    (func $environ_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_get"
    (func $environ_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; Layout:
  ;; 0-3:     argc result
  ;; 4-7:     argv_buf_size result
  ;; 8-11:    environ_count result
  ;; 12-15:   environ_buf_size result
  ;; 100-199: argv pointers (up to 25 args)
  ;; 200-511: argv string buffer
  ;; 512-611: environ pointers (up to 25 env vars)
  ;; 612-1023: environ string buffer
  ;; 1024-1031: iovec for stdout
  ;; 1032-1035: nwritten result

  ;; "\n" at offset 1040
  (data (i32.const 1040) "\n")
  ;; newline iovec at 1048: buf=1040, len=1
  (data (i32.const 1048) "\10\04\00\00\01\00\00\00")

  (func $_start (export "_start")
    ;; ── Step 1: Get args sizes ──
    ;; args_sizes_get(argc_ptr=0, argv_buf_size_ptr=4)
    (call $args_sizes_get (i32.const 0) (i32.const 4))
    (if (then (call $proc_exit (i32.const 10))))

    ;; Check argc >= 2
    (if (i32.lt_u (i32.load (i32.const 0)) (i32.const 2))
      (then (call $proc_exit (i32.const 11))))

    ;; ── Step 2: Get args ──
    ;; args_get(argv_ptr=100, argv_buf=200)
    (call $args_get (i32.const 100) (i32.const 200))
    (if (then (call $proc_exit (i32.const 20))))

    ;; ── Step 3: Write argv[1] to stdout ──
    ;; argv[1] pointer is at offset 104 (second i32 in argv array)
    ;; We need to find the length by scanning for NUL
    ;; For simplicity, use a helper: compute length of argv[1]
    (call $write_cstring_to_stdout (i32.load (i32.const 104)))
    ;; Write newline
    (call $fd_write (i32.const 1) (i32.const 1048) (i32.const 1) (i32.const 1032))
    drop

    ;; ── Step 4: Get environ sizes ──
    ;; environ_sizes_get(count_ptr=8, buf_size_ptr=12)
    (call $environ_sizes_get (i32.const 8) (i32.const 12))
    (if (then (call $proc_exit (i32.const 30))))

    ;; Check environ_count >= 1
    (if (i32.lt_u (i32.load (i32.const 8)) (i32.const 1))
      (then (call $proc_exit (i32.const 31))))

    ;; ── Step 5: Get environ ──
    ;; environ_get(environ_ptr=512, environ_buf=612)
    (call $environ_get (i32.const 512) (i32.const 612))
    (if (then (call $proc_exit (i32.const 40))))

    ;; ── Step 6: Write environ[0] to stdout ──
    ;; environ[0] pointer is at offset 512
    (call $write_cstring_to_stdout (i32.load (i32.const 512)))
    ;; Write newline
    (call $fd_write (i32.const 1) (i32.const 1048) (i32.const 1) (i32.const 1032))
    drop

    ;; Exit 0
    (call $proc_exit (i32.const 0))
  )

  ;; Helper: write a NUL-terminated C string to stdout
  ;; Uses iovec at 1024
  (func $write_cstring_to_stdout (param $ptr i32)
    (local $len i32)
    ;; Compute string length by scanning for NUL byte
    (local.set $len (i32.const 0))
    (block $done
      (loop $scan
        (br_if $done (i32.eqz (i32.load8_u (i32.add (local.get $ptr) (local.get $len)))))
        (local.set $len (i32.add (local.get $len) (i32.const 1)))
        (br $scan)
      )
    )
    ;; Set up iovec at 1024: {buf=ptr, buf_len=len}
    (i32.store (i32.const 1024) (local.get $ptr))
    (i32.store (i32.const 1028) (local.get $len))
    ;; fd_write(fd=1, iovs=1024, iovs_count=1, nwritten=1032)
    (call $fd_write (i32.const 1) (i32.const 1024) (i32.const 1) (i32.const 1032))
    drop
  )
)
