#[allow(warnings)]
mod bindings;

use bindings::exports::wasi::cli::environment::Guest as EnvironmentGuest;
use bindings::exports::wasi::cli::exit::Guest as ExitGuest;
use bindings::exports::wasi::cli::run::Guest as RunGuest;
use bindings::exports::wasi::cli::stdin::Guest as StdinGuest;
use bindings::exports::wasi::cli::stdout::Guest as StdoutGuest;
use bindings::exports::wasi::cli::stderr::Guest as StderrGuest;
use bindings::exports::wasi::random::random::Guest as RandomGuest;
use bindings::exports::wasi::clocks::monotonic_clock::Guest as MonotonicClockGuest;
use bindings::exports::wasi::clocks::wall_clock::Guest as WallClockGuest;

use bindings::exports::jsco::test::echo_primitives::Guest as EchoPrimitivesGuest;
use bindings::exports::jsco::test::echo_compound::Guest as EchoCompoundGuest;
use bindings::exports::jsco::test::echo_algebraic::Guest as EchoAlgebraicGuest;

use bindings::jsco::test::logger::{self, Level};

struct Component;

bindings::export!(Component with_types_in bindings);

fn log_forward(name: &str) {
    logger::log(Level::Debug, &format!("[forwarder] {name}"));
}

impl RunGuest for Component {
    fn run() -> Result<(), ()> {
        log_forward("run");
        // The forwarder doesn't have its own run logic — 
        // composition wires the consumer's run through
        Ok(())
    }
}

impl EnvironmentGuest for Component {
    fn get_environment() -> Vec<(String, String)> {
        log_forward("get-environment");
        bindings::wasi::cli::environment::get_environment()
    }

    fn get_arguments() -> Vec<String> {
        log_forward("get-arguments");
        bindings::wasi::cli::environment::get_arguments()
    }

    fn initial_cwd() -> Option<String> {
        log_forward("initial-cwd");
        bindings::wasi::cli::environment::initial_cwd()
    }
}

impl ExitGuest for Component {
    fn exit(status: Result<(), ()>) {
        log_forward("exit");
        bindings::wasi::cli::exit::exit(status);
    }
}

impl StdinGuest for Component {
    fn get_stdin() -> bindings::exports::wasi::cli::stdin::InputStream {
        log_forward("get-stdin");
        bindings::wasi::cli::stdin::get_stdin().into()
    }
}

impl StdoutGuest for Component {
    fn get_stdout() -> bindings::exports::wasi::cli::stdout::OutputStream {
        log_forward("get-stdout");
        bindings::wasi::cli::stdout::get_stdout().into()
    }
}

impl StderrGuest for Component {
    fn get_stderr() -> bindings::exports::wasi::cli::stderr::OutputStream {
        log_forward("get-stderr");
        bindings::wasi::cli::stderr::get_stderr().into()
    }
}

impl RandomGuest for Component {
    fn get_random_bytes(len: u64) -> Vec<u8> {
        log_forward("get-random-bytes");
        bindings::wasi::random::random::get_random_bytes(len)
    }

    fn get_random_u64() -> u64 {
        log_forward("get-random-u64");
        bindings::wasi::random::random::get_random_u64()
    }
}

impl MonotonicClockGuest for Component {
    fn now() -> u64 {
        log_forward("monotonic-clock::now");
        bindings::wasi::clocks::monotonic_clock::now()
    }

    fn resolution() -> u64 {
        log_forward("monotonic-clock::resolution");
        bindings::wasi::clocks::monotonic_clock::resolution()
    }

    fn subscribe_instant(when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        log_forward("monotonic-clock::subscribe-instant");
        bindings::wasi::clocks::monotonic_clock::subscribe_instant(when).into()
    }

    fn subscribe_duration(when: u64) -> bindings::exports::wasi::clocks::monotonic_clock::Pollable {
        log_forward("monotonic-clock::subscribe-duration");
        bindings::wasi::clocks::monotonic_clock::subscribe_duration(when).into()
    }
}

