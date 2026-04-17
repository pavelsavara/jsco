// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// adapted from https://github.com/yskszk63/stream-wasm-parser by yusuke suzuki under MIT License

import * as leb from '@thi.ng/leb128';
import { Export, ExternalKind, ValType, Import, TypeRef } from '../model/core';
import { SyncSource, Source } from '../utils/streaming';
import { ComponentExternalKind } from '../model/exports';
import { ComponentOuterAliasKind } from '../model/aliases';
import { CoreFuncIndex, CoreModuleIndex, ComponentFuncIndex, ComponentTypeIndex } from '../model/indices';
import { ModelTag } from '../model/tags';
import { ComponentExternName, ComponentTypeRef, TypeBounds } from '../model/imports';
import { ComponentFuncResult, ComponentTypeComponent, ComponentTypeDefined, ComponentTypeFunc, ComponentTypeInstance, ComponentTypeResource, ComponentValType, CoreType, ComponentTypeDeclaration, InstanceTypeDeclaration, ModuleTypeDeclaration, NamedValue, PrimitiveValType, VariantCase } from '../model/types';
import { CanonicalFunction, CanonicalOption, TaskReturnResults } from '../model/canonicals';
import { ComponentInstantiationArg, CoreInstance, InstantiationArg, InstantiationArgKind } from '../model/instances';
import { readAlias } from './alias';
import { ComponentStartFunction } from '../model/start';

const textDecoder = new TextDecoder();

export async function readU32Async(source: Source): Promise<number> {
    return await readIntegerAsync(
        source,
        0x00,
        0xFFFF_FFFF,
        leb.decodeULEB128,
    );
}

export function readU32(source: SyncSource): number {
    return readInteger(
        source,
        0x00,
        0xFFFF_FFFF,
        leb.decodeULEB128,
    );
}

export function readStringArray(src: SyncSource): string[] {

    const count = readU32(src);
    const arr: string[] = [];
    for (let i = 0; i < count; i++) {
        arr.push(readName(src));
    }
    return arr;
}

export function readName(source: SyncSource): string {
    const length = readU32(source);
    const content = source.readExact(length);
    return textDecoder.decode(content)!;
}

export function parseAsExternalKind(k1: number): ExternalKind {
    switch (k1) {
        case 0x00: return ExternalKind.Func;
        case 0x01: return ExternalKind.Table;
        case 0x02: return ExternalKind.Memory;
        case 0x03: return ExternalKind.Global;
        case 0x04: return ExternalKind.Tag;
        default:
            throw new Error(`unknown external kind. ${k1}`);
    }
}

export function readComponentExternalKind(src: SyncSource): ComponentExternalKind {
    const k1 = readU32(src);
    return (k1 == 0x00)
        ? parseAsComponentExternalKind(k1, readU32(src))
        : parseAsComponentExternalKind(k1);
}

export function parseAsComponentExternalKind(k1: number, k2?: number): ComponentExternalKind {
    switch (k1) {
        case 0x00:
            switch (k2) {
                case 0x11: return ComponentExternalKind.Module;
                default:
                    throw new Error(`unknown component external kind 2. ${k2}`);
            }
        case 0x01: return ComponentExternalKind.Func;
        case 0x02: return ComponentExternalKind.Value;
        case 0x03: return ComponentExternalKind.Type;
        case 0x04: return ComponentExternalKind.Component;
        case 0x05: return ComponentExternalKind.Instance;
        default:
            throw new Error(`unknown component external kind. 0x${k1.toString(16)}`);
    }
}

export function readCoreValType(src: SyncSource): ValType {
    const b = src.read();
    switch (b) {
        case 0x7F: return { tag: ModelTag.ValTypeI32 };
        case 0x7E: return { tag: ModelTag.ValTypeI64 };
        case 0x7D: return { tag: ModelTag.ValTypeF32 };
        case 0x7C: return { tag: ModelTag.ValTypeF64 };
        case 0x7B: return { tag: ModelTag.ValTypeV128 };
        case 0x70: // funcref
        case 0x6F: // externref
            return { tag: ModelTag.ValTypeRef, value: b };
        default: throw new Error(`unknown core val type: 0x${b.toString(16)}`);
    }
}

