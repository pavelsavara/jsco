#[allow(warnings)]
mod bindings;

use bindings::jsco::test::counter::Counter;
use bindings::jsco::test::logger::{self, Level};
use bindings::jsco::test::echo_primitives;
use bindings::jsco::test::echo_compound;
use bindings::jsco::test::echo_algebraic;
use bindings::jsco::test::echo_complex;
use bindings::jsco::test::echo_resources;
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

        // --- Echo complex tests ---
        {
            let addr = echo_complex::Address { street: "123 Main".to_string(), city: "Springfield".to_string(), zip: "62701".to_string() };
            let person = echo_complex::Person {
                name: "Alice".to_string(),
                age: 30,
                email: Some("alice@example.com".to_string()),
                address: addr,
                tags: vec!["admin".to_string(), "user".to_string()],
            };
            let team = echo_complex::Team {
                name: "Alpha".to_string(),
                lead: person.clone(),
                members: vec![person.clone()],
                metadata: vec![("key".to_string(), "val".to_string())],
            };
            let r = echo_complex::echo_deeply_nested(&team);
            if r.name == "Alpha" && r.lead.name == "Alice" && r.lead.address.city == "Springfield"
                && r.members.len() == 1 && r.metadata.len() == 1 {
                pass("echo_deeply_nested");
            } else { fail("echo_deeply_nested", "wrong value"); failures += 1; }
        }
        {
            let persons = vec![
                echo_complex::Person {
                    name: "Bob".to_string(), age: 25, email: None,
                    address: echo_complex::Address { street: "456 Oak".to_string(), city: "Shelbyville".to_string(), zip: "62702".to_string() },
                    tags: vec![],
                },
            ];
            let r = echo_complex::echo_list_of_records(&persons);
            if r.len() == 1 && r[0].name == "Bob" && r[0].age == 25 && r[0].email.is_none() {
                pass("echo_list_of_records");
            } else { fail("echo_list_of_records", "wrong value"); failures += 1; }
        }
        {
            let person = echo_complex::Person {
                name: "Carol".to_string(), age: 40, email: Some("carol@test.com".to_string()),
                address: echo_complex::Address { street: "789 Pine".to_string(), city: "Capital".to_string(), zip: "10001".to_string() },
                tags: vec!["vip".to_string()],
            };
            let addr = echo_complex::Address { street: "999 Elm".to_string(), city: "Remote".to_string(), zip: "99999".to_string() };
            let r = echo_complex::echo_tuple_of_records((&person, &addr));
            if r.0.name == "Carol" && r.1.city == "Remote" {
                pass("echo_tuple_of_records");
            } else { fail("echo_tuple_of_records", "wrong value"); failures += 1; }
        }
        {
            let poly = echo_complex::Geometry::Polygon(vec![
                echo_complex::Vec2 { x: 0.0, y: 0.0 },
                echo_complex::Vec2 { x: 1.0, y: 0.0 },
                echo_complex::Vec2 { x: 0.5, y: 1.0 },
            ]);
            let r = echo_complex::echo_complex_variant(&poly);
            if let echo_complex::Geometry::Polygon(pts) = r {
                if pts.len() == 3 && pts[2].y == 1.0 {
                    pass("echo_complex_variant");
                } else { fail("echo_complex_variant", "wrong polygon points"); failures += 1; }
            } else { fail("echo_complex_variant", "wrong variant case"); failures += 1; }
        }
        {
            let person = echo_complex::Person {
                name: "Dave".to_string(), age: 50, email: None,
                address: echo_complex::Address { street: "1 St".to_string(), city: "X".to_string(), zip: "00000".to_string() },
                tags: vec![],
            };
            let msg = echo_complex::Message::Structured(person);
            let r = echo_complex::echo_message(&msg);
            if let echo_complex::Message::Structured(p) = r {
                if p.name == "Dave" && p.age == 50 {
                    pass("echo_message");
                } else { fail("echo_message", "wrong person data"); failures += 1; }
            } else { fail("echo_message", "wrong variant case"); failures += 1; }
        }
        {
            let ks = echo_complex::KitchenSink {
                name: "sink".to_string(),
                values: vec![1, 2, 3],
                nested: vec![vec!["a".to_string(), "b".to_string()], vec!["c".to_string()]],
                pairs: vec![("x".to_string(), 10), ("y".to_string(), 20)],
                maybe: Some(vec![42]),
                result_field: Ok(vec!["ok".to_string()]),
            };
            let r = echo_complex::echo_kitchen_sink(&ks);
            if r.name == "sink" && r.values == vec![1, 2, 3] && r.nested.len() == 2
                && r.pairs.len() == 2 && r.maybe == Some(vec![42])
                && r.result_field == Ok(vec!["ok".to_string()]) {
                pass("echo_kitchen_sink");
            } else { fail("echo_kitchen_sink", "wrong value"); failures += 1; }
        }
        {
            let v = vec![vec![1, 2], vec![3, 4, 5]];
            let r = echo_complex::echo_nested_lists(&v);
            if r == v {
                pass("echo_nested_lists");
            } else { fail("echo_nested_lists", "wrong value"); failures += 1; }
        }
        {
            let person = echo_complex::Person {
                name: "Eve".to_string(), age: 28, email: Some("eve@test.com".to_string()),
                address: echo_complex::Address { street: "5 Rd".to_string(), city: "Town".to_string(), zip: "11111".to_string() },
                tags: vec!["tag".to_string()],
            };
            let r = echo_complex::echo_option_record(Some(&person));
            if let Some(p) = r {
                if p.name == "Eve" { pass("echo_option_record"); }
                else { fail("echo_option_record", "wrong name"); failures += 1; }
            } else { fail("echo_option_record", "got None"); failures += 1; }
        }
        {
            let person = echo_complex::Person {
                name: "Frank".to_string(), age: 35, email: None,
                address: echo_complex::Address { street: "6 Ave".to_string(), city: "Ville".to_string(), zip: "22222".to_string() },
                tags: vec![],
            };
            let r = echo_complex::echo_result_record(Ok(&person));
            if let Ok(p) = r {
                if p.name == "Frank" { pass("echo_result_record"); }
                else { fail("echo_result_record", "wrong name"); failures += 1; }
            } else { fail("echo_result_record", "got Err"); failures += 1; }
        }
        {
            let variants = vec![
                echo_complex::Geometry::Point2d(echo_complex::Vec2 { x: 1.0, y: 2.0 }),
                echo_complex::Geometry::Empty,
                echo_complex::Geometry::Line((echo_complex::Vec2 { x: 0.0, y: 0.0 }, echo_complex::Vec2 { x: 3.0, y: 4.0 })),
            ];
            let r = echo_complex::echo_list_of_variants(&variants);
            if r.len() == 3 && matches!(r[1], echo_complex::Geometry::Empty) {
                pass("echo_list_of_variants");
            } else { fail("echo_list_of_variants", "wrong value"); failures += 1; }
        }

        // --- Echo resources tests ---
        {
            let acc = echo_resources::Accumulator::new(10);
            acc.add(5);
            acc.add(3);
            if acc.get_total() == 18 {
                pass("accumulator_basic");
            } else { fail("accumulator_basic", &format!("expected 18, got {}", acc.get_total())); failures += 1; }
        }
        {
            let acc = echo_resources::Accumulator::new(100);
            let snap = acc.snapshot();
            acc.add(50);
            // snapshot should still be 100
            if snap.get_total() == 100 && acc.get_total() == 150 {
                pass("accumulator_snapshot");
            } else { fail("accumulator_snapshot", "snapshot or original value wrong"); failures += 1; }
        }
        {
            let acc = echo_resources::Accumulator::new(7);
            let total = echo_resources::inspect_borrowed(&acc);
            // acc should still be usable after borrow
            if total == 7 && acc.get_total() == 7 {
                pass("inspect_borrowed");
            } else { fail("inspect_borrowed", "wrong value"); failures += 1; }
        }
        {
            let acc = echo_resources::Accumulator::new(10);
            let result = echo_resources::transform_owned(acc);
            // should be doubled = 20
            if result.get_total() == 20 {
                pass("transform_owned");
            } else { fail("transform_owned", &format!("expected 20, got {}", result.get_total())); failures += 1; }
        }
        {
            let a = echo_resources::Accumulator::new(3);
            let b = echo_resources::Accumulator::new(7);
            let merged = echo_resources::merge_accumulators(a, b);
            if merged.get_total() == 10 {
                pass("merge_accumulators");
            } else { fail("merge_accumulators", &format!("expected 10, got {}", merged.get_total())); failures += 1; }
        }
        {
            let buf = echo_resources::ByteBuffer::new(&[10, 20, 30, 40, 50]);
            if buf.remaining() == 5 && !buf.is_empty() {
                let chunk = buf.read(3);
                if chunk == vec![10, 20, 30] && buf.remaining() == 2 {
                    pass("byte_buffer_basic");
                } else { fail("byte_buffer_basic", "read or remaining wrong"); failures += 1; }
            } else { fail("byte_buffer_basic", "initial state wrong"); failures += 1; }
        }
        {
            let buf = echo_resources::ByteBuffer::new(&[1, 2, 3]);
            let echoed = echo_resources::echo_buffer(buf);
            if echoed.remaining() == 3 {
                let data = echoed.read(10);
                if data == vec![1, 2, 3] {
                    pass("echo_buffer");
                } else { fail("echo_buffer", "wrong data"); failures += 1; }
            } else { fail("echo_buffer", &format!("expected 3 remaining, got {}", echoed.remaining())); failures += 1; }
        }

        if failures > 0 {
            eprintln!("{failures} test(s) failed");
            Err(())
        } else {
            Ok(())
        }
    }
}
