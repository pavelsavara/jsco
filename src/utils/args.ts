// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import type { NetworkConfig } from '../host/wasip3/types';
import { NETWORK_DEFAULTS } from '../host/wasip3/types';

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
    envInheritNames: string[];
    envInheritAll: boolean;
    mounts: FsMount[];
    cwd: string | undefined;
    enabledInterfaces: string[] | undefined;
    /** serve-specific: listen address as host:port. Default: 0.0.0.0:8080 */
    addr: string | undefined;
    /** Arguments to pass to the WASM component via wasi:cli/environment get-arguments */
    componentArgs: string[];
}

export interface CliParseResult {
    command: 'run' | 'serve';
    componentUrl: string | undefined;
    options: CliOptions;
    error: string | undefined;
    help: boolean;
}

// ─── Help Text ───

const MAIN_HELP_TEXT = `jsco WebAssembly Component Runtime

Usage: jsco [OPTIONS] <WASM>
       jsco <COMMAND> [OPTIONS] <WASM>

Commands:
  run         Runs a WebAssembly component [default]
  serve       Serves requests from a wasi:http proxy component
  help        Print this message or the help of the given subcommand

If a subcommand is not provided, the \`run\` subcommand will be used.

Common Options:
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest
  --env <NAME[=VAL]>         Pass an environment variable to the program
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.
`;

const RUN_HELP_TEXT = `Runs a WebAssembly component

Usage: jsco run [OPTIONS] <WASM>

Arguments:
  <WASM>  The WebAssembly component to run

Options:
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest.
                             If specified as just HOST_DIR then the same
                             directory name on the host is made available
                             within the guest. If specified as HOST::GUEST
                             then the HOST directory is opened and made
                             available as the name GUEST in the guest.
  --env <NAME[=VAL]>         Pass an environment variable to the program.
                             The --env FOO=BAR form will set the environment
                             variable named FOO to the value BAR for the
                             guest. The --env FOO form will inherit the
                             variable from the calling process.
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
                             (e.g. --enable wasi:http --enable wasi:cli)
                             By default all interfaces are enabled.
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.

Networking options:
  --max-http-body-bytes <N>           Max HTTP body size in bytes (default: ${NETWORK_DEFAULTS.maxHttpBodyBytes})
  --max-http-headers-bytes <N>        Max HTTP headers size in bytes (default: ${NETWORK_DEFAULTS.maxHttpHeadersBytes})
  --socket-buffer-bytes <N>           Per-connection socket buffer in bytes (default: ${NETWORK_DEFAULTS.socketBufferBytes})
  --max-tcp-pending <N>               Max pending TCP connections (default: ${NETWORK_DEFAULTS.maxTcpPendingConnections})
  --tcp-idle-timeout-ms <N>           TCP idle timeout in ms (default: ${NETWORK_DEFAULTS.tcpIdleTimeoutMs})
  --http-request-timeout-ms <N>       HTTP request timeout in ms (default: ${NETWORK_DEFAULTS.httpRequestTimeoutMs})
  --max-udp-datagrams <N>             Max queued UDP datagrams (default: ${NETWORK_DEFAULTS.maxUdpDatagrams})
  --dns-timeout-ms <N>                DNS lookup timeout in ms (default: ${NETWORK_DEFAULTS.dnsTimeoutMs})
  --max-concurrent-dns <N>            Max concurrent DNS lookups (default: ${NETWORK_DEFAULTS.maxConcurrentDnsLookups})
  --max-http-connections <N>          Max concurrent HTTP server connections (default: ${NETWORK_DEFAULTS.maxHttpConnections})
  --max-request-url-bytes <N>         Max request URL length in bytes (default: ${NETWORK_DEFAULTS.maxRequestUrlBytes})
  --http-headers-timeout-ms <N>       Slowloris protection: headers timeout (default: ${NETWORK_DEFAULTS.httpHeadersTimeoutMs})
  --http-keep-alive-timeout-ms <N>    HTTP keep-alive timeout (default: ${NETWORK_DEFAULTS.httpKeepAliveTimeoutMs})
`;

