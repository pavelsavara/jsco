// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import isDebug from 'env:isDebug';
import type { WITModel, ParserContext, ParserOptions, ComponentSection } from './types';
import { fetchLike, getBodyIfResponse } from '../utils/fetch-like';
import { defaultVerbosity, LogLevel } from '../utils/assert';
import type { LogFn } from '../utils/assert';
import { printWAT } from '../utils/wat-printer';
import { SyncSource, bufferToHex, Closeable, Source, newSource } from '../utils/streaming';
import { parseSectionCustom } from './otherSection';
import { parseSectionExport } from './export';
import { parseModule } from './module';
import { readU32Async, readU32, readCoreType, readStartFunction } from './values';
import { parseSectionAlias } from './alias';
import { OTHER_SECTION_DATA, COMPILE_STREAMING, PROCESS_CUSTOM_SECTION, VERBOSE, LOGGER } from '../utils/constants';
import { parseSectionImport } from './import';
import { parseSectionType } from './type';
import { parseSectionCanon } from './canon';
import { parseSectionCoreInstance } from './coreInstance';
import { parseSectionInstance } from './instance';
import { ModelTag, WITSection } from './model/tags';

export type { WITModel };

export const WIT_MAGIC = [0x00, 0x61, 0x73, 0x6d];
export const WIT_VERSION = [0x0D, 0x00];
export const WIT_LAYER = [0x01, 0x00];

export async function parse(
    componentOrUrl:
        | string
        | ArrayLike<number>
        | ReadableStream<Uint8Array>
        | Response
        | PromiseLike<Response>,
    options?: ParserOptions
): Promise<WITModel> {
    let input = componentOrUrl as any;
    if (typeof componentOrUrl === 'string') {
        input = fetchLike(componentOrUrl);
    }
    input = await getBodyIfResponse(input);
    const src = newSource(input);
    const sections = await parseWIT(src, options);
    return sections;
}

async function parseWIT(src: Source & Closeable, options?: ParserOptions): Promise<WITSection[]> {
    try {
        await checkPreamble(src);

        // eslint-disable-next-line no-console
        const defaultLogger: LogFn = (phase, _level, ...args) => console.log(`[${phase}]`, ...args);
        const ctx: ParserContext = {
            otherSectionData: options?.[OTHER_SECTION_DATA] ?? false,
            compileStreaming: options?.[COMPILE_STREAMING] ?? WebAssembly.compileStreaming,
            processCustomSection: options?.[PROCESS_CUSTOM_SECTION] ?? undefined,
            verbose: { ...defaultVerbosity, ...(options as any)?.[VERBOSE] },
            logger: (options as any)?.[LOGGER] ?? defaultLogger,
            depth: 0,
        };

        const model: WITSection[] = [];
        for (; ;) {
            const sections = await parseSection(ctx, src);
            if (sections === null) {
                break;
            }
            for (const s of sections) {
                model.push(s);
            }
        }

        if (isDebug && (ctx.verbose?.parser ?? 0) >= LogLevel.Summary) {
            ctx.logger!('parser', LogLevel.Summary, `Parsed ${model.length} sections\n` + printWAT(model));
        }

        return model;
    }
    finally {
        src.close();
    }
}

async function checkPreamble(src: Source): Promise<void> {
    const magic = await src.readExact(WIT_MAGIC.length);
    const version = await src.readExact(WIT_VERSION.length);
    const layer = await src.readExact(WIT_LAYER.length);

    const ok = magic.every((v, i) => v === WIT_MAGIC[i])
        && version.every((v, i) => v === WIT_VERSION[i])
        && layer.every((v, i) => v === WIT_LAYER[i]);
    if (!ok) {
        // Detect core WASM module (WASI P1): same magic, version 1, layer 0
        if (magic.every((v, i) => v === WIT_MAGIC[i]) && version[0] === 0x01 && version[1] === 0x00) {
            throw new Error('Input is a WebAssembly core module, not a component. WASI Preview 1 modules must be compiled as a component (e.g. use wasm32-wasip2 target or apply a P1-to-P2 adapter shim).');
        }
        throw new Error('unexpected magic, version or layer.');
    }
}

async function parseSection(ctx: ParserContext, src: Source): Promise<WITSection[] | null> {
    const type = await src.read(true); // byte will be enough for type
    if (type === null) {
        return null;
    }
    const size = await readU32Async(src);
    const start = src.pos;
    const asyncSub: Source | undefined = type == 1 || type == 4 ? src.subSource(size) : undefined; // if this is module, we need to stream it
    const sub: SyncSource | undefined = type != 1 && type != 4 ? await src.subSyncSource(size) : undefined; // otherwise it's not worth all the async overhead
    const sections = await (() => {
        switch (type) {
            ///
            /// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#component-definitions
            ///
            case 0: return parseSectionCustom(ctx, sub!, size);
            case 1: return parseModule(ctx, asyncSub!, size);
            case 2: return parseSectionCoreInstance(ctx, sub!);
            case 3: return parseSectionCoreType(sub!);
            case 4: return parseSectionComponent(ctx, asyncSub!, size);
            case 5: return parseSectionInstance(ctx, sub!);
            case 6: return parseSectionAlias(ctx, sub!);
            case 7: return parseSectionType(ctx, sub!);
            case 8: return parseSectionCanon(ctx, sub!);
            case 9: return parseSectionStart(sub!);
            case 10: return parseSectionImport(ctx, sub!);
            case 11: return parseSectionExport(ctx, sub!);
            default:
                throw new Error(`unknown section: ${type}`);
        }
    })();
    if (sub && sub.remaining !== 0) {
        const absoluteActual = start + sub.pos;
        const absoluteExpected = start + size;
        const remaining = sub.remaining;
        const data = sub.readExact(remaining);
        const hex = bufferToHex(data);
        throw new Error(`invalid size after reading section ${type}: \n`
            + `actual position: 0x${absoluteActual.toString(16)} vs. expected position 0x${absoluteExpected.toString(16)}, remaining ${remaining}\n`
            + `section: ${JSON.stringify(sections)}\n`
            + 'remaining: ' + hex);
    }

    return sections;
}

function parseSectionCoreType(src: SyncSource): WITSection[] {
    const count = readU32(src);
    const types: WITSection[] = [];
    for (let i = 0; i < count; i++) {
        types.push(readCoreType(src));
    }
    return types;
}

function parseSectionStart(src: SyncSource): WITSection[] {
    return [readStartFunction(src)];
}

const MAX_NESTING_DEPTH = 100;

async function parseSectionComponent(
    ctx: ParserContext,
    src: Source,
    size: number
): Promise<ComponentSection[]> {
    if (ctx.depth >= MAX_NESTING_DEPTH) {
        throw new Error(`component nesting depth exceeds ${MAX_NESTING_DEPTH}`);
    }
    ctx.depth++;
    try {
        const end = src.pos + size;
        await checkPreamble(src);
        let model: WITSection[] = [];
        for (; ;) {
            if (src.pos == end) {
                break;
            }
            const sections = await parseSection(ctx, src);
            if (sections === null) {
                break;
            }
            model = [...model, ...sections];
        }
        return [{
            tag: ModelTag.ComponentSection,
            sections: model,
        }];
    } finally {
        ctx.depth--;
    }
}
