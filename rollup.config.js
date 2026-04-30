// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import virtual from '@rollup/plugin-virtual';
import * as path from 'path';
import dts from 'rollup-plugin-dts';
import gitCommitInfo from 'git-commit-info';
import reservedProps from './scripts/reserved-props.cjs';
import reservedWitNames from './scripts/reserved-wit-names.cjs';

const configuration = process.env.Configuration ?? 'Debug';
const isDebug = configuration !== 'Release';
const isContinuousIntegrationBuild = process.env.ContinuousIntegrationBuild === 'true' ? true : false;
let gitHash = (() => {
    try {
        const gitInfo = gitCommitInfo();
        return gitInfo.hash;
    } catch (e) {
        return 'unknown';
    }
})();

const constants = {
    'env:configuration': `export default "${configuration}"`,
    'env:isDebug': `export default ${isDebug}`,
    'env:gitHash': `export default "${gitHash}"`,
};

/**
 * Rollup plugin: in Release builds, replace `jsco_assert(...)` and `debugStack(...)`
 * call expressions with `void 0`. Eliminates the call AND the message-factory
 * closure (which terser cannot DCE on its own because it is a function expression
 * passed as an argument). The replacement is a simple statement that terser then
 * collapses entirely. We also rewrite the function bodies in `src/utils/assert.ts`
 * so the symbol definitions tree-shake away.
 *
 * The transform runs on TS source (before tsc) and is purely textual. It walks
 * balanced parens to delimit each call so multi-line calls are handled.
 */
