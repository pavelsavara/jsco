// TODO inline rollup macro
export function jsco_assert(condition: unknown, messageFactory: string | (() => string)): asserts condition {
    if (condition) return;
    const message = 'Assert failed: ' + (typeof messageFactory === 'function'
        ? messageFactory()
        : messageFactory);
    throw new Error(message);
}
