// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

/**
 * One-off script to generate TypeScript type definitions for WASI Preview 1
 * from the wasi-libc C header file (wasip1.h).
 *
 * Usage: node scripts/generate-wasip1-types.mjs
 *
 * Source: https://github.com/WebAssembly/wasi-libc/blob/main/libc-bottom-half/headers/public/wasi/wasip1.h
 *
 * Output: wit/wasip1/types/wasi-snapshot-preview1.d.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HEADER_URL = 'https://raw.githubusercontent.com/WebAssembly/wasi-libc/main/libc-bottom-half/headers/public/wasi/wasip1.h';

async function fetchHeader() {
    console.log(`Fetching ${HEADER_URL} ...`);
    const resp = await fetch(HEADER_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching header`);
    return resp.text();
}

// ── C type → TypeScript type mapping ──────────────────────────────────────────
// In the raw WASM ABI, all pointers/sizes are i32 (number) and
// 64-bit integers (timestamp, filesize, rights, filedelta, userdata) are i64 (bigint).

/** Map C typedef base types to { tsType, wasmType } */
const BASE_TYPE_MAP = {
    'uint8_t':  { tsType: 'number', wasmType: 'i32', bits: 8 },
    'uint16_t': { tsType: 'number', wasmType: 'i32', bits: 16 },
    'uint32_t': { tsType: 'number', wasmType: 'i32', bits: 32 },
    'uint64_t': { tsType: 'bigint', wasmType: 'i64', bits: 64 },
    'int32_t':  { tsType: 'number', wasmType: 'i32', bits: 32 },
    'int64_t':  { tsType: 'bigint', wasmType: 'i64', bits: 64 },
    'int':      { tsType: 'number', wasmType: 'i32', bits: 32 },
    '__SIZE_TYPE__': { tsType: 'number', wasmType: 'i32', bits: 32 },
};

// ── Parse typedefs ────────────────────────────────────────────────────────────

function parseTypedefs(src) {
    const typedefs = new Map();
    // Match: typedef <base_type> __wasi_<name>_t;
    const re = /typedef\s+(\w+)\s+(__wasi_\w+_t)\s*;/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const [, baseType, wasiType] = m;
        const info = BASE_TYPE_MAP[baseType];
        if (info) {
            const name = wasiType.replace(/^__wasi_/, '').replace(/_t$/, '');
            typedefs.set(wasiType, { name, ...info, cType: baseType });
        }
    }
    return typedefs;
}

// ── Parse #define constants ───────────────────────────────────────────────────

function parseDefines(src) {
    const groups = new Map(); // prefix → [{name, value}]

    // Match: #define __WASI_ERRNO_SUCCESS (UINT16_C(0))
    // Match: #define __WASI_RIGHTS_FD_READ ((__wasi_rights_t)(1 << 1))
    const re = /#define\s+(__WASI_(\w+?)_(\w+))\s+\((?:UINT\d+_C\((\d+)\)|(?:\(__wasi_\w+_t\))?\((\d+)\s*<<\s*(\d+)\))\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const [, fullName, prefix, member, directVal, shiftBase, shiftAmt] = m;
        const groupKey = prefix;
        if (!groups.has(groupKey)) groups.set(groupKey, []);

        let value;
        if (directVal !== undefined) {
            value = parseInt(directVal, 10);
        } else if (shiftBase !== undefined && shiftAmt !== undefined) {
            value = parseInt(shiftBase, 10) << parseInt(shiftAmt, 10);
        }

        groups.get(groupKey).push({
            fullName,
            member,
            value,
        });
    }

    return groups;
}

// ── Parse struct definitions ──────────────────────────────────────────────────