export function readCoreTypeRef(src: SyncSource): TypeRef {
    const kind = src.read();
    switch (kind) {
        case 0x00: return { tag: ModelTag.TypeRefFunc, value: readU32(src) };
        case 0x01: {
            const element_type = src.read();
            const initial = readU32(src);
            const hasMax = src.read();
            const maximum = hasMax ? readU32(src) : undefined;
            return { tag: ModelTag.TypeRefTable, element_type, initial, maximum };
        }
        case 0x02: {
            const flags = src.read();
            const memory64 = (flags & 0x04) !== 0;
            const shared = (flags & 0x02) !== 0;
            const hasMax = (flags & 0x01) !== 0;
            const initial = readU32(src);
            const maximum = hasMax ? readU32(src) : undefined;
            return { tag: ModelTag.TypeRefMemory, memory64, shared, initial, maximum };
        }
        case 0x03: {
            const content_type = readCoreValType(src);
            const mutable = src.read() !== 0;
            return { tag: ModelTag.TypeRefGlobal, content_type, mutable };
        }
        case 0x04: return { tag: ModelTag.TypeRefTag, value: readU32(src) };
        default: throw new Error(`unknown core type ref kind: 0x${kind.toString(16)}`);
    }
}

export function readCoreImport(src: SyncSource): Import {
    const module = readName(src);
    const name = readName(src);
    const ty = readCoreTypeRef(src);
    return { module, name, ty };
}

export function readModuleTypeDeclarations(src: SyncSource): ModuleTypeDeclaration[] {
    const count = readU32(src);
    const declarations: ModuleTypeDeclaration[] = [];
    for (let i = 0; i < count; i++) {
        const kind = src.read();
        switch (kind) {
            case 0x00: {
                // import
                const imp = readCoreImport(src);
                declarations.push({
                    tag: ModelTag.ModuleTypeDeclarationImport,
                    ...imp,
                });
                break;
            }
            case 0x01: {
                // type (SubType wrapping a structural type)
                const funcTag = src.read();
                if (funcTag !== 0x60) {
                    throw new Error(`expected core func type 0x60 in module type declaration, got 0x${funcTag.toString(16)}`);
                }
                const paramCount = readU32(src);
                const params: ValType[] = [];
                for (let j = 0; j < paramCount; j++) {
                    params.push(readCoreValType(src));
                }
                const resultCount = readU32(src);
                const results: ValType[] = [];
                for (let j = 0; j < resultCount; j++) {
                    results.push(readCoreValType(src));
                }
                declarations.push({
                    tag: ModelTag.ModuleTypeDeclarationType,
                    is_final: true,
                    supertype_idx: undefined,
                    structural_type: {
                        tag: ModelTag.StructuralTypeFunc,
                        params_results: [...params, ...results],
                        len_params: paramCount,
                    },
                });
                break;
            }
            case 0x02: {
                // outer alias
                const aliasSort = src.read();
                if (aliasSort !== 0x10) {
                    throw new Error(`expected core type sort 0x10 in module type alias, got 0x${aliasSort.toString(16)}`);
                }
                const count = readU32(src);
                const index = readU32(src);
                declarations.push({
                    tag: ModelTag.ModuleTypeDeclarationOuterAlias,
                    kind: { tag: ModelTag.OuterAliasKindType },
                    count,
                    index,
                });
                break;
            }
            case 0x03: {
                // export
                const name = readName(src);
                const ty = readCoreTypeRef(src);
                declarations.push({
                    tag: ModelTag.ModuleTypeDeclarationExport,
                    name,
                    ty,
                });
                break;
            }
            default:
                throw new Error(`unknown module type declaration kind: 0x${kind.toString(16)}`);
        }
    }
    return declarations;
}

export function readCoreType(src: SyncSource): CoreType {
    const tag = src.read();
    switch (tag) {
        case 0x60: {
            // core func type
            const paramCount = readU32(src);
            const params: ValType[] = [];
            for (let i = 0; i < paramCount; i++) {
                params.push(readCoreValType(src));
            }
            const resultCount = readU32(src);
            const results: ValType[] = [];
            for (let i = 0; i < resultCount; i++) {
                results.push(readCoreValType(src));
            }
            return {
                tag: ModelTag.CoreTypeFunc,
                params_results: [...params, ...results],
                len_params: paramCount,
            };
        }
        case 0x50: {
            // core module type
            return {
                tag: ModelTag.CoreTypeModule,
                declarations: readModuleTypeDeclarations(src),
            };
        }
        default:
            throw new Error(`unknown core type tag: 0x${tag.toString(16)}`);
    }
}