const SERVE_HELP_TEXT = `Serves requests from a wasi:http proxy component

Usage: jsco serve [OPTIONS] <WASM>

Arguments:
  <WASM>  The WebAssembly component to serve

Options:
  --addr <SOCKADDR>          Socket address to bind to [default: 0.0.0.0:8080]
  --use-number-for-int64     Use JavaScript number instead of BigInt for i64
  --no-jspi                  Disable JSPI (WebAssembly.Suspending/promising)
  --validate-types           Enable type validation
  --dir <HOST_DIR[::GUEST_DIR[::ro]]>
                             Grant access of a host directory to a guest
  --env <NAME[=VAL]>         Pass an environment variable to the program
  --env-inherit              Inherit all host environment variables
  --cwd <PATH>               Set the working directory for the component
  --enable <PREFIX>          Enable only WASI interfaces matching prefix
  -h, --help                 Print help

Arguments after -- are passed to the component via wasi:cli/environment.

Networking options:
  --max-http-body-bytes <N>           Max HTTP body size in bytes (default: ${NETWORK_DEFAULTS.maxHttpBodyBytes})
  --max-http-headers-bytes <N>        Max HTTP headers size in bytes (default: ${NETWORK_DEFAULTS.maxHttpHeadersBytes})
  --max-http-connections <N>          Max concurrent HTTP server connections (default: ${NETWORK_DEFAULTS.maxHttpConnections})
  --max-request-url-bytes <N>         Max request URL length in bytes (default: ${NETWORK_DEFAULTS.maxRequestUrlBytes})
  --http-request-timeout-ms <N>       HTTP request timeout in ms (default: ${NETWORK_DEFAULTS.httpRequestTimeoutMs})
  --http-headers-timeout-ms <N>       Slowloris protection: headers timeout (default: ${NETWORK_DEFAULTS.httpHeadersTimeoutMs})
  --http-keep-alive-timeout-ms <N>    HTTP keep-alive timeout (default: ${NETWORK_DEFAULTS.httpKeepAliveTimeoutMs})
`;

export function getHelpText(command?: 'run' | 'serve'): string {
    switch (command) {
        case 'run': return RUN_HELP_TEXT;
        case 'serve': return SERVE_HELP_TEXT;
        default: return MAIN_HELP_TEXT;
    }
}

// For backward compatibility
export const HELP_TEXT = MAIN_HELP_TEXT;

// ─── Parsing ───

function createDefaultOptions(): CliOptions {
    return {
        useNumberForInt64: false,
        noJspi: false,
        validateTypes: true,
        network: {},
        env: {},
        envInheritNames: [],
        envInheritAll: false,
        mounts: [],
        cwd: undefined,
        enabledInterfaces: undefined,
        addr: undefined,
        componentArgs: [],
    };
}

/**
 * Consume the next argument value. Supports both `--flag=value` and `--flag value` forms.
 * Returns the value and optional updated index (if i was advanced).
 */
function consumeValue(arg: string, prefix: string, args: string[], i: number): { val: string; nextI: number } | null {
    if (arg.startsWith(prefix + '=')) {
        return { val: arg.substring(prefix.length + 1), nextI: i };
    }
    if (arg === prefix) {
        const next = args[i + 1];
        if (next === undefined || next.startsWith('-')) {
            return null; // missing value
        }
        return { val: next, nextI: i + 1 };
    }
    /* istanbul ignore next -- unreachable guard */
    return undefined as never; // should not be called unless arg starts with prefix
}

