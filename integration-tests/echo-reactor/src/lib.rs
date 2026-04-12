#[allow(warnings)]
mod bindings;

use bindings::exports::jsco::test::echo_primitives::Guest as Primitives;
use bindings::exports::jsco::test::echo_compound::Guest as Compound;
use bindings::exports::jsco::test::echo_compound::{LabeledPoint, Point};
use bindings::exports::jsco::test::echo_algebraic::Guest as Algebraic;
use bindings::exports::jsco::test::echo_algebraic::{Color, Permissions, Shape};
use bindings::exports::jsco::test::echo_edge_cases::Guest as EdgeCases;
use bindings::exports::jsco::test::echo_edge_cases::GuestErrCtx;
use bindings::exports::jsco::test::echo_edge_cases::ErrCtx;
use bindings::exports::jsco::test::echo_edge_cases::BigFlags;
use bindings::exports::jsco::test::echo_resources::Guest as Resources;
use bindings::exports::jsco::test::echo_resources::GuestAccumulator;
use bindings::exports::jsco::test::echo_resources::GuestByteBuffer;
use bindings::exports::jsco::test::echo_resources::Accumulator;
use bindings::exports::jsco::test::echo_resources::AccumulatorBorrow;
use bindings::exports::jsco::test::echo_resources::ByteBuffer;
use bindings::exports::jsco::test::echo_complex::Guest as Complex;
use bindings::exports::jsco::test::echo_complex::{
    Address, Person, Team, Geometry, Message, KitchenSink,
};
use bindings::jsco::test::echo_sink;

struct Component;

pub struct ErrCtxImpl {
    message: String,
}

impl GuestErrCtx for ErrCtxImpl {
    fn new(message: String) -> Self {
        ErrCtxImpl { message }
    }
    fn get_message(&self) -> String {
        self.message.clone()
    }
}

pub struct AccumulatorImpl {
    total: i64,
}

impl GuestAccumulator for AccumulatorImpl {
    fn new(initial: i64) -> Self {
        AccumulatorImpl { total: initial }
    }
    fn add(&self, value: i64) {
        // Note: WIT borrow methods get &self, so we can't mutate.
        // In a real implementation we'd use interior mutability.
        // For echo tests, we just verify the call succeeds.
        let _ = value;
    }
    fn get_total(&self) -> i64 {
        self.total
    }
    fn snapshot(&self) -> Accumulator {
        Accumulator::new(AccumulatorImpl { total: self.total })
    }
}

pub struct ByteBufferImpl {
    data: Vec<u8>,
    pos: std::cell::Cell<usize>,
}

impl GuestByteBuffer for ByteBufferImpl {
    fn new(data: Vec<u8>) -> Self {
        ByteBufferImpl { data, pos: std::cell::Cell::new(0) }
    }
    fn read(&self, n: u32) -> Vec<u8> {
        let pos = self.pos.get();
        let end = std::cmp::min(pos + n as usize, self.data.len());
        let result = self.data[pos..end].to_vec();
        self.pos.set(end);
        result
    }
    fn remaining(&self) -> u32 {
        (self.data.len() - self.pos.get()) as u32
    }
    fn is_empty(&self) -> bool {
        self.pos.get() >= self.data.len()
    }
}

impl Primitives for Component {
    fn echo_bool(v: bool) -> bool {
        echo_sink::report_primitive("bool", &v.to_string());
        v
    }
    fn echo_u8(v: u8) -> u8 {
        echo_sink::report_primitive("u8", &v.to_string());
        v
    }
    fn echo_u16(v: u16) -> u16 {
        echo_sink::report_primitive("u16", &v.to_string());
        v
    }
    fn echo_u32(v: u32) -> u32 {
        echo_sink::report_primitive("u32", &v.to_string());
        v
    }
    fn echo_u64(v: u64) -> u64 {
        echo_sink::report_primitive("u64", &v.to_string());
        v
    }
    fn echo_s8(v: i8) -> i8 {
        echo_sink::report_primitive("s8", &v.to_string());
        v
    }
    fn echo_s16(v: i16) -> i16 {
        echo_sink::report_primitive("s16", &v.to_string());
        v
    }
    fn echo_s32(v: i32) -> i32 {
        echo_sink::report_primitive("s32", &v.to_string());
        v
    }
    fn echo_s64(v: i64) -> i64 {
        echo_sink::report_primitive("s64", &v.to_string());
        v
    }
    fn echo_f32(v: f32) -> f32 {
        echo_sink::report_primitive("f32", &v.to_string());
        v
    }
    fn echo_f64(v: f64) -> f64 {
        echo_sink::report_primitive("f64", &v.to_string());
        v
    }
    fn echo_char(v: char) -> char {
        echo_sink::report_primitive("char", &v.to_string());
        v
    }
    fn echo_string(v: String) -> String {
        echo_sink::report_primitive("string", &v);
        v
    }
}

