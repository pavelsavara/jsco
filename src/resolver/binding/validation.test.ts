import { validateAllocResult, validatePointerAlignment, validateUtf16, checkNotPoisoned, checkNotReentrant } from './validation';
import type { BindingContext } from '../types';

function makeCtx(memorySize: number, opts?: Partial<BindingContext>): BindingContext {
    return {
        memory: {
            getMemory() {
                return { buffer: new ArrayBuffer(memorySize) } as any;
            }
        },
        poisoned: false,
        inExport: false,
        ...opts,
    } as any as BindingContext;
}

describe('validation.ts', () => {
    describe('validateAllocResult', () => {
        test('accepts aligned pointer within bounds', () => {
            const ctx = makeCtx(1024);
            expect(() => validateAllocResult(ctx, 16 as any, 4, 100)).not.toThrow();
        });

        test('accepts null pointer with zero size', () => {
            const ctx = makeCtx(1024);
            expect(() => validateAllocResult(ctx, 0 as any, 4, 0)).not.toThrow();
        });

        test('throws on unaligned pointer', () => {
            const ctx = makeCtx(1024);
            expect(() => validateAllocResult(ctx, 3 as any, 4, 100)).toThrow('not aligned');
        });

        test('throws on out of bounds', () => {
            const ctx = makeCtx(100);
            expect(() => validateAllocResult(ctx, 0 as any, 1, 200)).toThrow('out of bounds');
        });
    });

    describe('validatePointerAlignment', () => {
        test('passes for aligned pointer', () => {
            expect(() => validatePointerAlignment(8, 4, 'test')).not.toThrow();
        });

        test('passes for align = 1', () => {
            expect(() => validatePointerAlignment(7, 1, 'test')).not.toThrow();
        });

        test('throws for unaligned pointer', () => {
            expect(() => validatePointerAlignment(3, 4, 'test')).toThrow('not aligned');
        });
    });

    describe('validateUtf16', () => {
        test('accepts valid UTF-16', () => {
            const valid = new Uint16Array([0x0041, 0x0042, 0x0043]); // "ABC"
            expect(() => validateUtf16(valid)).not.toThrow();
        });

        test('accepts valid surrogate pair', () => {
            const valid = new Uint16Array([0xD800, 0xDC00]); // U+10000
            expect(() => validateUtf16(valid)).not.toThrow();
        });

        test('throws on unpaired high surrogate at end', () => {
            const invalid = new Uint16Array([0xD800]);
            expect(() => validateUtf16(invalid)).toThrow('unpaired high surrogate');
        });

        test('throws on high surrogate not followed by low surrogate', () => {
            const invalid = new Uint16Array([0xD800, 0x0041]);
            expect(() => validateUtf16(invalid)).toThrow('not followed by low surrogate');
        });

        test('throws on lone low surrogate', () => {
            const invalid = new Uint16Array([0xDC00]);
            expect(() => validateUtf16(invalid)).toThrow('unpaired low surrogate');
        });

        test('accepts empty array', () => {
            expect(() => validateUtf16(new Uint16Array([]))).not.toThrow();
        });
    });

    describe('checkNotPoisoned', () => {
        test('passes when not poisoned', () => {
            const ctx = makeCtx(100, { poisoned: false });
            expect(() => checkNotPoisoned(ctx)).not.toThrow();
        });

        test('throws when poisoned', () => {
            const ctx = makeCtx(100, { poisoned: true });
            expect(() => checkNotPoisoned(ctx)).toThrow('poisoned');
        });
    });

    describe('checkNotReentrant', () => {
        test('passes when not in export', () => {
            const ctx = makeCtx(100, { inExport: false });
            expect(() => checkNotReentrant(ctx)).not.toThrow();
        });

        test('throws when in export', () => {
            const ctx = makeCtx(100, { inExport: true });
            expect(() => checkNotReentrant(ctx)).toThrow('cannot reenter');
        });
    });
});
