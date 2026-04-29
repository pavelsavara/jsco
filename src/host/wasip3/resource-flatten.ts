// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

/**
 * Shared resource-flattening utilities for `wasi:*` host modules.
 *
 * The component model expects resource imports like `[method]tcp-socket.send`
 * and `[constructor]fields` as flat function entries in the import object.
 * These helpers convert TypeScript classes / synchronous calls into the
 * `result<T, E>`-wrapped shape the resolver looks up.
 */

import { ok, err, type WasiResult } from './result';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Convert `getKeepAliveCount` → `get-keep-alive-count`. */
export function camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/**
 * Wrap a synchronous call so success → `{tag:'ok', val}` and thrown
 * ErrorCode-shaped objects (with a `.tag` string) → `{tag:'err', val}`.
 */
export function tryResult<T>(fn: () => T): WasiResult<T, unknown> {
    try {
        return ok(fn());
    } catch (e) {
        if (e && typeof e === 'object' && typeof (e as { tag?: unknown }).tag === 'string') {
            return err(e);
        }
        throw e;
    }
}

/**
 * Wrap `target[method](...args)` so success → `{tag:'ok', val}` and
 * ErrorCode-shaped throws → `{tag:'err', val}`. Awaits Promises.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
export function wrapResultCall(target: Any, method: string, ...args: Any[]): Any {
    try {
        const res = target[method](...args);
        if (res instanceof Promise) {
            return res.then(
                (val: Any) => ok(val),
                (e: Any) => {
                    if (e && typeof e === 'object' && typeof e.tag === 'string') return err(e);
                    throw e;
                },
            );
        }
        return ok(res);
    } catch (e: Any) {
        if (e && typeof e === 'object' && typeof e.tag === 'string') return err(e);
        throw e;
    }
}

/**
 * Flatten a resource class into a `[static]/[method]/[resource-drop]` table.
 *
 * Methods whose WIT return type is `result<T, E>` are auto-wrapped via
 * `wrapResultCall`. Methods listed in `nonResultMethods` (kebab-case) are
 * passed through as-is.
 *
 * - `cls.create` (if present) → `[static]<name>.create`
 * - All prototype methods → `[method]<name>.<kebab-case>`
 * - `[resource-drop]<name>` → calls `self.drop()` if present, else no-op
 */
export function flattenResource(
    name: string,
    cls: { prototype: Record<string, unknown>; create?: (...args: unknown[]) => unknown },
    nonResultMethods?: ReadonlySet<string>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    result[name] = cls;
    if (typeof cls.create === 'function') {
        result[`[static]${name}.create`] = (...args: Any[]): unknown => wrapResultCall(cls, 'create', ...args);
    }
    for (const key of Object.getOwnPropertyNames(cls.prototype)) {
        if (key === 'constructor') continue;
        if (typeof cls.prototype[key] !== 'function') continue;
        const kebab = camelToKebab(key);
        if (nonResultMethods?.has(kebab)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            result[`[method]${name}.${kebab}`] = (self: Any, ...args: Any[]): unknown => self[key](...args);
        } else {
            result[`[method]${name}.${kebab}`] = (self: Any, ...args: Any[]): unknown => wrapResultCall(self, key, ...args);
        }
    }
    result[`[resource-drop]${name}`] = (self: Any): void => { if (self && typeof self.drop === 'function') self.drop(); };
    return result;
}
