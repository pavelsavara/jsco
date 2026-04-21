// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { WasiP3Config } from './host/wasip3';
import type { WasiHttpHandlerExport } from './host/wasip3/node/wasip3';
import { loadWasiP3Serve } from './dynamic';
import { createComponent } from './resolver';
import { CliOptions, CliParseResult, getHelpText, parseCliArgs } from './utils/args';
import { hasJspi } from './utils/jspi';
import { detectWasiType, createWasiImports, WasiType } from './wasi-auto';

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
    await main(parsedArgs);
}

export async function main({ command, componentUrl, options }: CliParseResult) {
    try {
        const config = createConfig(options);
        const component = await createComponent(componentUrl!, options);
        const exportNames = component.exports();
        const importNames = component.imports();
        const wasiType = detectWasiType(exportNames, importNames);
        // CLI always provides a host — default to P3 when WASI version is not detected
        const effectiveType = wasiType === WasiType.None ? WasiType.P3 : wasiType;
        const imports = await createWasiImports(effectiveType, config);
        const instance = await component.instantiate(imports);

        if (command === 'run') {
            const runExportName = exportNames.find(s => s.startsWith('wasi:cli/run'));
            if (!runExportName) {
                throw new Error('Component does not export wasi:cli/run');
            }
            const run = instance.exports[runExportName]?.['run'] as Function | undefined;
            if (!run) throw new Error('Component does not export wasi:cli/run');
            await run();
        } else if (command === 'serve') {
            const handlerExportName = exportNames.find(s => s.startsWith('wasi:http/incoming-handler') || s.startsWith('wasi:incoming-handler/handle'));
            if (!handlerExportName) {
                throw new Error('Component does not export wasi:http/incoming-handler');
            }
            const handlerExport = instance.exports[handlerExportName] as WasiHttpHandlerExport | undefined;
            if (!handlerExport) throw new Error('Component does not export wasi:http/incoming-handler');

            await (await loadWasiP3Serve()).serve(handlerExport, config);
        } else {
            throw new Error(`Unknown command: ${command}`);
        }

    } catch (e: unknown) {
        // WasiExit is a normal exit — use its exit code
        // P3 host uses `exitCode`, P2 host uses `status`
        if (e instanceof Error && e.name === 'WasiExit') {
            const code = 'exitCode' in e ? e.exitCode as number : 'status' in e ? e.status as number : 1;
            process.exit(code);
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
