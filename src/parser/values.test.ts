// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { initializeAsserts } from '../utils/assert';
initializeAsserts();

import * as leb from '@thi.ng/leb128';
import { newSource } from '../utils/streaming';
import { ModelTag } from '../model/tags';
import { PrimitiveValType } from '../model/types';
import {
    readU32, readName, readStringArray,
    parseAsExternalKind, readComponentExternalKind, parseAsComponentExternalKind,
    readCoreValType, readCoreTypeRef, readCoreImport,
    readModuleTypeDeclarations, readCoreType,
    readStartFunction,
    readComponentExternName, readDestructor,
    readComponentTypeDefined, readComponentType,
    readComponentTypeRef, readTypeBounds,
    readCanonicalFunction, readCanonicalOptions, readCanonicalOption,
    readComponentValType, readOptionalComponentValType, readOptionalRefinement,
    readNamedValues, readComponentFuncResult,
    parsePrimitiveValType, parseAsComponentOuterAliasKind,
    readComponentInstantiationArgs,
    readCoreInstance, readExports, readInstantiationArgs, readInstantiationArgKind,
    readInstanceTypeDeclarations,
} from './values';
import type { SyncSource } from '../utils/streaming';

// Helper: encode LEB128
function encU32(val: number): number[] {
    const buf = leb.encodeULEB128(val);
    return [...buf];
}

async function syncSrc(bytes: number[]): Promise<SyncSource> {
    const src = newSource(bytes);
    return src.subSyncSource(bytes.length);
}

