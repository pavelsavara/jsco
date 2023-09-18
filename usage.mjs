import { createComponent } from './dist/index.js';

// this is url of your component
// `hello.wasm` sample was built using `npm run build:hello`
// the implementation is in `./hello/src/lib.rs` 
const componentUrl='./hello/wasm/hello.wasm';

// this is the component instance, see also `instantiateComponent`
const component = await createComponent(componentUrl);

// these are the imports that the component expects
const imports = {
    'hello:city/city': {
        sendMessage: console.log
    }
};

// it has the following API `./hello/wit/hello.wit`
const instance = await component.instantiate(imports);

// exported namespaces contain the functions
const exports = instance.exports;

// this is the function that we want to call
const run = exports['hello:city/greeter'].run;

// run expects a cityInfo parameter
const cityInfo = {
    name: 'Prague',
    headCount: 1_000_000,
    budget: BigInt(200_000_000),
};

// call the WASM component's function
run(cityInfo);

// result type is void
// And we should see 'Welcome to Prague, we invite you for a drink!' in the console