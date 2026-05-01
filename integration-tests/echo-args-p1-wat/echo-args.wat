;; Hand-written WASI Preview 1 (wasi_snapshot_preview1) core module.
;; Echoes the argv vector to stdout, one arg per line — the WASIp1 analogue
;; of an "echo my arguments" function.
;;
;; Imports: wasi_snapshot_preview1.{args_sizes_get,args_get,fd_write,proc_exit}
;; Exports: _start, memory
;;
;; Memory layout (page 0 = 64 KiB, plenty for typical argv sizes):
;;   0x0000   scratch buffer for argv pointer table + arg byte storage
;;   0x4000   scratch sizes_get retptr0/retptr1 (argc, argv_buf_size)
;;   0x4010   ciovec  { buf, len }  — set per write
;;   0x4018   nwritten_ptr
;;   0x4020   1-byte newline buffer ("\n")

(module
  (import "wasi_snapshot_preview1" "args_sizes_get"
    (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get"
    (func $args_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; Pre-load a "\n" byte at 0x4020 for line separators.
  (data (i32.const 0x4020) "\n")

  ;; --- helper: write a single ciovec(buf, len) to stdout, exit on error.
  (func $write1 (param $buf i32) (param $len i32)
    (local $rc i32)
    (i32.store (i32.const 0x4010) (local.get $buf))
    (i32.store (i32.const 0x4014) (local.get $len))
    (local.set $rc
      (call $fd_write
        (i32.const 1)        ;; stdout
        (i32.const 0x4010)   ;; iovec
        (i32.const 1)
        (i32.const 0x4018))) ;; nwritten_ptr
    (if (i32.ne (local.get $rc) (i32.const 0))
      (then
        (call $proc_exit (local.get $rc))
        unreachable))
  )

  ;; --- helper: strlen on a NUL-terminated cstring at $ptr.
  (func $strlen (param $ptr i32) (result i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $scan
        (br_if $done (i32.eqz (i32.load8_u (i32.add (local.get $ptr) (local.get $i)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $scan)
      )
    )
    (local.get $i)
  )

  (func $_start (export "_start")
    (local $rc i32)
    (local $argc i32)
    (local $argv-buf-size i32)
    (local $argv-table i32)
    (local $argv-buf i32)
    (local $i i32)
    (local $arg-ptr i32)
    (local $arg-len i32)

    ;; args_sizes_get(retptr0=0x4000, retptr1=0x4004)
    (local.set $rc
      (call $args_sizes_get (i32.const 0x4000) (i32.const 0x4004)))
    (if (i32.ne (local.get $rc) (i32.const 0))
      (then
        (call $proc_exit (local.get $rc))
        unreachable))

    (local.set $argc          (i32.load (i32.const 0x4000)))
    (local.set $argv-buf-size (i32.load (i32.const 0x4004)))

    ;; argc == 0 → nothing to print, clean exit.
    (if (i32.eqz (local.get $argc))
      (then
        (call $proc_exit (i32.const 0))
        unreachable))

    ;; Place argv pointer table at 0x0000 and the argv byte buffer right
    ;; after it (argc * 4 bytes for the pointer array).
    (local.set $argv-table (i32.const 0x0000))
    (local.set $argv-buf
      (i32.add (local.get $argv-table) (i32.mul (local.get $argc) (i32.const 4))))

    ;; args_get(argv=$argv-table, argv_buf=$argv-buf)
    (local.set $rc
      (call $args_get (local.get $argv-table) (local.get $argv-buf)))
    (if (i32.ne (local.get $rc) (i32.const 0))
      (then
        (call $proc_exit (local.get $rc))
        unreachable))

    ;; For each arg: strlen + write + newline.
    (local.set $i (i32.const 0))
    (block $done
      (loop $each
        (br_if $done (i32.ge_u (local.get $i) (local.get $argc)))

        (local.set $arg-ptr
          (i32.load (i32.add (local.get $argv-table) (i32.mul (local.get $i) (i32.const 4)))))
        (local.set $arg-len (call $strlen (local.get $arg-ptr)))

        (call $write1 (local.get $arg-ptr) (local.get $arg-len))
        (call $write1 (i32.const 0x4020) (i32.const 1))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $each)
      )
    )

    (call $proc_exit (i32.const 0))
  )
)
