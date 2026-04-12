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
use bindings::exports::jsco::test::echo_complex::Guest as EchoComplexGuest;

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

// --- echo-complex forwarding ---
// Type aliases for readability
use bindings::exports::jsco::test::echo_complex as ec_exp;
use bindings::jsco::test::echo_complex as ec_imp;

fn person_to_import(v: &ec_exp::Person) -> ec_imp::Person {
    ec_imp::Person {
        name: v.name.clone(),
        age: v.age,
        email: v.email.clone(),
        address: ec_imp::Address { street: v.address.street.clone(), city: v.address.city.clone(), zip: v.address.zip.clone() },
        tags: v.tags.clone(),
    }
}
fn person_from_import(v: ec_imp::Person) -> ec_exp::Person {
    ec_exp::Person {
        name: v.name,
        age: v.age,
        email: v.email,
        address: ec_exp::Address { street: v.address.street, city: v.address.city, zip: v.address.zip },
        tags: v.tags,
    }
}
fn address_to_import(v: &ec_exp::Address) -> ec_imp::Address {
    ec_imp::Address { street: v.street.clone(), city: v.city.clone(), zip: v.zip.clone() }
}
fn address_from_import(v: ec_imp::Address) -> ec_exp::Address {
    ec_exp::Address { street: v.street, city: v.city, zip: v.zip }
}
fn vec2_to_import(v: &ec_exp::Vec2) -> ec_imp::Vec2 {
    ec_imp::Vec2 { x: v.x, y: v.y }
}
fn vec2_from_import(v: ec_imp::Vec2) -> ec_exp::Vec2 {
    ec_exp::Vec2 { x: v.x, y: v.y }
}
fn vec3_from_import(v: ec_imp::Vec3) -> ec_exp::Vec3 {
    ec_exp::Vec3 { x: v.x, y: v.y, z: v.z }
}
fn geometry_to_import(v: &ec_exp::Geometry) -> ec_imp::Geometry {
    match v {
        ec_exp::Geometry::Point2d(p) => ec_imp::Geometry::Point2d(vec2_to_import(p)),
        ec_exp::Geometry::Point3d(p) => ec_imp::Geometry::Point3d(ec_imp::Vec3 { x: p.x, y: p.y, z: p.z }),
        ec_exp::Geometry::Line((a, b)) => ec_imp::Geometry::Line((vec2_to_import(a), vec2_to_import(b))),
        ec_exp::Geometry::Polygon(pts) => ec_imp::Geometry::Polygon(pts.iter().map(vec2_to_import).collect()),
        ec_exp::Geometry::Labeled((s, pts)) => ec_imp::Geometry::Labeled((s.clone(), pts.iter().map(vec2_to_import).collect())),
        ec_exp::Geometry::Empty => ec_imp::Geometry::Empty,
    }
}
fn geometry_from_import(v: ec_imp::Geometry) -> ec_exp::Geometry {
    match v {
        ec_imp::Geometry::Point2d(p) => ec_exp::Geometry::Point2d(vec2_from_import(p)),
        ec_imp::Geometry::Point3d(p) => ec_exp::Geometry::Point3d(vec3_from_import(p)),
        ec_imp::Geometry::Line((a, b)) => ec_exp::Geometry::Line((vec2_from_import(a), vec2_from_import(b))),
        ec_imp::Geometry::Polygon(pts) => ec_exp::Geometry::Polygon(pts.into_iter().map(vec2_from_import).collect()),
        ec_imp::Geometry::Labeled((s, pts)) => ec_exp::Geometry::Labeled((s, pts.into_iter().map(vec2_from_import).collect())),
        ec_imp::Geometry::Empty => ec_exp::Geometry::Empty,
    }
}
fn message_to_import(v: &ec_exp::Message) -> ec_imp::Message {
    match v {
        ec_exp::Message::Text(s) => ec_imp::Message::Text(s.clone()),
        ec_exp::Message::Binary(b) => ec_imp::Message::Binary(b.clone()),
        ec_exp::Message::Structured(p) => ec_imp::Message::Structured(person_to_import(p)),
        ec_exp::Message::ErrorResult(r) => ec_imp::Message::ErrorResult(r.as_ref().map(|s| s.clone()).map_err(|s| s.clone())),
        ec_exp::Message::Tagged((s, o)) => ec_imp::Message::Tagged((s.clone(), o.clone())),
        ec_exp::Message::Empty => ec_imp::Message::Empty,
    }
}
fn message_from_import(v: ec_imp::Message) -> ec_exp::Message {
    match v {
        ec_imp::Message::Text(s) => ec_exp::Message::Text(s),
        ec_imp::Message::Binary(b) => ec_exp::Message::Binary(b),
        ec_imp::Message::Structured(p) => ec_exp::Message::Structured(person_from_import(p)),
        ec_imp::Message::ErrorResult(r) => ec_exp::Message::ErrorResult(r),
        ec_imp::Message::Tagged((s, o)) => ec_exp::Message::Tagged((s, o)),
        ec_imp::Message::Empty => ec_exp::Message::Empty,
    }
}
fn ks_to_import(v: &ec_exp::KitchenSink) -> ec_imp::KitchenSink {
    ec_imp::KitchenSink {
        name: v.name.clone(),
        values: v.values.clone(),
        nested: v.nested.clone(),
        pairs: v.pairs.clone(),
        maybe: v.maybe.clone(),
        result_field: v.result_field.as_ref().map(|v| v.clone()).map_err(|e| e.clone()),
    }
}
fn ks_from_import(v: ec_imp::KitchenSink) -> ec_exp::KitchenSink {
    ec_exp::KitchenSink {
        name: v.name,
        values: v.values,
        nested: v.nested,
        pairs: v.pairs,
        maybe: v.maybe,
        result_field: v.result_field,
    }
}

