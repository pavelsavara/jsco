// adapted from https://github.com/yskszk63/stream-wasm-parser by yusuke suzuki under MIT License

import * as leb from '@thi.ng/leb128';
import { Export, ExternalKind } from '../model/core';
import { SyncSource, Source } from '../utils/streaming';
import { ComponentExternalKind } from '../model/exports';
import { ComponentOuterAliasKind } from '../model/aliases';
import { ModelTag } from '../model/tags';
import { ComponentExternName, ComponentTypeRef, TypeBounds } from '../model/imports';
import { ComponentFuncResult, ComponentTypeDefined, ComponentValType, InstanceTypeDeclaration, NamedValue, PrimitiveValType, VariantCase } from '../model/types';
import { CanonicalFunction, CanonicalOption } from '../model/canonicals';
import { ComponentInstantiationArg, CoreInstance, InstantiationArg, InstantiationArgKind } from '../model/instances';

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

export async function readNameAsync(source: SyncSource): Promise<string> {
    const length = await readU32(source);
    const content = await source.readExact(length);
    return textDecoder.decode(content) as any;
}

export function readStringArray(src: SyncSource): string[] {

    const count = readU32(src);
    const arr: string[] = [];
    for(let i=0; i<count; i++)
    {
        arr.push(readName(src));
    }
    return arr;
}

export function readName(source: SyncSource): string {
    const length = readU32(source);
    const content = source.readExact(length);
    return textDecoder.decode(content) as any;
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

export function readInstanceTypeDeclarations(src: SyncSource): InstanceTypeDeclaration[]
{
    const count = readU32(src);
    const declarations: InstanceTypeDeclaration[] = [];
    for(let i = 0; i < count; i++)
    {
        const type = src.read();
        let declaration: any;
        switch (type)
        {
            case 0x00:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationCoreType,
                    value: undefined,
                };
                break;
            }
            case 0x01:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationType,
                    value: readComponentType(src),
                };
                break;
            }
            case 0x02:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationAlias,
                    value: undefined,
                };
                break;
            }
            case 0x04:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationExport,
                    name: readComponentExternName(src),
                    ty: readComponentTypeRef(src)
                };
                break;
            }
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

export function readDestructor(src: SyncSource) : number | undefined
{
    const type = src.read();
    switch (type)
    {
        case 0x00: return undefined;
        case 0x01: return readU32(src);
        default: throw new Error('Invalid leading byte in resource destructor');
    }
}

export function readComponentTypeDefined(src: SyncSource, type: number): ComponentTypeDefined{
    switch (type)
    {
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
        case 0x6a: {
            return {
                tag: ModelTag.ComponentTypeDefinedResult,
                ok: readComponentValType(src),
                err: readComponentValType(src),
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
            for(let i=0; i<count; i++)
            {
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
            for(let i=0; i<count; i++)
            {
                variants.push({
                    name: readName(src),
                    ty: readComponentValType(src),
                    refines: readU32(src),
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
            for(let i=0; i<count; i++)
            {
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
    for(let i=0; i<count; i++)
    {
        args.push({
            name: readName(src),
            kind: readComponentExternalKind(src),
            index: readU32(src)
        });
    }
    return args;
}

export function readCoreInstance(src: SyncSource): CoreInstance{
    const type = src.read();
    switch (type)
    {
        case 0x00: {
            const index = readU32(src);
            return {
                tag: ModelTag.CoreInstanceInstantiate,
                module_index: index,
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

export function readExports(src: SyncSource): Export[]{
    const count = readU32(src);
    const exports: Export[] = [];
    for(let i=0; i<count; i++)
    {
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
    for(let i=0; i<count; i++){
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

export function readCanonicalFunction(src: SyncSource): CanonicalFunction{
    const type = src.read();
    switch (type)
    {
        case 0x00: {
            const controlByte = src.read();
            if (controlByte != 0x00)
                throw new Error(`Unrecognized byte for CanonicalFunctionLift in readCanonicalFunction: ${controlByte}`);
            return {
                tag: ModelTag.CanonicalFunctionLift,
                core_func_index: readU32(src),
                options: readCanonicalOptions(src),
                type_index: readU32(src),
            };
        }
        case 0x01: {
            const controlByte = src.read();
            if (controlByte != 0x00)
                throw new Error(`Unrecognized byte for CanonicalFunctionLower in readCanonicalFunction: ${controlByte}`);
            return {
                tag: ModelTag.CanonicalFunctionLower, // here
                func_index: readU32(src),
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
        default: throw new Error(`Unrecognized type in readCanonicalFunction: ${type}`);
    }
}

export function readCanonicalOptions(src: SyncSource): CanonicalOption[]{

    const optionsCount = readU32(src);
    const options: CanonicalOption[] = [];
    for (let i=0; i<optionsCount; i++)
    {
        options.push(readCanonicalOption(src));
    }
    return options;
}

export function readCanonicalOption(src: SyncSource): CanonicalOption{
    const type = src.read();
    switch (type)
    {
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
        default: throw new Error(`Unrecognized type in readCanonicalOption = ${type}.`);
    }
}

export function readComponentType(src: SyncSource) : any
{
    const type = src.read();
    switch (type)
    {
        case 0x3F: {
            return {
                tag: ModelTag.ComponentTypeResource,
                rep: readU32(src),
                dtor: readDestructor(src)
            };
        }
        case 0x40: {
            return {
                tag: ModelTag.ComponentTypeFunc,
                params: readNamedValues(src),
                results: readComponentFuncResult(src),
            };
        }
        case 0x41: {
            return {
                tag: ModelTag.ComponentTypeComponent,
                declarations: undefined,
            };
        }
        case 0x42: {
            return {
                tag: ModelTag.ComponentTypeInstance,
                declarations:  readInstanceTypeDeclarations(src),
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
            tag: ModelTag.ComponentTypeRefInstance,
            value: readU32(src),
        };
        case 0x05: return {
            tag: ModelTag.ComponentTypeRefComponent,
            value: readU32(src),
        };
        default:
            throw new Error(`unknown ComponentExternName. ${type}`);
    }
}

export function readNamedValues(src: SyncSource): NamedValue[]{
    const values: NamedValue[] = [];
    const count = readU32(src);
    for(let i=0; i<count; i++)
    {
        values.push({
            name: readName(src),
            type: readComponentValType(src),
        });
    }
    return values;
}

export function readComponentFuncResult(src: SyncSource) : ComponentFuncResult | undefined
{
    try
    {
        const type = src.read();
        switch(type)
        {
            case 0x00:
                return {
                    tag: ModelTag.ComponentFuncResultUnnamed,
                    value: readComponentValType(src),
                };
            case 0x01:
                return {
                    tag: ModelTag.ComponentFuncResultNamed,
                    value: readNamedValues(src),
                };
            default: throw new Error(`unknown ComponentFuncResult type: ${type}`);
        }
    }
    catch
    {
        return undefined;
    }
}

export function readComponentValType(src: SyncSource): ComponentValType {
    const b = src.read();
    if (0x73 <= b && b <= 0x7f)
    {
        return {
            tag: ModelTag.ComponentValTypePrimitive,
            value: parsePrimitiveValType(b),
        };
    }
    const val = readU32(src);
    return {
        tag: ModelTag.ComponentValTypeType,
        value: val,
    };
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