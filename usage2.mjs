import { instantiateComponent } from './dist/index.js';
const instance = await instantiateComponent('./hello/wasm/hello.wasm', {
    'hello:city/city@0.1.0': { sendMessage: console.log }
});
const run = instance.exports['hello:city/greeter@0.1.0'].run;
run({ name: 'Kladno', headCount: 100000, budget: 0n });
// prints 'Welcome to Kladno!' to the console