// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { parse, WIT_MAGIC, WIT_VERSION, WIT_LAYER } from './index';

// Component model binary preamble
const PREAMBLE = [...WIT_MAGIC, ...WIT_VERSION, ...WIT_LAYER];

/**
 * Build a minimal component binary with one section.
 * @param sectionId - section type byte (0–11)
 * @param payload - raw section payload bytes (length is auto-prefixed as LEB128 u32)
 */
function componentWithSection(sectionId: number, payload: number[]): Uint8Array {
    return new Uint8Array([...PREAMBLE, sectionId, ...leb128U32(payload.length), ...payload]);
}

/** Encode a u32 value as LEB128 bytes. */
function leb128U32(value: number): number[] {
    const result: number[] = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        result.push(byte);
    } while (value !== 0);
    return result;
}

/** Encode a name string as length-prefixed UTF-8 (the component-model name encoding). */
function encodeName(name: string): number[] {
    const utf8 = new TextEncoder().encode(name);
    return [...leb128U32(utf8.length), ...utf8];
}

/** Build a ComponentExternName (kebab-case, discriminant 0x00). */
function externNameKebab(name: string): number[] {
    return [0x00, ...encodeName(name)];
}

describe('parser security', () => {
    // ─── Preamble validation ───

    describe('preamble', () => {
        test('empty input', async () => {
            await expect(parse(new Uint8Array([]))).rejects.toThrow('unexpected EOF');
        });

        test('truncated magic (3 bytes)', async () => {
            await expect(parse(new Uint8Array([0x00, 0x61, 0x73]))).rejects.toThrow('unexpected EOF');
        });

        test('missing layer bytes', async () => {
            // only magic + version (6 bytes), missing layer
            await expect(parse(new Uint8Array([...WIT_MAGIC, ...WIT_VERSION]))).rejects.toThrow('unexpected EOF');
        });

        test('wrong magic', async () => {
            const wasm = new Uint8Array([0x00, 0x00, 0x00, 0x00, ...WIT_VERSION, ...WIT_LAYER]);
            await expect(parse(wasm)).rejects.toThrow('unexpected magic, version or layer.');
        });

        test('wrong version', async () => {
            const wasm = new Uint8Array([...WIT_MAGIC, 0xFF, 0x00, ...WIT_LAYER]);
            await expect(parse(wasm)).rejects.toThrow('unexpected magic, version or layer.');
        });

        test('wrong layer', async () => {
            const wasm = new Uint8Array([...WIT_MAGIC, ...WIT_VERSION, 0x00, 0x00]);
            await expect(parse(wasm)).rejects.toThrow('unexpected magic, version or layer.');
        });

        test('core wasm module header (layer 0)', async () => {
            // layer = [0x00, 0x00] instead of [0x01, 0x00]
            const wasm = new Uint8Array([...WIT_MAGIC, 0x01, 0x00, 0x00, 0x00]);
            await expect(parse(wasm)).rejects.toThrow('unexpected magic, version or layer.');
        });
    });

    // ─── Unknown / invalid section IDs ───

    describe('unknown section types', () => {
        test('section ID 12 (out of range)', async () => {
            const wasm = componentWithSection(12, []);
            await expect(parse(wasm)).rejects.toThrow('unknown section: 12');
        });

        test('section ID 0xFF', async () => {
            const wasm = componentWithSection(0xFF, []);
            await expect(parse(wasm)).rejects.toThrow('unknown section: 255');
        });

        test('section ID 42', async () => {
            const wasm = componentWithSection(42, []);
            await expect(parse(wasm)).rejects.toThrow('unknown section: 42');
        });
    });

    // ─── Section size mismatches ───

    describe('section size', () => {
        test('declared size larger than available data', async () => {
            // Type section (7) with declared size 100 but only 2 bytes of payload
            const wasm = new Uint8Array([...PREAMBLE, 7, ...leb128U32(100), 0x01, 0x73]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('declared size smaller than actual content', async () => {
            // Type section (7): count=1, one primitive type (0x73) - but section size = 1 (only covers count)
            const wasm = new Uint8Array([...PREAMBLE, 7, ...leb128U32(1), 0x01, 0x73]);
            // size=1 means only 1 byte is read into SyncArraySource, so reading the type will EOF
            await expect(parse(wasm)).rejects.toThrow();
        });

        test('zero-length section for type section', async () => {
            // Type section (7) with 0 bytes of payload - can't even read the count
            const wasm = componentWithSection(7, []);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('extra bytes after section content', async () => {
            // Type section with count=0 + an extra trailing byte
            const wasm = componentWithSection(7, [0x00, 0xFF]);
            await expect(parse(wasm)).rejects.toThrow('invalid size after reading section 7');
        });
    });

    // ─── Truncated section payloads ───

    describe('truncated sections', () => {
        test('import section: truncated after count', async () => {
            // Import section (10): count=1 but no import data
            const wasm = componentWithSection(10, [0x01]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('export section: truncated mid-name', async () => {
            // Export section (11): count=1, extern name type=0x00, name length=10, but only 3 bytes of name
            const wasm = componentWithSection(11, [0x01, 0x00, 0x0A, 0x41, 0x42, 0x43]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('alias section: truncated after sort byte', async () => {
            // Alias section (6): count=1, sort b1=0x01 (func), then nothing
            const wasm = componentWithSection(6, [0x01, 0x01]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('canon section: truncated after function type', async () => {
            // Canon section (8): count=1, type=0x00 (lift), then nothing
            const wasm = componentWithSection(8, [0x01, 0x00]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('start section: truncated mid-arguments', async () => {
            // Start section (9): func_index=0, argCount=5, but no arg data
            const wasm = componentWithSection(9, [0x00, 0x05]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('core instance section: truncated', async () => {
            // Core instance section (2): count=1, type=0x00 (instantiate), then nothing
            const wasm = componentWithSection(2, [0x01, 0x00]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('instance section: truncated', async () => {
            // Instance section (5): count=1, type=0x00 (instantiate), then nothing
            const wasm = componentWithSection(5, [0x01, 0x00]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('type section: truncated after type tag', async () => {
            // Type section (7): count=1, type tag 0x72 (record), then nothing
            const wasm = componentWithSection(7, [0x01, 0x72]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('truncated LEB128 mid-byte', async () => {
            // Type section (7) with a LEB128 count that has continuation bit set but no more bytes
            const wasm = componentWithSection(7, [0x80]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });
    });

    // ─── String / name validation ───

    describe('string and name handling', () => {
        test('name length exceeds section bounds', async () => {
            // Import section (10): count=1, extern name type=0x00, name length = 0xFFFF (huge)
            // but section only has a few bytes
            const wasm = componentWithSection(10, [
                0x01, // count = 1
                0x00, // extern name type = kebab
                0xFF, 0xFF, 0x03, // name length = 65535 (LEB128)
                0x41 // only 1 byte of name data
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('name with u32 max length', async () => {
            // Import section (10): count=1, extern name type=0x00, name length = 0xFFFFFFFF
            const wasm = componentWithSection(10, [
                0x01, // count = 1
                0x00, // extern name type = kebab
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // name length = 4294967295 (u32 max in LEB128)
                0x41 // only 1 byte
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('zero-length name is accepted', async () => {
            // Type section (7): count=1, type 0x6d (enum), members count=1, name length=0
            const wasm = componentWithSection(7, [
                0x01, // count = 1 type
                0x6d, // enum
                0x01, // 1 member
                0x00, // member name length = 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('name with valid multi-byte UTF-8', async () => {
            // Type section (7): count=1, type 0x6d (enum), members count=1, name = "café" (5 UTF-8 bytes)
            const nameBytes = [...new TextEncoder().encode('café')];
            const wasm = componentWithSection(7, [
                0x01, // count = 1 type
                0x6d, // enum
                0x01, // 1 member
                ...leb128U32(nameBytes.length),
                ...nameBytes,
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('unknown extern name type', async () => {
            // Import section (10): count=1, extern name type=0x05 (invalid)
            const wasm = componentWithSection(10, [
                0x01, // count = 1
                0x05, // invalid extern name type
                ...encodeName('test'),
                // type ref follows but won't be reached
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown ComponentExternName');
        });
    });

    // ─── LEB128 encoding attacks ───

    describe('LEB128 encoding', () => {
        test('overlong LEB128 (6 continuation bytes)', async () => {
            // Type section (7): count encoded as 6-byte LEB128 with unnecessary continuation bits
            const wasm = componentWithSection(7, [
                0x80, 0x80, 0x80, 0x80, 0x80, 0x00 // overlong encoding of 0
            ]);
            // readRawInteger only reads maxLen=5 bytes, so it won't see the terminator
            // The 5th byte (0x80) has continuation bit set, so the LEB128 has no terminator in 5 bytes
            await expect(parse(wasm)).rejects.toThrow();
        });

        test('LEB128 all continuation bits, no terminator', async () => {
            // section payload is 5 bytes all with continuation bit set
            const wasm = componentWithSection(7, [
                0x80, 0x80, 0x80, 0x80, 0x80
            ]);
            await expect(parse(wasm)).rejects.toThrow();
        });

        test('component valtype LEB128 overflow', async () => {
            // Type section (7): count=1, type 0x70 (list), then a valtype index with >5 LEB128 bytes
            const wasm = componentWithSection(7, [
                0x01, // count = 1 type
                0x70, // list
                // valtype index: 6 continuation bytes (triggers our count > 5 check)
                0x80, 0x80, 0x80, 0x80, 0x80, 0x00,
            ]);
            await expect(parse(wasm)).rejects.toThrow('LEB128 overflow in component val type index');
        });
    });

    // ─── Invalid discriminant / type tags ───

    describe('invalid type discriminants', () => {
        test('unknown core val type', async () => {
            // Core type section (3): count=1, tag=0x60 (func), param count=1, invalid val type
            const wasm = componentWithSection(3, [
                0x01, // count = 1
                0x60, // core func type
                0x01, // 1 param
                0x50, // invalid core val type
                0x00, // 0 results
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown core val type');
        });

        test('unknown core type tag', async () => {
            // Core type section (3): count=1, tag=0xFF (unknown)
            const wasm = componentWithSection(3, [
                0x01, // count = 1
                0xFF, // invalid core type tag — but 0xFF has continuation bit, so it's LEB128
            ]);
            // The tag 0xFF is read as a byte (src.read()), not LEB128
            // Actually readCoreType reads tag via src.read(), so 0xFF is unknown
            await expect(parse(wasm)).rejects.toThrow('unknown core type tag');
        });

        test('unknown component type defined tag', async () => {
            // Type section (7): count=1, type byte 0x50 (not in 0x68-0x72 or 0x73-0x7F ranges)
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x50, // invalid component type defined tag
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in readComponentTypeDefined');
        });

        test('unknown canonical function type', async () => {
            // Canon section (8): count=1, type=0x0F (unknown)
            const wasm = componentWithSection(8, [
                0x01, // count = 1
                0x0F, // invalid canonical function type
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in readCanonicalFunction');
        });

        test('unknown canonical option type', async () => {
            // Canon section (8): count=1, type=0x00 (lift), control=0x00, core_func_index=0,
            // options count=1, option type=0xFF (unknown)
            const wasm = componentWithSection(8, [
                0x01, // count = 1
                0x00, // lift
                0x00, // control byte
                0x00, // core_func_index = 0
                0x01, // 1 option
                0xFF, 0x01, // option type 0xFF — but read as src.read(), so just 0xFF
            ]);
            // readCanonicalOption reads type via src.read() which returns the raw byte
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in readCanonicalOption');
        });

        test('unknown component external kind', async () => {
            // Export section (11): count=1, extern name, kind=0x09 (unknown)
            const wasm = componentWithSection(11, [
                0x01, // count = 1
                ...externNameKebab('test'),
                0x09, // invalid component external kind (readU32 returns 9)
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown component external kind');
        });

        test('unknown external kind (core)', async () => {
            // Core type section (3): count=1, tag=0x50 (module),
            // module type declarations: count=1, kind=0x03 (export),
            // name, then a TypeRef with invalid external kind byte
            const wasm = componentWithSection(3, [
                0x01, // count = 1
                0x50, // module type
                0x01, // 1 declaration
                0x03, // kind = export declaration
                ...encodeName('test'),
                0x0F, // invalid TypeRef kind byte (not 0x00-0x04)
            ]);
            // readCoreTypeRef switch expects 0x00-0x04, so 0x0F is unknown
            await expect(parse(wasm)).rejects.toThrow();
        });

        test('unknown instance declaration kind', async () => {
            // Type section (7): count=1, type=0x42 (instance type), count=1, kind=0x0F (unknown)
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x42, // instance type
                0x01, // 1 declaration
                0x0F, // invalid instance decl kind
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown instance type declaration kind');
        });

        test('unknown component func result type', async () => {
            // Type section (7): count=1, type=0x40 (func), 0 params, result type=0x05 (unknown)
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x40, // func type
                0x00, // 0 params
                0x05, // invalid func result type
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown ComponentFuncResult type');
        });

        test('unknown instantiation arg kind', async () => {
            // Core instance section (2): count=1, type=0x00 (instantiate), module_index=0,
            // args count=1, name, kind=0x00 (invalid, should be 0x12)
            const wasm = componentWithSection(2, [
                0x01, // count = 1
                0x00, // instantiate
                0x00, // module_index = 0
                0x01, // 1 arg
                ...encodeName('arg'),
                0x00, // invalid kind (should be 0x12)
                0x00, // index = 0
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized kind in readInstantiationArgKind');
        });

        test('unknown type bounds discriminant', async () => {
            // Import section (10): count=1, extern name, type ref = 0x03 (type), bounds=0x05 (unknown)
            const wasm = componentWithSection(10, [
                0x01, // count = 1
                ...externNameKebab('test'),
                0x03, // type ref = Type
                0x05, // invalid type bounds discriminant
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown type bounds');
        });

        test('unknown component instance type', async () => {
            // Instance section (5): count=1, type=0x05 (unknown)
            const wasm = componentWithSection(5, [
                0x01, // count = 1
                0x05, // invalid instance type
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in parseSectionInstance');
        });

        test('unknown core instance type', async () => {
            // Core instance section (2): count=1, type=0x05 (unknown)
            const wasm = componentWithSection(2, [
                0x01, // count = 1
                0x05, // invalid core instance type
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in readCoreInstance');
        });

        test('unknown alias target', async () => {
            // Alias section (6): count=1, b1=0x01 (func), target=0x05 (unknown)
            const wasm = componentWithSection(6, [
                0x01, // count = 1
                0x01, // sort b1 = func
                0x05, // invalid target type
            ]);
            await expect(parse(wasm)).rejects.toThrow('unknown target type');
        });

        test('invalid optional valtype flag', async () => {
            // Type section (7): count=1, type=0x6a (result),
            // ok: flag = 0x05 (invalid, should be 0x00 or 0x01)
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x6a, // result type
                0x05, // invalid optional valtype flag
            ]);
            await expect(parse(wasm)).rejects.toThrow('invalid optional valtype flag');
        });

        test('invalid optional refinement flag', async () => {
            // Type section (7): count=1, type=0x71 (variant), count=1,
            // name, optional valtype=0x00 (absent), refinement flag=0x05 (invalid)
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x71, // variant
                0x01, // 1 variant case
                ...encodeName('case1'),
                0x00, // optional valtype absent
                0x05, // invalid refinement flag
            ]);
            await expect(parse(wasm)).rejects.toThrow('invalid optional refinement flag');
        });

        test('invalid primitive val type', async () => {
            // Type section (7): count=1, type=0x70 (list), element type = 0x60 (invalid primitive)
            // 0x60 is below 0x73 (String) and not a valid index (it would be index 96 which is fine as type ref)
            // To test primitive validation, we need a byte in the 0x73-0x7F range that isn't valid
            // But all 0x73-0x7F are valid primitives... Instead, test with parsePrimitiveValType's range.
            // The primitive range is 0x73-0x7F. readComponentValType only checks 0x73-0x7F for primitives.
            // So any byte <0x73 with high bit clear is a type index. Nothing to reject here for valtype.
            // However, readComponentTypeDefined with 0x73 <= type <= 0x7f calls parsePrimitiveValType.
            // All those are valid. We need a byte like 0x72 which is 'record', not a primitive,
            // or 0x67 which falls into default of readComponentTypeDefined.
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x67, // invalid tag — not in 0x68-0x72 and not in 0x73-0x7F
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized type in readComponentTypeDefined');
        });

        test('invalid resource destructor flag', async () => {
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x3F, // resource
                0x00, // rep = 0
                0x05, // invalid destructor flag
            ]);
            await expect(parse(wasm)).rejects.toThrow('Invalid leading byte in resource destructor');
        });

        test('invalid canon lift control byte', async () => {
            // Canon section (8): count=1, type=0x00 (lift), control byte=0x05 (should be 0x00)
            const wasm = componentWithSection(8, [
                0x01, // count = 1
                0x00, // lift
                0x05, // invalid control byte
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized byte for CanonicalFunctionLift');
        });

        test('invalid canon lower control byte', async () => {
            // Canon section (8): count=1, type=0x01 (lower), control byte=0x05 (should be 0x00)
            const wasm = componentWithSection(8, [
                0x01, // count = 1
                0x01, // lower
                0x05, // invalid control byte
            ]);
            await expect(parse(wasm)).rejects.toThrow('Unrecognized byte for CanonicalFunctionLower');
        });
    });

    // ─── Large counts / resource exhaustion ───

    describe('large counts', () => {
        test('huge item count in type section', async () => {
            // Type section (7): count = 0xFFFFFFFF (4294967295) but no data
            const wasm = componentWithSection(7, [
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge item count in import section', async () => {
            const wasm = componentWithSection(10, [
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge item count in export section', async () => {
            const wasm = componentWithSection(11, [
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge string array count in flags', async () => {
            // Type section (7): count=1, type=0x6e (flags), members count = u32 max
            const wasm = componentWithSection(7, [
                0x01,
                0x6e, // flags
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // members count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge variant case count', async () => {
            // Type section (7): count=1, type=0x71 (variant), case count = u32 max
            const wasm = componentWithSection(7, [
                0x01,
                0x71, // variant
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // case count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge record member count', async () => {
            // Type section (7): count=1, type=0x72 (record), member count = u32 max
            const wasm = componentWithSection(7, [
                0x01,
                0x72, // record
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // member count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge tuple member count', async () => {
            // Type section (7): count=1, type=0x6f (tuple), member count = u32 max
            const wasm = componentWithSection(7, [
                0x01,
                0x6f, // tuple
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // member count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge named values count (func params)', async () => {
            // Type section (7): count=1, type=0x40 (func), param count = u32 max
            const wasm = componentWithSection(7, [
                0x01,
                0x40, // func
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // param count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge canon options count', async () => {
            // Canon section (8): count=1, type=0x00 (lift), control=0x00, core_func=0,
            // options count = u32 max
            const wasm = componentWithSection(8, [
                0x01,
                0x00, 0x00, // lift, control byte
                0x00, // core_func_index = 0
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // options count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge export count', async () => {
            // Core instance from exports: count=1, type=0x01, exports count = huge
            const wasm = componentWithSection(2, [
                0x01, // count = 1
                0x01, // from-exports
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // exports count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge instantiation args count', async () => {
            // Core instance instantiate: count=1, type=0x00, module=0, args count = huge
            const wasm = componentWithSection(2, [
                0x01, // count = 1
                0x00, // instantiate
                0x00, // module_index = 0
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // args count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge component instantiation args count', async () => {
            // Instance section (5): count=1, type=0x00 (instantiate), component=0, args count = huge
            const wasm = componentWithSection(5, [
                0x01, // count = 1
                0x00, // instantiate
                0x00, // component_index = 0
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // args count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge instance type declarations count', async () => {
            // Type section (7): count=1, type=0x42 (instance), declarations count = huge
            const wasm = componentWithSection(7, [
                0x01,
                0x42, // instance type
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // declarations count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });

        test('huge start function args count', async () => {
            // Start section (9): func_index=0, argCount = u32 max
            const wasm = componentWithSection(9, [
                0x00, // func_index = 0
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // arg count = u32 max
            ]);
            await expect(parse(wasm)).rejects.toThrow('unexpected EOF');
        });
    });

    // ─── Index values (unvalidated at parse time, but shouldn't crash) ───

    describe('index values', () => {
        test('type index at u32 max', async () => {
            // Type section (7): count=1, type=0x70 (list), element = type index 0xFFFFFFFF
            const wasm = componentWithSection(7, [
                0x01,
                0x70, // list
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F // type index = u32 max
            ]);
            // Parser doesn't validate index ranges — this should parse without error
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('core func index at u32 max in canon lift', async () => {
            // Canon section (8): count=1, lift with huge core func index
            const wasm = componentWithSection(8, [
                0x01,
                0x00, 0x00, // lift, control byte
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // core_func_index = u32 max
                0x00, // 0 options
                0x00, // type_index = 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('component func index at u32 max in canon lower', async () => {
            // Canon section (8): count=1, lower with huge func index
            const wasm = componentWithSection(8, [
                0x01,
                0x01, 0x00, // lower, control byte
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // func_index = u32 max
                0x00, // 0 options
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('module index at u32 max in core instance', async () => {
            // Core instance section (2): count=1, instantiate, module index = huge
            const wasm = componentWithSection(2, [
                0x01,
                0x00, // instantiate
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // module_index = u32 max
                0x00, // 0 args
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('component index at u32 max in component instance', async () => {
            // Instance section (5): count=1, instantiate, component index = huge
            const wasm = componentWithSection(5, [
                0x01,
                0x00, // instantiate
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // component_index = u32 max
                0x00, // 0 args
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('resource index at u32 max in resource.new', async () => {
            // Canon section (8): count=1, resource.new with huge resource index
            const wasm = componentWithSection(8, [
                0x01,
                0x02, // resource.new
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // resource = u32 max
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('resource index at u32 max in resource.drop', async () => {
            const wasm = componentWithSection(8, [
                0x01,
                0x03, // resource.drop
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // resource = u32 max
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('resource index at u32 max in resource.rep', async () => {
            const wasm = componentWithSection(8, [
                0x01,
                0x04, // resource.rep
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // resource = u32 max
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('instance index at u32 max in alias', async () => {
            // Alias section (6): count=1, sort=0x01 (func), target=0x00 (instance export),
            // instance index = huge, name
            const wasm = componentWithSection(6, [
                0x01, // count = 1
                0x01, // sort b1 = func
                0x00, // target = instance export
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // instance_index = u32 max
                ...encodeName('x'),
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('core instance index at u32 max in core alias', async () => {
            // Alias section (6): count=1, sort=0x00, sub=0x00 (func), target=0x01 (core instance export)
            // core instance index = huge, name
            const wasm = componentWithSection(6, [
                0x01, // count = 1
                0x00, // sort b1 = core
                0x00, // sort b2 = func (ExternalKind.Func)
                0x01, // target = core instance export
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // core_instance_index = u32 max
                ...encodeName('x'),
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('outer alias count and index at u32 max', async () => {
            // Alias section (6): count=1, sort=0x03 (type), target=0x02 (outer),
            // count = huge, index = huge
            const wasm = componentWithSection(6, [
                0x01, // count = 1
                0x03, // sort b1 = Type outer alias kind
                0x02, // target = outer
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // count = u32 max
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // index = u32 max
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('export index at u32 max', async () => {
            // Export section (11): count=1, name, kind=func, index=huge, no type bound
            const wasm = componentWithSection(11, [
                0x01, // count = 1
                ...externNameKebab('test'),
                0x01, // kind = func
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // index = u32 max
                0x00, // no type bound
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('type ref index at u32 max in import', async () => {
            // Import section (10): count=1, name, type ref = func, index = huge
            const wasm = componentWithSection(10, [
                0x01, // count = 1
                ...externNameKebab('test'),
                0x01, // type ref = Func
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // func type index = u32 max
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('memory index at u32 max in canon option', async () => {
            // Canon section (8): count=1, lift, control=0x00, core_func=0,
            // 1 option: memory with huge index, type_index=0
            const wasm = componentWithSection(8, [
                0x01,
                0x00, 0x00, // lift, control byte
                0x00, // core_func_index = 0
                0x01, // 1 option
                0x03, // memory option
                0xFF, 0xFF, 0xFF, 0xFF, 0x0F, // memory index = u32 max
                0x00, // type_index = 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('start function indices at u32 max', async () => {
            // Start section (9): func=huge, argCount=2, arg0=huge, arg1=huge, results=huge
            const huge = [0xFF, 0xFF, 0xFF, 0xFF, 0x0F];
            const wasm = componentWithSection(9, [
                ...huge, // func_index
                0x02, // 2 args
                ...huge, // arg[0]
                ...huge, // arg[1]
                ...huge, // results
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('borrow/own type index at u32 max', async () => {
            // Type section (7): count=2
            // [0]: borrow with huge index
            // [1]: own with huge index
            const huge = [0xFF, 0xFF, 0xFF, 0xFF, 0x0F];
            const wasm = componentWithSection(7, [
                0x02, // count = 2
                0x68, // borrow
                ...huge, // type index
                0x69, // own
                ...huge, // type index
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(2);
        });

        test('component type ref indices at u32 max', async () => {
            // Import section: test various ComponentTypeRef kinds with huge indices
            const huge = [0xFF, 0xFF, 0xFF, 0xFF, 0x0F];
            // kind 0x00 = module, kind 0x01 = func, kind 0x04 = component, kind 0x05 = instance
            for (const kind of [0x00, 0x01, 0x04, 0x05]) {
                const wasm = componentWithSection(10, [
                    0x01, // count = 1
                    ...externNameKebab('test'),
                    kind, // type ref kind
                    ...huge, // type index = u32 max
                ]);
                const model = await parse(wasm);
                expect(model.length).toBe(1);
            }
        });
    });

    // ─── Buffer boundary / offset problems ───

    describe('buffer boundaries', () => {
        test('readExact with n=0 returns empty array', async () => {
            // A zero-length name should work (length=0 means readExact(0))
            const wasm = componentWithSection(7, [
                0x01, // count = 1
                0x6e, // flags
                0x01, // 1 member
                0x00, // member name length = 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('section consumes exactly all bytes', async () => {
            // Type section (7): count=1, primitive char (0x74) — exactly 2 bytes of payload
            const wasm = componentWithSection(7, [0x01, 0x74]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('multiple sections back to back', async () => {
            // Two type sections, each with 1 primitive
            const section1 = [7, ...leb128U32(2), 0x01, 0x74]; // type section: count=1, char
            const section2 = [7, ...leb128U32(2), 0x01, 0x73]; // type section: count=1, string
            const wasm = new Uint8Array([...PREAMBLE, ...section1, ...section2]);
            const model = await parse(wasm);
            expect(model.length).toBe(2);
        });

        test('section with payload at exact u8 boundary (255 bytes)', async () => {
            // Create a type section with lots of primitives to fill ~255 bytes
            // Each primitive type is 1 byte, plus 1 byte per count entry
            // count (LEB128 of 254 is 2 bytes: 0xFE, 0x01) + 254 bytes of primitives = 256 bytes
            // Let's use count=253 + 253 bytes of 0x74 (char primitive) = 254 + LEB128(253)=2 = 255
            const count = 253;
            const payload = [...leb128U32(count), ...Array(count).fill(0x74)];
            expect(payload.length).toBe(255); // verify our math
            const wasm = componentWithSection(7, payload);
            const model = await parse(wasm);
            expect(model.length).toBe(count);
        });

        test('data after valid component has trailing garbage', async () => {
            // A valid section type byte followed by a valid LEB128 size, then garbage
            // The parser reads type, then size, then dispatches
            const wasm = new Uint8Array([...PREAMBLE, 0x20, 0x00]);
            // 0x20 = 32, not a valid section type, size = 0
            await expect(parse(wasm)).rejects.toThrow('unknown section: 32');
        });
    });

    // ─── Nesting depth ───

    describe('nesting depth limit', () => {
        test('component nesting at limit is rejected', async () => {
            // Build 101 levels of nested components
            // Each nested component: section type 4, size = N, then preamble
            // The deepest fails when depth >= 100

            // Build from inside out
            let inner = new Uint8Array(PREAMBLE); // innermost empty component
            for (let i = 0; i < 101; i++) {
                const sizeBytes = leb128U32(inner.length);
                const outer = new Uint8Array([
                    ...PREAMBLE,
                    4, // component section
                    ...sizeBytes,
                    ...inner
                ]);
                inner = outer;
            }
            await expect(parse(inner)).rejects.toThrow(`component nesting depth exceeds ${100}`);
        });

        test('99 levels of nesting succeeds', async () => {
            let inner = new Uint8Array(PREAMBLE);
            for (let i = 0; i < 99; i++) {
                const sizeBytes = leb128U32(inner.length);
                const outer = new Uint8Array([
                    ...PREAMBLE,
                    4,
                    ...sizeBytes,
                    ...inner
                ]);
                inner = outer;
            }
            const model = await parse(inner);
            expect(model.length).toBe(1); // one component section
        });
    });

    // ─── Component-specific edge cases ───

    describe('component type edge cases', () => {
        test('result type with both ok and err absent', async () => {
            // Type section (7): count=1, result with ok=absent, err=absent
            const wasm = componentWithSection(7, [
                0x01,
                0x6a, // result
                0x00, // ok absent
                0x00, // err absent
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('result type with both ok and err present', async () => {
            // Type section (7): count=1, result with ok=string, err=string
            const wasm = componentWithSection(7, [
                0x01,
                0x6a, // result
                0x01, 0x73, // ok = present, string primitive
                0x01, 0x73, // err = present, string primitive
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('option type with type index 0', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x6b, // option
                0x00, // type index 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('empty enum (0 members)', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x6d, // enum
                0x00, // 0 members
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('empty flags (0 members)', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x6e, // flags
                0x00, // 0 members
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('empty tuple (0 members)', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x6f, // tuple
                0x00, // 0 members
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('empty variant (0 cases)', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x71, // variant
                0x00, // 0 cases
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('empty record (0 members)', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x72, // record
                0x00, // 0 members
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('func type with 0 params and unnamed result', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x40, // func
                0x00, // 0 params
                0x00, // unnamed result
                0x73, // result type = string
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('func type with named results', async () => {
            const wasm = componentWithSection(7, [
                0x01,
                0x40, // func
                0x00, // 0 params
                0x01, // named results
                0x01, // 1 named value
                ...encodeName('r'),
                0x73, // type = string
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('component type tag is accepted', async () => {
            // 0x41 = component type with 0 declarations
            const wasm = componentWithSection(7, [
                0x01,
                0x41, // component type
                0x00, // 0 declarations
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });

        test('instance type with all declaration kinds', async () => {
            // instance type with declarations:
            // 0x00 = core type, 0x01 = type, 0x03 = import, 0x04 = export
            const wasm = componentWithSection(7, [
                0x01,
                0x42, // instance type
                0x02, // 2 declarations
                // decl 0: type (kind=0x01) -> primitive string
                0x01, 0x73,
                // decl 1: export (kind=0x04) -> name + type ref
                0x04,
                ...externNameKebab('x'),
                0x01, // type ref = func
                0x00, // func type index = 0
            ]);
            const model = await parse(wasm);
            expect(model.length).toBe(1);
        });
    });

    // ─── Valid components with empty sections ───

    describe('empty sections', () => {
        test('empty component (just preamble)', async () => {
            const wasm = new Uint8Array(PREAMBLE);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('type section with 0 types', async () => {
            const wasm = componentWithSection(7, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('import section with 0 imports', async () => {
            const wasm = componentWithSection(10, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('export section with 0 exports', async () => {
            const wasm = componentWithSection(11, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('alias section with 0 aliases', async () => {
            const wasm = componentWithSection(6, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('canon section with 0 functions', async () => {
            const wasm = componentWithSection(8, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('core instance section with 0 instances', async () => {
            const wasm = componentWithSection(2, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('instance section with 0 instances', async () => {
            const wasm = componentWithSection(5, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });

        test('core type section with 0 types', async () => {
            const wasm = componentWithSection(3, [0x00]);
            const model = await parse(wasm);
            expect(model.length).toBe(0);
        });
    });
});