export function readStartFunction(src: SyncSource): ComponentStartFunction {
    const func_index = readU32(src);
    const argCount = readU32(src);
    const args: number[] = [];
    for (let i = 0; i < argCount; i++) {
        args.push(readU32(src));
    }
    const results = readU32(src);
    return {
        tag: ModelTag.ComponentStartFunction,
        func_index,
        arguments: args,
        results,
    };
}

export function readInstanceTypeDeclarations(src: SyncSource): InstanceTypeDeclaration[] {
    const count = readU32(src);
    const declarations: InstanceTypeDeclaration[] = [];
    for (let i = 0; i < count; i++) {
        const type = src.read();
        let declaration: InstanceTypeDeclaration;
        switch (type) {
            case 0x00: {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationCoreType,
                    value: readCoreType(src),
                };
                break;
            }
            case 0x01: {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationType,
                    value: readComponentType(src),
                };
                break;
            }
            case 0x02: {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationAlias,
                    value: readAlias(src),
                };
                break;
            }
            case 0x04: {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationExport,
                    name: readComponentExternName(src),
                    ty: readComponentTypeRef(src)
                };
                break;
            }
            default:
                throw new Error(`unknown instance type declaration kind: 0x${type.toString(16)}`);
        }
        declarations.push(declaration);
    }
    return declarations;
}

export function readComponentTypeDeclarations(src: SyncSource): ComponentTypeDeclaration[] {
    const count = readU32(src);
    const declarations: ComponentTypeDeclaration[] = [];
    for (let i = 0; i < count; i++) {
        const type = src.read();
        let declaration: ComponentTypeDeclaration;
        switch (type) {
            case 0x00: {
                declaration = {
                    tag: ModelTag.ComponentTypeDeclarationCoreType,
                    value: readCoreType(src),
                };
                break;
            }
            case 0x01: {
                declaration = {
                    tag: ModelTag.ComponentTypeDeclarationType,
                    value: readComponentType(src),
                };
                break;
            }
            case 0x02: {
                declaration = {
                    tag: ModelTag.ComponentTypeDeclarationAlias,
                    value: readAlias(src),
                };
                break;
            }
            case 0x03: {
                declaration = {
                    tag: ModelTag.ComponentImport,
                    name: readComponentExternName(src),
                    ty: readComponentTypeRef(src),
                };
                break;
            }
            case 0x04: {
                declaration = {
                    tag: ModelTag.ComponentTypeDeclarationExport,
                    name: readComponentExternName(src),
                    ty: readComponentTypeRef(src),
                };
                break;
            }
            default:
                throw new Error(`unknown component type declaration kind: 0x${type.toString(16)}`);
        }
        declarations.push(declaration);
    }
    return declarations;
}

export function readComponentExternName(src: SyncSource): ComponentExternName {
    const type = readU32(src);

    switch (type) {
        case 0x00: return {
            tag: ModelTag.ComponentExternNameKebab,
            name: readName(src),
        };
        case 0x01: return {
            tag: ModelTag.ComponentExternNameInterface,
            name: readName(src),
        };
        default:
            throw new Error(`unknown ComponentExternName. ${type}`);
    }
}

export function readDestructor(src: SyncSource): number | undefined {
    const type = src.read();
    switch (type) {
        case 0x00: return undefined;
        case 0x01: return readU32(src);
        default: throw new Error('Invalid leading byte in resource destructor');
    }
}

