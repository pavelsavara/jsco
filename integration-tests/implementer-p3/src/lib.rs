wit_bindgen::generate!({
    inline: "
        package jsco:implementer-p3@0.1.0;

        world implementer-p3 {
            export wasi:cli/environment@0.3.0-rc-2026-03-15;
            export wasi:cli/exit@0.3.0-rc-2026-03-15;
            export wasi:random/random@0.3.0-rc-2026-03-15;
            export wasi:clocks/monotonic-clock@0.3.0-rc-2026-03-15;
            export wasi:clocks/system-clock@0.3.0-rc-2026-03-15;
            export jsco:test/echo-primitives@0.1.0;
            export jsco:test/echo-compound@0.1.0;
            export jsco:test/echo-algebraic@0.1.0;
            export jsco:test/echo-complex@0.1.0;
        }
    ",
    path: [
        "../../wit/wasip3/cli",
        "../../wit",
    ],
    world: "jsco:implementer-p3/implementer-p3",
    pub_export_macro: true,
    generate_all,
});

use exports::wasi::cli::environment::Guest as EnvironmentGuest;
use exports::wasi::cli::exit::Guest as ExitGuest;
use exports::wasi::random::random::Guest as RandomGuest;
use exports::wasi::clocks::monotonic_clock::Guest as MonotonicClockGuest;
use exports::wasi::clocks::system_clock::Guest as SystemClockGuest;
use exports::jsco::test::echo_primitives::Guest as EchoPrimitivesGuest;
use exports::jsco::test::echo_compound::Guest as EchoCompoundGuest;
use exports::jsco::test::echo_compound::{LabeledPoint, Point};
use exports::jsco::test::echo_algebraic::Guest as EchoAlgebraicGuest;
use exports::jsco::test::echo_algebraic::{Color, Permissions, Shape};
use exports::jsco::test::echo_complex::Guest as EchoComplexGuest;
use exports::jsco::test::echo_complex::{
    Address, Geometry, KitchenSink, Message, Person, Team,
};

struct Component;

export!(Component);

static mut MONOTONIC_COUNTER: u64 = 1_000_000;

impl EnvironmentGuest for Component {
    fn get_environment() -> Vec<(String, String)> {
        vec![
            ("JSCO_TEST_MODE".to_string(), "fake".to_string()),
            ("TEST_SPECIAL".to_string(), "hello=world 🌍".to_string()),
            ("HOME".to_string(), "/fake/home".to_string()),
        ]
    }

    fn get_arguments() -> Vec<String> {
        vec!["fake-program".to_string(), "--fake-arg".to_string()]
    }

    fn get_initial_cwd() -> Option<String> {
        Some("/fake/cwd".to_string())
    }
}

impl ExitGuest for Component {
    fn exit(_status: Result<(), ()>) {}
}

impl RandomGuest for Component {
    fn get_random_bytes(len: u64) -> Vec<u8> {
        (0..len).map(|i| (i & 0xFF) as u8).collect()
    }
    fn get_random_u64() -> u64 {
        0xDEAD_BEEF_CAFE_BABE
    }
}

impl MonotonicClockGuest for Component {
    fn now() -> u64 {
        unsafe {
            MONOTONIC_COUNTER += 1000;
            MONOTONIC_COUNTER
        }
    }
    fn get_resolution() -> u64 {
        1_000
    }
    async fn wait_until(_when: u64) {}
    async fn wait_for(_how_long: u64) {}
}

impl SystemClockGuest for Component {
    fn now() -> exports::wasi::clocks::system_clock::Instant {
        exports::wasi::clocks::system_clock::Instant {
            seconds: 1_700_000_000,
            nanoseconds: 123_456_789,
        }
    }
    fn get_resolution() -> u64 {
        1_000_000
    }
}

impl EchoPrimitivesGuest for Component {
    fn echo_bool(v: bool) -> bool { v }
    fn echo_u8(v: u8) -> u8 { v }
    fn echo_u16(v: u16) -> u16 { v }
    fn echo_u32(v: u32) -> u32 { v }
    fn echo_u64(v: u64) -> u64 { v }
    fn echo_s8(v: i8) -> i8 { v }
    fn echo_s16(v: i16) -> i16 { v }
    fn echo_s32(v: i32) -> i32 { v }
    fn echo_s64(v: i64) -> i64 { v }
    fn echo_f32(v: f32) -> f32 { v }
    fn echo_f64(v: f64) -> f64 { v }
    fn echo_char(v: char) -> char { v }
    fn echo_string(v: String) -> String { v }
}

impl EchoCompoundGuest for Component {
    fn echo_tuple2(v: (u32, String)) -> (u32, String) { v }
    fn echo_tuple3(v: (f32, f32, f32)) -> (f32, f32, f32) { v }
    fn echo_record(v: Point) -> Point { v }
    fn echo_nested_record(v: LabeledPoint) -> LabeledPoint { v }
    fn echo_list_u8(v: Vec<u8>) -> Vec<u8> { v }
    fn echo_list_string(v: Vec<String>) -> Vec<String> { v }
    fn echo_list_record(v: Vec<Point>) -> Vec<Point> { v }
    fn echo_option_u32(v: Option<u32>) -> Option<u32> { v }
    fn echo_option_string(v: Option<String>) -> Option<String> { v }
    fn echo_result_ok(v: Result<String, String>) -> Result<String, String> { v }
}

impl EchoAlgebraicGuest for Component {
    fn echo_enum(v: Color) -> Color { v }
    fn echo_flags(v: Permissions) -> Permissions { v }
    fn echo_variant(v: Shape) -> Shape { v }
}

impl EchoComplexGuest for Component {
    fn echo_deeply_nested(v: Team) -> Team { v }
    fn echo_list_of_records(v: Vec<Person>) -> Vec<Person> { v }
    fn echo_tuple_of_records(v: (Person, Address)) -> (Person, Address) { v }
    fn echo_complex_variant(v: Geometry) -> Geometry { v }
    fn echo_message(v: Message) -> Message { v }
    fn echo_kitchen_sink(v: KitchenSink) -> KitchenSink { v }
    fn echo_nested_lists(v: Vec<Vec<u32>>) -> Vec<Vec<u32>> { v }
    fn echo_option_record(v: Option<Person>) -> Option<Person> { v }
    fn echo_result_record(v: Result<Person, String>) -> Result<Person, String> { v }
    fn echo_list_of_variants(v: Vec<Geometry>) -> Vec<Geometry> { v }
}

fn main() {}