// TODO inline rollup macro
export function jsco_assert(condition: unknown, messageFactory: string | (() => string)): asserts condition {
    if (condition) return;
    const message = 'Assert failed: ' + (typeof messageFactory === 'function'
        ? messageFactory()
        : messageFactory);
    throw new Error(message);
}

export const enum LogLevel {
    Off,
    Summary,
    Detailed,
}

export type Verbosity = {
    parser: LogLevel;
    resolver: LogLevel;
    binder: LogLevel;
    executor: LogLevel;
}

export type LogFn = (phase: string, level: LogLevel, ...args: unknown[]) => void;

export const defaultVerbosity: Verbosity = {
    parser: LogLevel.Off,
    resolver: LogLevel.Off,
    binder: LogLevel.Off,
    executor: LogLevel.Off,
};

// eslint-disable-next-line no-console
let _logger: LogFn = (phase, _level, ...args) => console.log(`[${phase}]`, ...args);

export function setLogger(fn: LogFn) { _logger = fn; }

export function jsco_log(phase: string, level: LogLevel, ...args: unknown[]): void {
    _logger(phase, level, ...args);
}

// TODO figure out how to get jest to use virtual modules
export let configuration = 'Debug';
export let isDebug = false;
export function setConfiguration(value: string) {
    configuration = value;
    isDebug = value === 'Debug';
    if (isDebug) {
        initDebugNames();
    }
}

let _initDebugNames: (() => void) | undefined;
export function registerInitDebugNames(fn: () => void) { _initDebugNames = fn; }
function initDebugNames() { if (_initDebugNames) _initDebugNames(); }

export function debugStack(src: any, target: any, position: string) {
    if (!isDebug) return;
    const orig = src['debugStack'] ?? [];
    target['debugStack'] = [position, ...(orig)];
}

export function withDebugTrace<T extends Function>(binder: T, label: string): T {
    if (!isDebug) return binder;
    return ((async (bctx: any, bargs: any) => {
        const tracedArgs = { ...bargs, debugStack: [label, ...(bargs.debugStack ?? [])] };
        return (binder as any)(bctx, tracedArgs);
    }) as any) as T;
}