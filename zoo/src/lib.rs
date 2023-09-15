#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

cargo_component_bindings::generate!({
    implementor: Eater,
});

use bindings::exports::zoo::food::eater::Guest;
use bindings::zoo::food::food::{hide_food, FoodInfo};

struct Eater;

impl Guest for Eater {
    fn feed(info: FoodInfo) {
        if info.healthy && info.calories > 1000 {
            hide_food(&info, &format!(
                "Yum, {} should be hidden for later.",
                info.name
            ));
        } else if info.cost > 100 {
            hide_food(&info, &format!("{}, come and have a bear hug!", info.name));
        } else {
            hide_food(&info, &format!("{}? Yuk!", info.name));
        }
    }
}