export function readComponentTypeDefined(src: SyncSource, type: number): ComponentTypeDefined {
    // Handle primitive types (0x73-0x7f) that appear as type definitions
    if (0x73 <= type && type <= 0x7f) {
        return {
            tag: ModelTag.ComponentTypeDefinedPrimitive,
            value: parsePrimitiveValType(type),
        };
    }
    switch (type) {
        case 0x68: {
            return {
                tag: ModelTag.ComponentTypeDefinedBorrow,
                value: readU32(src),
            };
        }
        case 0x69: {
            return {
                tag: ModelTag.ComponentTypeDefinedOwn,
                value: readU32(src),
            };
        }
        case 0x64: {
            return {
                tag: ModelTag.ComponentTypeDefinedErrorContext,
            };
        }
        case 0x65: {
            return {
                tag: ModelTag.ComponentTypeDefinedFuture,
                value: readOptionalComponentValType(src),
            };
        }
        case 0x66: {
            return {
                tag: ModelTag.ComponentTypeDefinedStream,
                value: readOptionalComponentValType(src),
            };
        }
        case 0x6a: {
            return {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: readOptionalComponentValType(src),
                err: readOptionalComponentValType(src),
            };
        }
        case 0x6b: {
            return {
                tag: ModelTag.ComponentTypeDefinedOption,
                value: readComponentValType(src),
            };
        }
        case 0x6d: {
            return {
                tag: ModelTag.ComponentTypeDefinedEnum,
                members: readStringArray(src),
            };
        }
        case 0x6e: {
            return {
                tag: ModelTag.ComponentTypeDefinedFlags,
                members: readStringArray(src),
            };
        }
        case 0x6f: {
            const count = readU32(src);
            const members: ComponentValType[] = [];
            for (let i = 0; i < count; i++) {
                members.push(readComponentValType(src));
            }
            return {
                tag: ModelTag.ComponentTypeDefinedTuple,
                members: members,
            };
        }
        case 0x70: {
            return {
                tag: ModelTag.ComponentTypeDefinedList,
                value: readComponentValType(src),
            };
        }
        case 0x71: {
            const count = readU32(src);
            const variants: VariantCase[] = [];
            for (let i = 0; i < count; i++) {
                variants.push({
                    name: readName(src),
                    ty: readOptionalComponentValType(src),
                    refines: readOptionalRefinement(src),
                });
            }
            return {
                tag: ModelTag.ComponentTypeDefinedVariant,
                variants: variants,
            };
        }
        case 0x72: {
            const count = readU32(src);
            const members: { name: string, type: ComponentValType }[] = [];
            for (let i = 0; i < count; i++) {
                members.push({
                    name: readName(src),
                    type: readComponentValType(src),
                });
            }
            return {
                tag: ModelTag.ComponentTypeDefinedRecord,
                members: members,
            };
        }
        default: throw new Error(`Unrecognized type in readComponentTypeDefined: ${type}`);
    }
}

export function readComponentInstantiationArgs(src: SyncSource): ComponentInstantiationArg[] {
    const count = readU32(src);
    const args: ComponentInstantiationArg[] = [];
    for (let i = 0; i < count; i++) {
        args.push({
            name: readName(src),
            kind: readComponentExternalKind(src),
            index: readU32(src)
        });
    }
    return args;
}

export function readCoreInstance(src: SyncSource): CoreInstance {
    const type = src.read();
    switch (type) {
        case 0x00: {
            const index = readU32(src);
            return {
                tag: ModelTag.CoreInstanceInstantiate,
                module_index: index as CoreModuleIndex,
                args: readInstantiationArgs(src),
            };
        }
        case 0x01: {
            return {
                tag: ModelTag.CoreInstanceFromExports,
                exports: readExports(src),
            };
        }
        default: throw new Error(`Unrecognized type in readCoreInstance: ${type}`);
    }
}

export function readExports(src: SyncSource): Export[] {
    const count = readU32(src);
    const exports: Export[] = [];
    for (let i = 0; i < count; i++) {
        const name = readName(src);
        const kind = readU32(src);
        const index = readU32(src);
        exports.push({
            name: name,
            kind: parseAsExternalKind(kind),
            index: index,
        });
    }
    return exports;
}

export function readInstantiationArgs(src: SyncSource): InstantiationArg[] {
    const count = readU32(src);
    const args: InstantiationArg[] = [];
    for (let i = 0; i < count; i++) {
        const name = readName(src);
        const kind = readInstantiationArgKind(src);
        const index = readU32(src);
        args.push({
            name: name,
            kind: kind,
            index: index
        });
    }
    return args;
}

