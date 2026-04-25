// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../../src/utils/assert';
initializeAsserts();

import { ModelTag } from '../../src/parser/model/tags';
import { newSource } from '../../src/utils/streaming';
import { parseSectionCustom, skipSection } from '../../src/parser/otherSection';
import type { ParserContext, CustomSection } from '../../src/parser/types';

function makeCtx(opts: { otherSectionData?: boolean, processCustomSection?: (s: CustomSection) => CustomSection } = {}): ParserContext {
    return {
        otherSectionData: opts.otherSectionData ?? true,
        compileStreaming: (async () => { throw new Error('not used'); }) as any,
        processCustomSection: opts.processCustomSection,
        depth: 0,
    };
}

// Encode a name (LEB128 length + UTF-8 bytes)
function encodeName(name: string): number[] {
    const utf8 = new TextEncoder().encode(name);
    const lenBytes = encodeLEB128(utf8.length);
    return [...lenBytes, ...utf8];
}

function encodeLEB128(val: number): number[] {
    const result: number[] = [];
    do {
        let byte = val & 0x7F;
        val >>>= 7;
        if (val !== 0) byte |= 0x80;
        result.push(byte);
    } while (val !== 0);
    return result;
}

describe('otherSection.ts', () => {
    describe('parseSectionCustom', () => {
        test('parses custom section with data', async () => {
            const nameBytes = encodeName('my-section');
            const dataBytes = [0xDE, 0xAD, 0xBE, 0xEF];
            const allBytes = [...nameBytes, ...dataBytes];
            const src = newSource(allBytes);
            const syncSrc = await src.subSyncSource(allBytes.length);
            const ctx = makeCtx({ otherSectionData: true });

            const result = parseSectionCustom(ctx, syncSrc, allBytes.length);

            expect(result).toHaveLength(1);
            expect(result[0]!.tag).toBe(ModelTag.CustomSection);
            expect(result[0]!.name).toBe('my-section');
            expect(result[0]!.data).toEqual(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
        });

        test('parses custom section without data when otherSectionData=false', async () => {
            const nameBytes = encodeName('test');
            const dataBytes = [1, 2, 3];
            const allBytes = [...nameBytes, ...dataBytes];
            const src = newSource(allBytes);
            const syncSrc = await src.subSyncSource(allBytes.length);
            const ctx = makeCtx({ otherSectionData: false });

            const result = parseSectionCustom(ctx, syncSrc, allBytes.length);

            expect(result).toHaveLength(1);
            expect(result[0]!.name).toBe('test');
            expect(result[0]!.data).toBeUndefined();
        });

        test('calls processCustomSection when provided', async () => {
            const nameBytes = encodeName('raw');
            const allBytes = [...nameBytes];
            const src = newSource(allBytes);
            const syncSrc = await src.subSyncSource(allBytes.length);
            const transformed: CustomSection = { tag: ModelTag.CustomSection, name: 'transformed', data: undefined };
            const ctx = makeCtx({
                otherSectionData: true,
                processCustomSection: () => transformed,
            });

            const result = parseSectionCustom(ctx, syncSrc, allBytes.length);

            expect(result[0]).toBe(transformed);
        });
    });

    describe('skipSection', () => {
        test('returns skipped section with data', async () => {
            const bytes = [0x01, 0x02, 0x03, 0x04];
            const src = newSource(bytes);
            const syncSrc = await src.subSyncSource(bytes.length);
            const ctx = makeCtx({ otherSectionData: true });

            const result = skipSection(ctx, syncSrc, 42, bytes.length);

            expect(result).toHaveLength(1);
            expect(result[0]!.tag).toBe(ModelTag.SkippedSection);
            expect(result[0]!.type).toBe(42);
            expect(result[0]!.data).toEqual(new Uint8Array([1, 2, 3, 4]));
        });

        test('returns skipped section without data when otherSectionData=false', async () => {
            const bytes = [0x01, 0x02];
            const src = newSource(bytes);
            const syncSrc = await src.subSyncSource(bytes.length);
            const ctx = makeCtx({ otherSectionData: false });

            const result = skipSection(ctx, syncSrc, 7, bytes.length);

            expect(result).toHaveLength(1);
            expect(result[0]!.tag).toBe(ModelTag.SkippedSection);
            expect(result[0]!.type).toBe(7);
            expect(result[0]!.data).toBeUndefined();
        });
    });
});
