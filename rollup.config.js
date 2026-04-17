// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import virtual from '@rollup/plugin-virtual';
import * as path from 'path';
import dts from 'rollup-plugin-dts';
import gitCommitInfo from 'git-commit-info';

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
const plugins = isDebug ? [] : [terser({
    ecma: 2022,
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
            keep_quoted: 'strict',
            reserved: ['leb128DecodeU64', 'leb128DecodeI64', 'leb128EncodeU64', 'leb128EncodeI64', 'buf', 'buffer', 'memory']
        },
    },
})];
const banner = '#!/usr/bin/env node\n//! Pavel Savara licenses this file to you under the MIT license.\n';
const externalDependencies = ['module', 'fs', 'gitHash'];
const outDir = isDebug ? 'dist/debug' : 'dist/release';
/** Rollup plugin: externalize sibling module imports (wasip2, wasip2-node, index) */
function externalizeSiblingModules(options) {
    const skipExternals = new Set(options?.skipExternals ?? []);
    const srcDir = path.resolve('./src');
    const wasip2Entry = path.resolve('./src/host/wasip2/wasip2.ts');
    const wasip2NodeEntry = path.resolve('./src/host/wasip2/node/wasip2.ts');
    const wasip2ViaP3Entry = path.resolve('./src/host/wasip2-via-wasip3/index.ts');
    const wasip3Entry = path.resolve('./src/host/wasip3/wasip3.ts');
    const wasip3NodeEntry = path.resolve('./src/host/wasip3/node/wasip3.ts');
    const wasip3Index = path.resolve('./src/host/wasip3/index.ts');
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

            if (!skipExternals.has('wasip2') && resolvedTs === wasip2Entry) {
                return { id: './wasip2.js', external: true };
            }
            if (!skipExternals.has('wasip2-node') && resolvedTs === wasip2NodeEntry) {
                return { id: './wasip2-node.js', external: true };
            }
            if (!skipExternals.has('wasip2-via-wasip3') && (resolvedTs === wasip2ViaP3Entry || resolvedIndex === wasip2ViaP3Entry)) {
                return { id: './wasip2-via-wasip3.js', external: true };
            }
            if (!skipExternals.has('wasip3')) {
                if (resolvedTs === wasip3Entry || resolvedTs === wasip3Index || resolvedIndex === wasip3Index) {
                    return { id: './wasip3.js', external: true };
                }
            }
            if (!skipExternals.has('wasip3-node') && resolvedTs === wasip3NodeEntry) {
                return { id: './wasip3-node.js', external: true };
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
    plugins: [dts()],
};

// WASI Preview 2 — browser-compatible host module
const wasip2 = {
    treeshake: !isDebug,
    input: './src/host/wasip2/wasip2.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2.js`,
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


// WASI Preview 2 — Node.js-specific extensions
const wasip2Node = {
    treeshake: !isDebug,
    input: './src/host/wasip2/node/wasip2.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-node.js`,
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


const wasip2Types = {
    input: './src/host/wasip2/wasip2.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
        }
    ],
    external: externalDependencies,
    plugins: [
        externalizeSiblingModules(),
        dts(),
    ],
};

const wasip2NodeTypes = {
    input: './src/host/wasip2/node/wasip2.ts',
    output: [
        {
            format: 'es',
            file: `${outDir}/wasip2-node.d.ts`,
            banner: banner.replace('#!/usr/bin/env node\n', ''),
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
        externalizeSiblingModules(),
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
        externalizeSiblingModules(),
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

export default defineConfig([
    jsco,
    jscoTypes,
    wasip2,
    wasip2Types,
    wasip2Node,
    wasip2NodeTypes,
    wasip2ViaP3,
    wasip2ViaP3Types,
    wasip3,
    wasip3Types,
    wasip3Node,
    wasip3NodeTypes,
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