export function readInstantiationArgKind(src: SyncSource): InstantiationArgKind {
    const kind = src.read();
    if (kind != 0x12)
        throw new Error(`Unrecognized kind in readInstantiationArgKind: ${kind}`);
    return InstantiationArgKind.Instance;
}

function readAsyncFlag(src: SyncSource): boolean {
    const flag = src.read();
    if (flag === 0x00) return false;
    if (flag === 0x01) return true;
    throw new Error(`invalid async flag: ${flag}`);
}

function readCancelFlag(src: SyncSource): boolean {
    const flag = src.read();
    if (flag === 0x00) return false;
    if (flag === 0x01) return true;
    throw new Error(`invalid cancel flag: ${flag}`);
}

function readTaskReturnResults(src: SyncSource): TaskReturnResults {
    const tag = src.read();
    if (tag === 0x00) {
        return { type: readComponentValType(src) };
    }
    if (tag === 0x01) {
        const zero = src.read();
        if (zero !== 0x00) throw new Error(`expected 0x00 after task.return tag 0x01, got ${zero}`);
        return {};
    }
    throw new Error(`invalid task.return result tag: ${tag}`);
}

export function readCanonicalFunction(src: SyncSource): CanonicalFunction {
    const type = src.read();
    switch (type) {
        case 0x00: {
            const controlByte = src.read();
            if (controlByte != 0x00)
                throw new Error(`Unrecognized byte for CanonicalFunctionLift in readCanonicalFunction: ${controlByte}`);
            return {
                tag: ModelTag.CanonicalFunctionLift,
                core_func_index: readU32(src) as CoreFuncIndex,
                options: readCanonicalOptions(src),
                type_index: readU32(src) as ComponentTypeIndex,
            };
        }
        case 0x01: {
            const controlByte = src.read();
            if (controlByte != 0x00)
                throw new Error(`Unrecognized byte for CanonicalFunctionLower in readCanonicalFunction: ${controlByte}`);
            return {
                tag: ModelTag.CanonicalFunctionLower, // here
                func_index: readU32(src) as ComponentFuncIndex,
                options: readCanonicalOptions(src),
            };
        }
        case 0x02: return {
            tag: ModelTag.CanonicalFunctionResourceNew,
            resource: readU32(src),
        };
        case 0x03: return {
            tag: ModelTag.CanonicalFunctionResourceDrop,
            resource: readU32(src),
        };
        case 0x04: return {
            tag: ModelTag.CanonicalFunctionResourceRep,
            resource: readU32(src),
        };
        case 0x05: return {
            tag: ModelTag.CanonicalFunctionTaskCancel,
        };
        case 0x06: return {
            tag: ModelTag.CanonicalFunctionSubtaskCancel,
            async: readAsyncFlag(src),
        };
        case 0x08: return {
            tag: ModelTag.CanonicalFunctionBackpressureSet,
        };
        case 0x09: return {
            tag: ModelTag.CanonicalFunctionTaskReturn,
            results: readTaskReturnResults(src),
            options: readCanonicalOptions(src),
        };
        case 0x0a: return {
            tag: ModelTag.CanonicalFunctionContextGet,
            valtype: src.read(),
            index: readU32(src),
        };
        case 0x0b: return {
            tag: ModelTag.CanonicalFunctionContextSet,
            valtype: src.read(),
            index: readU32(src),
        };
        case 0x0c: return {
            tag: ModelTag.CanonicalFunctionThreadYield,
            cancellable: readCancelFlag(src),
        };
        case 0x0d: return {
            tag: ModelTag.CanonicalFunctionSubtaskDrop,
        };
        case 0x0e: return {
            tag: ModelTag.CanonicalFunctionStreamNew,
            type: readU32(src),
        };
        case 0x0f: return {
            tag: ModelTag.CanonicalFunctionStreamRead,
            type: readU32(src),
            options: readCanonicalOptions(src),
        };
        case 0x10: return {
            tag: ModelTag.CanonicalFunctionStreamWrite,
            type: readU32(src),
            options: readCanonicalOptions(src),
        };
        case 0x11: return {
            tag: ModelTag.CanonicalFunctionStreamCancelRead,
            type: readU32(src),
            async: readAsyncFlag(src),
        };
        case 0x12: return {
            tag: ModelTag.CanonicalFunctionStreamCancelWrite,
            type: readU32(src),
            async: readAsyncFlag(src),
        };
        case 0x13: return {
            tag: ModelTag.CanonicalFunctionStreamDropReadable,
            type: readU32(src),
        };
        case 0x14: return {
            tag: ModelTag.CanonicalFunctionStreamDropWritable,
            type: readU32(src),
        };
        case 0x15: return {
            tag: ModelTag.CanonicalFunctionFutureNew,
            type: readU32(src),
        };
        case 0x16: return {
            tag: ModelTag.CanonicalFunctionFutureRead,
            type: readU32(src),
            options: readCanonicalOptions(src),
        };
        case 0x17: return {
            tag: ModelTag.CanonicalFunctionFutureWrite,
            type: readU32(src),
            options: readCanonicalOptions(src),
        };
        case 0x18: return {
            tag: ModelTag.CanonicalFunctionFutureCancelRead,
            type: readU32(src),
            async: readAsyncFlag(src),
        };
        case 0x19: return {
            tag: ModelTag.CanonicalFunctionFutureCancelWrite,
            type: readU32(src),
            async: readAsyncFlag(src),
        };
        case 0x1a: return {
            tag: ModelTag.CanonicalFunctionFutureDropReadable,
            type: readU32(src),
        };
        case 0x1b: return {
            tag: ModelTag.CanonicalFunctionFutureDropWritable,
            type: readU32(src),
        };
        case 0x1c: return {
            tag: ModelTag.CanonicalFunctionErrorContextNew,
            options: readCanonicalOptions(src),
        };
        case 0x1d: return {
            tag: ModelTag.CanonicalFunctionErrorContextDebugMessage,
            options: readCanonicalOptions(src),
        };
        case 0x1e: return {
            tag: ModelTag.CanonicalFunctionErrorContextDrop,
        };
        case 0x1f: return {
            tag: ModelTag.CanonicalFunctionWaitableSetNew,
        };
        case 0x20: return {
            tag: ModelTag.CanonicalFunctionWaitableSetWait,
            cancellable: readCancelFlag(src),
            memory: readU32(src),
        };
        case 0x21: return {
            tag: ModelTag.CanonicalFunctionWaitableSetPoll,
            cancellable: readCancelFlag(src),
            memory: readU32(src),
        };
        case 0x22: return {
            tag: ModelTag.CanonicalFunctionWaitableSetDrop,
        };
        case 0x23: return {
            tag: ModelTag.CanonicalFunctionWaitableJoin,
        };
        case 0x24: return {
            tag: ModelTag.CanonicalFunctionBackpressureInc,
        };
        case 0x25: return {
            tag: ModelTag.CanonicalFunctionBackpressureDec,
        };
        default: throw new Error(`Unrecognized type in readCanonicalFunction: ${type}`);
    }
}

