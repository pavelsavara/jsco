import { instantiateWasiComponent } from '../../dist/index.js';

const instance = await instantiateWasiComponent(
    './hello/wasi-hello/wasm/wasi-hello.wasm',
    {
        stdout: (bytes) => process.stdout.write(bytes),
    },
);

const run = instance.exports['wasi:cli/run@0.2.6'].run;
await run();
