// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { types as typesComponent } from '@bytecodealliance/jco';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const packages = [
    { dir: 'cli', worlds: ['imports', 'command'] },
    { dir: 'clocks', worlds: ['imports'] },
    { dir: 'filesystem', worlds: ['imports'] },
    { dir: 'http', worlds: ['imports', 'proxy'] },
    { dir: 'io', worlds: ['imports'] },
    { dir: 'random', worlds: ['imports'] },
    { dir: 'sockets', worlds: ['imports'] },
];

const witBase = resolve('wit/wasip2');
const outBase = 'wit/wasip2/types';

for (const pkg of packages) {
    const witPath = resolve(witBase, pkg.dir);
    for (const world of pkg.worlds) {
        for (const guest of [false, true]) {
            const flavor = guest ? 'guest' : 'host';
            const outDir = `${outBase}/${pkg.dir}/${world}/${flavor}`;

            console.log(`Generating ${flavor} types for ${pkg.dir}/${world}...`);

            try {
                const files = await typesComponent(witPath, {
                    name: pkg.dir,
                    worldName: world,
                    outDir,
                    guest,
                    allFeatures: true,
                });

                for (const [filename, content] of Object.entries(files)) {
                    const filePath = resolve(filename);
                    await mkdir(dirname(filePath), { recursive: true });
                    await writeFile(filePath, content);
                    console.log(`  wrote ${filename}`);
                }
            } catch (err) {
                console.error(`  ERROR for ${pkg.dir}/${world}/${flavor}: ${err.message}`);
            }
        }
    }
}

console.log('\nDone.');
