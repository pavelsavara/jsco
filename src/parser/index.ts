import type { WITModel, ParserContext, WITSection, ParserOptions } from './types';
export type { WITModel };

import { fetchLike, getBodyIfResponse } from '../utils/fetch-like';
import { SyncSource, bufferToHex, Closeable, Source, newSource } from '../utils/streaming';
import { parseSectionCustom, skipSection } from './otherSection';
import { parseSectionExport } from './export';
import { parseModule } from './module';
import { readU32Async } from './values';
import { parseSectionAlias } from './alias';
import { parseSectionImport } from './import';
import { parseSectionType } from './type';
import { ComponentTypeComponent, ComponentTypeDeclaration } from '../model/types';
import { parseSectionCanon } from './canon';
import { parseSectionCoreInstance } from './coreInstance';
import { parseSectionInstance } from './instance';
import { ModelTag } from '../model/tags';

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

        const ctx: ParserContext = {
            otherSectionData: options?.otherSectionData ?? false,
            compileStreaming: options?.compileStreaming ?? WebAssembly.compileStreaming,
            processCustomSection: options?.processCustomSection ?? undefined,
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
            case 4: return parseSectionComponent(ctx, asyncSub!, size);
            case 5: return parseSectionInstance(ctx, sub!);
            case 6: return parseSectionAlias(ctx, sub!);
            case 7: return parseSectionType(ctx, sub!);
            case 8: return parseSectionCanon(ctx, sub!);
            case 10: return parseSectionImport(ctx, sub!);
            case 11: return parseSectionExport(ctx, sub!);

            //TODO: to implement
            case 3: // core type - we don't have it in the sample
            case 9: // start
                return skipSection(ctx, sub!, type, size); // this is all TODO
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

async function parseSectionComponent(
    ctx: ParserContext,
    src: Source,
    size: number
): Promise<ComponentTypeComponent[]> {
    const bytes = await src.readExact(size);
    const src2 = newSource(bytes);

    await checkPreamble(src2);
    const model: ComponentTypeDeclaration[] = [];
    for (; ;) {
        const sections = await parseSection(ctx, src2);
        if (sections === null) {
            break;
        }
        for (const s of sections) {
            switch (s.tag) {
                case ModelTag.ComponentTypeDefinedRecord:
                    model.push({
                        tag: ModelTag.ComponentTypeDeclarationType,
                        value: s
                    });
                    break;
                case ModelTag.ComponentTypeFunc:
                    model.push({
                        tag: ModelTag.ComponentTypeDeclarationType,
                        value: s
                    });
                    break;
                case ModelTag.ComponentExport:
                    model.push({
                        tag: ModelTag.ComponentTypeDeclarationExport,
                        name: s.name,
                        ty: s.ty!
                    });
                    break;
                case ModelTag.ComponentImport:
                    model.push(s);
                    break;
                default:
                    throw new Error(`Unexpected section ${s.tag}`);
                    break;
            }
        }
    }
    return [{
        tag: ModelTag.ComponentTypeComponent,
        declarations: model
    }];
}
