export namespace ZooFoodFood {
  export function hideFood(food: FoodInfo, message: string): void;
  export function consumeFood(foodinfo: FoodInfo, packageinfo: PackageInfo, message: string): void;
  export function openPackage(packageinfo: PackageInfo, message: string): void;
  export function trashPackage(sealingstate: SealingState, message: string): void;
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
 * ## `"carbohyrdate"`
 * 
 * ## `"protein"`
 * 
 * ## `"vitamin"`
 */
export type NutritionType = 'carbohyrdate' | 'protein' | 'vitamin';
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
/**
 * # Variants
 * 
 * ## `"opened"`
 * 
 * ## `"closed"`
 * 
 * ## `"damaged"`
 */
export type SealingState = 'opened' | 'closed' | 'damaged';
export interface PackageInfo {
  nutrition: NutritionInfo,
  material: MaterialType,
  sealing: SealingState,
}
