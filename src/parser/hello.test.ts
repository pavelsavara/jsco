import { parse } from './index';
//import { expectModelToEqual } from './jest-utils';
//import { expectedModel } from '../../hello/wat/model';

describe('hello', () => {

    test('parse method compiles modules', async () => {
        // build it with `npm run build:hello`
        const model = await parse('./hello/wasm/hello.wasm');

        expect(model.tag).toBe('model');
        expect(model.modules.length).toBe(3);
        expect(model.modules[0].module).toBeInstanceOf(Promise);
        expect(model.modules[1].module).toBeInstanceOf(Promise);
        expect(model.modules[2].module).toBeInstanceOf(Promise);

        const modules = await Promise.all(model.modules.map(async (m) => m.module));
        expect(modules[0]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
        expect(modules[1]).toBeInstanceOf(WebAssembly.Module);
    });

    //TODO!
    test('parsed model matches hand written model', async () => {
        const model = await parse('./hello/wasm/hello.wasm');
        //TODO expectModelToEqual(model, expectedModel);
    });
});

