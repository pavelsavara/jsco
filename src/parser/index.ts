import type { WITModel, ParserContext, WITSection } from './types';
export type { WITModel };

import { fetchLike, getBodyIfResponse } from '../utils/fetch-like';
import { SyncSource, bufferToHex, Closeable, Source, newSource } from '../utils/streaming';
import { parseSectionCustom, skipSection } from './otherSection';
import { parseSectionExport } from './export';
import { parseModule } from './module';
import { readU32Async } from './values';

export const WIT_MAGIC = [0x00, 0x61, 0x73, 0x6d];
export const WIT_VERSION = [0x0D, 0x00, 0x01, 0x00];

export async function parse(componentOrUrl:
    | string
    | ArrayLike<number>
    | ReadableStream<Uint8Array>
    | Response
    | PromiseLike<Response>
): Promise<WITModel> {
    let input = componentOrUrl as any;
    if (typeof componentOrUrl === 'string') {
        input = fetchLike(componentOrUrl);
    }
    input = await getBodyIfResponse(input);
    const src = newSource(input);
    return parseWIT(src);
}

async function parseWIT(src: Source & Closeable): Promise<WITModel> {
    const model: WITModel = {
        tag: 'model',
        componentExports: [],
        componentImports: [],
        modules: [],
        other: [],
        aliases: [],
    } as any;
    try {
        await checkHeader(src);

        const ctx: ParserContext = {
            compileStreaming: WebAssembly.compileStreaming, // configurable ?
            processCustomSection: undefined,
            otherSectionData: false,
        };
        for (; ;) {
            const section = await parseSection(ctx, src);
            if (section === null) {
                break;
            }
            // TODO: process all sections into model
            switch (section.tag) {
                case 'ComponentModule':
                    model.modules.push(section);
                    break;
                case 'ComponentExport':
                    model.componentExports.push(section);
                    break;
                case 'ComponentImport':
                    model.componentImports.push(section);
                    break;
                case 'ComponentAliasOuter':
                case 'ComponentAliasCoreInstanceExport':
                case 'ComponentAliasInstanceExport':
                    model.aliases.push(section);
                    break;
                case 'SkippedSection':
                case 'CustomSection':
                    model.other.push(section);
                    break;
                default:
                    throw new Error(`unexpected section tag: ${(section as any).tag}`);
            }
        }

        return model;
    }
    finally {
        src.close();
    }
}

async function checkHeader(src: Source): Promise<void> {
    const magic = await src.readExact(WIT_MAGIC.length);
    const version = await src.readExact(WIT_VERSION.length);

    const ok = magic.every((v, i) => v === WIT_MAGIC[i]) &&
        version.every((v, i) => v === WIT_VERSION[i]);
    if (!ok) {
        throw new Error('unexpected magic or version.');
    }
}

export async function parseSection(ctx: ParserContext, src: Source): Promise<WITSection | null> {
    const type = await src.read(true); // byte will be enough for type
    if (type === null) {
        return null;
    }
    const size = await readU32Async(src);
    const start = src.pos;
    const asyncSub: Source | undefined = type == 1 ? src.subSource(size) : undefined; // if this is module, we need to stream it
    const sub: SyncSource | undefined = type != 1 ? await src.subSyncSource(size) : undefined; // otherwise it's not worth all the async overhead
    const section = await (() => {
        switch (type) {
            ///
            /// https://github.com/WebAssembly/component-model/blob/main/design/mvp/Binary.md#component-definitions
            ///
            case 0: return parseSectionCustom(ctx, sub!, size);
            case 1: return parseModule(ctx, asyncSub!, size);
            case 11: return parseSectionExport(ctx, sub!);
            //case 6: return parseSectionAlias(ctx, sub!);

            //TODO: to implement    
            case 2: // core instance
            case 3: // core type
            case 4: // component
            case 5: // instance
            case 6: // alias
            case 7: // type
            case 8: // canon
            case 10: // import
                return skipSection(ctx, sub!, type, size); // this is all TODO
            default:
                throw new Error(`unknown section: ${type}`);
        }
    })();
    if (sub && sub.remainig !== 0) {
        const absoluteActual = start + sub.pos;
        const absoluteExpected = start + size;
        const remainig = sub.remainig;
        const data = sub.readExact(remainig);
        const hex = bufferToHex(data);
        throw new Error(`invalid size after reading section ${type}: \n`
            + `actual position: ${absoluteActual} vs. expected position ${absoluteExpected}, remaining ${remainig} \n`
            + `section: ${JSON.stringify(section)}\n`
            + 'remaining: ' + hex);
    }

    return section;
}

