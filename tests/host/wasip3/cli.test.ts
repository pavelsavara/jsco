// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { createEnvironment, createExit, createCliTypes, WasiExit } from '../../../src/host/wasip3/cli';

describe('wasi:cli/environment', () => {
    describe('getEnvironment', () => {
        it('returns configured env vars as Array<[string, string]>', () => {
            const env = createEnvironment({
                env: [['HOME', '/home/user'], ['PATH', '/usr/bin']],
            });
            const result = env.getEnvironment();
            expect(result).toEqual([['HOME', '/home/user'], ['PATH', '/usr/bin']]);
        });

        it('returns empty array when no env configured', () => {
            const env = createEnvironment();
            expect(env.getEnvironment()).toEqual([]);
        });

        it('returns empty array with empty config', () => {
            const env = createEnvironment({});
            expect(env.getEnvironment()).toEqual([]);
        });

        it('preserves env var with empty key', () => {
            const env = createEnvironment({ env: [['', 'value']] });
            expect(env.getEnvironment()).toEqual([['', 'value']]);
        });

        it('preserves env var with empty value', () => {
            const env = createEnvironment({ env: [['KEY', '']] });
            expect(env.getEnvironment()).toEqual([['KEY', '']]);
        });

        it('preserves env var with = in value', () => {
            const env = createEnvironment({ env: [['EQ', 'a=b=c']] });
            expect(env.getEnvironment()).toEqual([['EQ', 'a=b=c']]);
        });

        it('preserves unicode in env vars', () => {
            const env = createEnvironment({ env: [['LANG', '日本語'], ['EMOJI', '🎉']] });
            expect(env.getEnvironment()).toEqual([['LANG', '日本語'], ['EMOJI', '🎉']]);
        });

        it('returns a copy — mutation does not affect subsequent calls', () => {
            const env = createEnvironment({ env: [['A', '1']] });
            const first = env.getEnvironment();
            first[0] = ['MUTATED', 'evil'];
            const second = env.getEnvironment();
            expect(second).toEqual([['A', '1']]);
        });

        it('handles __proto__ env var key without prototype pollution', () => {
            const env = createEnvironment({ env: [['__proto__', 'val']] });
            const result = env.getEnvironment();
            expect(result).toEqual([['__proto__', 'val']]);
            // Verify no prototype pollution
            expect(({} as Record<string, unknown>)['__proto__']).toBe(Object.prototype);
        });

        it('handles constructor env var key without prototype pollution', () => {
            const env = createEnvironment({ env: [['constructor', 'val']] });
            const result = env.getEnvironment();
            expect(result).toEqual([['constructor', 'val']]);
        });
    });

    describe('getArguments', () => {
        it('returns configured args as string[]', () => {
            const env = createEnvironment({ args: ['hello', 'world'] });
            expect(env.getArguments()).toEqual(['hello', 'world']);
        });

        it('returns empty array when no args configured', () => {
            const env = createEnvironment();
            expect(env.getArguments()).toEqual([]);
        });

        it('preserves args with spaces and special characters', () => {
            const env = createEnvironment({ args: ['--name=hello world', '-v', 'path/to/file', '"quoted"'] });
            expect(env.getArguments()).toEqual(['--name=hello world', '-v', 'path/to/file', '"quoted"']);
        });

        it('preserves unicode arguments', () => {
            const env = createEnvironment({ args: ['日本語', '🎉'] });
            expect(env.getArguments()).toEqual(['日本語', '🎉']);
        });

        it('returns a copy — mutation does not affect subsequent calls', () => {
            const env = createEnvironment({ args: ['original'] });
            const first = env.getArguments();
            first[0] = 'mutated';
            const second = env.getArguments();
            expect(second).toEqual(['original']);
        });

        it('handles very long argument list (10000 entries)', () => {
            const args = Array.from({ length: 10000 }, (_, i) => `arg${i}`);
            const env = createEnvironment({ args });
            const result = env.getArguments();
            expect(result.length).toBe(10000);
            expect(result[0]).toBe('arg0');
            expect(result[9999]).toBe('arg9999');
        });
    });

    describe('getInitialCwd', () => {
        it('returns configured cwd', () => {
            const env = createEnvironment({ cwd: '/home/user/project' });
            expect(env.getInitialCwd()).toBe('/home/user/project');
        });

        it('returns undefined when no cwd configured', () => {
            const env = createEnvironment();
            expect(env.getInitialCwd()).toBeUndefined();
        });

        it('returns undefined with empty config', () => {
            const env = createEnvironment({});
            expect(env.getInitialCwd()).toBeUndefined();
        });
    });
});