impl Compound for Component {
    fn echo_tuple2(v: (u32, String)) -> (u32, String) {
        echo_sink::report_primitive("tuple2", &format!("({}, {})", v.0, v.1));
        v
    }
    fn echo_tuple3(v: (f32, f32, f32)) -> (f32, f32, f32) {
        echo_sink::report_primitive("tuple3", &format!("({}, {}, {})", v.0, v.1, v.2));
        v
    }
    fn echo_record(v: Point) -> Point {
        echo_sink::report_record("point", v.x, v.y);
        v
    }
    fn echo_nested_record(v: LabeledPoint) -> LabeledPoint {
        echo_sink::report_record(&format!("labeled-point:{}", v.label), v.coords.x, v.coords.y);
        v
    }
    fn echo_list_u8(v: Vec<u8>) -> Vec<u8> {
        echo_sink::report_primitive("list-u8", &format!("{} bytes", v.len()));
        v
    }
    fn echo_list_string(v: Vec<String>) -> Vec<String> {
        echo_sink::report_primitive("list-string", &format!("{} items", v.len()));
        v
    }
    fn echo_list_record(v: Vec<Point>) -> Vec<Point> {
        echo_sink::report_primitive("list-record", &format!("{} points", v.len()));
        v
    }
    fn echo_option_u32(v: Option<u32>) -> Option<u32> {
        echo_sink::report_primitive("option-u32", &format!("{:?}", v));
        v
    }
    fn echo_option_string(v: Option<String>) -> Option<String> {
        echo_sink::report_primitive("option-string", &format!("{:?}", v));
        v
    }
    fn echo_result_ok(v: Result<String, String>) -> Result<String, String> {
        echo_sink::report_primitive("result", &format!("{:?}", v));
        v
    }
}

impl Algebraic for Component {
    fn echo_enum(v: Color) -> Color {
        let name = match v {
            Color::Red => "red",
            Color::Green => "green",
            Color::Blue => "blue",
            Color::Yellow => "yellow",
        };
        echo_sink::report_primitive("enum", name);
        v
    }
    fn echo_flags(v: Permissions) -> Permissions {
        let mut parts = Vec::new();
        if v.contains(Permissions::READ) { parts.push("read"); }
        if v.contains(Permissions::WRITE) { parts.push("write"); }
        if v.contains(Permissions::EXECUTE) { parts.push("execute"); }
        echo_sink::report_primitive("flags", &parts.join("|"));
        v
    }
    fn echo_variant(v: Shape) -> Shape {
        let desc = match &v {
            Shape::Circle(r) => format!("circle({})", r),
            Shape::Rectangle((w, h)) => format!("rectangle({}, {})", w, h),
            Shape::NamedPolygon(name) => format!("named-polygon({})", name),
            Shape::Dot => "dot".to_string(),
        };
        echo_sink::report_primitive("variant", &desc);
        v
    }
}

impl EdgeCases for Component {
    type ErrCtx = ErrCtxImpl;

    fn echo_result_ok_only(v: Result<String, ()>) -> Result<String, ()> {
        echo_sink::report_primitive("result-ok-only", &format!("{:?}", v));
        v
    }
    fn echo_result_err_only(v: Result<(), String>) -> Result<(), String> {
        echo_sink::report_primitive("result-err-only", &format!("{:?}", v));
        v
    }
    fn echo_result_empty(v: Result<(), ()>) -> Result<(), ()> {
        echo_sink::report_primitive("result-empty", &format!("{:?}", v));
        v
    }
    fn echo_nested_option(v: Option<Option<u32>>) -> Option<Option<u32>> {
        echo_sink::report_primitive("nested-option", &format!("{:?}", v));
        v
    }
    fn echo_tuple5(v: (u8, u16, u32, u64, String)) -> (u8, u16, u32, u64, String) {
        echo_sink::report_primitive("tuple5", &format!("({}, {}, {}, {}, {})", v.0, v.1, v.2, v.3, v.4));
        v
    }
    fn echo_list_option(v: Vec<Option<String>>) -> Vec<Option<String>> {
        echo_sink::report_primitive("list-option", &format!("{} items", v.len()));
        v
    }
    fn echo_list_result(v: Vec<Result<u32, String>>) -> Vec<Result<u32, String>> {
        echo_sink::report_primitive("list-result", &format!("{} items", v.len()));
        v
    }
    fn echo_option_list(v: Option<Vec<u32>>) -> Option<Vec<u32>> {
        echo_sink::report_primitive("option-list", &format!("{:?}", v.as_ref().map(|l| l.len())));
        v
    }
    fn echo_list_tuple(v: Vec<(String, u32)>) -> Vec<(String, u32)> {
        echo_sink::report_primitive("list-tuple", &format!("{} items", v.len()));
        v
    }
    fn echo_big_flags(v: BigFlags) -> BigFlags {
        echo_sink::report_primitive("big-flags", &format!("{:?}", v));
        v
    }
    fn echo_empty_list(v: Vec<u32>) -> Vec<u32> {
        echo_sink::report_primitive("empty-list", &format!("{} items", v.len()));
        v
    }
    fn echo_empty_string(v: String) -> String {
        echo_sink::report_primitive("empty-string", &format!("len={}", v.len()));
        v
    }
    fn echo_result_complex(v: Result<Vec<u8>, (String, ErrCtx)>) -> Result<Vec<u8>, (String, ErrCtx)> {
        echo_sink::report_primitive("result-complex", &format!("{}", match &v {
            Ok(bytes) => format!("ok({} bytes)", bytes.len()),
            Err((msg, _)) => format!("err({}, <resource>)", msg),
        }));
        v
    }
}

