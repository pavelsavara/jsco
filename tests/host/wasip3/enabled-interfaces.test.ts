// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { applyEnabledInterfaces } from '../../../src/host/_shared/enabled-interfaces';
import { createWasiP3Host as createHost } from '../../../src/host/wasip3/index';

const VERSION = '0.3.0-rc-2026-03-15';

describe('applyEnabledInterfaces', () => {
    test('undefined whitelist is a no-op (all interfaces kept)', () => {
        const real = (): string => 'ok';
        const map: Record<string, unknown> = { 'wasi:cli/environment': { getEnvironment: real } };
        applyEnabledInterfaces(map, undefined);
        expect((map['wasi:cli/environment'] as { getEnvironment: () => string }).getEnvironment()).toBe('ok');
    });

    test('keeps interfaces matching a prefix', () => {
        const real = (): string => 'ok';
        const map: Record<string, unknown> = {
            'wasi:cli/environment': { getEnvironment: real },
            'wasi:cli/exit': { exit: real },
        };
        applyEnabledInterfaces(map, ['wasi:cli']);
        expect((map['wasi:cli/environment'] as { getEnvironment: () => string }).getEnvironment()).toBe('ok');
        expect((map['wasi:cli/exit'] as { exit: () => string }).exit()).toBe('ok');
    });

    test('replaces non-matching interfaces with a trapping stub', () => {
        const real = (): string => 'ok';
        const map: Record<string, unknown> = {
            'wasi:cli/environment': { getEnvironment: real },
            'wasi:sockets/types': { foo: real, bar: real },
        };
        applyEnabledInterfaces(map, ['wasi:cli']);
        // Enabled interface still works.
        expect((map['wasi:cli/environment'] as { getEnvironment: () => string }).getEnvironment()).toBe('ok');
        // Disabled interface keeps its member keys, but they trap on call.
        const sockets = map['wasi:sockets/types'] as Record<string, () => unknown>;
        expect(Object.keys(sockets).sort()).toEqual(['bar', 'foo']);
        expect(() => sockets.foo!()).toThrow(/disabled/);
        expect(() => sockets.bar!()).toThrow(/wasi:sockets\/types/);
    });

    test('prefix matches versioned interface keys', () => {
        const real = (): string => 'ok';
        const map: Record<string, unknown> = {
            [`wasi:cli/environment@${VERSION}`]: { getEnvironment: real },
            [`wasi:sockets/types@${VERSION}`]: { foo: real },
        };
        applyEnabledInterfaces(map, ['wasi:cli']);
        expect((map[`wasi:cli/environment@${VERSION}`] as { getEnvironment: () => string }).getEnvironment()).toBe('ok');
        expect(() => (map[`wasi:sockets/types@${VERSION}`] as { foo: () => unknown }).foo()).toThrow(/disabled/);
    });

    test('a non-object interface value becomes a trapping function', () => {
        const map: Record<string, unknown> = { 'wasi:cli/run': (): string => 'ok' };
        applyEnabledInterfaces(map, ['wasi:http']);
        expect(typeof map['wasi:cli/run']).toBe('function');
        expect(() => (map['wasi:cli/run'] as () => unknown)()).toThrow(/disabled/);
    });

    test('is idempotent (re-running keeps disabled interfaces trapping)', () => {
        const real = (): string => 'ok';
        const map: Record<string, unknown> = { 'wasi:sockets/types': { foo: real } };
        applyEnabledInterfaces(map, ['wasi:cli']);
        applyEnabledInterfaces(map, ['wasi:cli']);
        expect(() => (map['wasi:sockets/types'] as { foo: () => unknown }).foo()).toThrow(/disabled/);
    });
});

describe('createWasiP3Host with enabledInterfaces', () => {
    test('without enabledInterfaces every interface is callable', () => {
        const host = createHost() as unknown as Record<string, Record<string, unknown>>;
        expect(typeof (host['wasi:clocks/monotonic-clock']!.now as () => bigint)()).toBe('bigint');
    });

    test('disabled interface members trap on call, enabled ones work', () => {
        const host = createHost({ enabledInterfaces: ['wasi:cli'] }) as unknown as Record<string, Record<string, unknown>>;

        // Enabled: wasi:cli/environment.getEnvironment works.
        const env = host['wasi:cli/environment']!.getEnvironment as () => [string, string][];
        expect(Array.isArray(env())).toBe(true);

        // Disabled: wasi:clocks/monotonic-clock.now traps.
        const now = host['wasi:clocks/monotonic-clock']!.now as () => bigint;
        expect(() => now()).toThrow(/disabled/);
    });

    test('disabled versioned aliases also trap', () => {
        const host = createHost({ enabledInterfaces: ['wasi:cli'] }) as unknown as Record<string, Record<string, unknown>>;
        const now = host[`wasi:clocks/monotonic-clock@${VERSION}`]!.now as () => bigint;
        expect(() => now()).toThrow(/disabled/);
    });

    test('the disabled interface still exists with its member keys (so the resolver can bind it)', () => {
        const host = createHost({ enabledInterfaces: ['wasi:cli'] }) as unknown as Record<string, Record<string, unknown>>;
        const clock = host['wasi:clocks/monotonic-clock']!;
        expect(clock).toBeDefined();
        expect(Object.keys(clock)).toContain('now');
    });
});
