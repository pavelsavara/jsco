export namespace ZooFoodFood {
  export function hideFood(food: FoodInfo, message: string): void;
  export function consumeFood(foodinfo: FoodInfo, packageinfo: PackageInfo, message: string): void;
  export function openPackage(sealingstate: SealingState, packageinfo: PackageInfo, message: string): void;
  export function trashPackage(trashed: PackageInfo[], message: string): boolean;
  export function planMeal(plan: MealPlan): Result<string, string>;
}
export interface FoodInfo {
  name: string,
  isoCode: string,
  weight: number,
  healthy: boolean,
  calories: bigint,
  cost: number,
  rating: number,
  pieces: number,
  shelfTemperature: [number, number],
  cookTimeInMinutes: number,
}
/**
 * # Variants
 * 
 * ## `"carbohydrate"`
 * 
 * ## `"protein"`
 * 
 * ## `"vitamin"`
 */
export type NutritionType = 'carbohydrate' | 'protein' | 'vitamin';
export interface NutritionInfo {
  percentage: number,
  nutritionType: NutritionType,
}
export type MaterialType = MaterialTypePlasticBag | MaterialTypeMetalCan;
export interface MaterialTypePlasticBag {
  tag: 'plastic-bag',
}
export interface MaterialTypeMetalCan {
  tag: 'metal-can',
}
export interface SealingState {
  opened?: boolean,
  closed?: boolean,
  damaged?: boolean,
}
export interface PackageInfo {
  nutrition: NutritionInfo,
  material: MaterialType,
  sealing: SealingState,
}
export interface MealPlan {
  foods: FoodInfo[],
  label?: string | undefined,
}
export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
