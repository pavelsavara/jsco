import { parse } from './index';
import { expectPartialModelToEqual } from './jest-utils';
import { expectedModel } from '../../tests/hello';
import { CoreModule } from './types';

describe('hello', () => {

    test('parse method compiles modules', async () => {
        // build it with `npm run build:hello`
        const actualModel = await parse('./hello/wasm/hello.wasm');

        const moduleSections: CoreModule[] = actualModel.filter((section) => section.tag === 'ComponentModule') as CoreModule[];

        expect(moduleSections.length).toBe(3);
        expect(moduleSections[0].module).toBeInstanceOf(Promise);
        expect(moduleSections[1].module).toBeInstanceOf(Promise);
        expect(moduleSections[2].module).toBeInstanceOf(Promise);

        const modules = await Promise.all(moduleSections.map(async (m) => m.module));
        expect(modules[0]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
    });

    test('parsed model matches hand written model', async () => {
        const actualModel = await parse('./hello/wasm/hello.wasm');
        expectPartialModelToEqual(actualModel, expectedModel);
    });
});
