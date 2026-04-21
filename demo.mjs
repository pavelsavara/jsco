// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// See also `demo-verbose.mjs` for a more verbose version of this demo with comments and extra options.

import { instantiateWasiComponent } from './dist/release/index.js';
const componentUrl = './integration-tests/hello-world-wat/hello.wasm';
const instance = await instantiateWasiComponent(componentUrl);
const run = instance.exports['wasi:cli/run@0.2.11'].run;

// prints 'hello from jsco' to the console
try {
    await run();
} catch (e) {
    // WasiExit with code 0 is a normal exit
    if (!(e.name === 'WasiExit' && e.exitCode === 0)) throw e;
}
process.exit(0);