function parseStructs(src) {
    const structs = new Map();

    // Match: typedef struct __wasi_<name>_t { ... } __wasi_<name>_t;
    const re = /typedef\s+struct\s+(__wasi_\w+_t)\s*\{([^}]+)\}\s*\1\s*;/gs;
    let m;
    while ((m = re.exec(src)) !== null) {
        const [, wasiType, body] = m;
        const name = wasiType.replace(/^__wasi_/, '').replace(/_t$/, '');
        const fields = [];

        // Parse fields: __wasi_<type>_t <name>; or uint8_t *<name>;
        const fieldRe = /(?:const\s+)?(\w+)\s+(\*?)(\w+)\s*;/g;
        let fm;
        while ((fm = fieldRe.exec(body)) !== null) {
            const [, fieldType, isPtr, fieldName] = fm;
            fields.push({ fieldType, isPtr: isPtr === '*', fieldName });
        }

        structs.set(wasiType, { name, fields });
    }

    return structs;
}

// ── Parse function declarations ───────────────────────────────────────────────

function parseFunctions(src) {
    const functions = [];

    // Extract the function section (after @defgroup wasi_snapshot_preview1)
    const sectionStart = src.indexOf('@defgroup wasi_snapshot_preview1');
    if (sectionStart === -1) return functions;
    const section = src.slice(sectionStart);

    // Match function declarations with their preceding doc comments
    // Pattern: __wasi_errno_t __wasi_<name>(...) or _Noreturn void __wasi_<name>(...)
    const re = /(?:__wasi_errno_t|_Noreturn\s+void)\s+(__wasi_(\w+))\s*\(([\s\S]*?)\)\s*(?:__attribute__\(\(__warn_unused_result__\)\))?;/g;
    let m;
    while ((m = re.exec(section)) !== null) {
        const [fullMatch, cName, name, paramsStr] = m;
        const isNoreturn = fullMatch.startsWith('_Noreturn');
        const params = parseParams(paramsStr);
        functions.push({ cName, name, params, isNoreturn });
    }

    return functions;
}

function parseParams(paramsStr) {
    if (paramsStr.trim() === 'void') return [];

    const params = [];
    // Clean up the params string - remove comments and normalize whitespace
    const cleaned = paramsStr
        .replace(/\/\*\*[\s\S]*?\*\//g, '') // remove doc comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
        .replace(/\s+/g, ' ')
        .trim();

    // Split by commas, but respect nested parens
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of cleaned) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
        const p = part.trim();
        if (!p) continue;

        // Match: const __wasi_type_t *name, __wasi_type_t name, uint8_t *name, size_t name, etc.
        const pm = p.match(/(?:const\s+)?(\w+)\s+(\*{0,2})(\w+)$/);
        if (pm) {
            const [, type, stars, name] = pm;
            const isPtr = stars.includes('*');
            params.push({ type, isPtr, name });
        }
    }

    return params;
}

// ── Determine WASM-level type for a C parameter ──────────────────────────────

function wasmParamType(param, typedefs) {
    if (param.isPtr) return { tsType: 'number', wasmType: 'i32' }; // pointer → i32

    // Check if it's a known WASI typedef
    const wasiType = `__wasi_${param.type.replace(/^__wasi_/, '')}`;
    const full = param.type.startsWith('__wasi_') ? param.type : wasiType;
    const td = typedefs.get(full);
    if (td) return { tsType: td.tsType, wasmType: td.wasmType };

    // size_t → i32 on wasm32
    if (param.type === 'size_t') return { tsType: 'number', wasmType: 'i32' };

    // Fallback
    const base = BASE_TYPE_MAP[param.type];
    if (base) return { tsType: base.tsType, wasmType: base.wasmType };

    return { tsType: 'number', wasmType: 'i32' };
}

/**
 * Expand C-level params to WASM ABI params.
 * In WASM, `const char *path` becomes two params: `path_ptr: i32, path_len: i32`.
 * Similarly, `uint8_t **argv` stays as a single pointer (it's a pointer to a pointer array).
 */
function expandToWasmParams(params, typedefs) {
    const expanded = [];
    for (const p of params) {
        // `const char *name` → name: i32, name_len: i32
        if (p.isPtr && p.type === 'char') {
            expanded.push({ ...p, name: p.name, type: 'char', isPtr: true });
            expanded.push({ name: p.name + '_len', type: 'size_t', isPtr: false });
        } else {
            expanded.push(p);
        }
    }
    return expanded;
}

