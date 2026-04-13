// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { newSource, bufferToHex } from './streaming';
import type { Source, SyncSource } from './streaming';

describe('streaming.ts', () => {
    describe('ArraySource', () => {
        test('read returns bytes sequentially', async () => {
            const src = newSource([1, 2, 3]);
            expect(await src.read()).toBe(1);
            expect(await src.read()).toBe(2);
            expect(await src.read()).toBe(3);
        });

        test('read throws on EOF', async () => {
            const src = newSource([]);
            await expect(src.read()).rejects.toThrow('unexpected EOF');
        });

        test('read(true) returns null on EOF', async () => {
            const src = newSource([]);
            expect(await src.read(true)).toBeNull();
        });

        test('readExact returns exact bytes', async () => {
            const src = newSource([10, 20, 30, 40]);
            const buf = await src.readExact(3);
            expect([...buf]).toEqual([10, 20, 30]);
        });

        test('readExact(0) returns empty', async () => {
            const src = newSource([1, 2]);
            const buf = await src.readExact(0);
            expect(buf.length).toBe(0);
        });

        test('readExact throws on insufficient data', async () => {
            const src = newSource([1]);
            await expect(src.readExact(5)).rejects.toThrow('unexpected EOF');
        });

        test('readExact throws on negative', async () => {
            const src = newSource([1]);
            await expect(src.readExact(-1)).rejects.toThrow('illegal argument');
        });

        test('skip advances position', async () => {
            const src = newSource([1, 2, 3, 4]);
            await src.skip(2);
            expect(await src.read()).toBe(3);
        });

        test('skip(0) is no-op', async () => {
            const src = newSource([1, 2]);
            await src.skip(0);
            expect(await src.read()).toBe(1);
        });

        test('skip throws on negative', async () => {
            const src = newSource([1]);
            await expect(src.skip(-1)).rejects.toThrow('illegal argument');
        });

        test('skip throws on overflow', async () => {
            const src = newSource([1]);
            await expect(src.skip(5)).rejects.toThrow('unexpected EOF');
        });

        test('pos tracks position', async () => {
            const src = newSource([1, 2, 3]);
            expect(src.pos).toBe(0);
            await src.read();
            expect(src.pos).toBe(1);
            await src.readExact(2);
            expect(src.pos).toBe(3);
        });

        test('readAvailable returns available bytes', async () => {
            const src = newSource([1, 2, 3, 4, 5]);
            const chunk = await src.readAvailable(3);
            expect(chunk).not.toBeNull();
            expect([...chunk!]).toEqual([1, 2, 3]);
        });

        test('readAvailable returns null on empty', async () => {
            const src = newSource([]);
            expect(await src.readAvailable(5)).toBeNull();
        });

        test('readAvailable returns null when fully consumed', async () => {
            const src = newSource([1]);
            await src.read();
            expect(await src.readAvailable(5)).toBeNull();
        });

        test('readAvailable with limit 0 returns null', async () => {
            const src = newSource([1, 2]);
            expect(await src.readAvailable(0)).toBeNull();
        });

        test('close is safe', () => {
            const src = newSource([1, 2, 3]);
            expect(() => src.close()).not.toThrow();
        });

        test('subSyncSource returns SyncSource', async () => {
            const src = newSource([10, 20, 30, 40, 50]);
            const sync = await src.subSyncSource(3);
            expect(sync.read()).toBe(10);
            expect(sync.read()).toBe(20);
            expect(sync.remaining).toBe(1);
        });
    });

    describe('SyncArraySource', () => {
        async function getSyncSource(data: number[]): Promise<SyncSource> {
            const src = newSource(data);
            return src.subSyncSource(data.length);
        }

        test('read returns bytes', async () => {
            const sync = await getSyncSource([1, 2, 3]);
            expect(sync.read()).toBe(1);
            expect(sync.read()).toBe(2);
        });

        test('read throws on EOF', async () => {
            const sync = await getSyncSource([]);
            expect(() => sync.read()).toThrow('unexpected EOF');
        });

        test('read(true) returns null on EOF', async () => {
            const sync = await getSyncSource([]);
            expect(sync.read(true)).toBeNull();
        });

        test('readExact returns bytes', async () => {
            const sync = await getSyncSource([1, 2, 3]);
            expect([...sync.readExact(2)]).toEqual([1, 2]);
        });

        test('readExact(0) returns empty', async () => {
            const sync = await getSyncSource([1]);
            expect(sync.readExact(0).length).toBe(0);
        });

        test('readExact throws on negative', async () => {
            const sync = await getSyncSource([1]);
            expect(() => sync.readExact(-1)).toThrow('illegal argument');
        });

        test('readExact throws on overflow', async () => {
            const sync = await getSyncSource([1]);
            expect(() => sync.readExact(5)).toThrow('unexpected EOF');
        });

        test('remaining tracks bytes left', async () => {
            const sync = await getSyncSource([1, 2, 3]);
            expect(sync.remaining).toBe(3);
            sync.read();
            expect(sync.remaining).toBe(2);
        });

        test('pos tracks position', async () => {
            const sync = await getSyncSource([1, 2, 3]);
            expect(sync.pos).toBe(0);
            sync.read();
            expect(sync.pos).toBe(1);
        });

        test('skip advances correctly', async () => {
            const sync = await getSyncSource([1, 2, 3, 4]);
            (sync as any).skip(2);
            expect(sync.read()).toBe(3);
        });

        test('skip(0) is no-op', async () => {
            const sync = await getSyncSource([1, 2]);
            (sync as any).skip(0);
            expect(sync.read()).toBe(1);
        });

        test('skip throws on negative', async () => {
            const sync = await getSyncSource([1]);
            expect(() => (sync as any).skip(-1)).toThrow('illegal argument');
        });

        test('skip throws on overflow', async () => {
            const sync = await getSyncSource([1]);
            expect(() => (sync as any).skip(5)).toThrow('unexpected EOF');
        });
    });

    describe('StreamSource', () => {
        function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
            let i = 0;
            return new ReadableStream({
                pull(controller) {
                    if (i < chunks.length) {
                        controller.enqueue(chunks[i++]);
                    } else {
                        controller.close();
                    }
                },
            });
        }

        test('read from stream', async () => {
            const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3])]);
            const src = newSource(stream);
            expect(await src.read()).toBe(1);
            expect(await src.read()).toBe(2);
            expect(await src.read()).toBe(3);
            src.close();
        });

        test('read(true) returns null on empty stream', async () => {
            const stream = makeStream([]);
            const src = newSource(stream);
            expect(await src.read(true)).toBeNull();
            src.close();
        });

        test('read throws on empty stream without eof flag', async () => {
            const stream = makeStream([]);
            const src = newSource(stream);
            await expect(src.read()).rejects.toThrow('unexpected EOF');
            src.close();
        });

        test('readExact across chunks', async () => {
            const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
            const src = newSource(stream);
            const buf = await src.readExact(4);
            expect([...buf]).toEqual([1, 2, 3, 4]);
            src.close();
        });

        test('readExact throws on insufficient data', async () => {
            const stream = makeStream([new Uint8Array([1])]);
            const src = newSource(stream);
            await expect(src.readExact(5)).rejects.toThrow('unexpected EOF');
            src.close();
        });

        test('skip past bytes', async () => {
            const stream = makeStream([new Uint8Array([1, 2, 3, 4, 5])]);
            const src = newSource(stream);
            await src.skip(3);
            expect(await src.read()).toBe(4);
            src.close();
        });

        test('skip with negative throws', async () => {
            const stream = makeStream([new Uint8Array([1])]);
            const src = newSource(stream);
            await expect(src.skip(-1)).rejects.toThrow('illegal argument');
            src.close();
        });

        test('skip past EOF throws', async () => {
            const stream = makeStream([new Uint8Array([1])]);
            const src = newSource(stream);
            await expect(src.skip(5)).rejects.toThrow('unexpected EOF');
            src.close();
        });

        test('pos tracks total bytes read', async () => {
            const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3])]);
            const src = newSource(stream);
            expect(src.pos).toBe(0);
            await src.read();
            expect(src.pos).toBe(1);
            await src.readExact(2);
            expect(src.pos).toBe(3);
            src.close();
        });

        test('readAvailable returns available chunk', async () => {
            const stream = makeStream([new Uint8Array([10, 20, 30])]);
            const src = newSource(stream);
            const chunk = await src.readAvailable(2);
            expect(chunk).not.toBeNull();
            expect([...chunk!]).toEqual([10, 20]);
            src.close();
        });

        test('readAvailable returns null on EOF', async () => {
            const stream = makeStream([]);
            const src = newSource(stream);
            const chunk = await src.readAvailable(5);
            expect(chunk).toBeNull();
            src.close();
        });

        test('subSyncSource returns SyncSource', async () => {
            const stream = makeStream([new Uint8Array([1, 2, 3, 4])]);
            const src = newSource(stream);
            const sync = await src.subSyncSource(3);
            expect(sync.read()).toBe(1);
            expect(sync.read()).toBe(2);
            expect(sync.remaining).toBe(1);
            src.close();
        });
    });

    describe('SubSource', () => {
        test('limits reads to limit', async () => {
            const src = newSource([1, 2, 3, 4, 5]);
            const sub = src.subSource(3);
            expect(await sub.read()).toBe(1);
            expect(await sub.read()).toBe(2);
            expect(await sub.read()).toBe(3);
            await expect(sub.read()).rejects.toThrow('limit reached');
        });

        test('readExact respects limit', async () => {
            const src = newSource([1, 2, 3, 4]);
            const sub = src.subSource(2);
            const buf = await sub.readExact(2);
            expect([...buf]).toEqual([1, 2]);
            await expect(sub.readExact(1)).rejects.toThrow('limit reached');
        });

        test('skip respects limit', async () => {
            const src = newSource([1, 2, 3, 4]);
            const sub = src.subSource(2);
            await sub.skip(2);
            await expect(sub.skip(1)).rejects.toThrow('limit reached');
        });

        test('read(true) with eof', async () => {
            const src = newSource([1]);
            const sub = src.subSource(5);
            expect(await sub.read()).toBe(1);
            expect(await sub.read(true)).toBeNull();
        });

        test('readAvailable with sub-limit', async () => {
            const src = newSource([1, 2, 3, 4, 5]);
            const sub = src.subSource(3);
            const chunk = await sub.readAvailable(10);
            expect(chunk).not.toBeNull();
            expect(chunk!.length).toBeLessThanOrEqual(3);
        });

        test('subSource chains', async () => {
            const src = newSource([1, 2, 3, 4, 5]);
            const sub1 = src.subSource(4);
            const sub2 = sub1.subSource(2);
            expect(await sub2.read()).toBe(1);
            expect(await sub2.read()).toBe(2);
            await expect(sub2.read()).rejects.toThrow('limit reached');
        });

        test('subSyncSource from sub', async () => {
            const src = newSource([10, 20, 30, 40, 50]);
            const sub = src.subSource(3);
            const sync = await sub.subSyncSource(2);
            expect(sync.read()).toBe(10);
            expect(sync.read()).toBe(20);
        });

        test('negative limit throws', () => {
            const src = newSource([1]);
            expect(() => src.subSource(-1)).toThrow('illegal argument');
        });

        test('pos delegates to parent', async () => {
            const src = newSource([1, 2, 3]);
            const sub = src.subSource(3);
            expect(sub.pos).toBe(0);
            await sub.read();
            expect(sub.pos).toBe(1);
        });
    });

    describe('bufferToHex', () => {
        test('encodes bytes as hex', () => {
            const hex = bufferToHex(new Uint8Array([0x0a, 0xff, 0x00]));
            expect(hex).toBe(' 0a ff 00');
        });

        test('empty buffer', () => {
            expect(bufferToHex(new Uint8Array([]))).toBe('');
        });
    });
});
