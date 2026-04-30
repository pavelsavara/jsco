// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Helpers for assembling the flat WASI host import tables.
 *
 * The component model represents a resource interface as a flat record whose
 * keys are bracket-tagged kebab strings:
 *
 *   [constructor]<cls>
 *   [static]<cls>.<name>
 *   [method]<cls>.<name>
 *   [resource-drop]<cls>
 *
 * The bracket tags and the `wasi:` prefix are repeated dozens of times across
 * host modules. These helpers compose them from segments so each class name
 * and method name appears exactly once at the call site.
 */

import camelCase from 'just-camel-case';

const T_METHOD = '[method]';
const T_CTOR = '[constructor]';
const T_STATIC = '[static]';
const T_DROP = '[resource-drop]';

const noop = (): void => { /* GC */ };

export interface ResourceSpec {
    /** Maps to `[constructor]<cls>`. */
    ctor?: Function;
    /** Each entry maps to `[static]<cls>.<kebab-name>`. */
    statics?: Record<string, Function>;
    /** Each entry maps to `[method]<cls>.<kebab-name>`. */
    methods?: Record<string, Function>;
    /** Maps to `[resource-drop]<cls>`. Defaults to a noop (JS GC owns the object). */
    drop?: () => void;
}

/** Build the flat entries for a single resource class. */
export function resource(cls: string, spec: ResourceSpec): Record<string, Function> {
    const out: Record<string, Function> = {};
    out[T_DROP + cls] = spec.drop ?? noop;
    if (spec.ctor) {
        out[T_CTOR + cls] = spec.ctor;
    }
    if (spec.statics) {
        for (const name in spec.statics) {
            out[T_STATIC + cls + '.' + name] = spec.statics[name]!;
        }
    }
    if (spec.methods) {
        for (const name in spec.methods) {
            out[T_METHOD + cls + '.' + name] = spec.methods[name]!;
        }
    }
    return out;
}

/**
 * Build a `{ [kebab]: (self, ...args) => self[camelCase(kebab)](...args) }` map.
 *
 * Used when the host method is a thin passthrough that just forwards to the
 * already-camelCased method on the JS instance produced by P3.
 */
export function passthrough(...kebabNames: string[]): Record<string, Function> {
    const out: Record<string, Function> = {};
    for (const kebab of kebabNames) {
        const cc = camelCase(kebab);
        out[kebab] = function (self: Record<string, Function>, ...args: unknown[]): unknown {
            return (self[cc] as Function).apply(self, args);
        };
    }
    return out;
}

/**
 * Build a `{ [kebab]: (...args) => valueOrThunk }` map.
 *
 * If `valueOrThunk` is a function it is invoked on every call (so it can return
 * a fresh object/result tag); otherwise the same value is returned each time.
 * Used for "dummy" stub methods that ignore their arguments.
 */
export function constant(valueOrThunk: unknown, ...kebabNames: string[]): Record<string, Function> {
    const out: Record<string, Function> = {};
    const isThunk = typeof valueOrThunk === 'function';
    for (const kebab of kebabNames) {
        out[kebab] = isThunk
            ? (): unknown => (valueOrThunk as () => unknown)()
            : (): unknown => valueOrThunk;
    }
    return out;
}

/**
 * Build the per-host registrar that publishes a value under both the
 * unversioned and one-or-more versioned keys.
 *
 *   register('cli/exit', impl)
 *   → out['wasi:cli/exit'] = impl
 *   → out['wasi:cli/exit@<v>'] = impl   (for each v in versions)
 */
export function makeRegister(
    out: Record<string, unknown>,
    prefix: string,
    versions: readonly string[],
): (ns: string, value: unknown) => void {
    return (ns, value) => {
        const key = prefix + ns;
        out[key] = value;
        for (const v of versions) {
            out[key + '@' + v] = value;
        }
    };
}
