// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.types.d.ts" />

import gitHash from 'env:gitHash';
import configuration from 'env:configuration';
import { initializeAsserts } from './utils/assert';
import './utils/debug-names'; // registers initDebugNames before setConfiguration
import { GIT_HASH, CONFIGURATION } from './constants';
import { instantiateWasiComponent } from './host/wasip2/instantiate';
import { parseCliArgs } from './args';

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
    const mainModulePath = process.argv[1];
    if (!mainModulePath) throw new Error('process.argv[1] is undefined');
    const mainModuleUrl = pathToFileURL(realpathSync(mainModulePath)).href;
    if (import.meta.url === mainModuleUrl) {
        // re-exec with --experimental-wasm-jspi if not already set
        if (!process.execArgv.some(a => a.includes('experimental-wasm-jspi'))) {
            const { spawnSync } = await import('node:child_process');
            const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', ...process.execArgv, mainModulePath, ...process.argv.slice(2)], { stdio: 'inherit' });
            process.exit(result.status ?? 1);
        }
        const args = process.argv.slice(2);
        const { componentUrl, options, error, help } = parseCliArgs(args);
        if (help) {
            const { HELP_TEXT } = await import('./args');
            // eslint-disable-next-line no-console
            console.log(HELP_TEXT);
            process.exit(0);
        }
        if (error) {
            // eslint-disable-next-line no-console
            console.error(error);
            process.exit(1);
        }
        if (!componentUrl) {
            process.exit(1);
        }

        const envPairs: [string, string][] | undefined = options.envInherit
            ? Object.entries({ ...process.env as Record<string, string>, ...options.env })
            : Object.keys(options.env).length > 0 ? Object.entries(options.env) : undefined;

        const instance = await instantiateWasiComponent(componentUrl, {
            network: options.network,
            enabledInterfaces: options.enabledInterfaces,
            env: envPairs,
            mounts: options.mounts.length > 0 ? options.mounts : undefined,
            cwd: options.cwd,
        }, {}, options);
        const run = instance.exports['wasi:cli/run@0.2.11']?.run;
        if (!run) throw new Error('Component does not export wasi:cli/run@0.2.11');
        await run();
    }
}