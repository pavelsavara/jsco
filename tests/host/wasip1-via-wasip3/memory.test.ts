// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { getView, readIovecs, gatherBytes, scatterBytes, readString } from './memory';
import { CiovecLayout } from './types/wasi-snapshot-preview1';

describe('WASI P1 memory utilities', () => {
    function makeMemory(pages = 1): WebAssembly.Memory {
        return new WebAssembly.Memory({ initial: pages });
    }

    describe('getView', () => {
        test('returns a DataView from memory', () => {
            const mem = makeMemory();
            const view = getView(mem);
            expect(view).toBeInstanceOf(DataView);
            expect(view.buffer).toBe(mem.buffer);
        });

        test('returns fresh view after memory.grow', () => {
            const mem = makeMemory(1);
            const initialByteLength = getView(mem).byteLength;
            mem.grow(1);
            const view2 = getView(mem);
            expect(view2.buffer).toBe(mem.buffer);
            expect(view2.byteLength).toBeGreaterThan(initialByteLength);
        });
    });

    describe('readIovecs', () => {
        test('reads single iovec entry', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // Write one iovec at offset 100: buf=200, buf_len=16
            view.setUint32(100 + CiovecLayout.buf.offset, 200, true);
            view.setUint32(100 + CiovecLayout.buf_len.offset, 16, true);
            const result = readIovecs(view, 100, 1);
            expect(result).toEqual([{ ptr: 200, len: 16 }]);
        });

        test('reads multiple iovec entries', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // iovec[0] at 100: buf=200, len=10
            view.setUint32(100, 200, true);
            view.setUint32(104, 10, true);
            // iovec[1] at 108: buf=300, len=20
            view.setUint32(108, 300, true);
            view.setUint32(112, 20, true);
            // iovec[2] at 116: buf=400, len=5
            view.setUint32(116, 400, true);
            view.setUint32(120, 5, true);
            const result = readIovecs(view, 100, 3);
            expect(result).toEqual([
                { ptr: 200, len: 10 },
                { ptr: 300, len: 20 },
                { ptr: 400, len: 5 },
            ]);
        });

        test('returns empty array for zero count', () => {
            const mem = makeMemory();
            const view = getView(mem);
            expect(readIovecs(view, 0, 0)).toEqual([]);
        });
    });

    describe('gatherBytes', () => {
        test('gathers bytes from single iovec', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // Data at offset 200
            new Uint8Array(mem.buffer, 200, 5).set([72, 101, 108, 108, 111]); // "Hello"
            // iovec at 100: buf=200, len=5
            view.setUint32(100, 200, true);
            view.setUint32(104, 5, true);
            const { data, totalLen } = gatherBytes(mem, 100, 1);
            expect(totalLen).toBe(5);
            expect(data).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
        });

        test('gathers bytes from multiple iovecs', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // First chunk at 200: "AB"
            new Uint8Array(mem.buffer, 200, 2).set([65, 66]);
            // Second chunk at 300: "CD"
            new Uint8Array(mem.buffer, 300, 2).set([67, 68]);
            // iovec[0] at 100: buf=200, len=2
            view.setUint32(100, 200, true);
            view.setUint32(104, 2, true);
            // iovec[1] at 108: buf=300, len=2
            view.setUint32(108, 300, true);
            view.setUint32(112, 2, true);
            const { data, totalLen } = gatherBytes(mem, 100, 2);
            expect(totalLen).toBe(4);
            expect(data).toEqual(new Uint8Array([65, 66, 67, 68]));
        });

        test('returns empty for zero iovecs', () => {
            const mem = makeMemory();
            const { data, totalLen } = gatherBytes(mem, 0, 0);
            expect(totalLen).toBe(0);
            expect(data.length).toBe(0);
        });
    });

    describe('scatterBytes', () => {
        test('scatters bytes into single iovec', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // iovec at 100: buf=200, len=10
            view.setUint32(100, 200, true);
            view.setUint32(104, 10, true);
            const src = new Uint8Array([1, 2, 3, 4, 5]);
            const written = scatterBytes(mem, 100, 1, src);
            expect(written).toBe(5);
            expect(new Uint8Array(mem.buffer, 200, 5)).toEqual(src);
        });

        test('scatters bytes across multiple iovecs', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // iovec[0] at 100: buf=200, len=3
            view.setUint32(100, 200, true);
            view.setUint32(104, 3, true);
            // iovec[1] at 108: buf=300, len=3
            view.setUint32(108, 300, true);
            view.setUint32(112, 3, true);
            const src = new Uint8Array([10, 20, 30, 40, 50]);
            const written = scatterBytes(mem, 100, 2, src);
            expect(written).toBe(5);
            expect(new Uint8Array(mem.buffer, 200, 3)).toEqual(new Uint8Array([10, 20, 30]));
            expect(new Uint8Array(mem.buffer, 300, 2)).toEqual(new Uint8Array([40, 50]));
        });

        test('truncates when data exceeds iovec capacity', () => {
            const mem = makeMemory();
            const view = getView(mem);
            // iovec at 100: buf=200, len=3
            view.setUint32(100, 200, true);
            view.setUint32(104, 3, true);
            const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
            const written = scatterBytes(mem, 100, 1, src);
            expect(written).toBe(3);
        });

        test('returns zero for empty data', () => {
            const mem = makeMemory();
            const view = getView(mem);
            view.setUint32(100, 200, true);
            view.setUint32(104, 10, true);
            const written = scatterBytes(mem, 100, 1, new Uint8Array(0));
            expect(written).toBe(0);
        });
    });

    describe('readString', () => {
        test('reads UTF-8 string from memory', () => {
            const mem = makeMemory();
            const text = 'hello world';
            const encoded = new TextEncoder().encode(text);
            new Uint8Array(mem.buffer, 50, encoded.length).set(encoded);
            expect(readString(mem, 50, encoded.length)).toBe(text);
        });

        test('reads empty string', () => {
            const mem = makeMemory();
            expect(readString(mem, 0, 0)).toBe('');
        });

        test('reads UTF-8 multibyte characters', () => {
            const mem = makeMemory();
            const text = 'héllo wörld';
            const encoded = new TextEncoder().encode(text);
            new Uint8Array(mem.buffer, 0, encoded.length).set(encoded);
            expect(readString(mem, 0, encoded.length)).toBe(text);
        });
    });
});
