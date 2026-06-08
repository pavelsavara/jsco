// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * `enabledInterfaces` whitelist enforcement for assembled WASI import tables.
 *
 * Kept dependency-free so it can be imported into the lightweight auto-detect
 * entry (`wasi-auto.ts`) without pulling the heavier host modules.
 */

/**
 * Build a trapping replacement for a disabled WASI interface.
 *
 * Preserves the interface's member keys so the resolver can still bind the
 * import (the component instantiates), but every member is a function that
 * throws when the guest actually invokes it.
 */
function makeTrappingInterface(key: string, original: unknown): unknown {
    const trap = (): never => {
        throw new Error(`WASI interface "${key}" is disabled (not listed in enabledInterfaces)`);
    };
    if (original && typeof original === 'object') {
        const stub: Record<string, unknown> = {};
        for (const member of Object.keys(original as Record<string, unknown>)) {
            stub[member] = trap;
        }
        return stub;
    }
    return trap;
}

/**
 * Enforce the `enabledInterfaces` whitelist on an assembled imports map.
 *
 * When `enabledInterfaces` is set, any key that does not start with one of the
 * listed prefixes (e.g. `'wasi:cli'` matches `'wasi:cli/environment'` and the
 * versioned `'wasi:cli/environment@0.3.0-...'`) is replaced in place by a
 * trapping stub. Idempotent — re-running on an already-filtered map is safe.
 */
export function applyEnabledInterfaces(
    map: Record<string, unknown>,
    enabledInterfaces: string[] | undefined,
): void {
    if (!enabledInterfaces) return;
    for (const key of Object.keys(map)) {
        const enabled = enabledInterfaces.some(prefix => key.startsWith(prefix));
        if (!enabled) {
            map[key] = makeTrappingInterface(key, map[key]);
        }
    }
}
