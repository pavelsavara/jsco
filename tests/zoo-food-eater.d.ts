export namespace ZooFoodEater {
  export function feed(foodinfo: FoodInfo, packageinfo: PackageInfo): void;
  export function schedule(plan: MealPlan): Result<string, string>;
}
import type { FoodInfo } from '../exports/zoo-food-food';
export { FoodInfo };
import type { PackageInfo } from '../exports/zoo-food-food';
export { PackageInfo };
import type { MealPlan } from '../exports/zoo-food-food';
export { MealPlan };
import type { Result } from '../exports/zoo-food-food';
export { Result };
