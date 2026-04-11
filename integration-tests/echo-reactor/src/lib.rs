#[allow(warnings)]
mod bindings;

use bindings::exports::jsco::test::echo_primitives::Guest as Primitives;
use bindings::exports::jsco::test::echo_compound::Guest as Compound;
use bindings::exports::jsco::test::echo_compound::{LabeledPoint, Point};
use bindings::exports::jsco::test::echo_algebraic::Guest as Algebraic;
use bindings::exports::jsco::test::echo_algebraic::{Color, Permissions, Shape};
use bindings::jsco::test::echo_sink;

struct Component;

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

bindings::export!(Component with_types_in bindings);