export function readCanonicalOptions(src: SyncSource): CanonicalOption[] {

    const optionsCount = readU32(src);
    const options: CanonicalOption[] = [];
    for (let i = 0; i < optionsCount; i++) {
        options.push(readCanonicalOption(src));
    }
    return options;
}

export function readCanonicalOption(src: SyncSource): CanonicalOption {
    const type = src.read();
    switch (type) {
        case 0x00: return {
            tag: ModelTag.CanonicalOptionUTF8,
        };
        case 0x01: return {
            tag: ModelTag.CanonicalOptionUTF16,
        };
        case 0x02: return {
            tag: ModelTag.CanonicalOptionCompactUTF16,
        };
        case 0x03: return {
            tag: ModelTag.CanonicalOptionMemory,
            value: readU32(src),
        };
        case 0x04: return {
            tag: ModelTag.CanonicalOptionRealloc,
            value: readU32(src),
        };
        case 0x05: return {
            tag: ModelTag.CanonicalOptionPostReturn,
            value: readU32(src),
        };
        case 0x06: return {
            tag: ModelTag.CanonicalOptionAsync,
        };
        case 0x07: return {
            tag: ModelTag.CanonicalOptionCallback,
            value: readU32(src),
        };
        default: throw new Error(`Unrecognized type in readCanonicalOption = ${type}.`);
    }
}

