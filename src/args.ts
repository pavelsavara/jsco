// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { NetworkConfig } from './host/wasip2/types';
import { NETWORK_DEFAULTS } from './host/wasip2/types';

export interface FsMount {
    hostPath: string;
    guestPath: string;
    readOnly: boolean;
}

export interface CliOptions {
    useNumberForInt64: boolean;
    noJspi: boolean;
    validateTypes: boolean;
    network: NetworkConfig;
    env: Record<string, string>;
    envInherit: boolean;
    mounts: FsMount[];
    cwd: string | undefined;
    enabledInterfaces: string[] | undefined;
}

export interface CliParseResult {
    componentUrl: string | undefined;
    options: CliOptions;
    error: string | undefined;
    help: boolean;
}

const HELP_TEXT = `Usage: npx @pavelsavara/jsco [options] [path/to/component.wasm]

Options:
  --component=<path>         Path to the WASM component
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --validate-types           Enable type validation
  --help                     Show this help message

Environment options:
  --env=KEY=VALUE            Set an environment variable for the WASM component
  --env-inherit              Inherit all host environment variables
  --cwd=<path>               Set the working directory for the WASM component

Mount options:
  --dir=<host>::<guest>      Mount a host directory at a guest path (read-write)
  --dir=<host>::<guest>::ro  Mount a host directory at a guest path (read-only)

Interface options:
  --enable=<prefix>          Enable only WASI interfaces matching prefix
                             (e.g. --enable=wasi:http --enable=wasi:cli)
                             By default all interfaces are enabled.
                             When specified, only matching prefixes are enabled.

Networking options:
  --max-http-body-bytes=<n>           Max HTTP body size in bytes (default: ${NETWORK_DEFAULTS.maxHttpBodyBytes})
  --max-http-headers-bytes=<n>        Max HTTP headers size in bytes (default: ${NETWORK_DEFAULTS.maxHttpHeadersBytes})
  --socket-buffer-bytes=<n>           Per-connection socket buffer in bytes (default: ${NETWORK_DEFAULTS.socketBufferBytes})
  --max-tcp-pending=<n>               Max pending TCP connections (default: ${NETWORK_DEFAULTS.maxTcpPendingConnections})
  --tcp-idle-timeout-ms=<n>           TCP idle timeout in ms (default: ${NETWORK_DEFAULTS.tcpIdleTimeoutMs})
  --http-request-timeout-ms=<n>       HTTP request timeout in ms (default: ${NETWORK_DEFAULTS.httpRequestTimeoutMs})
  --max-udp-datagrams=<n>             Max queued UDP datagrams (default: ${NETWORK_DEFAULTS.maxUdpDatagrams})
  --dns-timeout-ms=<n>                DNS lookup timeout in ms (default: ${NETWORK_DEFAULTS.dnsTimeoutMs})
  --max-concurrent-dns=<n>            Max concurrent DNS lookups (default: ${NETWORK_DEFAULTS.maxConcurrentDnsLookups})
  --max-http-connections=<n>          Max concurrent HTTP server connections (default: ${NETWORK_DEFAULTS.maxHttpConnections})
  --max-request-url-bytes=<n>         Max request URL length in bytes (default: ${NETWORK_DEFAULTS.maxRequestUrlBytes})
  --http-headers-timeout-ms=<n>       Slowloris protection: headers timeout in ms (default: ${NETWORK_DEFAULTS.httpHeadersTimeoutMs})
  --http-keep-alive-timeout-ms=<n>    HTTP keep-alive timeout in ms (default: ${NETWORK_DEFAULTS.httpKeepAliveTimeoutMs})
`;

