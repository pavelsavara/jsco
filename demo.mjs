// See also `demo-verbose.mjs` for a more verbose version of this demo with comments and extra options.

import { instantiateWasiComponent } from './dist/index.js';
const componentUrl = './integration-tests/hello-world-wat/hello.wasm';
const instance = await instantiateWasiComponent(componentUrl);
const run = instance.exports['wasi:cli/run@0.2.11'].run;

// prints 'hello from jsco' to the console
await run();
