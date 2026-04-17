// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createWasiP2ViaP3Adapter } from './host/wasip2-via-wasip3';
import { createWasiP3Host, WasiP3Config } from './host/wasip3';
import { serve, WasiHttpHandlerExport } from './host/wasip3/node/wasip3';
import { createComponent } from './resolver';
import { CliOptions, CliParseResult, getHelpText, parseCliArgs } from './utils/args';
import { EXPORTS, INSTANTIATE } from './utils/constants';
import { hasJspi } from './utils/jspi';

// ─── CLI Entry Point ───

/* istanbul ignore next -- CLI entry point: uses import.meta.url, process.exit, dynamic imports; untestable in Jest */
export async function cliMain(): Promise<void> {
    // detect that we are running in nodejs
    if (typeof process === 'undefined' || process.versions == null || process.versions.node == null) return;

    // and that we are the main esm entry point (not imported by another module)
    const realpathSync = (await import('node:fs'))['realpathSync'];
    const pathToFileURL = (await import('node:url'))['pathToFileURL'];
    const mainModulePath = process.argv[1];
    if (!mainModulePath) return;
    const mainModuleUrl = pathToFileURL(realpathSync(mainModulePath)).href;
    if (import.meta.url !== mainModuleUrl) return;

    // re-exec with --experimental-wasm-jspi if not already set
    if (!hasJspi()) {
        const spawnSync = (await import('node:child_process'))['spawnSync'];
        const result = spawnSync(process['execPath'], ['--experimental-wasm-jspi', ...process['execArgv'] as string[], mainModulePath, ...process.argv.slice(2)], { 'stdio': 'inherit' });
        process.exit(result['status'] ?? 1);
    }

    const args = process.argv.slice(2);
    const parsedArgs = parseCliArgs(args);
    if (parsedArgs.help) {
        // eslint-disable-next-line no-console
        console.log(getHelpText(parsedArgs.command));
        process.exit(0);
    }
    if (parsedArgs.error) {
        // eslint-disable-next-line no-console
        console.error(parsedArgs.error);
        process.exit(1);
    }
    if (!parsedArgs.componentUrl) {
        process.exit(1);
    }
    await mainImpl(parsedArgs);
}

export async function mainImpl({ command, componentUrl, options }: CliParseResult) {
    try {
        const config = createConfig(options);
        const component = await createComponent(componentUrl!, options);
        const exports = component[EXPORTS]();
        const wsiP2Rx = /^wasi:cli\/.*@0\.2/;
        const isWasiP2 = exports.find(s => wsiP2Rx.test(s));
        const wasiP3Host = createWasiP3Host(config);
        const imports = isWasiP2
            ? createWasiP2ViaP3Adapter(wasiP3Host)
            : wasiP3Host;
        const instance = await component[INSTANTIATE](imports);

        if (command === 'run') {
            const runExportName = exports.find(s => s.startsWith('wasi:cli/run'));
            if (!runExportName) {
                throw new Error('Component does not export wasi:cli/run');
            }
            const run = instance.exports[runExportName]?.['run'] as Function | undefined;
            if (!run) throw new Error('Component does not export wasi:cli/run');
            await run();
        } else if (command === 'serve') {
            const handlerExportName = exports.find(s => s.startsWith('wasi:incoming-handler/handle'));
            if (!handlerExportName) {
                throw new Error('Component does not export wasi:incoming-handler/handle');
            }
            const handlerExport = instance.exports[handlerExportName] as WasiHttpHandlerExport | undefined;
            if (!handlerExport) throw new Error('Component does not export wasi:incoming-handler/handle');

            await serve(handlerExport, config);
        } else {
            throw new Error(`Unknown command: ${command}`);
        }

    } catch (e: unknown) {
        // WasiExit is a normal exit — use its status code
        if (e instanceof Error && e.name === 'WasiExit' && 'status' in e) {
            process.exit(e.status as number);
        }
        // eslint-disable-next-line no-console
        console.error(e instanceof Error ? e.stack ?? e.message : e);
        process.exit(1);
    }
}

export function createConfig(options: CliOptions): WasiP3Config {
    // Build env pairs: explicit values + inherited names + inherit-all
    const envRecord: Record<string, string> = {};
    if (options.envInheritAll) {
        Object.assign(envRecord, process['env']);
    }
    for (const name of options.envInheritNames) {
        if (name in process['env']) {
            envRecord[name] = process['env'][name]!;
        }
    }
    Object.assign(envRecord, options.env);
    const envPairs: [string, string][] | undefined = Object.keys(envRecord).length > 0
        ? Object.entries(envRecord) : undefined;

    return {
        network: options.network,
        enabledInterfaces: options.enabledInterfaces,
        env: envPairs,
        mounts: options.mounts.length > 0 ? options.mounts : undefined,
        cwd: options.cwd,
        args: options.componentArgs.length > 0 ? options.componentArgs : undefined,
    };
}
