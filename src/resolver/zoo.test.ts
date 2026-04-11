import { instantiateComponent } from './index';
import { setConfiguration } from '../utils/assert';
import type { ZooFoodFood } from '../../tests/zoo-food-food';
import type { ZooFoodEater } from '../../tests/zoo-food-eater';

type TFeed = typeof ZooFoodEater.feed
type TSchedule = typeof ZooFoodEater.schedule
type TZooFoodFood = typeof ZooFoodFood

setConfiguration('Debug');

describe('resolver zoo', () => {
    let actualMessage: string = undefined as any;
    let _actualFood: any = undefined as any;

    const zooFood: TZooFoodFood = {
        hideFood: (food, message) => {
            actualMessage = message;
            _actualFood = food;
        },
        consumeFood: (foodinfo, packageinfo, message) => {
            actualMessage = message;
        },
        openPackage: (sealingstate, packageinfo, message) => {
            actualMessage = message;
        },
        trashPackage: (trashed, message) => {
            actualMessage = message;
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

    test('feed with cheap unhealthy food calls hideFood with Yuk', async () => {
        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const feed = instance.exports['zoo:food/eater@0.1.0'].feed as TFeed;

        feed({
            name: 'apple',
            isoCode: 'cz',
            weight: 1,
            healthy: true,
            calories: 1n,
            cost: 1,
            rating: 1,
            pieces: 1,
            shelfTemperature: [1, 1],
            cookTimeInMinutes: 1,
        }, {
            nutrition: {
                percentage: 1,
                nutritionType: 'carbohydrate',
            },
            material: { tag: 'plastic-bag' },
            sealing: { closed: true },
        });

        expect(actualMessage).toBe('Package type plastic bag is now opened. Enjoy.');
    });

    test('feed with damaged package calls trashPackage', async () => {
        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const feed = instance.exports['zoo:food/eater@0.1.0'].feed as TFeed;

        feed({
            name: 'banana',
            isoCode: 'b',
            weight: 1,
            healthy: false,
            calories: 1n,
            cost: 1,
            rating: 1,
            pieces: 1,
            shelfTemperature: [1, 1],
            cookTimeInMinutes: 1,
        }, {
            nutrition: {
                percentage: 1,
                nutritionType: 'protein',
            },
            material: { tag: 'metal-can' },
            sealing: { damaged: true },
        });

        expect(actualMessage).toBe('Package type metal can was damaged, you cannot eat this food.');
    });

    test('schedule with option label and result ok', async () => {
        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const schedule = instance.exports['zoo:food/eater@0.1.0'].schedule as TSchedule;

        const result = schedule({
            foods: [{
                name: 'steak',
                isoCode: 's',
                weight: 0.5,
                healthy: true,
                calories: 500n,
                cost: 50,
                rating: 10,
                pieces: 1,
                shelfTemperature: [4, 39],
                cookTimeInMinutes: 20,
            }],
            label: 'dinner',
        });

        expect(result).toEqual({ tag: 'ok', val: 'Scheduled \'dinner\': planned 1 foods' });
    });

    test('schedule with no label uses unnamed', async () => {
        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const schedule = instance.exports['zoo:food/eater@0.1.0'].schedule as TSchedule;

        const result = schedule({
            foods: [{
                name: 'rice',
                isoCode: 'r',
                weight: 0.3,
                healthy: true,
                calories: 300n,
                cost: 10,
                rating: 7,
                pieces: 1,
                shelfTemperature: [20, 68],
                cookTimeInMinutes: 15,
            }],
            label: undefined,
        });

        expect(result).toEqual({ tag: 'ok', val: 'Scheduled \'unnamed\': planned 1 foods' });
    });

    test('schedule with empty foods returns error', async () => {
        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const schedule = instance.exports['zoo:food/eater@0.1.0'].schedule as TSchedule;

        const result = schedule({
            foods: [],
            label: 'empty',
        });

        expect(result).toEqual({ tag: 'err', val: 'No foods in meal plan' });
    });
});