export function readComponentType(src: SyncSource): ComponentTypeDefined | ComponentTypeResource | ComponentTypeFunc | ComponentTypeComponent | ComponentTypeInstance {
    const type = src.read();
    switch (type) {
        case 0x3F: {
            return {
                tag: ModelTag.ComponentTypeResource,
                rep: readU32(src) as unknown as ValType,
                dtor: readDestructor(src)
            };
        }
        case 0x40:
        case 0x43: {
            return {
                tag: ModelTag.ComponentTypeFunc,
                async_: type === 0x43,
                params: readNamedValues(src),
                results: readComponentFuncResult(src),
            };
        }
        case 0x41: {
            return {
                tag: ModelTag.ComponentTypeComponent,
                declarations: readComponentTypeDeclarations(src),
            };
        }
        case 0x42: {
            return {
                tag: ModelTag.ComponentTypeInstance,
                declarations: readInstanceTypeDeclarations(src),
            };
        }
        default: {
            return readComponentTypeDefined(src, type);
        }
    }
}

export function readComponentTypeRef(src: SyncSource): ComponentTypeRef {
    const type = readU32(src);
    switch (type) {
        case 0x00: return {
            tag: ModelTag.ComponentTypeRefModule,
            value: readU32(src),
        };
        case 0x01: return {
            tag: ModelTag.ComponentTypeRefFunc,
            value: readU32(src),
        };
        case 0x02: return {
            tag: ModelTag.ComponentTypeRefValue,
            value: readComponentValType(src),
        };
        case 0x03: return {
            tag: ModelTag.ComponentTypeRefType,
            value: readTypeBounds(src),
        };
        case 0x04: return {
            tag: ModelTag.ComponentTypeRefComponent,
            value: readU32(src),
        };
        case 0x05: return {
            tag: ModelTag.ComponentTypeRefInstance,
            value: readU32(src),
        };
        default:
            throw new Error(`unknown ComponentExternName. ${type}`);
    }
}

export function readNamedValues(src: SyncSource): NamedValue[] {
    const values: NamedValue[] = [];
    const count = readU32(src);
    for (let i = 0; i < count; i++) {
        values.push({
            name: readName(src),
            type: readComponentValType(src),
        });
    }
    return values;
}

export function readComponentFuncResult(src: SyncSource): ComponentFuncResult {
    const type = src.read();
    switch (type) {
        case 0x00:
            return {
                tag: ModelTag.ComponentFuncResultUnnamed,
                type: readComponentValType(src),
            };
        case 0x01:
            return {
                tag: ModelTag.ComponentFuncResultNamed,
                values: readNamedValues(src),
            };
        default: throw new Error(`unknown ComponentFuncResult type: ${type}`);
    }
}

export function readComponentValType(src: SyncSource): ComponentValType {
    // Component Model valtype is encoded as s33 (signed 33-bit LEB128).
    // Negative values (-1 to -13) represent primitive types and are encoded
    // as single bytes 0x73-0x7F. Non-negative values are type indices.
    //
    // Primitives are always single-byte (high bit = 0, value 0x73-0x7F).
    // Type indices use standard ULEB128; multi-byte encodings have high bit
    // set on non-final bytes, so the first byte of a multi-byte index will
    // never be in 0x73-0x7F. We read the first byte to distinguish.
    const first = src.read();
    if (first <= 0x7f && first >= 0x73) {
        // Single-byte primitive (no continuation bit, in primitive range)
        return {
            tag: ModelTag.ComponentValTypePrimitive,
            value: parsePrimitiveValType(first),
        };
    }
    // Reconstruct the LEB128 value from the first byte onward.
    // If high bit is clear (first < 0x80), it's a single-byte type index.
    // If high bit is set (first >= 0x80), read continuation bytes.
    let result = first & 0x7f;
    if (first & 0x80) {
        let shift = 7;
        let byte: number;
        let count = 1;
        do {
            byte = src.read();
            result |= (byte & 0x7f) << shift;
            shift += 7;
            count++;
            if (count > 5) throw new Error('LEB128 overflow in component val type index');
        } while (byte & 0x80);
    }
    return {
        tag: ModelTag.ComponentValTypeType,
        value: result,
    };
}

