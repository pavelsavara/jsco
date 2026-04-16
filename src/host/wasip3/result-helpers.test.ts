// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ok, err, WasiError } from './result-helpers';

describe('Result/Error Helpers', () => {
    // ─── 1.3 Happy path ─────────────────────────────────────────────

    describe('happy path', () => {
        it('ok(value) produces { tag: "ok", val: value }', () => {
            const result = ok(42);
            expect(result).toEqual({ tag: 'ok', val: 42 });
        });

        it('err(code) produces { tag: "err", val: errorCode }', () => {
            const result = err('access-denied');
            expect(result).toEqual({ tag: 'err', val: 'access-denied' });
        });

        it('WasiError wraps an error code and is throwable', () => {
            const error = new WasiError('no-entry', 'filesystem', 'types');
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(WasiError);
            expect(error.code).toBe('no-entry');
            expect(error.phase).toBe('filesystem');
            expect(error.iface).toBe('types');
            expect(error.name).toBe('WasiError');
        });

        it('WasiError has a descriptive message', () => {
            const error = new WasiError('no-entry', 'filesystem', 'types');
            expect(error.message).toContain('no-entry');
            expect(error.message).toContain('filesystem');
            expect(error.message).toContain('types');
        });

        it('WasiError can be thrown and caught', () => {
            expect(() => {
                throw new WasiError('pipe', 'cli', 'stdin');
            }).toThrow(WasiError);
        });

        it('WasiError accepts a custom message', () => {
            const error = new WasiError('io', 'filesystem', 'types', 'custom message');
            expect(error.message).toBe('custom message');
            expect(error.code).toBe('io');
        });

        it('ok with string value', () => {
            expect(ok('hello')).toEqual({ tag: 'ok', val: 'hello' });
        });

        it('err with numeric code', () => {
            expect(err(404)).toEqual({ tag: 'err', val: 404 });
        });
    });

    // ─── 1.3 Edge cases ─────────────────────────────────────────────

    describe('edge cases', () => {
        it('ok(undefined) for void-returning functions has val as undefined', () => {
            const result = ok(undefined);
            expect(result.tag).toBe('ok');
            expect(result).toHaveProperty('val');
            expect(result.val).toBeUndefined();
        });

        it('nested result: ok(err(...)) has outer tag ok', () => {
            const inner = err('inner-error');
            const outer = ok(inner);
            expect(outer.tag).toBe('ok');
            expect(outer.val).toEqual({ tag: 'err', val: 'inner-error' });
        });

        it('ok(null) stores null as val', () => {
            const result = ok(null);
            expect(result.tag).toBe('ok');
            expect(result.val).toBeNull();
        });

        it('err(undefined) stores undefined as val', () => {
            const result = err(undefined);
            expect(result.tag).toBe('err');
            expect(result.val).toBeUndefined();
        });

        it('WasiError has proper stack trace', () => {
            const error = new WasiError('test', 'test', 'test');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('WasiError');
        });

        it('ok with complex object preserves reference', () => {
            const obj = { nested: { deep: [1, 2, 3] } };
            const result = ok(obj);
            expect(result.val).toBe(obj); // same reference
        });
    });
});
