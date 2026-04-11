#[allow(warnings)]
mod bindings;

use bindings::jsco::test::counter::Counter;
use bindings::jsco::test::logger::{self, Level};
use bindings::jsco::test::echo_primitives;
use bindings::jsco::test::echo_compound;
use bindings::jsco::test::echo_algebraic;
use bindings::wasi::clocks::{monotonic_clock, wall_clock};
use bindings::wasi::random::random;
use bindings::exports::wasi::cli::run::Guest;

struct Component;

bindings::export!(Component with_types_in bindings);

fn pass(name: &str) {
    println!("[PASS] {name}");
}

fn fail(name: &str, reason: &str) {
    println!("[FAIL] {name}: {reason}");
}

fn is_fake_mode() -> bool {
    let env = bindings::wasi::cli::environment::get_environment();
    env.iter().any(|(k, v)| k == "JSCO_TEST_MODE" && v == "fake")
}

impl Guest for Component {
    fn run() -> Result<(), ()> {
        let mut failures = 0u32;
        let fake = is_fake_mode();

        // --- Environment tests ---
        {
            let args = bindings::wasi::cli::environment::get_arguments();
            if !args.is_empty() {
                pass("env_get_arguments");
            } else {
                fail("env_get_arguments", "expected non-empty arguments");
                failures += 1;
            }
        }
        {
            let env = bindings::wasi::cli::environment::get_environment();
            if !env.is_empty() {
                pass("env_get_environment");
            } else {
                fail("env_get_environment", "expected non-empty environment");
                failures += 1;
            }
        }
        {
            let env = bindings::wasi::cli::environment::get_environment();
            let test_var = env.iter().find(|(k, _)| k == "TEST_SPECIAL");
            if let Some((_, v)) = test_var {
                if v == "hello=world 🌍" {
                    pass("env_special_chars");
                } else {
                    fail("env_special_chars", &format!("unexpected value: {v}"));
                    failures += 1;
                }
            } else {
                fail("env_special_chars", "TEST_SPECIAL not found");
                failures += 1;
            }
        }

        // --- Stdout / stderr tests ---
        {
            println!("stdout_test_output");
            pass("stdout_println");
        }
        {
            eprintln!("stderr_test_output");
            pass("stderr_eprintln");
        }

        // --- Random tests ---
        {
            let bytes = random::get_random_bytes(16);
            if bytes.len() == 16 {
                pass("random_get_16_bytes");
            } else {
                fail("random_get_16_bytes", &format!("got {} bytes", bytes.len()));
                failures += 1;
            }
        }
        {
            let bytes = random::get_random_bytes(0);
            if bytes.is_empty() {
                pass("random_get_0_bytes");
            } else {
                fail("random_get_0_bytes", &format!("got {} bytes", bytes.len()));
                failures += 1;
            }
        }
        {
            let a = random::get_random_bytes(16);
            let b = random::get_random_bytes(16);
            if !fake {
                if a != b {
                    pass("random_two_calls_differ");
                } else {
                    fail("random_two_calls_differ", "two calls returned same bytes");
                    failures += 1;
                }
            } else {
                // In fake mode, random may be deterministic
                pass("random_two_calls_differ");
            }
        }

        // --- Clock tests ---
        {
            let now = monotonic_clock::now();
            if now > 0 {
                pass("monotonic_clock_now_positive");
            } else {
                fail("monotonic_clock_now_positive", &format!("got {now}"));
                failures += 1;
            }
        }
        {
            let a = monotonic_clock::now();
            let b = monotonic_clock::now();
            if b >= a {
                pass("monotonic_clock_non_decreasing");
            } else {
                fail("monotonic_clock_non_decreasing", &format!("{b} < {a}"));
                failures += 1;
            }
        }
        {
            let res = monotonic_clock::resolution();
            if res > 0 {
                pass("monotonic_clock_resolution_positive");
            } else {
                fail("monotonic_clock_resolution_positive", &format!("got {res}"));
                failures += 1;
            }
        }
        {
            let now = wall_clock::now();
            if now.seconds > 1_577_836_800 {
                pass("wall_clock_after_2020");
            } else if fake {
                pass("wall_clock_after_2020");
            } else {
                fail("wall_clock_after_2020", &format!("seconds={}", now.seconds));
                failures += 1;
            }
        }
        {
            let now = wall_clock::now();
            if now.nanoseconds < 1_000_000_000 {
                pass("wall_clock_nanos_in_range");
            } else {
                fail("wall_clock_nanos_in_range", &format!("nanos={}", now.nanoseconds));
                failures += 1;
            }
        }

        // --- Logger tests (custom interface) ---
        {
            logger::log(Level::Info, "test message");
            pass("logger_log");
        }
        {
            logger::structured_log(
                Level::Debug,
                "structured test",
                &[
                    ("key".to_string(), "value".to_string()),
                    ("emoji".to_string(), "🔧".to_string()),
                ],
            );
            pass("logger_structured_log");
        }

        // --- Counter tests (custom resource) ---
        {
            let c = Counter::new("test-counter");
            let val = c.get();
            if val == 0 {
                pass("counter_initial_zero");
            } else {
                fail("counter_initial_zero", &format!("got {val}"));
                failures += 1;
            }
        }
        {
            let c = Counter::new("inc-counter");
            c.increment();
            c.increment();
            c.increment();
            let val = c.get();
            if val == 3 {
                pass("counter_increment_three");
            } else {
                fail("counter_increment_three", &format!("expected 3, got {val}"));
                failures += 1;
            }
        }
        {
            let a = Counter::new("counter-a");
            let b = Counter::new("counter-b");
            a.increment();
            a.increment();
            b.increment();
            if a.get() == 2 && b.get() == 1 {
                pass("counter_independent");
            } else {
                fail("counter_independent", &format!("a={}, b={}", a.get(), b.get()));
                failures += 1;
            }
        }

        // --- Echo primitives tests ---
        {
            if echo_primitives::echo_bool(true) == true {
                pass("echo_bool");
            } else { fail("echo_bool", "wrong value"); failures += 1; }
        }
        {
            if echo_primitives::echo_u32(42) == 42 {
                pass("echo_u32");
            } else { fail("echo_u32", "wrong value"); failures += 1; }
        }
        {
            if echo_primitives::echo_s64(-999) == -999 {
                pass("echo_s64");
            } else { fail("echo_s64", "wrong value"); failures += 1; }
        }
        {
            if echo_primitives::echo_f64(3.14) == 3.14 {
                pass("echo_f64");
            } else { fail("echo_f64", "wrong value"); failures += 1; }
        }
        {
            if echo_primitives::echo_char('🎯') == '🎯' {
                pass("echo_char");
            } else { fail("echo_char", "wrong value"); failures += 1; }
        }
        {
            if echo_primitives::echo_string("hello 🌍") == "hello 🌍" {
                pass("echo_string");
            } else { fail("echo_string", "wrong value"); failures += 1; }
        }

        // --- Echo compound tests ---
        {
            let v = echo_compound::echo_tuple2((7, "tuple"));
            if v.0 == 7 && v.1 == "tuple" {
                pass("echo_tuple2");
            } else { fail("echo_tuple2", "wrong value"); failures += 1; }
        }
        {
            let p = echo_compound::echo_record(echo_compound::Point { x: 1.0, y: 2.0 });
            if p.x == 1.0 && p.y == 2.0 {
                pass("echo_record");
            } else { fail("echo_record", "wrong value"); failures += 1; }
        }
        {
            let v = echo_compound::echo_list_u8(&[1, 2, 3]);
            if v == vec![1, 2, 3] {
                pass("echo_list_u8");
            } else { fail("echo_list_u8", "wrong value"); failures += 1; }
        }
        {
            let v = echo_compound::echo_option_u32(Some(42));
            if v == Some(42) {
                pass("echo_option_u32");
            } else { fail("echo_option_u32", "wrong value"); failures += 1; }
        }
        {
            let v = echo_compound::echo_result_ok(Ok("ok"));
            if v == Ok("ok".to_string()) {
                pass("echo_result_ok");
            } else { fail("echo_result_ok", "wrong value"); failures += 1; }
        }

        // --- Echo algebraic tests ---
        {
            let v = echo_algebraic::echo_enum(echo_algebraic::Color::Blue);
            if matches!(v, echo_algebraic::Color::Blue) {
                pass("echo_enum");
            } else { fail("echo_enum", "wrong value"); failures += 1; }
        }
        {
            let v = echo_algebraic::echo_flags(echo_algebraic::Permissions::READ | echo_algebraic::Permissions::EXECUTE);
            if v.contains(echo_algebraic::Permissions::READ) && v.contains(echo_algebraic::Permissions::EXECUTE) && !v.contains(echo_algebraic::Permissions::WRITE) {
                pass("echo_flags");
            } else { fail("echo_flags", "wrong value"); failures += 1; }
        }
        {
            let v = echo_algebraic::echo_variant(&echo_algebraic::Shape::Circle(5.0));
            if matches!(v, echo_algebraic::Shape::Circle(r) if r == 5.0) {
                pass("echo_variant");
            } else { fail("echo_variant", "wrong value"); failures += 1; }
        }

        if failures > 0 {
            eprintln!("{failures} test(s) failed");
            Err(())
        } else {
            Ok(())
        }
    }
}
