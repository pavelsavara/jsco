// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createComponent } from './dist/index.js';

// this is url of your component
// `hello.wasm` sample was built using `npm run build:hello`
// the implementation is in `./integration-tests/hello-city-wat/hello-city.wat` 
const componentUrl = './integration-tests/hello-city-wat/hello-city.wasm';

// this is the component instance, see also `instantiateComponent`
const component = await createComponent(componentUrl, {
    useNumberForInt64: false,
    noJspi: false,
    validateTypes: true
});

// these are the imports that the component expects
// it has the following API `./integration-tests/hello-city-wat/hello-city.wit`
const imports = {
    'hello:city/logger@0.1.0': {
        log: console.log
    }
};

// instantiate the component with the imports
const instance = await component.instantiate(imports);

// exported namespaces contain the functions
const exports = instance.exports;

// this is the function that we want to call
const run = exports['hello:city/greeter@0.1.0'].run;

// run expects a cityInfo parameter
const cityInfo = {
    name: 'Prague',
    headCount: 1_000_000,
    budget: BigInt(200_000_000),
};

// call the WASM component's function
await run(cityInfo);

// result type is void
// And we should see 'Welcome to Prague, we invite you for a drink!' in the console