function stripDebugCalls() {
    const stripNames = ['jsco_assert', 'debugStack'];
    const callRe = new RegExp(`\\b(?:${stripNames.join('|')})\\s*\\(`, 'g');
    return {
        name: 'strip-debug-calls',
        transform(code, id) {
            if (!id.endsWith('.ts')) return null;
            // Skip assert.ts itself — it defines the symbols. The internal calls
            // inside debug-only code paths there are guarded by `if (isDebug)` and
            // tree-shake on their own.
            if (id.replace(/\\/g, '/').endsWith('/src/utils/assert.ts')) return null;
            let out = '';
            let last = 0;
            let m;
            callRe.lastIndex = 0;
            let mutated = false;
            while ((m = callRe.exec(code)) !== null) {
                // Skip definitions: `function jsco_assert(`, `export function jsco_assert(`,
                // `function debugStack(` — preserve the declaration sites in assert.ts.
                const before = code.slice(Math.max(0, m.index - 40), m.index);
                if (/\bfunction\s*$/.test(before) || /\bregisterInitDebugNames\s*\(\s*$/.test(before)) {
                    continue;
                }
                // Find matching close paren.
                let depth = 1;
                let i = m.index + m[0].length;
                let inStr = null;
                let inLine = false;
                let inBlock = false;
                while (i < code.length && depth > 0) {
                    const c = code[i];
                    const c2 = code[i + 1];
                    if (inLine) {
                        if (c === '\n') inLine = false;
                    } else if (inBlock) {
                        if (c === '*' && c2 === '/') { inBlock = false; i++; }
                    } else if (inStr) {
                        if (c === '\\') { i++; }
                        else if (c === inStr) { inStr = null; }
                        else if (inStr === '`' && c === '$' && c2 === '{') {
                            // template ${...} — track as separate paren depth via nested string state.
                            // Conservatively bail out: treat as part of string until matching `}`.
                            i++; // skip $
                            // walk until balanced `}`
                            let braceDepth = 1;
                            i++; // skip {
                            while (i < code.length && braceDepth > 0) {
                                const cc = code[i];
                                if (cc === '{') braceDepth++;
                                else if (cc === '}') braceDepth--;
                                i++;
                            }
                            continue;
                        }
                    } else {
                        if (c === '/' && c2 === '/') { inLine = true; i++; }
                        else if (c === '/' && c2 === '*') { inBlock = true; i++; }
                        else if (c === '"' || c === '\'' || c === '`') { inStr = c; }
                        else if (c === '(') depth++;
                        else if (c === ')') depth--;
                    }
                    i++;
                }
                if (depth !== 0) continue; // malformed; skip

                // Optional trailing semicolon
                let end = i;
                while (end < code.length && /[ \t]/.test(code[end])) end++;
                if (code[end] === ';') end++;

                out += code.slice(last, m.index) + 'void 0;';
                last = end;
                mutated = true;
            }
            if (!mutated) return null;
            out += code.slice(last);
            return { code: out, map: null };
        },
    };
}

const plugins = isDebug ? [] : (() => {
    // Shared mutable name cache for terser. Mutated in place as each bundle is
    // minified so that mangled identifier names stay consistent across chunks
    // that import each other (./wasip3.js, ./wasip2-via-wasip3.js, etc.).
    const sharedNameCache = {};
    return [terser({
        ecma: 2022,
        nameCache: sharedNameCache,
        compress: {
            defaults: true,
            module: true,
            ecma: 2022,
            toplevel: true,
            passes: 4,
            computed_props: false,
        },
        mangle: {
            module: true,
            toplevel: true,
            properties: {
                // keep_quoted: true means any property accessed via `obj['name']`
                // syntax anywhere in source is auto-reserved. With `builtins:false`
                // (default), terser also reserves the DOM/built-in property list.
                keep_quoted: true,
                reserved: [
                    ...reservedProps,
                    ...reservedWitNames,
                ],
            },
        },
    })];
})();
const banner = '#!/usr/bin/env node\n//! Pavel Savara licenses this file to you under the Apache-2.0 license with LLVM exception.\n';
const externalDependencies = ['module', 'fs', 'gitHash', /^node:/];
const outDir = isDebug ? 'dist/debug' : 'dist/release';
/** Rollup plugin: externalize sibling module imports (wasip2, wasip2-node, index) */
function externalizeSiblingModules(options) {
    const skipExternals = new Set(options?.skipExternals ?? []);
    const srcDir = path.resolve('./src');
    const wasip1ViaP3Entry = path.resolve('./src/host/wasip1-via-wasip3/index.ts');
    const wasip2ViaP3Entry = path.resolve('./src/host/wasip2-via-wasip3/index.ts');
    const wasip2ViaP3NodeEntry = path.resolve('./src/host/wasip2-via-wasip3/node/index.ts');
    const wasip3Entry = path.resolve('./src/host/wasip3/wasip3.ts');
    const wasip3NodeEntry = path.resolve('./src/host/wasip3/node/wasip3.ts');
    const wasip3Index = path.resolve('./src/host/wasip3/index.ts');
    const cliEntry = path.resolve('./src/cli.ts');
    return {
        name: 'externalize-sibling-modules',
        resolveId(source, importer) {
            if (!importer || !path.resolve(importer).startsWith(srcDir)) {
                return null;
            }
            // Resolve the import to an absolute path and check if it matches a sibling entry
            const importerDir = path.dirname(path.resolve(importer));
            const resolved = path.resolve(importerDir, source);
            // Match with or without .ts extension, or directory/index.ts
            const resolvedTs = resolved.endsWith('.ts') ? resolved : resolved + '.ts';
            const resolvedIndex = path.join(resolved, 'index.ts');

            if (!skipExternals.has('wasip1-via-wasip3') && (resolvedTs === wasip1ViaP3Entry || resolvedIndex === wasip1ViaP3Entry)) {
                return { id: './wasip1-via-wasip3.js', external: true };
            }
            if (!skipExternals.has('wasip2-via-wasip3') && (resolvedTs === wasip2ViaP3Entry || resolvedIndex === wasip2ViaP3Entry)) {
                return { id: './wasip2-via-wasip3.js', external: true };
            }
            if (!skipExternals.has('wasip2-via-wasip3-node') && (resolvedTs === wasip2ViaP3NodeEntry || resolvedIndex === wasip2ViaP3NodeEntry)) {
                return { id: './wasip2-via-wasip3-node.js', external: true };
            }
            if (!skipExternals.has('wasip3')) {
                if (resolvedTs === wasip3Entry || resolvedTs === wasip3Index || resolvedIndex === wasip3Index) {
                    return { id: './wasip3.js', external: true };
                }
            }
            if (!skipExternals.has('wasip3-node') && resolvedTs === wasip3NodeEntry) {
                return { id: './wasip3-node.js', external: true };
            }
            if (!skipExternals.has('cli') && resolvedTs === cliEntry) {
                return { id: './cli.js', external: true };
            }
            // Only externalize ./index from top-level src/ files
            if ((source === './index' || source === './index.js') && importerDir === srcDir) {
                return { id: './index.js', external: true };
            }
            return null;
        }
    };
}

const sourcePlugins = [
    virtual(constants),
    ...(isDebug ? [] : [stripDebugCalls()]),
    nodeResolve({
        extensions: ['.ts'],
    }),
    typescript({
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**', '**/integration-helpers.ts'],
        compilerOptions: { rootDir: './src' },
    })
];

const jsco = {
    treeshake: !isDebug,
    input: './src/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/index.js`,
            banner,
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        ...sourcePlugins,
    ]
};
const jscoTypes = {
    input: './src/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/index.d.ts`,
            banner: banner,
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        dts(),
    ],
};

