import type { WITModel, ParserContext, WITSection, ParserOptions } from './types';
export type { WITModel };

import { fetchLike, getBodyIfResponse } from '../utils/fetch-like';
import { SyncSource, bufferToHex, Closeable, Source, newSource } from '../utils/streaming';
import { parseSectionCustom, skipSection } from './otherSection';
import { parseSectionExport } from './export';
import { parseModule } from './module';
import { readU32Async } from './values';
import { parseSectionAlias } from './alias';

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
    const model = produceModel(sections);
    return model;
}

async function parseWIT(src: Source & Closeable, options?: ParserOptions): Promise<WITSection[]> {
    try {
        await checkPreamble(src);

        const ctx: ParserContext = {
            otherSectionData: options?.otherSectionData ?? false,
            compileStreaming: options?.compileStreaming ?? WebAssembly.compileStreaming,
            processCustomSection: options?.processCustomSection ?? undefined,
        };

        const sections: WITSection[] = [];
        for (; ;) {
            const section = await parseSection(ctx, src);
            if (section === null) {
                break;
            }
            sections.push(section);
        }

        return sections;
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

async function parseSection(ctx: ParserContext, src: Source): Promise<WITSection | null> {
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
        const remaining = sub.remainig;
        const data = sub.readExact(remaining);
        const hex = bufferToHex(data);
        throw new Error(`invalid size after reading section ${type}: \n`
            + `actual position: ${absoluteActual} vs. expected position ${absoluteExpected}, remaining ${remaining}\n`
            + `section: ${JSON.stringify(section)}\n`
            + 'remaining: ' + hex);
    }

    return section;
}

export function produceModel(sections: WITSection[]): WITModel {
    const model: WITModel = {
        tag: 'model',
        componentExports: [],
        componentImports: [],
        instances: [],
        modules: [],
        other: [],
        type: [],
        aliases: [],
        cannon: [],
        component: [],
    };

    for (const section of sections) {
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
            case 'InstanceFromExports':
            case 'InstanceInstantiate':
                model.instances.push(section);
                break;
            case 'ComponentTypeFunc':
            case 'ComponentTypeComponent':
            case 'ComponentTypeDefined':
            case 'ComponentTypeInstance':
            case 'ComponentTypeResource':
                model.type.push(section);
                break;
            case 'CanonicalFunctionLower':
            case 'CanonicalFunctionLift':
            case 'CanonicalFunctionResourceDrop':
            case 'CanonicalFunctionResourceNew':
            case 'CanonicalFunctionResourceRep':
                model.cannon.push(section);
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