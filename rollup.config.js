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
    'env:gitHash': `export default "${gitHash}"`,
};
const plugins = isDebug ? [] : [terser({
    compress: {
        defaults: true,
    },
    mangle: {},
})];
const banner = '//! Pavel Savara licenses this file to you under the MIT license.\n';
const externalDependencies = ['module', 'fs', 'gitHash'];
const jsco = {
    treeshake: !isDebug,
    input: './src/index.ts',
    output: [
        {
            format: 'es',
            file: 'dist/index.js',
            banner,
            plugins,
            sourcemap: true,
            sourcemapPathTransform,
        }
    ],
    external: externalDependencies,
    plugins: [
        virtual(constants),
        nodeResolve({
            extensions: ['.ts'],
        }),
        typescript()
    ]
};
const jscoTypes = {
    input: './src/index.ts',
    output: [
        {
            format: 'es',
            file: 'dist/index.d.ts',
            banner: banner,
        }
    ],
    external: externalDependencies,
    plugins: [dts()],
};

export default defineConfig([
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