describe('values.ts', () => {
    describe('readU32', () => {
        test('reads single-byte LEB128', async () => {
            const src = await syncSrc(encU32(42));
            expect(readU32(src)).toBe(42);
        });

        test('reads multi-byte LEB128', async () => {
            const src = await syncSrc(encU32(300));
            expect(readU32(src)).toBe(300);
        });

        test('reads max u32', async () => {
            const src = await syncSrc(encU32(0xFFFFFFFF));
            expect(readU32(src)).toBe(0xFFFFFFFF);
        });
    });

    describe('readName', () => {
        test('reads UTF-8 name', async () => {
            const name = 'hello';
            const encoded = new TextEncoder().encode(name);
            const src = await syncSrc([...encU32(encoded.length), ...encoded]);
            expect(readName(src)).toBe('hello');
        });

        test('reads empty name', async () => {
            const src = await syncSrc([...encU32(0)]);
            expect(readName(src)).toBe('');
        });
    });

    describe('readStringArray', () => {
        test('reads array of strings', async () => {
            const s1 = new TextEncoder().encode('foo');
            const s2 = new TextEncoder().encode('bar');
            const bytes = [
                ...encU32(2), // count
                ...encU32(s1.length), ...s1,
                ...encU32(s2.length), ...s2,
            ];
            const src = await syncSrc(bytes);
            expect(readStringArray(src)).toEqual(['foo', 'bar']);
        });
    });

    describe('parseAsExternalKind', () => {
        test('Func', () => expect(parseAsExternalKind(0x00)).toBe(0)); // ExternalKind.Func
        test('Table', () => expect(parseAsExternalKind(0x01)).toBe(1));
        test('Memory', () => expect(parseAsExternalKind(0x02)).toBe(2));
        test('Global', () => expect(parseAsExternalKind(0x03)).toBe(3));
        test('Tag', () => expect(parseAsExternalKind(0x04)).toBe(4));
        test('unknown throws', () => expect(() => parseAsExternalKind(0xFF)).toThrow('unknown external kind'));
    });

    describe('readComponentExternalKind', () => {
        test('Module (0x00, 0x11)', async () => {
            const src = await syncSrc([...encU32(0x00), ...encU32(0x11)]);
            expect(readComponentExternalKind(src)).toBe(0); // ComponentExternalKind.Module
        });

        test('Func (0x01)', async () => {
            const src = await syncSrc([...encU32(0x01)]);
            expect(readComponentExternalKind(src)).toBe(1); // ComponentExternalKind.Func
        });
    });

    describe('parseAsComponentExternalKind', () => {
        test('unknown k2 with k1=0x00 throws', async () => {
            expect(() => parseAsComponentExternalKind(0x00, 0xFF)).toThrow('unknown component external kind 2');
        });

        test('unknown k1 throws', async () => {
            expect(() => parseAsComponentExternalKind(0xFF)).toThrow('unknown component external kind');
        });

        test('all valid kinds', async () => {
            expect(parseAsComponentExternalKind(0x01)).toBeDefined(); // Func
            expect(parseAsComponentExternalKind(0x02)).toBeDefined(); // Value
            expect(parseAsComponentExternalKind(0x03)).toBeDefined(); // Type
            expect(parseAsComponentExternalKind(0x04)).toBeDefined(); // Component
            expect(parseAsComponentExternalKind(0x05)).toBeDefined(); // Instance
        });
    });

    describe('readCoreValType', () => {
        test('i32', async () => {
            const src = await syncSrc([0x7F]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeI32 });
        });

        test('i64', async () => {
            const src = await syncSrc([0x7E]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeI64 });
        });

        test('f32', async () => {
            const src = await syncSrc([0x7D]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeF32 });
        });

        test('f64', async () => {
            const src = await syncSrc([0x7C]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeF64 });
        });

        test('v128', async () => {
            const src = await syncSrc([0x7B]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeV128 });
        });

        test('funcref', async () => {
            const src = await syncSrc([0x70]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeRef, value: 0x70 });
        });

        test('externref', async () => {
            const src = await syncSrc([0x6F]);
            expect(readCoreValType(src)).toEqual({ tag: ModelTag.ValTypeRef, value: 0x6F });
        });

        test('unknown throws', async () => {
            const src = await syncSrc([0x00]);
            expect(() => readCoreValType(src)).toThrow('unknown core val type');
        });
    });

    describe('readCoreTypeRef', () => {
        test('func type ref', async () => {
            const src = await syncSrc([0x00, ...encU32(5)]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefFunc);
            expect((result as any).value).toBe(5);
        });

        test('table type ref', async () => {
            // kind=0x01, element_type, initial, hasMax=0
            const src = await syncSrc([0x01, 0x70, ...encU32(10), 0x00]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefTable);
            expect((result as any).initial).toBe(10);
            expect((result as any).maximum).toBeUndefined();
        });

        test('table type ref with max', async () => {
            const src = await syncSrc([0x01, 0x70, ...encU32(10), 0x01, ...encU32(20)]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefTable);
            expect((result as any).maximum).toBe(20);
        });

        test('memory type ref', async () => {
            // kind=0x02, flags=0x00, initial
            const src = await syncSrc([0x02, 0x00, ...encU32(1)]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefMemory);
            expect((result as any).initial).toBe(1);
            expect((result as any).memory64).toBe(false);
            expect((result as any).shared).toBe(false);
            expect((result as any).maximum).toBeUndefined();
        });

        test('memory type ref with max and flags', async () => {
            // flags: 0x07 = hasMax + shared + memory64
            const src = await syncSrc([0x02, 0x07, ...encU32(1), ...encU32(100)]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefMemory);
            expect((result as any).memory64).toBe(true);
            expect((result as any).shared).toBe(true);
            expect((result as any).maximum).toBe(100);
        });

        test('global type ref', async () => {
            // kind=0x03, content_type (i32=0x7F), mutable=0x01
            const src = await syncSrc([0x03, 0x7F, 0x01]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefGlobal);
            expect((result as any).mutable).toBe(true);
        });

        test('tag type ref', async () => {
            const src = await syncSrc([0x04, ...encU32(3)]);
            const result = readCoreTypeRef(src);
            expect(result.tag).toBe(ModelTag.TypeRefTag);
            expect((result as any).value).toBe(3);
        });

        test('unknown kind throws', async () => {
            const src = await syncSrc([0xFF]);
            expect(() => readCoreTypeRef(src)).toThrow('unknown core type ref kind');
        });
    });

    describe('readCoreImport', () => {
        test('reads module, name, and type ref', async () => {
            const mod = new TextEncoder().encode('env');
            const name = new TextEncoder().encode('memory');
            const src = await syncSrc([
                ...encU32(mod.length), ...mod,
                ...encU32(name.length), ...name,
                0x02, 0x00, ...encU32(1), // memory type, flags=0, initial=1
            ]);
            const result = readCoreImport(src);
            expect(result.module).toBe('env');
            expect(result.name).toBe('memory');
            expect(result.ty.tag).toBe(ModelTag.TypeRefMemory);
        });
    });

    describe('readCoreType', () => {
        test('core func type', async () => {
            // tag=0x60, 1 param (i32), 1 result (i64)
            const src = await syncSrc([0x60, ...encU32(1), 0x7F, ...encU32(1), 0x7E]);
            const result = readCoreType(src);
            expect(result.tag).toBe(ModelTag.CoreTypeFunc);
        });

        test('core module type', async () => {
            // tag=0x50, 0 declarations
            const src = await syncSrc([0x50, ...encU32(0)]);
            const result = readCoreType(src);
            expect(result.tag).toBe(ModelTag.CoreTypeModule);
        });

        test('unknown tag throws', async () => {
            const src = await syncSrc([0x00]);
            expect(() => readCoreType(src)).toThrow('unknown core type tag');
        });
    });

    describe('readModuleTypeDeclarations', () => {
        test('import declaration', async () => {
            const mod = new TextEncoder().encode('env');
            const name = new TextEncoder().encode('f');
            const src = await syncSrc([
                ...encU32(1), // count
                0x00, // import kind
                ...encU32(mod.length), ...mod,
                ...encU32(name.length), ...name,
                0x00, ...encU32(0), // TypeRefFunc index 0
            ]);
            const result = readModuleTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.ModuleTypeDeclarationImport);
        });

        test('type declaration', async () => {
            // kind=0x01, funcTag=0x60, 0 params, 0 results
            const src = await syncSrc([
                ...encU32(1), 0x01, 0x60, ...encU32(0), ...encU32(0),
            ]);
            const result = readModuleTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.ModuleTypeDeclarationType);
        });

        test('type declaration with non-0x60 tag throws', async () => {
            const src = await syncSrc([...encU32(1), 0x01, 0x00]);
            expect(() => readModuleTypeDeclarations(src)).toThrow('expected core func type 0x60');
        });

        test('outer alias declaration', async () => {
            // kind=0x02, aliasSort=0x10, count=0, index=0
            const src = await syncSrc([...encU32(1), 0x02, 0x10, ...encU32(0), ...encU32(0)]);
            const result = readModuleTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.ModuleTypeDeclarationOuterAlias);
        });

        test('outer alias with wrong sort throws', async () => {
            const src = await syncSrc([...encU32(1), 0x02, 0x00, ...encU32(0), ...encU32(0)]);
            expect(() => readModuleTypeDeclarations(src)).toThrow('expected core type sort 0x10');
        });

        test('export declaration', async () => {
            const name = new TextEncoder().encode('e');
            const src = await syncSrc([
                ...encU32(1), 0x03,
                ...encU32(name.length), ...name,
                0x00, ...encU32(0), // TypeRefFunc index 0
            ]);
            const result = readModuleTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.ModuleTypeDeclarationExport);
        });

        test('unknown kind throws', async () => {
            const src = await syncSrc([...encU32(1), 0xFF]);
            expect(() => readModuleTypeDeclarations(src)).toThrow('unknown module type declaration kind');
        });
    });

    describe('readStartFunction', () => {
        test('reads start function with args', async () => {
            const src = await syncSrc([
                ...encU32(5), // func_index
                ...encU32(2), // arg count
                ...encU32(10), ...encU32(20), // args
                ...encU32(1), // results
            ]);
            const result = readStartFunction(src);
            expect(result.tag).toBe(ModelTag.ComponentStartFunction);
            expect(result.func_index).toBe(5);
            expect(result.arguments).toEqual([10, 20]);
            expect(result.results).toBe(1);
        });
    });

    describe('readComponentExternName', () => {
        test('kebab name', async () => {
            const name = new TextEncoder().encode('my-func');
            const src = await syncSrc([...encU32(0x00), ...encU32(name.length), ...name]);
            const result = readComponentExternName(src);
            expect(result.tag).toBe(ModelTag.ComponentExternNameKebab);
            expect(result.name).toBe('my-func');
        });

        test('interface name', async () => {
            const name = new TextEncoder().encode('wasi:io/streams');
            const src = await syncSrc([...encU32(0x01), ...encU32(name.length), ...name]);
            const result = readComponentExternName(src);
            expect(result.tag).toBe(ModelTag.ComponentExternNameInterface);
        });

        test('unknown type throws', async () => {
            const src = await syncSrc([...encU32(0x99)]);
            expect(() => readComponentExternName(src)).toThrow('unknown ComponentExternName');
        });
    });

    describe('readDestructor', () => {
        test('no destructor', async () => {
            const src = await syncSrc([0x00]);
            expect(readDestructor(src)).toBeUndefined();
        });

        test('with destructor', async () => {
            const src = await syncSrc([0x01, ...encU32(3)]);
            expect(readDestructor(src)).toBe(3);
        });

        test('invalid throws', async () => {
            const src = await syncSrc([0x02]);
            expect(() => readDestructor(src)).toThrow('Invalid leading byte');
        });
    });

    describe('readComponentType', () => {
        test('resource type', async () => {
            const src = await syncSrc([0x3F, ...encU32(0), 0x00]); // rep=0, no dtor
            const result = readComponentType(src);
            expect(result.tag).toBe(ModelTag.ComponentTypeResource);
        });

        test('func type', async () => {
            // 0x40, 0 params, result type unnamed with primitive u32
            const src = await syncSrc([0x40, ...encU32(0), 0x00, 0x7A]);
            const result = readComponentType(src);
            expect(result.tag).toBe(ModelTag.ComponentTypeFunc);
        });

        test('component type', async () => {
            const src = await syncSrc([0x41]);
            const result = readComponentType(src);
            expect(result.tag).toBe(ModelTag.ComponentTypeComponent);
        });

        test('instance type', async () => {
            const src = await syncSrc([0x42, ...encU32(0)]); // 0 declarations
            const result = readComponentType(src);
            expect(result.tag).toBe(ModelTag.ComponentTypeInstance);
        });

        test('defined type (record)', async () => {
            // 0x72, 0 members
            const src = await syncSrc([0x72, ...encU32(0)]);
            const result = readComponentType(src);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
        });
    });

    describe('readComponentValType', () => {
        test('primitive bool', async () => {
            const src = await syncSrc([0x7F]);
            const result = readComponentValType(src);
            expect(result.tag).toBe(ModelTag.ComponentValTypePrimitive);
            expect((result as any).value).toBe(PrimitiveValType.Bool);
        });

        test('primitive string', async () => {
            const src = await syncSrc([0x73]);
            const result = readComponentValType(src);
            expect(result.tag).toBe(ModelTag.ComponentValTypePrimitive);
            expect((result as any).value).toBe(PrimitiveValType.String);
        });

        test('type index single-byte', async () => {
            const src = await syncSrc([0x05]);
            const result = readComponentValType(src);
            expect(result.tag).toBe(ModelTag.ComponentValTypeType);
            expect((result as any).value).toBe(5);
        });

        test('type index multi-byte', async () => {
            // 200 = 0xC8 → LEB128: 0xC8 0x01
            const src = await syncSrc([0xC8, 0x01]);
            const result = readComponentValType(src);
            expect(result.tag).toBe(ModelTag.ComponentValTypeType);
            expect((result as any).value).toBe(200);
        });
    });

    describe('readOptionalComponentValType', () => {
        test('absent (0x00)', async () => {
            const src = await syncSrc([0x00]);
            expect(readOptionalComponentValType(src)).toBeUndefined();
        });

        test('present (0x01)', async () => {
            const src = await syncSrc([0x01, 0x7A]); // u32
            const result = readOptionalComponentValType(src);
            expect(result).toBeDefined();
            expect(result!.tag).toBe(ModelTag.ComponentValTypePrimitive);
        });

        test('invalid flag throws', async () => {
            const src = await syncSrc([0x02]);
            expect(() => readOptionalComponentValType(src)).toThrow('invalid optional valtype flag');
        });
    });

    describe('readOptionalRefinement', () => {
        test('absent', async () => {
            const src = await syncSrc([0x00]);
            expect(readOptionalRefinement(src)).toBeUndefined();
        });

        test('present', async () => {
            const src = await syncSrc([0x01, ...encU32(42)]);
            expect(readOptionalRefinement(src)).toBe(42);
        });

        test('invalid flag throws', async () => {
            const src = await syncSrc([0x02]);
            expect(() => readOptionalRefinement(src)).toThrow('invalid optional refinement flag');
        });
    });

    describe('readTypeBounds', () => {
        test('eq bounds', async () => {
            const src = await syncSrc([...encU32(0x00), ...encU32(5)]);
            const result = readTypeBounds(src);
            expect(result.tag).toBe(ModelTag.TypeBoundsEq);
            expect((result as any).value).toBe(5);
        });

        test('sub resource bounds', async () => {
            const src = await syncSrc([...encU32(0x01)]);
            const result = readTypeBounds(src);
            expect(result.tag).toBe(ModelTag.TypeBoundsSubResource);
        });

        test('unknown throws', async () => {
            const src = await syncSrc([...encU32(0xFF)]);
            expect(() => readTypeBounds(src)).toThrow('unknown type bounds');
        });
    });

    describe('readCanonicalOption', () => {
        test('UTF8', async () => {
            const src = await syncSrc([0x00]);
            expect(readCanonicalOption(src).tag).toBe(ModelTag.CanonicalOptionUTF8);
        });

        test('UTF16', async () => {
            const src = await syncSrc([0x01]);
            expect(readCanonicalOption(src).tag).toBe(ModelTag.CanonicalOptionUTF16);
        });

        test('CompactUTF16', async () => {
            const src = await syncSrc([0x02]);
            expect(readCanonicalOption(src).tag).toBe(ModelTag.CanonicalOptionCompactUTF16);
        });

        test('Memory', async () => {
            const src = await syncSrc([0x03, ...encU32(0)]);
            const result = readCanonicalOption(src);
            expect(result.tag).toBe(ModelTag.CanonicalOptionMemory);
            expect((result as any).value).toBe(0);
        });

        test('Realloc', async () => {
            const src = await syncSrc([0x04, ...encU32(1)]);
            const result = readCanonicalOption(src);
            expect(result.tag).toBe(ModelTag.CanonicalOptionRealloc);
        });

        test('PostReturn', async () => {
            const src = await syncSrc([0x05, ...encU32(2)]);
            const result = readCanonicalOption(src);
            expect(result.tag).toBe(ModelTag.CanonicalOptionPostReturn);
        });

        test('unknown throws', async () => {
            const src = await syncSrc([0xFF]);
            expect(() => readCanonicalOption(src)).toThrow('Unrecognized type in readCanonicalOption');
        });
    });

    describe('readCanonicalOptions', () => {
        test('reads array of options', async () => {
            const src = await syncSrc([
                ...encU32(2), // 2 options
                0x00, // UTF8
                0x03, ...encU32(0), // Memory 0
            ]);
            const result = readCanonicalOptions(src);
            expect(result).toHaveLength(2);
        });
    });

    describe('readCanonicalFunction', () => {
        test('lift', async () => {
            const src = await syncSrc([
                0x00, 0x00, // lift, control=0x00
                ...encU32(0), // core_func_index
                ...encU32(0), // 0 options
                ...encU32(0), // type_index
            ]);
            const result = readCanonicalFunction(src);
            expect(result.tag).toBe(ModelTag.CanonicalFunctionLift);
        });

        test('lower', async () => {
            const src = await syncSrc([
                0x01, 0x00, // lower, control=0x00
                ...encU32(0), // func_index
                ...encU32(0), // 0 options
            ]);
            const result = readCanonicalFunction(src);
            expect(result.tag).toBe(ModelTag.CanonicalFunctionLower);
        });

        test('resource.new', async () => {
            const src = await syncSrc([0x02, ...encU32(1)]);
            const result = readCanonicalFunction(src);
            expect(result.tag).toBe(ModelTag.CanonicalFunctionResourceNew);
        });

        test('resource.drop', async () => {
            const src = await syncSrc([0x03, ...encU32(2)]);
            const result = readCanonicalFunction(src);
            expect(result.tag).toBe(ModelTag.CanonicalFunctionResourceDrop);
        });

        test('resource.rep', async () => {
            const src = await syncSrc([0x04, ...encU32(3)]);
            const result = readCanonicalFunction(src);
            expect(result.tag).toBe(ModelTag.CanonicalFunctionResourceRep);
        });

        test('unknown type throws', async () => {
            const src = await syncSrc([0xFF]);
            expect(() => readCanonicalFunction(src)).toThrow('Unrecognized type in readCanonicalFunction');
        });

        test('lift with wrong control byte throws', async () => {
            const src = await syncSrc([0x00, 0x01]);
            expect(() => readCanonicalFunction(src)).toThrow('Unrecognized byte for CanonicalFunctionLift');
        });

        test('lower with wrong control byte throws', async () => {
            const src = await syncSrc([0x01, 0x02]);
            expect(() => readCanonicalFunction(src)).toThrow('Unrecognized byte for CanonicalFunctionLower');
        });
    });

    describe('readComponentTypeDefined', () => {
        test('primitive', async () => {
            const src = await syncSrc([]);
            const result = readComponentTypeDefined(src, 0x7A); // u32
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedPrimitive);
        });

        test('borrow', async () => {
            const src = await syncSrc([...encU32(0)]);
            const result = readComponentTypeDefined(src, 0x68);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedBorrow);
        });

        test('own', async () => {
            const src = await syncSrc([...encU32(0)]);
            const result = readComponentTypeDefined(src, 0x69);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedOwn);
        });

        test('result', async () => {
            const src = await syncSrc([0x01, 0x7A, 0x00]); // ok=u32, err=none
            const result = readComponentTypeDefined(src, 0x6a);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedResult);
        });

        test('option', async () => {
            const src = await syncSrc([0x7A]); // u32
            const result = readComponentTypeDefined(src, 0x6b);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedOption);
        });

        test('enum', async () => {
            const s = new TextEncoder().encode('a');
            const src = await syncSrc([...encU32(1), ...encU32(s.length), ...s]);
            const result = readComponentTypeDefined(src, 0x6d);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedEnum);
        });

        test('flags', async () => {
            const s = new TextEncoder().encode('f');
            const src = await syncSrc([...encU32(1), ...encU32(s.length), ...s]);
            const result = readComponentTypeDefined(src, 0x6e);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedFlags);
        });

        test('tuple', async () => {
            const src = await syncSrc([...encU32(1), 0x7A]); // 1 member, u32
            const result = readComponentTypeDefined(src, 0x6f);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedTuple);
        });

        test('list', async () => {
            const src = await syncSrc([0x7A]); // u32
            const result = readComponentTypeDefined(src, 0x70);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedList);
        });

        test('variant', async () => {
            const name = new TextEncoder().encode('v');
            const src = await syncSrc([
                ...encU32(1), // 1 variant case
                ...encU32(name.length), ...name,
                0x01, 0x7A, // has type: u32
                0x00, // no refines
            ]);
            const result = readComponentTypeDefined(src, 0x71);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedVariant);
        });

        test('record', async () => {
            const name = new TextEncoder().encode('x');
            const src = await syncSrc([
                ...encU32(1),
                ...encU32(name.length), ...name,
                0x7A, // u32
            ]);
            const result = readComponentTypeDefined(src, 0x72);
            expect(result.tag).toBe(ModelTag.ComponentTypeDefinedRecord);
        });

        test('unknown throws', async () => {
            const src = await syncSrc([]);
            expect(() => readComponentTypeDefined(src, 0x00)).toThrow('Unrecognized type in readComponentTypeDefined');
        });
    });

    describe('readComponentTypeRef', () => {
        test('module ref', async () => {
            const src = await syncSrc([...encU32(0x00), ...encU32(0)]);
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefModule);
        });

        test('func ref', async () => {
            const src = await syncSrc([...encU32(0x01), ...encU32(0)]);
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefFunc);
        });

        test('value ref', async () => {
            const src = await syncSrc([...encU32(0x02), 0x7A]); // value with u32
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefValue);
        });

        test('type ref', async () => {
            const src = await syncSrc([...encU32(0x03), ...encU32(0x00), ...encU32(0)]); // TypeBoundsEq(0)
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefType);
        });

        test('component ref', async () => {
            const src = await syncSrc([...encU32(0x04), ...encU32(0)]);
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefComponent);
        });

        test('instance ref', async () => {
            const src = await syncSrc([...encU32(0x05), ...encU32(0)]);
            expect(readComponentTypeRef(src).tag).toBe(ModelTag.ComponentTypeRefInstance);
        });

        test('unknown throws', async () => {
            const src = await syncSrc([...encU32(0xFF)]);
            expect(() => readComponentTypeRef(src)).toThrow('unknown ComponentExternName');
        });
    });

    describe('readNamedValues', () => {
        test('reads named values', async () => {
            const name = new TextEncoder().encode('x');
            const src = await syncSrc([
                ...encU32(1), // count
                ...encU32(name.length), ...name,
                0x7A, // u32
            ]);
            const result = readNamedValues(src);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('x');
        });
    });

    describe('readComponentFuncResult', () => {
        test('unnamed result', async () => {
            const src = await syncSrc([0x00, 0x7A]); // unnamed, u32
            const result = readComponentFuncResult(src);
            expect(result!.tag).toBe(ModelTag.ComponentFuncResultUnnamed);
        });

        test('named result', async () => {
            const name = new TextEncoder().encode('r');
            const src = await syncSrc([
                0x01, // named
                ...encU32(1), // count
                ...encU32(name.length), ...name,
                0x7A, // u32
            ]);
            const result = readComponentFuncResult(src);
            expect(result!.tag).toBe(ModelTag.ComponentFuncResultNamed);
        });

        test('unknown throws', async () => {
            const src = await syncSrc([0x02]);
            expect(() => readComponentFuncResult(src)).toThrow('unknown ComponentFuncResult type');
        });
    });

    describe('parsePrimitiveValType', () => {
        test('all primitives', async () => {
            expect(parsePrimitiveValType(0x7f)).toBe(PrimitiveValType.Bool);
            expect(parsePrimitiveValType(0x7e)).toBe(PrimitiveValType.S8);
            expect(parsePrimitiveValType(0x7d)).toBe(PrimitiveValType.U8);
            expect(parsePrimitiveValType(0x7c)).toBe(PrimitiveValType.S16);
            expect(parsePrimitiveValType(0x7b)).toBe(PrimitiveValType.U16);
            expect(parsePrimitiveValType(0x7a)).toBe(PrimitiveValType.S32);
            expect(parsePrimitiveValType(0x79)).toBe(PrimitiveValType.U32);
            expect(parsePrimitiveValType(0x78)).toBe(PrimitiveValType.S64);
            expect(parsePrimitiveValType(0x77)).toBe(PrimitiveValType.U64);
            expect(parsePrimitiveValType(0x76)).toBe(PrimitiveValType.Float32);
            expect(parsePrimitiveValType(0x75)).toBe(PrimitiveValType.Float64);
            expect(parsePrimitiveValType(0x74)).toBe(PrimitiveValType.Char);
            expect(parsePrimitiveValType(0x73)).toBe(PrimitiveValType.String);
        });

        test('unknown throws', async () => {
            expect(() => parsePrimitiveValType(0x00)).toThrow('unknown primitive val type');
        });
    });

    describe('parseAsComponentOuterAliasKind', () => {
        test('core type', async () => {
            expect(parseAsComponentOuterAliasKind(0x00, 0x10)).toBeDefined();
        });

        test('core module', async () => {
            expect(parseAsComponentOuterAliasKind(0x00, 0x11)).toBeDefined();
        });

        test('type', async () => {
            expect(parseAsComponentOuterAliasKind(0x03)).toBeDefined();
        });

        test('component', async () => {
            expect(parseAsComponentOuterAliasKind(0x04)).toBeDefined();
        });

        test('unknown k2 with k1=0x00 throws', async () => {
            expect(() => parseAsComponentOuterAliasKind(0x00, 0xFF)).toThrow('unknown outer alias kind 2');
        });

        test('unknown k1 throws', async () => {
            expect(() => parseAsComponentOuterAliasKind(0xFF)).toThrow('unknown outer alias kind');
        });
    });

    describe('readCoreInstance', () => {
        test('instantiate with args', async () => {
            const name = new TextEncoder().encode('a');
            const src = await syncSrc([
                0x00, // instantiate
                ...encU32(0), // module_index
                ...encU32(1), // 1 arg
                ...encU32(name.length), ...name,
                0x12, // instance kind
                ...encU32(0), // index
            ]);
            const result = readCoreInstance(src);
            expect(result.tag).toBe(ModelTag.CoreInstanceInstantiate);
        });

        test('from exports', async () => {
            const name = new TextEncoder().encode('e');
            const src = await syncSrc([
                0x01,
                ...encU32(1), // 1 export
                ...encU32(name.length), ...name,
                ...encU32(0x00), // ExternalKind.Func
                ...encU32(0),
            ]);
            const result = readCoreInstance(src);
            expect(result.tag).toBe(ModelTag.CoreInstanceFromExports);
        });

        test('unknown type throws', async () => {
            const src = await syncSrc([0x02]);
            expect(() => readCoreInstance(src)).toThrow('Unrecognized type in readCoreInstance');
        });
    });

    describe('readInstantiationArgKind', () => {
        test('instance kind', async () => {
            const src = await syncSrc([0x12]);
            expect(readInstantiationArgKind(src)).toBeDefined();
        });

        test('unknown throws', async () => {
            const src = await syncSrc([0x00]);
            expect(() => readInstantiationArgKind(src)).toThrow('Unrecognized kind in readInstantiationArgKind');
        });
    });

    describe('readInstanceTypeDeclarations', () => {
        test('core type declaration', async () => {
            // count=1, type=0x00 (core type), tag=0x60 (func), 0 params, 0 results
            const src = await syncSrc([
                ...encU32(1), 0x00, 0x60, ...encU32(0), ...encU32(0),
            ]);
            const result = readInstanceTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.InstanceTypeDeclarationCoreType);
        });

        test('type declaration', async () => {
            // count=1, type=0x01, record with 0 members
            const src = await syncSrc([
                ...encU32(1), 0x01, 0x72, ...encU32(0),
            ]);
            const result = readInstanceTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.InstanceTypeDeclarationType);
        });

        test('export declaration', async () => {
            const name = new TextEncoder().encode('f');
            const src = await syncSrc([
                ...encU32(1), 0x04,
                ...encU32(0x00), ...encU32(name.length), ...name, // kebab name
                ...encU32(0x01), ...encU32(0), // ComponentTypeRefFunc index 0
            ]);
            const result = readInstanceTypeDeclarations(src);
            expect(result).toHaveLength(1);
            expect(result[0].tag).toBe(ModelTag.InstanceTypeDeclarationExport);
        });

        test('unknown type throws', async () => {
            const src = await syncSrc([...encU32(1), 0xFF]);
            expect(() => readInstanceTypeDeclarations(src)).toThrow('unknown instance type declaration kind');
        });
    });
});