// ── Generate TypeScript ──────────────────────────────────────────────────────

function generateTypeScript(typedefs, defines, structs, functions) {
    const lines = [];

    lines.push('// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.');
    lines.push('');
    lines.push('/**');
    lines.push(' * WASI Preview 1 (wasi_snapshot_preview1) raw WASM ABI type definitions.');
    lines.push(' *');
    lines.push(' * Auto-generated from wasi-libc wasip1.h by scripts/generate-wasip1-types.mjs');
    lines.push(' * Source: https://github.com/WebAssembly/wasi-libc/blob/main/libc-bottom-half/headers/public/wasi/wasip1.h');
    lines.push(' *');
    lines.push(' * All pointer parameters are i32 (number), 64-bit integers are i64 (bigint).');
    lines.push(' * Functions operate on the module\'s linear memory via DataView.');
    lines.push(' */');
    lines.push('');

    // Collect enum/flag group names so we can skip conflicting type aliases
    const enumNames = new Set();
    const groupTypeMap = {
        'ERRNO': 'Errno',
        'CLOCKID': 'Clockid',
        'FILETYPE': 'Filetype',
        'ADVICE': 'Advice',
        'WHENCE': 'Whence',
        'EVENTTYPE': 'Eventtype',
        'PREOPENTYPE': 'Preopentype',
    };
    const flagGroupMap = {
        'RIGHTS': 'Rights',
        'FDFLAGS': 'Fdflags',
        'FSTFLAGS': 'Fstflags',
        'LOOKUPFLAGS': 'Lookupflags',
        'OFLAGS': 'Oflags',
        'SUBCLOCKFLAGS': 'Subclockflags',
        'EVENTRWFLAGS': 'Eventrwflags',
        'RIFLAGS': 'Riflags',
        'ROFLAGS': 'Roflags',
        'SDFLAGS': 'Sdflags',
        'SIFLAGS': 'Siflags',
    };
    for (const [gk] of defines) {
        if (groupTypeMap[gk]) enumNames.add(groupTypeMap[gk]);
        if (flagGroupMap[gk]) enumNames.add(flagGroupMap[gk]);
    }

    // ── Type aliases ──
    lines.push('// ── Primitive type aliases ─────────────────────────────────────────────────');
    lines.push('');
    for (const [cType, info] of typedefs) {
        const tsName = snakeToCamel(info.name);
        // Skip type aliases that conflict with const enum names
        if (enumNames.has(tsName)) continue;
        lines.push(`/** ${cType} - ${info.cType} (${info.bits}-bit) */`);
        lines.push(`export type ${tsName} = ${info.tsType};`);
        lines.push('');
    }

    // ── Enum/flag constants ──
    lines.push('// ── Constants ─────────────────────────────────────────────────────────────');
    lines.push('');

    for (const [groupKey, members] of defines) {
        const enumName = groupTypeMap[groupKey];
        const flagName = flagGroupMap[groupKey];

        if (enumName) {
            lines.push(`/** ${groupKey} enum values */`);
            lines.push(`export const enum ${enumName} {`);
            for (const m of members) {
                const memberName = snakeToCamelMember(m.member);
                lines.push(`    ${memberName} = ${m.value},`);
            }
            lines.push('}');
            lines.push('');
        } else if (flagName) {
            lines.push(`/** ${groupKey} flags */`);
            lines.push(`export const enum ${flagName} {`);
            for (const m of members) {
                const memberName = snakeToCamelMember(m.member);
                if (m.value > 0x7FFFFFFF) {
                    // BigInt for 64-bit flags — can't use in numeric const enum
                    // Use hex representation
                    lines.push(`    ${memberName} = 0x${m.value.toString(16)},`);
                } else {
                    lines.push(`    ${memberName} = ${m.value},`);
                }
            }
            lines.push('}');
            lines.push('');
        }
    }

    // ── Struct layout constants ──
    // Override known-incorrect layouts for types containing unions
    // (the regex parser cannot handle C unions properly)
    const layoutOverrides = new Map([
        ['__wasi_event_t', {
            name: 'Event',
            fields: [
                { name: 'userdata', offset: 0, size: 8, tsType: 'bigint' },
                { name: 'error', offset: 8, size: 2, tsType: 'number' },
                { name: 'type', offset: 10, size: 1, tsType: 'number' },
                { name: 'fd_readwrite', offset: 16, size: 16, tsType: 'EventFdReadwrite' },
            ],
            _size: 32, _align: 8,
        }],
        ['__wasi_subscription_u_t', {
            name: 'SubscriptionU',
            fields: [
                { name: 'tag', offset: 0, size: 1, tsType: 'number' },
                { name: 'u', offset: 8, size: 32, tsType: 'SubscriptionClock | SubscriptionFdReadwrite' },
            ],
            _size: 40, _align: 8,
        }],
        ['__wasi_subscription_t', {
            name: 'Subscription',
            fields: [
                { name: 'userdata', offset: 0, size: 8, tsType: 'bigint' },
                { name: 'u', offset: 8, size: 40, tsType: 'SubscriptionU' },
            ],
            _size: 48, _align: 8,
        }],
        ['__wasi_prestat_t', {
            name: 'Prestat',
            fields: [
                { name: 'tag', offset: 0, size: 1, tsType: 'number' },
                { name: 'u', offset: 4, size: 4, tsType: 'PrestatDir' },
            ],
            _size: 8, _align: 4,
        }],
    ]);

    lines.push('// ── Struct sizes and offsets (for DataView access) ─────────────────────────');
    lines.push('');

    for (const [cType, info] of structs) {
        const override = layoutOverrides.get(cType);
        const tsName = override ? override.name : snakeToCamel(info.name);

        if (override) {
            lines.push(`/** ${cType} layout */`);
            lines.push(`export const ${tsName}Layout = {`);
            for (const field of override.fields) {
                lines.push(`    ${field.name}: { offset: ${field.offset}, size: ${field.size} },`);
            }
            lines.push(`    _size: ${override._size},`);
            lines.push(`    _align: ${override._align},`);
            lines.push('} as const;');
            lines.push('');
            continue;
        }

        lines.push(`/** ${cType} layout */`);
        lines.push(`export const ${tsName}Layout = {`);

        let offset = 0;
        for (const field of info.fields) {
            const fieldInfo = resolveFieldType(field, typedefs);
            // Align
            offset = alignTo(offset, fieldInfo.align);
            lines.push(`    ${field.fieldName}: { offset: ${offset}, size: ${fieldInfo.size} },`);
            offset += fieldInfo.size;
        }

        // Total size (aligned to largest member alignment)
        const maxAlign = Math.max(...info.fields.map(f => resolveFieldType(f, typedefs).align));
        const totalSize = alignTo(offset, maxAlign);
        lines.push(`    _size: ${totalSize},`);
        lines.push(`    _align: ${maxAlign},`);

        lines.push('} as const;');
        lines.push('');
    }

    // ── Function interface ──
    lines.push('// ── WASI Preview 1 function signatures (raw WASM ABI) ─────────────────────');
    lines.push('');
    lines.push('/**');
    lines.push(' * Raw WASM ABI interface for wasi_snapshot_preview1.');
    lines.push(' *');
    lines.push(' * All parameters are passed as WASM i32 (number) or i64 (bigint).');
    lines.push(' * Pointer parameters point into the module\'s linear memory.');
    lines.push(' * Return value is errno (i32) unless the function is _Noreturn.');
    lines.push(' */');
    lines.push('export interface WasiSnapshotPreview1 {');

    for (const fn of functions) {
        const wasmParams = expandToWasmParams(fn.params, typedefs);
        const paramStrs = wasmParams.map(p => {
            const wt = wasmParamType(p, typedefs);
            return `${sanitizeName(p.name)}: ${wt.tsType}`;
        });

        const returnType = fn.isNoreturn ? 'void' : 'number';
        lines.push(`    ${fn.name}(${paramStrs.join(', ')}): ${returnType};`);
    }

    lines.push('}');
    lines.push('');

    // ── Struct interfaces (for typed field access) ──
    lines.push('// ── Struct field access interfaces ────────────────────────────────────────');
    lines.push('');

    for (const [cType, info] of structs) {
        const override = layoutOverrides.get(cType);
        const tsName = override ? override.name : snakeToCamel(info.name);

        if (override) {
            lines.push(`/** ${cType} fields */`);
            lines.push(`export interface ${tsName} {`);
            for (const field of override.fields) {
                lines.push(`    ${field.name}: ${field.tsType};`);
            }
            lines.push('}');
            lines.push('');
            continue;
        }

        lines.push(`/** ${cType} fields */`);
        lines.push(`export interface ${tsName} {`);
        for (const field of info.fields) {
            const fieldInfo = resolveFieldType(field, typedefs);
            lines.push(`    ${field.fieldName}: ${fieldInfo.tsType};`);
        }
        lines.push('}');
        lines.push('');
    }

    return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function snakeToCamel(snake) {
    return snake
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

function snakeToCamelMember(snake) {
    const parts = snake.split('_');
    let result = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
        + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
    // Handle identifiers starting with digits (e.g., "2big" → "TooBig")
    if (/^\d/.test(result)) result = 'E' + result;
    return result;
}

function sanitizeName(name) {
    // Avoid TypeScript reserved words
    const reserved = new Set(['in', 'out', 'new', 'delete', 'default', 'switch', 'case', 'break', 'return']);
    if (reserved.has(name)) return name + '_';
    return name;
}

function resolveFieldType(field, typedefs) {
    if (field.isPtr) {
        return { tsType: 'number', size: 4, align: 4 }; // wasm32 pointer
    }

    const td = typedefs.get(field.fieldType);
    if (td) {
        const size = td.bits / 8;
        return { tsType: td.tsType, size, align: Math.min(size, 8) };
    }

    const base = BASE_TYPE_MAP[field.fieldType];
    if (base) {
        const size = base.bits / 8;
        return { tsType: base.tsType, size, align: Math.min(size, 8) };
    }

    // Default to 4-byte i32
    return { tsType: 'number', size: 4, align: 4 };
}

function alignTo(offset, align) {
    return Math.ceil(offset / align) * align;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const headerSrc = await fetchHeader();
    console.log(`Fetched ${headerSrc.length} bytes`);

    const typedefs = parseTypedefs(headerSrc);
    console.log(`Found ${typedefs.size} typedefs`);

    const defines = parseDefines(headerSrc);
    console.log(`Found ${defines.size} define groups`);

    const structs = parseStructs(headerSrc);
    console.log(`Found ${structs.size} structs`);

    const functions = parseFunctions(headerSrc);
    console.log(`Found ${functions.length} functions`);

    const output = generateTypeScript(typedefs, defines, structs, functions);

    const outDir = join(ROOT, 'wit', 'wasip1', 'types');
    mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, 'wasi-snapshot-preview1.d.ts');
    writeFileSync(outPath, output, 'utf-8');
    console.log(`\nWritten: ${outPath}`);

    // Print summary
    console.log('\n── Summary ──────────────────────────────────');
    console.log(`Typedefs: ${typedefs.size}`);
    for (const [k, v] of typedefs) console.log(`  ${v.name}: ${v.tsType} (${v.cType})`);
    console.log(`Define groups: ${defines.size}`);
    for (const [k, v] of defines) console.log(`  ${k}: ${v.length} members`);
    console.log(`Structs: ${structs.size}`);
    for (const [k, v] of structs) console.log(`  ${v.name}: ${v.fields.length} fields`);
    console.log(`Functions: ${functions.length}`);
    for (const fn of functions) console.log(`  ${fn.name}(${fn.params.length} params)${fn.isNoreturn ? ' [noreturn]' : ''}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
