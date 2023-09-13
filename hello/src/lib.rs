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
        if ((info.budget as f64) / (info.head_count as f64)) > 100.0 {
            send_message(&format!(
                "Welcome to {}, we invite you for a drink!",
                info.name
            ));
        } else if info.head_count > 1_000_000 {
            send_message(&format!("Welcome to {} mega polis!", info.name));
        } else {
            send_message(&format!("Welcome to {}!", info.name));
        }
    }
}
