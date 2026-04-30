// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Extract WIT method/property names from `wit/wasip3/types/**/*.d.ts`.
// These are the names the component-model runtime looks up via
// `imports[interface][method]` at instantiation time. Terser cannot see
// these literal strings (they come from the parsed component binary),
// so each must be reserved for property mangling.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', 'wit', 'wasip3', 'types');
const CHECK_MODE = process.argv.includes('--check');

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            out.push(...walk(full));
        } else if (entry.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out;
}

const names = new Set();

// Match interface bodies and extract method/property names.
//   methodName(...): ReturnType;
//   methodName: type;
//   readonly fieldName: type;
const memberRe = /^\s*(?:readonly\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[(:?]/gm;
// Match enum-like literal type unions and members of interface-as-namespace
// declarations. Skip `export`, `import`, `interface`, `namespace`, `type`,
// `function`, `const`, `class` keywords.
const RESERVED_KEYWORDS = new Set([
    'export', 'import', 'interface', 'namespace', 'type', 'function',
    'const', 'class', 'declare', 'extends', 'implements', 'readonly',
    'public', 'private', 'protected', 'static', 'abstract', 'async',
    'await', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'default', 'break', 'continue', 'throw', 'try', 'catch',
    'finally', 'new', 'this', 'super', 'true', 'false', 'null',
    'undefined', 'void', 'never', 'any', 'unknown', 'string', 'number',
    'boolean', 'bigint', 'symbol', 'object', 'Promise', 'Array',
    'Uint8Array', 'Uint16Array', 'Uint32Array', 'BigInt64Array',
    'BigUint64Array', 'Int8Array', 'Int16Array', 'Int32Array',
    'Float32Array', 'Float64Array', 'Map', 'Set', 'Date', 'Error',
    'RegExp', 'JSON', 'Math', 'Symbol', 'Reflect', 'Proxy',
    'AsyncIterator', 'Iterator', 'Iterable', 'AsyncIterable',
    'AsyncIterableIterator', 'IterableIterator', 'Record',
    'Partial', 'Readonly', 'Required', 'Pick', 'Omit', 'Exclude',
    'Extract', 'NonNullable', 'ReturnType', 'Parameters',
    'InstanceType', 'ThisType', 'ConstructorParameters',
]);

for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    let m;
    memberRe.lastIndex = 0;
    while ((m = memberRe.exec(src)) !== null) {
        const name = m[1];
        if (RESERVED_KEYWORDS.has(name)) continue;
        // Skip lone-letter type-parameter names (T, U, K, V, ...).
        if (name.length === 1) continue;
        names.add(name);
    }
}

// Also extract from result.ts / streams.ts / http.ts / vfs.ts etc. — these
// define wrapper classes / objects whose property keys are exposed across
// the component-model boundary.
const SRC_HOST = join(__dirname, '..', 'src', 'host', 'wasip3');
function extractMethodKeys(file) {
    const src = readFileSync(file, 'utf8');
    // Match identifier-style method definitions inside object literals or classes:
    //   methodName(...): ReturnType {
    //   methodName(...) {
    //   get methodName(): ...
    //   set methodName(...): ...
    const re = /^\s*(?:get\s+|set\s+|async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        const name = m[1];
        if (RESERVED_KEYWORDS.has(name)) continue;
        if (name.length === 1) continue;
        // skip control-flow words that could match
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'function'].includes(name)) continue;
        names.add(name);
    }
}

for (const entry of readdirSync(SRC_HOST)) {
    if (entry.endsWith('.ts')) {
        extractMethodKeys(join(SRC_HOST, entry));
    }
}
const NODE_HOST = join(SRC_HOST, 'node');
for (const entry of readdirSync(NODE_HOST)) {
    if (entry.endsWith('.ts')) {
        extractMethodKeys(join(NODE_HOST, entry));
    }
}

// Also scan all other host adapters — methods on classes in
// `src/host/wasip2-via-wasip3/**` and `src/host/wasip1-via-wasip3/**` are
// looked up dynamically (e.g. `passthrough(kebab)` does
// `self[camelCase(kebab)]`) and must not be mangled.
const HOST_ROOT = join(__dirname, '..', 'src', 'host');
function walkSrc(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            walkSrc(full);
        } else if (entry.endsWith('.ts')) {
            extractMethodKeys(full);
        }
    }
}
walkSrc(HOST_ROOT);

const sorted = [...names].sort();
const out = `// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.
// AUTO-GENERATED by scripts/extract-wit-names.mjs — do not edit by hand.
// Run \`node scripts/extract-wit-names.mjs\` to regenerate.
//
// Property names from WIT interface definitions (wit/wasip3/types/**/*.d.ts)
// and host implementation files (src/host/wasip3/**/*.ts). The component-model
// runtime looks these up via \`imports[interfaceName][methodName]\` using
// strings that come from the parsed component binary at runtime — terser
// cannot see them, so they must be added to the property-mangling reserved set.

module.exports = ${JSON.stringify(sorted, null, 4)};
`;

const outFile = join(__dirname, 'reserved-wit-names.cjs');
if (CHECK_MODE) {
    let existing = '';
    try {
        existing = readFileSync(outFile, 'utf8');
    } catch {
        console.error(`error: ${outFile} does not exist. Run \`node scripts/extract-wit-names.mjs\` to generate it.`);
        process.exit(1);
    }
    // Normalize CRLF→LF on both sides so the check passes on Windows checkouts
    // where git's autocrlf has rewritten line endings on disk.
    const normalize = (s) => s.replace(/\r\n/g, '\n');
    if (normalize(existing) !== normalize(out)) {
        console.error(`error: ${outFile} is out of date relative to wit/wasip3/types/**/*.d.ts and src/host/**/*.ts.`);
        console.error('Run `node scripts/extract-wit-names.mjs` (or `npm run reserved:wit`) and commit the result.');
        process.exit(1);
    }
    console.log(`OK: ${outFile} matches the generated output (${sorted.length} names).`);
} else {
    writeFileSync(outFile, out, 'utf8');
    console.log(`Wrote ${sorted.length} names to ${outFile}`);
}
