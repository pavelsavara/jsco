import { expectedModel } from '../../tests/hello';
import { expectedContext, resolveJCO } from '../../tests/resolve-hello';
import { js } from '../../tests/hello-component';
import { createResolverContext, setSelfIndex } from './context';
import { createComponent, instantiateComponent } from './index';
import { ResolverContext } from './types';
import { parse } from '../parser';
import { setConfiguration } from '../utils/assert';
// import { writeToFile } from '../../tests/utils';

setConfiguration('Debug');

describe('resolver hello', () => {
    test('resolver compiles component from fake model', async () => {
        //TODO const wasm = './hello/wasm/hello.wasm';
        const component = await createComponent<js.NamedExports>(expectedModel);
        const rctx = component.resolverContext as ResolverContext;

        //TODO asserts
    });

    test('component hello.wasm could run', async () => {
        let actualMessage: string = undefined as any;

        const imports: js.NamedImports = {
            'hello:city/city': {
                sendMessage: (message: string) => {
                    //console.log('sendMessage in test ', message);
                    actualMessage = message;
                }
            }
        };

        const instance = await instantiateComponent('./hello/wasm/hello.wasm', imports);
        const run = instance.exports['hello:city/greeter'].run;

        run({
            name: 'Prague',
            headCount: 1_000_000,
            budget: BigInt(200_000_000),
        });
        expect(actualMessage).toBe('Welcome to Prague, we invite you for a drink!');

        actualMessage = undefined as any;
        run({
            name: 'Kladno',
            headCount: 100_000,
            budget: 0n,
        });
        expect(actualMessage).toBe('Welcome to Kladno!');

    });

    test('manual resolve indexes', async () => {
        const actualContext = createResolverContext(expectedModel, {});
        // writeToFile('actual-hello.json', JSON.stringify(actualContext, null, 2));
        // writeToFile('expected-hello.json', JSON.stringify(expectedContext, null, 2));
        const expectedContextCpy = { ...expectedContext } as ResolverContext;
        setSelfIndex(expectedContextCpy);
        expect(actualContext.indexes).toEqual(expectedContext.indexes);
    });

    test('JCO rewrite works', async () => {
        const parsedModel = await parse('./hello/wasm/hello.wasm');

        let actualMessage: string = undefined as any;
        const imports: js.NamedImports = {
            'hello:city/city': {
                sendMessage: (message: string) => {
                    actualMessage = message;
                }
            }
        };

        const instance = await resolveJCO(parsedModel, imports);

        instance.exports['hello:city/greeter'].run({
            name: 'Prague',
            headCount: 1_000_000,
            budget: BigInt(200_000_000),
        });
        expect(actualMessage).toBe('Welcome to Prague, we invite you for a drink!');
    });
});