impl EchoComplexGuest for Component {
    fn echo_deeply_nested(v: ec_exp::Team) -> ec_exp::Team {
        log_forward("echo-deeply-nested");
        let r = ec_imp::echo_deeply_nested(&ec_imp::Team {
            name: v.name.clone(),
            lead: person_to_import(&v.lead),
            members: v.members.iter().map(person_to_import).collect(),
            metadata: v.metadata.clone(),
        });
        ec_exp::Team {
            name: r.name,
            lead: person_from_import(r.lead),
            members: r.members.into_iter().map(person_from_import).collect(),
            metadata: r.metadata,
        }
    }
    fn echo_list_of_records(v: Vec<ec_exp::Person>) -> Vec<ec_exp::Person> {
        log_forward("echo-list-of-records");
        let r = ec_imp::echo_list_of_records(&v.iter().map(person_to_import).collect::<Vec<_>>());
        r.into_iter().map(person_from_import).collect()
    }
    fn echo_tuple_of_records(v: (ec_exp::Person, ec_exp::Address)) -> (ec_exp::Person, ec_exp::Address) {
        log_forward("echo-tuple-of-records");
        let imp_person = person_to_import(&v.0);
        let imp_addr = address_to_import(&v.1);
        let r = ec_imp::echo_tuple_of_records((&imp_person, &imp_addr));
        (person_from_import(r.0), address_from_import(r.1))
    }
    fn echo_complex_variant(v: ec_exp::Geometry) -> ec_exp::Geometry {
        log_forward("echo-complex-variant");
        geometry_from_import(ec_imp::echo_complex_variant(&geometry_to_import(&v)))
    }
    fn echo_message(v: ec_exp::Message) -> ec_exp::Message {
        log_forward("echo-message");
        message_from_import(ec_imp::echo_message(&message_to_import(&v)))
    }
    fn echo_kitchen_sink(v: ec_exp::KitchenSink) -> ec_exp::KitchenSink {
        log_forward("echo-kitchen-sink");
        ks_from_import(ec_imp::echo_kitchen_sink(&ks_to_import(&v)))
    }
    fn echo_nested_lists(v: Vec<Vec<u32>>) -> Vec<Vec<u32>> {
        log_forward("echo-nested-lists");
        ec_imp::echo_nested_lists(&v)
    }
    fn echo_option_record(v: Option<ec_exp::Person>) -> Option<ec_exp::Person> {
        log_forward("echo-option-record");
        let imp_v = v.as_ref().map(person_to_import);
        ec_imp::echo_option_record(imp_v.as_ref()).map(person_from_import)
    }
    fn echo_result_record(v: Result<ec_exp::Person, String>) -> Result<ec_exp::Person, String> {
        log_forward("echo-result-record");
        let imp_v = v.as_ref().map(person_to_import).map_err(|s| s.clone());
        ec_imp::echo_result_record(imp_v.as_ref().map_err(|s| s.as_str())).map(person_from_import)
    }
    fn echo_list_of_variants(v: Vec<ec_exp::Geometry>) -> Vec<ec_exp::Geometry> {
        log_forward("echo-list-of-variants");
        let imp_v: Vec<ec_imp::Geometry> = v.iter().map(geometry_to_import).collect();
        ec_imp::echo_list_of_variants(&imp_v).into_iter().map(geometry_from_import).collect()
    }
}
