// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// See also `demo-verbose.mjs` for a more verbose version of this demo with comments and extra options.

import { instantiateWasiComponent } from './dist/release/index.js';
const componentUrl = './integration-tests/hello-p3-world-wat/hello-p3.wasm';
const instance = await instantiateWasiComponent(componentUrl);
const run = instance.exports['wasi:cli/run@0.3.0-rc-2026-03-15'].run;

// prints 'hello from jsco' to the console
await run();
process.exit(0);
