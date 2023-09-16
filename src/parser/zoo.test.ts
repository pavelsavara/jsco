import { parse } from './index';
import { expectPartialModelToEqual } from './jest-utils';
import { expectedModel } from '../../tests/zoo';
import { CoreModule } from './types';
import { writeToFile } from '../../tests/utils';

describe('zoo', () => {

    test('parse method compiles zoo modules', async () => {
        // build it with `npm run build:zoo`
        const actualModel = await parse('./zoo/wasm/zoo.wasm');

        const moduleSections: CoreModule[] = actualModel.filter((section) => section.tag === 'CoreModule') as CoreModule[];

        expect(moduleSections.length).toBe(3);
        expect(moduleSections[0].module).toBeInstanceOf(Promise);
        expect(moduleSections[1].module).toBeInstanceOf(Promise);
        expect(moduleSections[2].module).toBeInstanceOf(Promise);

        const modules = await Promise.all(moduleSections.map(async (m) => m.module));
        expect(modules[0]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
    });

    test('parsed model matches hand written zoo model', async () => {
        const actualModel = await parse('./zoo/wasm/zoo.wasm');
        // writeToFile('actual-zoo.json', JSON.stringify(actualModel, null, 2));
        //writeToFile('expected-zoo.json', JSON.stringify(expectedModel, null, 2));
        expectPartialModelToEqual(actualModel, expectedModel);
    });
});
