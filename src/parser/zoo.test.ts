import { parse } from './index';
// import { expectPartialModelToEqual } from './jest-utils';
// import { expectedModel } from '../../tests/zoo';
import { CoreModule } from './types';

describe('zoo', () => {

    test('parse method compiles zoo modules', async () => {
        // build it with `npm run build:zoo`
        const actualModel = await parse('./zoo/wasm/zoo.wasm');

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
});