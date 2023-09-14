/* eslint-disable no-console */
// adapted from https://github.com/yskszk63/stream-wasm-parser by yusuke suzuki under MIT License

import * as leb from '@thi.ng/leb128';
import { ExternalKind } from '../model/core';
import { SyncSource, Source } from '../utils/streaming';
import { ComponentExternalKind } from '../model/exports';
import { ComponentOuterAliasKind } from '../model/aliases';
import { ModelTag } from '../model/tags';
import { ComponentExternName, ComponentTypeRef, TypeBounds } from '../model/imports';
import { ComponentDefinedType, ComponentFuncResult, ComponentValType, InstanceTypeDeclaration, NamedValue, PrimitiveValType } from '../model/types';

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
export function readS32(source: SyncSource): number {
    return readInteger(
        source,
        0X8000_0000,
        0X7FFF_FFFF,
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
    const arr = [];
    for(let i=0; i<count; i++)
    {
        arr.push(readName(src));
    }
    return arr;
}

export function readName(source: SyncSource): string {
    const length = readU32(source);
    const content = source.readExact(length);
    console.log(`readName: length=${length}, contentStr=${textDecoder.decode(content)}`);
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
            throw new Error(`unknown component external kind. ${k1}`);
    }
}

export function readInstanceTypeDeclarations(src: SyncSource): InstanceTypeDeclaration[]
{
    const count = readU32(src); // 4
    console.log(`readInstanceTypeDeclarations: count=${count}`);
    const declarations: InstanceTypeDeclaration[] = [];
    for(let i = 0; i < count; i++)
    {
        const type = src.read(); // read_u8
        console.log(`readInstanceTypeDeclarations: type=${type}`);
        let declaration: any;
        switch (type)
        {
            case 0x00:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationCoreType,
                    value: undefined, // CoreType
                };
                break;
            }
            case 0x01: // i=0, i=2
            {
                declaration = {
                    tag: ModelTag.ComponentTypeDefined, // this
                    value: readComponentType(src),
                };
                break;
            }
            case 0x02:
            {
                declaration = {
                    tag: ModelTag.InstanceTypeDeclarationAlias,
                    value: undefined, // ComponentAlias
                };
                break;
            }
            case 0x04: // i=1, 2
            {
                declaration = { // ComponentExternName
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
    const type = src.read(); // read_u8
    switch (type)
    {
        case 0x00: return undefined;
        case 0x01: return readU32(src);
        default: throw new Error('Invalid leading byte in resource destructor');
    }
}

export function readComponentDefinedType(src: SyncSource, type: number): ComponentDefinedType{
    console.log(`readComponentDefinedType: type=${type}`);
    switch (type)
    {
        case 0x68: {
            return {
                tag: ModelTag.ComponentDefinedTypeBorrow,
                value: readU32(src),
            };
        }
        case 0x69: {
            return {
                tag: ModelTag.ComponentDefinedTypeOwn,
                value: readU32(src),
            };
        }
        case 0x6a: {
            return {
                tag: ModelTag.ComponentDefinedTypeResult,
                ok: readComponentValType(src),
                err: readComponentValType(src),
            };
        }
        case 0x6b: {
            return {
                tag: ModelTag.ComponentDefinedTypeOption,
                value: readComponentValType(src),
            };
        }
        case 0x6d: {
            return {
                tag: ModelTag.ComponentDefinedTypeEnum,
                members: readStringArray(src),
            };
        }
        case 0x6e: {
            return {
                tag: ModelTag.ComponentDefinedTypeFlags,
                members: readStringArray(src),
            };
        }
        case 0x6f: {
            const count = readU32(src);
            const members = [];
            for(let i=0; i<count; i++)
            {
                members.push(readComponentValType(src));
            }
            return {
                tag: ModelTag.ComponentDefinedTypeTuple,
                members: members,
            };
        }
        case 0x70: {
            return {
                tag: ModelTag.ComponentDefinedTypeList,
                value: readComponentValType(src),
            };
        }
        case 0x71: {
            const count = readU32(src);
            const variants = [];
            for(let i=0; i<count; i++)
            {
                variants.push({
                    name: readName(src),
                    ty: readComponentValType(src),
                    refines: readU32(src),
                });
            }
            return {
                tag: ModelTag.ComponentDefinedTypeVariant,
                variants: variants,
            };
        }
        case 0x72: {
            const count = readU32(src); // 3
            console.log(`readComponentDefinedType 114: count=${count}`);
            const members = [];
            for(let i=0; i<count; i++)
            {
                members.push({
                    name: readName(src),
                    type: readComponentValType(src),
                });
            }
            return {
                tag: ModelTag.ComponentDefinedTypeRecord,
                members: members,
            };
        }
        default:
            throw new Error('Unrecognized type in readComponentDefinedType.');
    }
}

export function readComponentType(src: SyncSource) : any
{
    const type = src.read(); // 66 (0x42)
    console.log(`readComponentType: type=${type}`);
    switch (type)
    {
        case 0x3F: {
            return {
                tag: ModelTag.ComponentTypeResource,
                rep: readU32(src),
                dtor: readDestructor(src)
            };
        }
        case 0x40: { // 64
            return {
                tag: ModelTag.ComponentTypeFunc,
                params: readNamedValues(src), // NamedValue[]
                results: readComponentFuncResult(src), // ComponentFuncResult
            };
        }
        case 0x41: {
            return {
                tag: ModelTag.ComponentTypeComponent,
                declarations: undefined, // ComponentTypeDeclaration[], read_iter
            };
        }
        case 0x42: {
            return {
                tag: ModelTag.ComponentTypeInstance,
                declarations:  readInstanceTypeDeclarations(src),
            };
        }
        default: {
            return {
                tag: ModelTag.ComponentTypeDefined,
                value: readComponentDefinedType(src, type),
            };
        }
    }
}

export function readComponentTypeRef(src: SyncSource): ComponentTypeRef {
    const type = readU32(src);
    console.log(`readComponentTypeRef: type=${type}`);
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
    const values = [];
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

export function readComponentFuncResult(src: SyncSource) : ComponentFuncResult
{
    const type = src.read();
    console.log(`readComponentFuncResult: type=${type}`);
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

export function readComponentValType(src: SyncSource): ComponentValType {
    const b = readU32(src);
    console.log(`readComponentValType: b=${b}`);
    if (0x73 <= b && b <= 0x7f)
    {
        return {
            tag: ModelTag.ComponentValTypePrimitive,
            value: parsePrimitiveValType(b),
        };
    }
    const val = readS32(src);
    console.log(`readComponentValType: val=${val}`);
    return {
        tag: ModelTag.ComponentValTypeType,
        value: val,
    };
}

export function readTypeBounds(src: SyncSource): TypeBounds {
    const b = readU32(src);
    console.log(`readTypeBounds: b=${b}`);
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
    console.log(`parsePrimitiveValType: b=${b}`);
    switch (b) {
        case 0x7f: return PrimitiveValType.Bool;
        case 0x7e: return PrimitiveValType.S8;
        case 0x7d: return PrimitiveValType.U8;
        case 0x7c: return PrimitiveValType.S16;
        case 0x7b: return PrimitiveValType.U16;
        case 0x7a: return PrimitiveValType.S32;
        case 0x79: return PrimitiveValType.U32; // 121
        case 0x78: return PrimitiveValType.S64; // 120
        case 0x77: return PrimitiveValType.U64;
        case 0x76: return PrimitiveValType.Float32;
        case 0x75: return PrimitiveValType.Float64;
        case 0x74: return PrimitiveValType.Char;
        case 0x73: return PrimitiveValType.String; // 115
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
    const buf = [];
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
    const buf = [];
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