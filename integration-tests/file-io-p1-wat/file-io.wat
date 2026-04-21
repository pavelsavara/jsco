(module
  ;; WASI P1 imports for file I/O test
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_read"
    (func $fd_read (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_close"
    (func $fd_close (param i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_seek"
    (func $fd_seek (param i32 i64 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_prestat_get"
    (func $fd_prestat_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_prestat_dir_name"
    (func $fd_prestat_dir_name (param i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "path_open"
    (func $path_open (param i32 i32 i32 i32 i32 i64 i64 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; Layout:
  ;; 0-15:    "test-file.txt\00" (filename, 14 bytes)
  ;; 16-31:   "hello from file\n" (content to write, 16 bytes)
  ;; 100-107: iovec for writing content {buf=16, len=16}
  ;; 200-203: nwritten/nread result
  ;; 300-307: iovec for reading {buf=400, len=64}
  ;; 400-463: read buffer
  ;; 500-507: iovec for stdout write {buf=400, len=?} (filled dynamically)
  ;; 600-603: opened fd result
  ;; 700-707: seek result (u64)
  ;; 800-807: prestat result

  (data (i32.const 0)  "test-file.txt\00")
  (data (i32.const 16) "hello from file\n")

  ;; Write iovec: buf=16, buf_len=16
  (data (i32.const 100) "\10\00\00\00\10\00\00\00")

  ;; Read iovec: buf=400, buf_len=64
  (data (i32.const 300) "\90\01\00\00\40\00\00\00")

  (func $_start (export "_start")
    ;; Step 1: Enumerate preopens — fd 3 should be the root directory
    ;; fd_prestat_get(fd=3, prestat_ptr=800)
    (call $fd_prestat_get (i32.const 3) (i32.const 800))
    ;; If errno != 0, exit with code 10
    (if (then
      (call $proc_exit (i32.const 10))
    ))

    ;; Step 2: Open "test-file.txt" for writing (create + truncate)
    ;; path_open(fd=3, dirflags=0, path=0, path_len=13, oflags=Creat|Trunc=9,
    ;;           rights_base=ALL, rights_inh=ALL, fdflags=0, result_fd_ptr=600)
    (call $path_open
      (i32.const 3)        ;; dir fd
      (i32.const 0)        ;; dirflags
      (i32.const 0)        ;; path ptr
      (i32.const 13)       ;; path len ("test-file.txt")
      (i32.const 9)        ;; oflags: Creat(1) | Trunc(8)
      (i64.const -1)       ;; rights_base (all)
      (i64.const -1)       ;; rights_inh (all)
      (i32.const 0)        ;; fdflags
      (i32.const 600)      ;; result fd ptr
    )
    ;; If errno != 0, exit with code 20
    (if (then
      (call $proc_exit (i32.const 20))
    ))

    ;; Step 3: Write "hello from file\n" to the opened fd
    ;; fd_write(fd=<opened>, iovs=100, iovs_count=1, nwritten=200)
    (call $fd_write
      (i32.load (i32.const 600))  ;; opened fd
      (i32.const 100)             ;; iovs
      (i32.const 1)               ;; iovs count
      (i32.const 200)             ;; nwritten
    )
    (if (then
      (call $proc_exit (i32.const 30))
    ))

    ;; Step 4: Close the file
    (call $fd_close (i32.load (i32.const 600)))
    (if (then
      (call $proc_exit (i32.const 40))
    ))

    ;; Step 5: Re-open the file for reading
    ;; path_open(fd=3, dirflags=0, path=0, path_len=13, oflags=0,
    ;;           rights_base=ALL, rights_inh=ALL, fdflags=0, result_fd_ptr=600)
    (call $path_open
      (i32.const 3)        ;; dir fd
      (i32.const 0)        ;; dirflags
      (i32.const 0)        ;; path ptr
      (i32.const 13)       ;; path len
      (i32.const 0)        ;; oflags: none
      (i64.const -1)       ;; rights_base
      (i64.const -1)       ;; rights_inh
      (i32.const 0)        ;; fdflags
      (i32.const 600)      ;; result fd ptr
    )
    (if (then
      (call $proc_exit (i32.const 50))
    ))

    ;; Step 6: Read from the file
    ;; fd_read(fd=<opened>, iovs=300, iovs_count=1, nread=200)
    (call $fd_read
      (i32.load (i32.const 600))  ;; opened fd
      (i32.const 300)             ;; iovs
      (i32.const 1)               ;; iovs count
      (i32.const 200)             ;; nread
    )
    (if (then
      (call $proc_exit (i32.const 60))
    ))

    ;; Step 7: Write the read content to stdout
    ;; Set up stdout iovec at 500: buf=400, buf_len=<nread from 200>
    (i32.store (i32.const 500) (i32.const 400))
    (i32.store (i32.const 504) (i32.load (i32.const 200)))
    ;; fd_write(fd=1, iovs=500, iovs_count=1, nwritten=200)
    (call $fd_write
      (i32.const 1)        ;; stdout
      (i32.const 500)      ;; iovs
      (i32.const 1)        ;; iovs count
      (i32.const 200)      ;; nwritten
    )
    (if (then
      (call $proc_exit (i32.const 70))
    ))

    ;; Step 8: Close the file and exit successfully
    (call $fd_close (i32.load (i32.const 600)))
    drop
    (call $proc_exit (i32.const 0))
  )
)
