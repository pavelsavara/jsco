#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

cargo_component_bindings::generate!({
    implementor: Greeter,
});

use bindings::exports::hello::city::greeter::Guest;
use bindings::hello::city::city::{send_message, CityInfo};

struct Greeter;

impl Guest for Greeter {
    fn run(info: CityInfo) {
        send_message(&format!("Hello {} from rust!", info.name));
    }
}
