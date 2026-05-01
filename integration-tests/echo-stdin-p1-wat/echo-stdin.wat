;; Hand-written WASI Preview 1 (wasi_snapshot_preview1) core module.
;; Reads bytes from stdin (fd 0) and writes them to stdout (fd 1) until EOF
;; — the WASIp1 analogue of the component-model `echo` interfaces. This is
;; the unix `cat` shape: a tight loop of `fd_read` + `fd_write` over the
;; same scratch buffer.
;;
;; Imports: wasi_snapshot_preview1.{fd_read,fd_write,proc_exit}
;; Exports: _start, memory
;;
;; Memory layout (page 0 = 64 KiB):
;;   0x0000               scratch read/write buffer (4 KiB)
;;   0x1000  iovec_in     { buf=0x0000, len=0x1000 }      ;; read target
;;   0x1008  iovec_out    { buf=0x0000, len=<actual>   }  ;; write source
;;   0x1010  nread_ptr    fd_read out — bytes read
;;   0x1014  nwritten_ptr fd_write out — bytes written

(module
  (import "wasi_snapshot_preview1" "fd_read"
    (func $fd_read (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; Pre-fill the read iovec — buf=0x0000, len=0x1000 (4096).
  (data (i32.const 0x1000) "\00\00\00\00\00\10\00\00")

  (func $_start (export "_start")
    (local $rc i32)
    (local $nread i32)
    (local $written i32)
    (local $remaining i32)
    (local $buf-cursor i32)

    (block $exit
      (loop $copy-loop
        ;; fd_read(fd=0, iovs=0x1000, iovs_count=1, retptr=0x1010)
        (local.set $rc
          (call $fd_read
            (i32.const 0)        ;; stdin
            (i32.const 0x1000)   ;; iovec
            (i32.const 1)
            (i32.const 0x1010))) ;; nread_ptr
        ;; Errno != 0 → bail out with that exit code.
        (if (i32.ne (local.get $rc) (i32.const 0))
          (then
            (call $proc_exit (local.get $rc))
            unreachable))

        ;; Read the actual byte count.
        (local.set $nread (i32.load (i32.const 0x1010)))

        ;; nread == 0 means EOF — done.
        (br_if $exit (i32.eqz (local.get $nread)))

        ;; Write loop: fd_write may report a short write, so keep calling
        ;; until everything in the scratch buffer has been flushed.
        (local.set $remaining (local.get $nread))
        (local.set $buf-cursor (i32.const 0))
        (loop $write-loop
          ;; iovec_out = { buf=$buf-cursor, len=$remaining }
          (i32.store (i32.const 0x1008) (local.get $buf-cursor))
          (i32.store (i32.const 0x100c) (local.get $remaining))
          (local.set $rc
            (call $fd_write
              (i32.const 1)        ;; stdout
              (i32.const 0x1008)   ;; iovec
              (i32.const 1)
              (i32.const 0x1014))) ;; nwritten_ptr
          (if (i32.ne (local.get $rc) (i32.const 0))
            (then
              (call $proc_exit (local.get $rc))
              unreachable))
          (local.set $written (i32.load (i32.const 0x1014)))
          ;; A zero-length write would loop forever — guard against that.
          (if (i32.eqz (local.get $written))
            (then
              (call $proc_exit (i32.const 76)) ;; ENOTRECOVERABLE
              unreachable))
          (local.set $remaining (i32.sub (local.get $remaining) (local.get $written)))
          (local.set $buf-cursor (i32.add (local.get $buf-cursor) (local.get $written)))
          (br_if $write-loop (i32.gt_u (local.get $remaining) (i32.const 0)))
        )
        (br $copy-loop)
      )
    )

    (call $proc_exit (i32.const 0))
  )
)
