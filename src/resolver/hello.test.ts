import { expectedModel } from '../../tests/hello';
import { js } from '../../tests/hello-component';
import { createComponent } from './index';

test('parse method compiles modules', async () => {
    let actualMessage: string = undefined as any;
    const imports: js.NamedImports = {
        'hello:city/city': {
            sendMessage: (message: string) => {
                actualMessage = message;
            }
        }
    };
    //TODO const wasm = './hello/wasm/hello.wasm';
    const component = await createComponent<js.NamedExports>(expectedModel, imports);

    component.exports['hello:city/greeter'].run({
        name: 'Prague',
        headCount: 1_000_000,
        budget: BigInt(200_000_000),
    });

    expect(actualMessage).toBe('Welcome in Prague, we invite you for a drink!');
});