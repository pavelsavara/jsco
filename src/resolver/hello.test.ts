import { expectedModel } from '../../tests/hello';
import { resolveTree, expectedContext } from '../../tests/resolve-hello';
import { js } from '../../tests/hello-component';
import { produceResolverContext } from './context';
import { createComponent, instantiateComponent } from './index';
import { ResolverContext } from './types';
// import { writeToFile } from '../../tests/utils';

describe('resolver hello', () => {
    test('resolver compiles component from fake model', async () => {
        //TODO const wasm = './hello/wasm/hello.wasm';
        const component = await createComponent<js.NamedExports>(expectedModel);
        const rctx = component.resolverContext as ResolverContext;
        //console.log('rctx', rctx);
    });

    test('component instantiated from fake model could run', async () => {
        let actualMessage: string = undefined as any;
        const imports: js.NamedImports = {
            'hello:city/city': {
                sendMessage: (message: string) => {
                    actualMessage = message;
                }
            }
        };
        const instance = await instantiateComponent(expectedModel, imports);

        instance.exports['hello:city/greeter'].run({
            name: 'Prague',
            headCount: 1_000_000,
            budget: BigInt(200_000_000),
        });

        expect(actualMessage).toBe('Welcome to Prague, we invite you for a drink!');
    });

    test('manual resolve indexes', async () => {
        const actualContext = produceResolverContext(expectedModel, {});
        // writeToFile('actual-hello.json', JSON.stringify(actualContext, null, 2));
        // writeToFile('expected-hello.json', JSON.stringify(expectedContext, null, 2));

        expect(actualContext.indexes).toEqual(expectedContext.indexes);
    });

    test('manual resolve tree', async () => {
        resolveTree();
    });
});
