#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

cargo_component_bindings::generate!({
    implementor: Eater,
});

use bindings::exports::zoo::food::eater::Guest;
use bindings::zoo::food::food::{
    hide_food, consume_food, open_package, trash_package,
    FoodInfo, PackageInfo, NutritionType, SealingState, MaterialType};
use std::fmt;

struct Eater;

impl std::fmt::Display for MaterialType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(match self {
            MaterialType::PlasticBag => "plastic bag",
            MaterialType::MetalCan  => "metal can",
        })
    }
}

impl Guest for Eater {
    fn feed(food_info: FoodInfo, package_info: PackageInfo) {
        if package_info.sealing == SealingState::Closed {
            open_package(package_info,
                &format!("Package type {} is now opened. Enjoy.", package_info.material));
        }
        else if package_info.sealing == SealingState::Damaged {
            trash_package(package_info.sealing,
                &format!("Package type {} was damaged, you cannot eat this food.", package_info.material));
            return;
        }

        if food_info.healthy && food_info.calories > 1000 {
            if package_info.sealing == SealingState::Opened && package_info.nutrition.nutrition_type == NutritionType::Protein && package_info.nutrition.percentage > 30.0
            {
                consume_food(&food_info,
                    package_info,
                    &format!("Eating {}", food_info.name))
            }
            else
            {
                hide_food(&food_info, &format!(
                    "Yum, {} should be hidden for later.",
                    food_info.name
                ));
            }
            
        } else if food_info.cost > 100 {
            hide_food(&food_info, &format!("{}, come and have a bear hug!", food_info.name));
        } else {
            hide_food(&food_info, &format!("{}? Yuk!", food_info.name));
        }
    }
}
