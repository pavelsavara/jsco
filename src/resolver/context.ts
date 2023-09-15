import { WITModel } from '../parser';
import { BindingContext, ComponentFactoryOptions, JsImports, ResolverContext } from './types';
import { WasmPointer, WasmSize, Tcabi_realloc } from './binding/types';
import { ModelTag } from '../model/tags';
import { ExternalKind } from '../model/core';
import { ComponentExternalKind } from '../model/exports';
import { ComponentSection, WITSection } from '../parser/types';
import { jsco_assert, configuration } from '../utils/assert';

export function createResolverContext(sections: WITModel, options: ComponentFactoryOptions): ResolverContext {
    const rctx: ResolverContext = {
        usesNumberForInt64: (options.useNumberForInt64 === true) ? true : false,
        wasmInstantiate: options.wasmInstantiate ?? WebAssembly.instantiate,
        indexes: {
            componentExports: [],
            componentImports: [],
            componentFunctions: [],
            componentInstances: [],
            componentTypes: [], // this is 2 phase
            componentTypeResource: [],

            coreModules: [],
            coreInstances: [],
            coreFunctions: [],
            coreMemories: [],
            coreTables: [],
            coreGlobals: [],
        },
        resolveCache: new Map(),
    };
    if (configuration === 'Debug') {
        rctx.debugStack = [];
    }

    const subComponent: (ComponentSection)[] = [];
    const indexes = rctx.indexes;
    for (const section of sections) {
        // TODO: process all sections into model
        switch (section.tag) {
            case ModelTag.CoreModule:
                indexes.coreModules.push(section);
                break;
            case ModelTag.ComponentExport:
                indexes.componentExports.push(section);
                break;
            case ModelTag.ComponentImport:
                indexes.componentImports.push(section);
                break;
            case ModelTag.ComponentAliasCoreInstanceExport: {
                switch (section.kind) {
                    case ExternalKind.Func:
                        indexes.coreFunctions.push(section);
                        break;
                    case ExternalKind.Table:
                        indexes.coreTables.push(section);
                        break;
                    case ExternalKind.Memory:
                        indexes.coreMemories.push(section);
                        break;
                    case ExternalKind.Global:
                        indexes.coreGlobals.push(section);
                        break;
                    case ExternalKind.Tag:
                    default:
                        throw new Error(`unexpected section tag: ${section.kind}`);
                }
                break;
            }
            case ModelTag.ComponentAliasInstanceExport: {
                switch (section.kind) {
                    case ComponentExternalKind.Func:
                        indexes.componentFunctions.push(section);
                        break;
                    case ComponentExternalKind.Component:
                        indexes.componentTypes.push(section);
                        break;
                    case ComponentExternalKind.Type:
                        indexes.componentTypes.push(section);
                        break;
                    case ComponentExternalKind.Module:
                    case ComponentExternalKind.Value:
                    case ComponentExternalKind.Instance:
                    default:
                        throw new Error(`unexpected section tag: ${section.kind}`);
                }
                break;
            }
            case ModelTag.CoreInstanceFromExports:
            case ModelTag.CoreInstanceInstantiate:
                indexes.coreInstances.push(section);
                break;
            case ModelTag.ComponentInstanceFromExports:
            case ModelTag.ComponentInstanceInstantiate:
                indexes.componentInstances.push(section);
                break;
            case ModelTag.ComponentTypeFunc:
                indexes.componentTypes.push(section);
                break;
            case ModelTag.ComponentSection:
                subComponent.push(section);//append later
                break;
            case ModelTag.ComponentTypeDefinedBorrow:
            case ModelTag.ComponentTypeDefinedEnum:
            case ModelTag.ComponentTypeDefinedFlags:
            case ModelTag.ComponentTypeDefinedList:
            case ModelTag.ComponentTypeDefinedOption:
            case ModelTag.ComponentTypeDefinedOwn:
            case ModelTag.ComponentTypeDefinedPrimitive:
            case ModelTag.ComponentTypeDefinedRecord:
            case ModelTag.ComponentTypeDefinedResult:
            case ModelTag.ComponentTypeDefinedTuple:
            case ModelTag.ComponentTypeDefinedVariant:
                indexes.componentTypes.push(section);
                break;
            case ModelTag.ComponentTypeInstance:
                indexes.componentInstances.push(section);
                break;
            case ModelTag.ComponentTypeResource:
                indexes.componentTypeResource.push(section);
                break;
            case ModelTag.CanonicalFunctionLower: {
                indexes.coreFunctions.push(section);
                break;
            }
            case ModelTag.CanonicalFunctionLift: {
                indexes.componentFunctions.push(section);
                break;
            }

            case ModelTag.SkippedSection:
            case ModelTag.CustomSection:
                //drop
                break;
            case ModelTag.ComponentAliasOuter:
            case ModelTag.CanonicalFunctionResourceDrop:
            case ModelTag.CanonicalFunctionResourceNew:
            case ModelTag.CanonicalFunctionResourceRep:
            default:
                throw new Error(`unexpected section tag: ${(section as any).tag}`);
        }
    }

    // indexed with imports first and then function definitions next
    // See https://github.com/bytecodealliance/wasm-interface-types/blob/main/BINARY.md
    indexes.componentTypes = [...subComponent, ...indexes.componentTypes];
    setSelfIndex(rctx);
    return rctx;
}

