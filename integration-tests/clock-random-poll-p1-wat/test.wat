;; WASI Preview 1 test: clocks, random, poll_oneoff, sched_yield.
;; Tests each returns errno 0 (success) and writes "ok\n" to stdout.
;; Exit code: 0 on success, 10-90 on failure at various stages.

(module
  (import "wasi_snapshot_preview1" "clock_res_get"
    (func $clock_res_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "clock_time_get"
    (func $clock_time_get (param i32 i64 i32) (result i32)))
  (import "wasi_snapshot_preview1" "random_get"
    (func $random_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "poll_oneoff"
    (func $poll_oneoff (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "sched_yield"
    (func $sched_yield (result i32)))
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit"
    (func $proc_exit (param i32)))

  (memory (export "memory") 1)

  ;; Layout:
  ;; 0-7:     clock_res result (u64)
  ;; 8-15:    clock_time result (u64)
  ;; 16-79:   random bytes buffer (64 bytes)
  ;; 100-147: poll subscription (48 bytes)
  ;; 200-231: poll event output (32 bytes)
  ;; 300-303: poll nevents result (u32)
  ;; 400-402: "ok\n" string
  ;; 408-415: iovec for stdout {buf=400, len=3}
  ;; 416-419: nwritten result

  ;; "ok\n" at 400
  (data (i32.const 400) "ok\n")
  ;; iovec at 408: buf=400, len=3
  (data (i32.const 408) "\90\01\00\00\03\00\00\00")

  ;; poll subscription at 100: clock subscription for monotonic clock
  ;; userdata: 42 (u64 LE at offset 0)
  ;; u.tag: 0 (Eventtype.Clock, u8 at offset 8)
  ;; u.clock.id: 1 (Clockid.Monotonic, u32 LE at offset 16)
  ;; u.clock.timeout: 0 ns (u64 LE at offset 24) — immediate
  ;; u.clock.precision: 0 (u64 LE at offset 32)
  ;; u.clock.flags: 0 (u16 LE at offset 40) — relative timeout
  (data (i32.const 100)
    "\2a\00\00\00\00\00\00\00"  ;; userdata = 42
    "\00"                       ;; tag = 0 (Clock)
    "\00\00\00\00\00\00\00"     ;; padding to offset 16
    "\01\00\00\00"              ;; clock.id = 1 (Monotonic)
    "\00\00\00\00"              ;; padding
    "\00\00\00\00\00\00\00\00"  ;; clock.timeout = 0
    "\00\00\00\00\00\00\00\00"  ;; clock.precision = 0
    "\00\00"                    ;; clock.flags = 0
    "\00\00\00\00\00\00"        ;; padding to 48
  )

  (func $_start (export "_start")
    ;; ── Step 1: clock_res_get for realtime clock (id=0) ──
    (call $clock_res_get (i32.const 0) (i32.const 0))
    (if (then (call $proc_exit (i32.const 10))))
    ;; Resolution should be > 0
    (if (i64.eqz (i64.load (i32.const 0)))
      (then (call $proc_exit (i32.const 11))))

    ;; ── Step 2: clock_res_get for monotonic clock (id=1) ──
    (call $clock_res_get (i32.const 1) (i32.const 0))
    (if (then (call $proc_exit (i32.const 12))))
    (if (i64.eqz (i64.load (i32.const 0)))
      (then (call $proc_exit (i32.const 13))))

    ;; ── Step 3: clock_time_get for realtime (id=0, precision=0) ──
    (call $clock_time_get (i32.const 0) (i64.const 0) (i32.const 8))
    (if (then (call $proc_exit (i32.const 20))))
    ;; Time should be > 0 (nanoseconds since epoch)
    (if (i64.eqz (i64.load (i32.const 8)))
      (then (call $proc_exit (i32.const 21))))

    ;; ── Step 4: clock_time_get for monotonic (id=1, precision=0) ──
    (call $clock_time_get (i32.const 1) (i64.const 0) (i32.const 8))
    (if (then (call $proc_exit (i32.const 22))))

    ;; ── Step 5: random_get — fill 64 bytes ──
    ;; First clear the buffer
    (memory.fill (i32.const 16) (i32.const 0) (i32.const 64))
    (call $random_get (i32.const 16) (i32.const 64))
    (if (then (call $proc_exit (i32.const 30))))
    ;; Check at least one non-zero byte (statistically impossible to fail)
    (call $check_nonzero (i32.const 16) (i32.const 64))
    (if (i32.eqz)
      (then (call $proc_exit (i32.const 31))))

    ;; ── Step 6: poll_oneoff — one clock subscription ──
    ;; in=100 (subscription), out=200 (event), nsubs=1, nevents_ptr=300
    (call $poll_oneoff (i32.const 100) (i32.const 200) (i32.const 1) (i32.const 300))
    (if (then (call $proc_exit (i32.const 40))))
    ;; Check nevents == 1
    (if (i32.ne (i32.load (i32.const 300)) (i32.const 1))
      (then (call $proc_exit (i32.const 41))))
    ;; Check event userdata == 42
    (if (i64.ne (i64.load (i32.const 200)) (i64.const 42))
      (then (call $proc_exit (i32.const 42))))
    ;; Check event error == 0 (success) at offset 8
    (if (i32.load16_u (i32.const 208))
      (then (call $proc_exit (i32.const 43))))
    ;; Check event type == 0 (Clock) at offset 10
    (if (i32.load8_u (i32.const 210))
      (then (call $proc_exit (i32.const 44))))

    ;; ── Step 7: sched_yield ──
    (call $sched_yield)
    (if (then (call $proc_exit (i32.const 50))))

    ;; ── All passed — write "ok\n" to stdout ──
    (call $fd_write (i32.const 1) (i32.const 408) (i32.const 1) (i32.const 416))
    drop

    (call $proc_exit (i32.const 0))
  )

  ;; Helper: check if any byte in [ptr, ptr+len) is nonzero. Returns 1 if found, 0 otherwise.
  (func $check_nonzero (param $ptr i32) (param $len i32) (result i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $found
      (loop $scan
        (br_if $found (i32.load8_u (i32.add (local.get $ptr) (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $scan (i32.lt_u (local.get $i) (local.get $len)))
        (return (i32.const 0))
      )
    )
    (i32.const 1)
  )
)