describe('wasi:cli/exit', () => {
    const exit = createExit();

    describe('exit', () => {
        it('exit({ tag: "ok" }) throws WasiExit with code 0', () => {
            try {
                exit.exit({ tag: 'ok', val: undefined });
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(0);
            }
        });

        it('exit({ tag: "err" }) throws WasiExit with code 1', () => {
            try {
                exit.exit({ tag: 'err', val: undefined });
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(1);
            }
        });
    });

    describe('exitWithCode', () => {
        it('throws WasiExit with code 0', () => {
            try {
                exit.exitWithCode(0);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(0);
            }
        });

        it('throws WasiExit with code 42', () => {
            try {
                exit.exitWithCode(42);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(42);
            }
        });

        it('throws WasiExit with code 255 (max u8)', () => {
            try {
                exit.exitWithCode(255);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(255);
            }
        });
    });

    describe('WasiExit properties', () => {
        it('has correct name and message', () => {
            try {
                exit.exitWithCode(42);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
                expect((e as WasiExit).name).toBe('WasiExit');
                expect((e as WasiExit).message).toContain('42');
            }
        });

        it('is instanceof Error', () => {
            try {
                exit.exitWithCode(0);
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
            }
        });
    });
});

describe('wasi:cli/types', () => {
    it('createCliTypes returns an object (type-only module)', () => {
        const types = createCliTypes();
        expect(typeof types).toBe('object');
    });
});

describe('wasi:cli/exit edge cases', () => {
    const exit = createExit();

    it('exitWithCode(256) still throws WasiExit (host does not validate u8 range)', () => {
        try {
            exit.exitWithCode(256);
            fail('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect((e as WasiExit).exitCode).toBe(256);
        }
    });

    it('exitWithCode(-1) throws WasiExit with negative code', () => {
        try {
            exit.exitWithCode(-1);
            fail('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect((e as WasiExit).exitCode).toBe(-1);
        }
    });

    it('exitWithCode(NaN) throws WasiExit with NaN code', () => {
        try {
            exit.exitWithCode(NaN);
            fail('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(WasiExit);
            expect((e as WasiExit).exitCode).toBe(NaN);
        }
    });

    it('exit called from within a promise callback does not deadlock', async () => {
        const exitPromise = Promise.resolve().then(() => {
            try {
                exit.exit({ tag: 'ok', val: undefined });
            } catch (e) {
                return e;
            }
            return undefined;
        });
        const result = await exitPromise;
        expect(result).toBeInstanceOf(WasiExit);
    });

    it('double exit — second call still throws WasiExit', () => {
        // Both calls throw independently (no "already exiting" state)
        let count = 0;
        for (let i = 0; i < 2; i++) {
            try {
                exit.exitWithCode(0);
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                count++;
            }
        }
        expect(count).toBe(2);
    });

    it('rapid repeated exit calls do not cause double-free', () => {
        for (let i = 0; i < 10; i++) {
            try {
                exit.exitWithCode(i);
            } catch (e) {
                expect(e).toBeInstanceOf(WasiExit);
                expect((e as WasiExit).exitCode).toBe(i);
            }
        }
    });
});

describe('wasi:cli/environment evil arguments', () => {
    it('env var with null bytes in value is preserved (opaque string)', () => {
        // The host config layer does not sanitize — values are opaque
        const env = createEnvironment({ env: [['KEY', 'val\x00ue']] });
        const result = env.getEnvironment();
        expect(result[0]![1]).toBe('val\x00ue');
    });

    it('env var value containing shell injection patterns is opaque', () => {
        const env = createEnvironment({ env: [['CMD', '$(rm -rf /)']] });
        const result = env.getEnvironment();
        expect(result[0]![1]).toBe('$(rm -rf /)');
    });
});
