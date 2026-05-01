// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import type { HostConfig } from './host/wasip3';
import type { WasiHttpHandlerExport } from './host/wasip3/node/wasip3';
// All non-CLI runtime is reached through './index', which is externalized in
// the Release bundle (resolves to './index.js' at runtime). This keeps the
// CLI bundle (cli.js) small — it doesn't re-bundle the resolver/parser/marshal.
import { createComponent, loadWasiP3Serve, loadWasiP1ViaP3Adapter } from './index';
import { CliOptions, CliParseResult, getHelpText, parseCliArgs } from './utils/args';
import { hasJspi } from './utils/jspi';
import { detectWasiType, createWasiImports, WasiType, isCoreModule } from './wasi-auto';
import { fetchLike, getBodyIfResponse } from './utils/fetch-like';

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

export async function main({ command, componentUrl, options }: CliParseResult): Promise<void> {
    try {
        const config = createConfig(options);

        // Read bytes to detect core module vs component
        const bytes = await readComponentBytes(componentUrl!);

        if (isCoreModule(bytes)) {
            // P1 core module path — bypass component model pipeline
            if (command === 'serve') {
                throw new Error('WASI P1 core modules do not support the serve command');
            }
            const module = await WebAssembly.compile(bytes as BufferSource);
            const { createWasiP1ViaP3Adapter } = await loadWasiP1ViaP3Adapter();
            const adapter = createWasiP1ViaP3Adapter(config);
            const instance = await WebAssembly.instantiate(module, adapter.imports as unknown as WebAssembly.Imports);
            const wasmMemory = instance.exports['memory'] as WebAssembly.Memory | undefined;
            if (wasmMemory) {
                adapter.bindMemory(wasmMemory);
            }
            const start = instance.exports['_start'] as Function | undefined;
            if (start) {
                start();
            }
            return;
        }

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
            const handlerExportName = exportNames.find(s => s.startsWith('wasi:http/incoming-handler') || s.startsWith('wasi:incoming-handler/handle') || s.startsWith('wasi:http/handler'));
            if (!handlerExportName) {
                throw new Error('Component does not export wasi:http/incoming-handler or wasi:http/handler');
            }
            const handlerExport = instance.exports[handlerExportName] as WasiHttpHandlerExport | undefined;
            if (!handlerExport) throw new Error('Component does not export wasi:http/incoming-handler or wasi:http/handler');

            // Parse --addr (host:port) into ServeConfig.
            let host: string | undefined;
            let port: number | undefined;
            if (options.addr) {
                const lastColon = options.addr.lastIndexOf(':');
                if (lastColon < 0) {
                    throw new Error(`Invalid --addr value (expected host:port): ${options.addr}`);
                }
                host = options.addr.slice(0, lastColon);
                const portStr = options.addr.slice(lastColon + 1);
                const portNum = Number.parseInt(portStr, 10);
                if (!Number.isFinite(portNum) || portNum < 0 || portNum > 65535) {
                    throw new Error(`Invalid --addr port: ${portStr}`);
                }
                port = portNum;
            }

            const handle = await (await loadWasiP3Serve()).serve(handlerExport, {
                host,
                port,
                network: config.network,
                // eslint-disable-next-line no-console
                ...(options.verbose ? { onError: (msg: string, e: unknown): void => console.error(msg, e instanceof Error ? (e.stack ?? e.message) : e) } : {}),
            });
            // Emit the resolved listening address so external supervisors
            // (e.g. jest globalSetup spawning `jsco serve`) can discover the
            // chosen port when --addr requested port 0.
            // eslint-disable-next-line no-console
            console.log(`jsco serve: listening on ${host ?? '127.0.0.1'}:${handle.port}`);
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

export function createConfig(options: CliOptions): HostConfig {
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
        limits: Object.keys(options.limits).length > 0 ? options.limits : undefined,
        enabledInterfaces: options.enabledInterfaces,
        env: envPairs,
        mounts: options.mounts.length > 0 ? options.mounts : undefined,
        cwd: options.cwd,
        args: options.componentArgs.length > 0 ? options.componentArgs : undefined,
    };
}

async function readComponentBytes(url: string): Promise<Uint8Array> {
    const result = await fetchLike(url);
    if (result instanceof Uint8Array) {
        return new Uint8Array(result);
    }
    const body = await getBodyIfResponse(result as any);
    if (body instanceof Uint8Array) {
        return new Uint8Array(body);
    }
    throw new Error(`Failed to read component bytes from ${url}`);
}