impl WallClockGuest for Component {
    fn now() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        log_forward("wall-clock::now");
        let dt = bindings::wasi::clocks::wall_clock::now();
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: dt.seconds,
            nanoseconds: dt.nanoseconds,
        }
    }

    fn resolution() -> bindings::exports::wasi::clocks::wall_clock::Datetime {
        log_forward("wall-clock::resolution");
        let dt = bindings::wasi::clocks::wall_clock::resolution();
        bindings::exports::wasi::clocks::wall_clock::Datetime {
            seconds: dt.seconds,
            nanoseconds: dt.nanoseconds,
        }
    }
}

impl EchoPrimitivesGuest for Component {
    fn echo_bool(v: bool) -> bool { log_forward("echo-bool"); bindings::jsco::test::echo_primitives::echo_bool(v) }
    fn echo_u8(v: u8) -> u8 { log_forward("echo-u8"); bindings::jsco::test::echo_primitives::echo_u8(v) }
    fn echo_u16(v: u16) -> u16 { log_forward("echo-u16"); bindings::jsco::test::echo_primitives::echo_u16(v) }
    fn echo_u32(v: u32) -> u32 { log_forward("echo-u32"); bindings::jsco::test::echo_primitives::echo_u32(v) }
    fn echo_u64(v: u64) -> u64 { log_forward("echo-u64"); bindings::jsco::test::echo_primitives::echo_u64(v) }
    fn echo_s8(v: i8) -> i8 { log_forward("echo-s8"); bindings::jsco::test::echo_primitives::echo_s8(v) }
    fn echo_s16(v: i16) -> i16 { log_forward("echo-s16"); bindings::jsco::test::echo_primitives::echo_s16(v) }
    fn echo_s32(v: i32) -> i32 { log_forward("echo-s32"); bindings::jsco::test::echo_primitives::echo_s32(v) }
    fn echo_s64(v: i64) -> i64 { log_forward("echo-s64"); bindings::jsco::test::echo_primitives::echo_s64(v) }
    fn echo_f32(v: f32) -> f32 { log_forward("echo-f32"); bindings::jsco::test::echo_primitives::echo_f32(v) }
    fn echo_f64(v: f64) -> f64 { log_forward("echo-f64"); bindings::jsco::test::echo_primitives::echo_f64(v) }
    fn echo_char(v: char) -> char { log_forward("echo-char"); bindings::jsco::test::echo_primitives::echo_char(v) }
    fn echo_string(v: String) -> String { log_forward("echo-string"); bindings::jsco::test::echo_primitives::echo_string(&v) }
}

impl EchoCompoundGuest for Component {
    fn echo_tuple2(v: (u32, String)) -> (u32, String) {
        log_forward("echo-tuple2");
        bindings::jsco::test::echo_compound::echo_tuple2((v.0, &v.1))
    }
    fn echo_tuple3(v: (f32, f32, f32)) -> (f32, f32, f32) {
        log_forward("echo-tuple3");
        bindings::jsco::test::echo_compound::echo_tuple3((v.0, v.1, v.2))
    }
    fn echo_record(v: bindings::exports::jsco::test::echo_compound::Point) -> bindings::exports::jsco::test::echo_compound::Point {
        log_forward("echo-record");
        let r = bindings::jsco::test::echo_compound::echo_record(bindings::jsco::test::echo_compound::Point { x: v.x, y: v.y });
        bindings::exports::jsco::test::echo_compound::Point { x: r.x, y: r.y }
    }
    fn echo_nested_record(v: bindings::exports::jsco::test::echo_compound::LabeledPoint) -> bindings::exports::jsco::test::echo_compound::LabeledPoint {
        log_forward("echo-nested-record");
        let r = bindings::jsco::test::echo_compound::echo_nested_record(&bindings::jsco::test::echo_compound::LabeledPoint {
            label: v.label.clone(),
            coords: bindings::jsco::test::echo_compound::Point { x: v.coords.x, y: v.coords.y },
            elevation: v.elevation,
        });
        bindings::exports::jsco::test::echo_compound::LabeledPoint {
            label: r.label,
            coords: bindings::exports::jsco::test::echo_compound::Point { x: r.coords.x, y: r.coords.y },
            elevation: r.elevation,
        }
    }
    fn echo_list_u8(v: Vec<u8>) -> Vec<u8> { log_forward("echo-list-u8"); bindings::jsco::test::echo_compound::echo_list_u8(&v) }
    fn echo_list_string(v: Vec<String>) -> Vec<String> {
        log_forward("echo-list-string");
        bindings::jsco::test::echo_compound::echo_list_string(&v)
    }
    fn echo_list_record(v: Vec<bindings::exports::jsco::test::echo_compound::Point>) -> Vec<bindings::exports::jsco::test::echo_compound::Point> {
        log_forward("echo-list-record");
        let import_pts: Vec<bindings::jsco::test::echo_compound::Point> = v.iter().map(|p| bindings::jsco::test::echo_compound::Point { x: p.x, y: p.y }).collect();
        let result = bindings::jsco::test::echo_compound::echo_list_record(&import_pts);
        result.into_iter().map(|p| bindings::exports::jsco::test::echo_compound::Point { x: p.x, y: p.y }).collect()
    }
    fn echo_option_u32(v: Option<u32>) -> Option<u32> { log_forward("echo-option-u32"); bindings::jsco::test::echo_compound::echo_option_u32(v) }
    fn echo_option_string(v: Option<String>) -> Option<String> {
        log_forward("echo-option-string");
        bindings::jsco::test::echo_compound::echo_option_string(v.as_deref())
    }
    fn echo_result_ok(v: Result<String, String>) -> Result<String, String> {
        log_forward("echo-result-ok");
        bindings::jsco::test::echo_compound::echo_result_ok(v.as_ref().map(|s| s.as_str()).map_err(|s| s.as_str()))
    }
}

