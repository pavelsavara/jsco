// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration
import { GIT_HASH, CONFIGURATION } from './constants';
import { instantiateWasiComponent } from './host/wasip2/instantiate';

export type { WasiInstantiateOptions } from './host/wasip2/instantiate';
export type { WasiConfig } from './host/wasip2/types';
export type { WasmComponent, WasmComponentInstance } from './resolver/api-types';
export { instantiateComponent, createComponent } from './resolver';
export { createWasiP2Host } from './host/wasip2';
export { instantiateWasiComponent } from './host/wasip2/instantiate';
export { LogLevel, setLogger } from './utils/assert';

export function getBuildInfo() {
    return {
        [GIT_HASH]: gitHash,
        [CONFIGURATION]: configuration,
    };
}

initializeAsserts();

// detect that we are running in nodejs
if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
    // and that we are the main esm entry point (not imported by another module)
    const { realpathSync } = await import('node:fs');
    const { pathToFileURL } = await import('node:url');
    const mainModuleUrl = pathToFileURL(realpathSync(process.argv[1])).href;
    if (import.meta.url === mainModuleUrl) {
        // re-exec with --experimental-wasm-jspi if not already set
        if (!process.execArgv.some(a => a.includes('experimental-wasm-jspi'))) {
            const { spawnSync } = await import('node:child_process');
            const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', ...process.execArgv, process.argv[1], ...process.argv.slice(2)], { stdio: 'inherit' });
            process.exit(result.status ?? 1);
        }
        const args = process.argv.slice(2);
        let componentUrl;
        const options = {
            useNumberForInt64: false,
            noJspi: false,
            validateTypes: true
        } as any;
        // process arguments and map them to them to options and componentUrl
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '--use-number-for-int64') {
                options.useNumberForInt64 = true;
            } else if (arg === '--no-jspi') {
                options.noJspi = true;
            } else if (arg === '--validate-types') {
                options.validateTypes = true;
            } else if (arg.startsWith('--component=')) {
                componentUrl = arg.substring('--component='.length);
            } else if (arg.endsWith('.wasm') && i == args.length - 1) {
                componentUrl = arg;
            } else {
                // eslint-disable-next-line no-console
                console.error(`Unknown argument: ${arg}`);
                process.exit(1);
            }
        }
        if (!componentUrl) {
            // eslint-disable-next-line no-console
            console.error('usage: npx @pavelsavara/jsco [--use-number-for-int64] [--no-jspi] [--validate-types] path/to/component.wasm');
            process.exit(1);
        }

        const instance = await instantiateWasiComponent(componentUrl, options);
        const run = instance.exports['wasi:cli/run@0.2.11'].run;
        await run();
    }
}