export function parseCliArgs(args: string[]): CliParseResult {
    let command: 'run' | 'serve' = 'run';
    let componentUrl: string | undefined;
    let error: string | undefined;
    let help = false;
    const options = createDefaultOptions();
    let enabledInterfaces: string[] | undefined;
    let startIdx = 0;

    // Check for command prefix
    const firstArg = args[0];
    if (firstArg === 'run') {
        command = 'run';
        startIdx = 1;
    } else if (firstArg === 'serve') {
        command = 'serve';
        startIdx = 1;
    } else if (firstArg === 'help') {
        // jsco help [command]
        const sub = args[1];
        if (sub === 'run' || sub === 'serve') {
            return { command: sub, componentUrl: undefined, options, error: undefined, help: true };
        }
        return { command: 'run', componentUrl: undefined, options, error: undefined, help: true };
    }

    for (let i = startIdx; i < args.length; i++) {
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
        } else if (arg === '--env-inherit') {
            options.envInheritAll = true;
        } else if (arg.startsWith('--env')) {
            const cv = consumeValue(arg, '--env', args, i);
            if (!cv) {
                error = 'Missing value for --env';
                return { command, componentUrl, options, error, help };
            }
            i = cv.nextI;
            const kv = cv.val;
            const eqIdx = kv.indexOf('=');
            if (eqIdx === -1) {
                // --env FOO → inherit single variable from host
                options.envInheritNames.push(kv);
            } else {
                // --env FOO=BAR → set explicit value
                options.env[kv.substring(0, eqIdx)] = kv.substring(eqIdx + 1);
            }
        } else if (arg.startsWith('--dir')) {
            const cv = consumeValue(arg, '--dir', args, i);
            if (!cv) {
                error = 'Missing value for --dir';
                return { command, componentUrl, options, error, help };
            }
            i = cv.nextI;
            const val = cv.val;
            const parts = val.split('::');
            if (parts.length === 1) {
                // --dir HOST_DIR → same path on guest (wasmtime compat)
                options.mounts.push({ hostPath: parts[0]!, guestPath: parts[0]!, readOnly: false });
            } else if (parts.length === 2) {
                options.mounts.push({ hostPath: parts[0]!, guestPath: parts[1]!, readOnly: false });
            } else if (parts.length === 3 && parts[2] === 'ro') {
                options.mounts.push({ hostPath: parts[0]!, guestPath: parts[1]!, readOnly: true });
            } else {
                error = `Invalid --dir format: ${val} (expected HOST_DIR, HOST::GUEST, or HOST::GUEST::ro)`;
                return { command, componentUrl, options, error, help };
            }
        } else if (arg.startsWith('--cwd')) {
            const cv = consumeValue(arg, '--cwd', args, i);
            if (!cv) {
                error = 'Missing value for --cwd';
                return { command, componentUrl, options, error, help };
            }
            i = cv.nextI;
            options.cwd = cv.val;
        } else if (arg.startsWith('--enable')) {
            const cv = consumeValue(arg, '--enable', args, i);
            if (!cv) {
                error = 'Missing value for --enable';
                return { command, componentUrl, options, error, help };
            }
            i = cv.nextI;
            if (!enabledInterfaces) enabledInterfaces = [];
            enabledInterfaces.push(cv.val);
            options.enabledInterfaces = enabledInterfaces;
        } else if (arg.startsWith('--addr')) {
            const cv = consumeValue(arg, '--addr', args, i);
            if (!cv) {
                error = 'Missing value for --addr';
                return { command, componentUrl, options, error, help };
            }
            i = cv.nextI;
            options.addr = cv.val;
        } else if (arg.startsWith('--max-http-body-bytes')) {
            const cv = consumeValue(arg, '--max-http-body-bytes', args, i);
            if (!cv) { error = 'Missing value for --max-http-body-bytes'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxHttpBodyBytes = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-http-headers-bytes')) {
            const cv = consumeValue(arg, '--max-http-headers-bytes', args, i);
            if (!cv) { error = 'Missing value for --max-http-headers-bytes'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxHttpHeadersBytes = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--socket-buffer-bytes')) {
            const cv = consumeValue(arg, '--socket-buffer-bytes', args, i);
            if (!cv) { error = 'Missing value for --socket-buffer-bytes'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.socketBufferBytes = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-tcp-pending')) {
            const cv = consumeValue(arg, '--max-tcp-pending', args, i);
            if (!cv) { error = 'Missing value for --max-tcp-pending'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxTcpPendingConnections = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--tcp-idle-timeout-ms')) {
            const cv = consumeValue(arg, '--tcp-idle-timeout-ms', args, i);
            if (!cv) { error = 'Missing value for --tcp-idle-timeout-ms'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.tcpIdleTimeoutMs = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--http-request-timeout-ms')) {
            const cv = consumeValue(arg, '--http-request-timeout-ms', args, i);
            if (!cv) { error = 'Missing value for --http-request-timeout-ms'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.httpRequestTimeoutMs = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-udp-datagrams')) {
            const cv = consumeValue(arg, '--max-udp-datagrams', args, i);
            if (!cv) { error = 'Missing value for --max-udp-datagrams'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxUdpDatagrams = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--dns-timeout-ms')) {
            const cv = consumeValue(arg, '--dns-timeout-ms', args, i);
            if (!cv) { error = 'Missing value for --dns-timeout-ms'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.dnsTimeoutMs = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-concurrent-dns')) {
            const cv = consumeValue(arg, '--max-concurrent-dns', args, i);
            if (!cv) { error = 'Missing value for --max-concurrent-dns'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxConcurrentDnsLookups = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-http-connections')) {
            const cv = consumeValue(arg, '--max-http-connections', args, i);
            if (!cv) { error = 'Missing value for --max-http-connections'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxHttpConnections = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--max-request-url-bytes')) {
            const cv = consumeValue(arg, '--max-request-url-bytes', args, i);
            if (!cv) { error = 'Missing value for --max-request-url-bytes'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.maxRequestUrlBytes = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--http-headers-timeout-ms')) {
            const cv = consumeValue(arg, '--http-headers-timeout-ms', args, i);
            if (!cv) { error = 'Missing value for --http-headers-timeout-ms'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.httpHeadersTimeoutMs = parseInt(cv.val, 10) || 0;
        } else if (arg.startsWith('--http-keep-alive-timeout-ms')) {
            const cv = consumeValue(arg, '--http-keep-alive-timeout-ms', args, i);
            if (!cv) { error = 'Missing value for --http-keep-alive-timeout-ms'; return { command, componentUrl, options, error, help }; }
            i = cv.nextI;
            options.network.httpKeepAliveTimeoutMs = parseInt(cv.val, 10) || 0;
        } else if (arg === '--') {
            // Everything after -- is passed as component args
            options.componentArgs = args.slice(i + 1);
            break;
        } else if (arg.startsWith('-')) {
            error = `Unknown argument: ${arg}`;
            return { command, componentUrl, options, error, help };
        } else if (arg.endsWith('.wasm')) {
            componentUrl = arg;
        } else {
            error = `Unknown argument: ${arg}`;
            return { command, componentUrl, options, error, help };
        }
    }

    if (help) {
        return { command, componentUrl, options, error: undefined, help };
    }

    if (!componentUrl) {
        error = `usage: jsco ${command} [options] <component.wasm>\nTry --help for more information.`;
    }

    return { command, componentUrl, options, error, help };
}

export { MAIN_HELP_TEXT, RUN_HELP_TEXT, SERVE_HELP_TEXT };
