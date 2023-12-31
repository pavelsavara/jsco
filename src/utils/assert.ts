// TODO inline rollup macro
export function jsco_assert(condition: unknown, messageFactory: string | (() => string)): asserts condition {
    if (condition) return;
    const message = 'Assert failed: ' + (typeof messageFactory === 'function'
        ? messageFactory()
        : messageFactory);
    throw new Error(message);
}

// TODO figure out how to get jest to use virtual modules
export let configuration = 'Debug';
export let isDebug = false;
export function setConfiguration(value: string) {
    configuration = value;
    isDebug = value === 'Debug';
}

export function debugStack(src: any, target: any, position: string) {
    if (!isDebug) return;
    const orig = src['debugStack'] ?? [];
    target['debugStack'] = [position, ...(orig)];
}