impl EchoAlgebraicGuest for Component {
    fn echo_enum(v: bindings::exports::jsco::test::echo_algebraic::Color) -> bindings::exports::jsco::test::echo_algebraic::Color {
        log_forward("echo-enum");
        use bindings::jsco::test::echo_algebraic::Color as IC;
        use bindings::exports::jsco::test::echo_algebraic::Color as EC;
        let import_v = match v { EC::Red => IC::Red, EC::Green => IC::Green, EC::Blue => IC::Blue, EC::Yellow => IC::Yellow };
        let r = bindings::jsco::test::echo_algebraic::echo_enum(import_v);
        match r { IC::Red => EC::Red, IC::Green => EC::Green, IC::Blue => EC::Blue, IC::Yellow => EC::Yellow }
    }
    fn echo_flags(v: bindings::exports::jsco::test::echo_algebraic::Permissions) -> bindings::exports::jsco::test::echo_algebraic::Permissions {
        log_forward("echo-flags");
        use bindings::jsco::test::echo_algebraic::Permissions as IP;
        use bindings::exports::jsco::test::echo_algebraic::Permissions as EP;
        let mut import_v = IP::empty();
        if v.contains(EP::READ) { import_v |= IP::READ; }
        if v.contains(EP::WRITE) { import_v |= IP::WRITE; }
        if v.contains(EP::EXECUTE) { import_v |= IP::EXECUTE; }
        let r = bindings::jsco::test::echo_algebraic::echo_flags(import_v);
        let mut export_v = EP::empty();
        if r.contains(IP::READ) { export_v |= EP::READ; }
        if r.contains(IP::WRITE) { export_v |= EP::WRITE; }
        if r.contains(IP::EXECUTE) { export_v |= EP::EXECUTE; }
        export_v
    }
    fn echo_variant(v: bindings::exports::jsco::test::echo_algebraic::Shape) -> bindings::exports::jsco::test::echo_algebraic::Shape {
        log_forward("echo-variant");
        use bindings::jsco::test::echo_algebraic::Shape as IS;
        use bindings::exports::jsco::test::echo_algebraic::Shape as ES;
        let import_v = match &v {
            ES::Circle(r) => IS::Circle(*r),
            ES::Rectangle((w, h)) => IS::Rectangle((*w, *h)),
            ES::NamedPolygon(n) => IS::NamedPolygon(n.clone()),
            ES::Dot => IS::Dot,
        };
        let r = bindings::jsco::test::echo_algebraic::echo_variant(&import_v);
        match r {
            IS::Circle(r) => ES::Circle(r),
            IS::Rectangle((w, h)) => ES::Rectangle((w, h)),
            IS::NamedPolygon(n) => ES::NamedPolygon(n),
            IS::Dot => ES::Dot,
        }
    }
}
