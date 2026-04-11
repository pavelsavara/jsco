#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[allow(warnings)]
mod bindings;

use bindings::exports::zoo::food::eater::Guest;
use bindings::zoo::food::food::{
    hide_food, consume_food, open_package, trash_package, plan_meal,
    FoodInfo, PackageInfo, NutritionType, SealingState, MaterialType, MealPlan};
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
        let sealing = package_info.sealing;
        let material_name = format!("{}", package_info.material);
        
        if sealing.contains(SealingState::CLOSED) {
            open_package(sealing,
                package_info,
                &format!("Package type {} is now opened. Enjoy.", material_name));
            return;
        }
        else if sealing.contains(SealingState::DAMAGED) {
            let msg = format!("Package type {} was damaged, you cannot eat this food.", material_name);
            let vec = vec![package_info];
            let _success = trash_package(&vec, &msg);
            return;
        }

        if food_info.healthy && food_info.calories > 1000 {
            if sealing.contains(SealingState::OPENED) && package_info.nutrition.nutrition_type == NutritionType::Protein && package_info.nutrition.percentage > 30.0
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

    fn schedule(plan: MealPlan) -> Result<String, String> {
        if plan.foods.is_empty() {
            return Err("No foods in meal plan".to_string());
        }
        let result = plan_meal(&plan);
        match result {
            Ok(msg) => {
                let label = plan.label.unwrap_or_else(|| "unnamed".to_string());
                Ok(format!("Scheduled '{}': {}", label, msg))
            }
            Err(e) => Err(format!("Failed to plan: {}", e)),
        }
    }
}

bindings::export!(Eater with_types_in bindings);