// WASI Preview 2 via Preview 3 adapter
const wasip2ViaP3 = {
    treeshake: !isDebug,
    input: './src/host/wasip2-via-wasip3/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-via-wasip3.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        ...sourcePlugins,
    ],
};

const wasip2ViaP3Types = {
    input: './src/host/wasip2-via-wasip3/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-via-wasip3.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        dts(),
    ],
};

// WASI Preview 2 via Preview 3 adapter — Node.js extensions
const wasip2ViaP3Node = {
    treeshake: !isDebug,
    input: './src/host/wasip2-via-wasip3/node/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-via-wasip3-node.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip2-via-wasip3', 'wasip3'] }),
        ...sourcePlugins,
    ],
};

const wasip2ViaP3NodeTypes = {
    input: './src/host/wasip2-via-wasip3/node/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-via-wasip3-node.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip2-via-wasip3', 'wasip3'] }),
        dts(),
    ],
};

// WASIp3 — browser-compatible host module
const wasip3 = {
    treeshake: !isDebug,
    input: './src/host/wasip3/wasip3.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip3.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip3'] }),
        ...sourcePlugins,
    ],
};

// WASIp3 — Node.js-specific extensions
const wasip3Node = {
    treeshake: !isDebug,
    input: './src/host/wasip3/node/wasip3.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip3-node.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip3'] }),
        ...sourcePlugins,
    ],
};

const wasip3Types = {
    input: './src/host/wasip3/wasip3.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip3.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip3'] }),
        dts(),
    ],
};

const wasip3NodeTypes = {
    input: './src/host/wasip3/node/wasip3.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip3-node.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules({ skipExternals: ['wasip3'] }),
        dts(),
    ],
};

// WASI Preview 1 via Preview 3 adapter
const wasip1ViaP3 = {
    treeshake: !isDebug,
    input: './src/host/wasip1-via-wasip3/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip1-via-wasip3.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        ...sourcePlugins,
    ],
};

const wasip1ViaP3Types = {
    input: './src/host/wasip1-via-wasip3/index.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip1-via-wasip3.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        dts(),
    ],
};

// CLI entry — split out so browser users of `index.js` don't pay for
// `src/utils/args.ts` (~16 KB raw) and the CLI plumbing. `src/index.ts`
// dynamically imports `./cli.js` only when `process` is defined.
const cliBundle = {
    treeshake: !isDebug,
    input: './src/cli.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/cli.js`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    onwarn,
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        ...sourcePlugins,
    ],
};

export default defineConfig([
    wasip1ViaP3,
    wasip1ViaP3Types,
    wasip2ViaP3,
    wasip2ViaP3Types,
    wasip2ViaP3Node,
    wasip2ViaP3NodeTypes,
    wasip3,
    wasip3Types,
    wasip3Node,
    wasip3NodeTypes,
    cliBundle,
    jsco,
    jscoTypes,
]);


const locationCache = {};
function sourcemapPathTransform(relativeSourcePath, sourcemapPath) {
    let res = locationCache[relativeSourcePath];
    if (res === undefined) {
        if (!isContinuousIntegrationBuild) {
            const sourcePath = path.resolve(
                path.dirname(sourcemapPath),
                relativeSourcePath
            );
            res = `file:///${sourcePath.replace(/\\/g, '/')}`;
        } else {
            relativeSourcePath = relativeSourcePath.substring(12);
            res = `https://raw.githubusercontent.com/pavelsavara/jsco/${gitHash}/${relativeSourcePath}`;
        }
        locationCache[relativeSourcePath] = res;
    }
    return res;
}

function onwarn(warning) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') {
        return;
    }
    // eslint-disable-next-line no-console
    console.warn(`(!) ${warning.toString()} ${warning.code}`);
}