export function setSelfIndex(rctx: ResolverContext) {
    function setSelfIndex(sort: WITSection[]) {
        for (let i = 0; i < sort.length; i++) {
            sort[i].selfSortIndex = i;
        }
    }
    setSelfIndex(rctx.indexes.componentExports);
    setSelfIndex(rctx.indexes.componentImports);
    setSelfIndex(rctx.indexes.componentFunctions);
    setSelfIndex(rctx.indexes.componentInstances);
    setSelfIndex(rctx.indexes.componentTypes);
    setSelfIndex(rctx.indexes.componentTypeResource);

    setSelfIndex(rctx.indexes.coreModules);
    setSelfIndex(rctx.indexes.coreInstances);
    setSelfIndex(rctx.indexes.coreFunctions);
    setSelfIndex(rctx.indexes.coreMemories);
    setSelfIndex(rctx.indexes.coreTables);
    setSelfIndex(rctx.indexes.coreGlobals);
}

export function createBindingContext(rctx: ResolverContext, imports: JsImports): BindingContext {
    let memory: WebAssembly.Memory = undefined as any;// TODO
    let cabi_realloc: Tcabi_realloc = undefined as any;// TODO

    function initialize(m: WebAssembly.Memory, cr: Tcabi_realloc) {
        memory = m;
        cabi_realloc = cr;
    }
    function getView(pointer?: number, len?: number) {
        return new DataView(memory.buffer, pointer, len);
    }
    function getViewU8(pointer?: number, len?: number) {
        return new Uint8Array(memory.buffer, pointer, len);
    }
    function getMemory() {
        return memory;
    }
    function realloc(oldPtr: WasmPointer, oldSize: WasmSize, align: WasmSize, newSize: WasmSize) {
        return cabi_realloc(oldPtr, oldSize, align, newSize);
    }
    function alloc(newSize: WasmSize, align: WasmSize) {
        return cabi_realloc(0 as any, 0 as any, align, newSize);
    }
    function readI32(ptr: WasmPointer) {
        return getView().getInt32(ptr);
    }
    function writeI32(ptr: WasmPointer, value: number) {
        return getView().setInt32(ptr, value);
    }
    function abort() {
        throw new Error('not implemented');
    }
    const ctx: BindingContext = {
        coreInstances: [],
        componentInstances: [],
        rootImports: imports,
        utf8Decoder: new TextDecoder(),
        utf8Encoder: new TextEncoder(),
        initialize,
        getView,
        getViewU8,
        getMemory,
        realloc,
        alloc,
        readI32,
        writeI32,
        abort,
    };
    if (configuration === 'Debug') {
        ctx.debugStack = [];
    }
    return ctx;
}

export function memoizePrepare<TFactory extends ((ctx: BindingContext, ...args: any[]) => Promise<any>)>(rctx: ResolverContext, section: WITSection, ff: () => Promise<TFactory>): Promise<TFactory> {
    jsco_assert(section.selfSortIndex !== undefined, 'expectd selfSortIndex');
    jsco_assert(section.tag !== undefined, 'expected tag');
    const cacheIndex = section.selfSortIndex;
    let cache = rctx.resolveCache.get(section.tag);
    if (cache === undefined) {
        cache = [];
        rctx.resolveCache.set(section.tag, cache);
    }
    if (cache[cacheIndex] !== undefined) {
        //console.warn('cacheFactory hit', section);
        return cache[cacheIndex] as Promise<TFactory>;
    }
    const res = new Promise<Function>((resolve, reject) => {
        const w = async () => {
            try {
                if (configuration === 'Debug') {
                    rctx.debugStack!.unshift(`PREPARE ${section.tag}[${cacheIndex}]`);

                    const factory = await ff();
                    const wrap = async (ctx: BindingContext, ...args: any[]) => {
                        try {
                            ctx.debugStack!.unshift(`CREATE  ${section.tag}[${cacheIndex}] args:${args.length}`); //(${args.length != 0 ? JSON.stringify(args) : ''})
                            const res = await factory(ctx, ...args);
                            //console.log(`CREATE returned ${section.tag}[${cacheIndex}]`, res);
                            return res;
                        }
                        finally {
                            ctx.debugStack!.shift();
                        }
                    };
                    return wrap as TFactory;
                } else {
                    const factory = await ff();
                    return factory;
                }
            }
            finally {
                if (configuration === 'Debug') {
                    rctx.debugStack!.pop();
                }
            }
        };

        return w().then((d) => resolve(d));
    });
    cache[cacheIndex] = res;
    return res as Promise<TFactory>;
}