/** Read an optional valtype? field (0x00 = absent, 0x01 = present + valtype). */
export function readOptionalComponentValType(src: SyncSource): ComponentValType | undefined {
    const flag = src.read();
    if (flag === 0x00) return undefined;
    if (flag === 0x01) return readComponentValType(src);
    throw new Error(`invalid optional valtype flag: ${flag}`);
}

/** Read an optional refinement? field (0x00 = absent, 0x01 = present + u32). */
export function readOptionalRefinement(src: SyncSource): number | undefined {
    const flag = src.read();
    if (flag === 0x00) return undefined;
    if (flag === 0x01) return readU32(src);
    throw new Error(`invalid optional refinement flag: ${flag}`);
}

export function readTypeBounds(src: SyncSource): TypeBounds {
    const b = readU32(src);
    switch (b) {
        case 0x00: return {
            tag: ModelTag.TypeBoundsEq,
            value: readU32(src),
        };
        case 0x01: return {
            tag: ModelTag.TypeBoundsSubResource,
        };
        default:
            throw new Error(`unknown type bounds. ${b}`);
    }
}

export function parsePrimitiveValType(b: number): PrimitiveValType {
    switch (b) {
        case 0x7f: return PrimitiveValType.Bool;
        case 0x7e: return PrimitiveValType.S8;
        case 0x7d: return PrimitiveValType.U8;
        case 0x7c: return PrimitiveValType.S16;
        case 0x7b: return PrimitiveValType.U16;
        case 0x7a: return PrimitiveValType.S32;
        case 0x79: return PrimitiveValType.U32;
        case 0x78: return PrimitiveValType.S64;
        case 0x77: return PrimitiveValType.U64;
        case 0x76: return PrimitiveValType.Float32;
        case 0x75: return PrimitiveValType.Float64;
        case 0x74: return PrimitiveValType.Char;
        case 0x73: return PrimitiveValType.String;
        default: throw new Error(`unknown primitive val type. ${b}`);
    }
}

export function parseAsComponentOuterAliasKind(k1: number, k2?: number): ComponentOuterAliasKind {
    switch (k1) {
        case 0x00:
            switch (k2) {
                case 0x10: return ComponentOuterAliasKind.CoreType;
                case 0x11: return ComponentOuterAliasKind.CoreModule;
                default:
                    throw new Error(`unknown outer alias kind 2. ${k2}`);
            }
        case 0x03: return ComponentOuterAliasKind.Type;
        case 0x04: return ComponentOuterAliasKind.Component;
        default:
            throw new Error(`unknown outer alias kind. ${k1}`);
    }
}

async function readIntegerAsync<R extends number>(
    source: Source,
    min: number,
    max: number,
    decoder: decoderType,
): Promise<R> {
    const src = await readRawIntegerAsync(source);
    const [r, consumed] = decoder(src);
    if (consumed !== src.length) {
        throw new Error(`invalid data. ${consumed} !== ${src.length}`);
    }
    if (r < min || r > max) {
        throw new Error(`overflow. ${bits}, ${r}`);
    }
    return Number(r) as R;
}
function readInteger<R extends number>(
    source: SyncSource,
    min: number,
    max: number,
    decoder: decoderType,
): R {
    const src = readRawInteger(source);
    const [r, consumed] = decoder(src);
    if (consumed !== src.length) {
        throw new Error(`invalid data. ${consumed} !== ${src.length}`);
    }
    if (r < min || r > max) {
        throw new Error(`overflow. ${bits}, ${r}`);
    }
    return Number(r) as R;
}

const bits = 32;
const maxLen = Math.ceil(bits / 7) | 0;

async function readRawIntegerAsync(
    source: Source,
): Promise<Uint8Array> {
    const buf: number[] = [];
    for (let i = 0; i < maxLen; i++) {
        const b = await source.read();
        buf.push(b);
        if ((b & 0x80) === 0) {
            break;
        }
    }
    return Uint8Array.from(buf);
}

function readRawInteger(
    source: SyncSource,
): Uint8Array {
    const buf: number[] = [];
    for (let i = 0; i < maxLen; i++) {
        const b = source.read();
        buf.push(b);
        if ((b & 0x80) === 0) {
            break;
        }
    }
    return Uint8Array.from(buf);
}

type decoderType = (src: Uint8Array, idx?: number) => [bigint, number]