export function parseCliArgs(args: string[]): CliParseResult {
    let componentUrl: string | undefined;
    let error: string | undefined;
    let help = false;
    const network: NetworkConfig = {};
    const env: Record<string, string> = {};
    const mounts: FsMount[] = [];
    let enabledInterfaces: string[] | undefined;
    const options: CliOptions = {
        useNumberForInt64: false,
        noJspi: false,
        validateTypes: true,
        network,
        env,
        envInherit: false,
        mounts,
        cwd: undefined,
        enabledInterfaces: undefined,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        if (arg === '--help' || arg === '-h') {
            help = true;
        } else if (arg === '--use-number-for-int64') {
            options.useNumberForInt64 = true;
        } else if (arg === '--no-jspi') {
            options.noJspi = true;
        } else if (arg === '--validate-types') {
            options.validateTypes = true;
        } else if (arg.startsWith('--component=')) {
            componentUrl = arg.substring('--component='.length);
        } else if (arg.startsWith('--env=')) {
            const kv = arg.substring('--env='.length);
            const eqIdx = kv.indexOf('=');
            if (eqIdx === -1) {
                error = `Invalid --env format: ${arg} (expected --env=KEY=VALUE)`;
                return { componentUrl, options, error, help };
            }
            env[kv.substring(0, eqIdx)] = kv.substring(eqIdx + 1);
        } else if (arg === '--env-inherit') {
            options.envInherit = true;
        } else if (arg.startsWith('--dir=')) {
            const val = arg.substring('--dir='.length);
            const parts = val.split('::');
            if (parts.length < 2 || parts.length > 3) {
                error = `Invalid --dir format: ${arg} (expected --dir=HOST::GUEST or --dir=HOST::GUEST::ro)`;
                return { componentUrl, options, error, help };
            }
            mounts.push({
                hostPath: parts[0]!,
                guestPath: parts[1]!,
                readOnly: parts.length === 3 && parts[2] === 'ro',
            });
        } else if (arg.startsWith('--cwd=')) {
            options.cwd = arg.substring('--cwd='.length);
        } else if (arg.startsWith('--enable=')) {
            if (!enabledInterfaces) enabledInterfaces = [];
            enabledInterfaces.push(arg.substring('--enable='.length));
            options.enabledInterfaces = enabledInterfaces;
        } else if (arg.startsWith('--max-http-body-bytes=')) {
            network.maxHttpBodyBytes = parseIntArg(arg);
        } else if (arg.startsWith('--max-http-headers-bytes=')) {
            network.maxHttpHeadersBytes = parseIntArg(arg);
        } else if (arg.startsWith('--socket-buffer-bytes=')) {
            network.socketBufferBytes = parseIntArg(arg);
        } else if (arg.startsWith('--max-tcp-pending=')) {
            network.maxTcpPendingConnections = parseIntArg(arg);
        } else if (arg.startsWith('--tcp-idle-timeout-ms=')) {
            network.tcpIdleTimeoutMs = parseIntArg(arg);
        } else if (arg.startsWith('--http-request-timeout-ms=')) {
            network.httpRequestTimeoutMs = parseIntArg(arg);
        } else if (arg.startsWith('--max-udp-datagrams=')) {
            network.maxUdpDatagrams = parseIntArg(arg);
        } else if (arg.startsWith('--dns-timeout-ms=')) {
            network.dnsTimeoutMs = parseIntArg(arg);
        } else if (arg.startsWith('--max-concurrent-dns=')) {
            network.maxConcurrentDnsLookups = parseIntArg(arg);
        } else if (arg.startsWith('--max-http-connections=')) {
            network.maxHttpConnections = parseIntArg(arg);
        } else if (arg.startsWith('--max-request-url-bytes=')) {
            network.maxRequestUrlBytes = parseIntArg(arg);
        } else if (arg.startsWith('--http-headers-timeout-ms=')) {
            network.httpHeadersTimeoutMs = parseIntArg(arg);
        } else if (arg.startsWith('--http-keep-alive-timeout-ms=')) {
            network.httpKeepAliveTimeoutMs = parseIntArg(arg);
        } else if (arg.endsWith('.wasm') && i === args.length - 1) {
            componentUrl = arg;
        } else {
            error = `Unknown argument: ${arg}`;
            return { componentUrl, options, error, help };
        }
    }

    if (help) {
        return { componentUrl, options, error: undefined, help };
    }

    if (!componentUrl) {
        error = 'usage: npx @pavelsavara/jsco [options] path/to/component.wasm\nTry --help for more information.';
    }

    return { componentUrl, options, error, help };
}

function parseIntArg(arg: string): number {
    const val = parseInt(arg.substring(arg.indexOf('=') + 1), 10);
    return isNaN(val) ? 0 : val;
}

export { HELP_TEXT };
