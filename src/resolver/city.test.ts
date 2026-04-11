import { instantiateComponent } from './index';
import { setConfiguration } from '../utils/assert';
import type { ZooFoodFood } from '../../tests/zoo-food-food';
import type { CityRunnerRunner } from '../../tests/city-runner-runner';

type TRun = typeof CityRunnerRunner.run
type TZooFoodFood = typeof ZooFoodFood

setConfiguration('Debug');

describe('resolver city-zoo', () => {
    test('composed city-zoo.wasm can run', async () => {
        let lastMessage: string = undefined as any;
        let consumedFood: any = undefined as any;

        const zooFood: TZooFoodFood = {
            hideFood: (food, message) => {
                lastMessage = message;
            },
            consumeFood: (foodinfo, packageinfo, message) => {
                lastMessage = message;
                consumedFood = foodinfo;
            },
            openPackage: (sealingstate, packageinfo, message) => {
                lastMessage = message;
            },
            trashPackage: (trashed, message) => {
                lastMessage = message;
                return true;
            },
            planMeal: (plan) => {
                if (plan.foods.length === 0) {
                    return { tag: 'err', val: 'empty plan' };
                }
                return { tag: 'ok', val: `planned ${plan.foods.length} foods` };
            }
        };
        const imports = {
            'zoo:food/food@0.1.0': zooFood
        };

        const instance = await instantiateComponent('./city/wasm/city-zoo.wasm', imports);
        const run = instance.exports['city:runner/runner@0.1.0'].run as TRun;

        run();

        // city calls feed with steak (healthy, calories>1000, opened, protein, percentage>30)
        // zoo's eater should call consume-food
        expect(lastMessage).toBe('Eating steak');
        expect(consumedFood).toBeDefined();
        expect(consumedFood.name).toBe('steak');
    });
});
