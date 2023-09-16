import { instantiateComponent } from './index';
import { setConfiguration } from '../utils/assert';
import type { } from '../../zoo/target/js-jco/imports/zoo-food-food.d.ts';
import type { ZooFoodFood } from '../../zoo/target/js-jco/exports/zoo-food-food';
import { ZooFoodEater } from '../../zoo/target/js-jco/exports/zoo-food-eater';

type TFeed = typeof ZooFoodEater.feed
type TZooFoodFood = typeof ZooFoodFood

setConfiguration('Debug');

describe('resolver hello', () => {
    test.failing('component zoo.wasm could run', async () => {
        let actualMessage: string = undefined as any;
        let actualFood: any = undefined as any;

        const zooFood: TZooFoodFood = {
            hideFood: (food, message) => {
                actualMessage = message;
                actualFood = food;
            },
            consumeFood: (foodinfo, packageinfo, message) => {
                actualMessage = message;
            },
            openPackage: (packageinfo, message) => {
                actualMessage = message;
            },
            trashPackage: (sealingstate, message) => {
                actualMessage = message;
            }
        };
        const imports = {
            'zoo:food/food': zooFood
        };

        const instance = await instantiateComponent('./zoo/wasm/zoo.wasm', imports);
        const feed = instance.exports['zoo:food/eater'].feed as TFeed;

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
                nutritionType: 'carbohyrdate',
            },
            material: { tag: 'plastic-bag' },
            sealing: 'closed',
        });

        expect(actualMessage).toBe('Welcome to Prague, we invite you for a drink!');
    });
});