impl Resources for Component {
    type Accumulator = AccumulatorImpl;
    type ByteBuffer = ByteBufferImpl;

    fn transform_owned(acc: Accumulator) -> Accumulator {
        let total = acc.get::<AccumulatorImpl>().get_total();
        Accumulator::new(AccumulatorImpl { total: total * 2 })
    }
    fn inspect_borrowed(acc: AccumulatorBorrow<'_>) -> i64 {
        acc.get::<AccumulatorImpl>().get_total()
    }
    fn merge_accumulators(a: Accumulator, b: Accumulator) -> Accumulator {
        let total_a = a.get::<AccumulatorImpl>().get_total();
        let total_b = b.get::<AccumulatorImpl>().get_total();
        Accumulator::new(AccumulatorImpl { total: total_a + total_b })
    }
    fn echo_buffer(buf: ByteBuffer) -> ByteBuffer {
        buf
    }
}

impl Complex for Component {
    fn echo_deeply_nested(v: Team) -> Team {
        echo_sink::report_primitive("team", &format!("lead={}, members={}", v.lead.name, v.members.len()));
        v
    }
    fn echo_list_of_records(v: Vec<Person>) -> Vec<Person> {
        echo_sink::report_primitive("list-person", &format!("{} items", v.len()));
        v
    }
    fn echo_tuple_of_records(v: (Person, Address)) -> (Person, Address) {
        echo_sink::report_primitive("tuple-person-address", &format!("{}, {}", v.0.name, v.1.city));
        v
    }
    fn echo_complex_variant(v: Geometry) -> Geometry {
        let desc = match &v {
            Geometry::Point2d(p) => format!("point2d({},{})", p.x, p.y),
            Geometry::Point3d(p) => format!("point3d({},{},{})", p.x, p.y, p.z),
            Geometry::Line((a, b)) => format!("line({},{}->{},{})", a.x, a.y, b.x, b.y),
            Geometry::Polygon(pts) => format!("polygon({} pts)", pts.len()),
            Geometry::Labeled((name, pts)) => format!("labeled({}, {} pts)", name, pts.len()),
            Geometry::Empty => "empty".to_string(),
        };
        echo_sink::report_primitive("geometry", &desc);
        v
    }
    fn echo_message(v: Message) -> Message {
        let desc = match &v {
            Message::Text(s) => format!("text({})", s),
            Message::Binary(b) => format!("binary({} bytes)", b.len()),
            Message::Structured(p) => format!("structured({})", p.name),
            Message::ErrorResult(r) => format!("error-result({:?})", r),
            Message::Tagged((tag, data)) => format!("tagged({}, {:?})", tag, data.as_ref().map(|d| d.len())),
            Message::Empty => "empty".to_string(),
        };
        echo_sink::report_primitive("message", &desc);
        v
    }
    fn echo_kitchen_sink(v: KitchenSink) -> KitchenSink {
        echo_sink::report_primitive("kitchen-sink", &format!("name={}, values={}", v.name, v.values.len()));
        v
    }
    fn echo_nested_lists(v: Vec<Vec<u32>>) -> Vec<Vec<u32>> {
        echo_sink::report_primitive("nested-lists", &format!("{} outer", v.len()));
        v
    }
    fn echo_option_record(v: Option<Person>) -> Option<Person> {
        echo_sink::report_primitive("option-record", &format!("{:?}", v.as_ref().map(|p| &p.name)));
        v
    }
    fn echo_result_record(v: Result<Person, String>) -> Result<Person, String> {
        echo_sink::report_primitive("result-record", &format!("{:?}", v.as_ref().map(|p| &p.name)));
        v
    }
    fn echo_list_of_variants(v: Vec<Geometry>) -> Vec<Geometry> {
        echo_sink::report_primitive("list-geometry", &format!("{} items", v.len()));
        v
    }
}

bindings::export!(Component with_types_in bindings);
