#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[allow(warnings)]
mod bindings;

use bindings::exports::city::runner::runner::Guest;
use bindings::zoo::food::food::{
    FoodInfo, PackageInfo, NutritionInfo, NutritionType, MaterialType, SealingState, MealPlan};
use bindings::zoo::food::eater::{feed, schedule};

struct Runner;

impl Guest for Runner {
    fn run() {
        let food = FoodInfo {
            name: "steak".to_string(),
            iso_code: 's',
            weight: 0.5,
            healthy: true,
            calories: 2000,
            cost: 200,
            rating: 10,
            pieces: 1,
            shelf_temperature: (4, 39),
            cook_time_in_minutes: 20,
        };

        let package = PackageInfo {
            nutrition: NutritionInfo {
                percentage: 80.0,
                nutrition_type: NutritionType::Protein,
            },
            material: MaterialType::PlasticBag,
            sealing: SealingState::OPENED,
        };

        // This should call consume-food via zoo's eater
        feed(&food, package);

        // Test schedule with meal plan (option + result)
        let plan = MealPlan {
            foods: vec![food],
            label: Some("city dinner".to_string()),
        };
        let result = schedule(&plan);
        match result {
            Ok(msg) => {
                // The zoo component will forward to plan-meal import
                // and wrap the result
                let _ = msg;
            }
            Err(_e) => {}
        }
    }
}

bindings::export!(Runner with_types_in bindings);
