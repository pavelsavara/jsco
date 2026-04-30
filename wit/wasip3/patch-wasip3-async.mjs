// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Post-process generated WASIp3 .d.ts files:
// Wrap return types with Promise<> for functions that were `async func` in the original WIT.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';

const base = resolve('wit/wasip3/types');

// Map: filename pattern → { class?: string, methods: string[] }
// Methods not inside a class are top-level `export function` declarations.
const asyncMethods = [
    {
        file: 'wasi-clocks-monotonic-clock.d.ts',
        functions: ['waitUntil', 'waitFor'],
    },
    {
        file: 'wasi-cli-run.d.ts',
        functions: ['run'],
    },
    {
        file: 'wasi-filesystem-types.d.ts',
        class: 'Descriptor',
        methods: [
            'advise', 'syncData', 'getFlags', 'getType', 'setSize', 'setTimes',
            'sync', 'createDirectoryAt', 'stat', 'statAt', 'setTimesAt',
            'linkAt', 'openAt', 'readlinkAt', 'removeDirectoryAt', 'renameAt',
            'symlinkAt', 'unlinkFileAt', 'isSameObject', 'metadataHash', 'metadataHashAt',
        ],
    },
    {
        file: 'wasi-sockets-ip-name-lookup.d.ts',
        functions: ['resolveAddresses'],
    },
    {
        file: 'wasi-sockets-types.d.ts',
        class: 'TcpSocket',
        methods: ['connect'],
    },
    {
        file: 'wasi-sockets-types.d.ts',
        class: 'UdpSocket',
        methods: ['send', 'receive'],
    },
    {
        file: 'wasi-http-handler.d.ts',
        functions: ['handle'],
    },
    {
        file: 'wasi-http-client.d.ts',
        functions: ['send'],
    },
];

// Collect all .d.ts files
const dtsFiles = [];
for await (const entry of glob('**/*.d.ts', { cwd: base })) {
    dtsFiles.push(resolve(base, entry));
}

console.log(`Found ${dtsFiles.length} .d.ts files.\n`);

let totalChanges = 0;

for (const filePath of dtsFiles) {
    const fileName = filePath.replace(/\\/g, '/').split('/').pop();
    const rel = filePath.slice(base.length + 1).replace(/\\/g, '/');

    // Find all rules that apply to this file
    const rules = asyncMethods.filter(r => r.file === fileName);
    if (rules.length === 0) continue;

    let content = await readFile(filePath, 'utf8');
    const original = content;
    let changes = 0;

    for (const rule of rules) {
        if (rule.functions) {
            // Top-level exported functions
            for (const fn of rule.functions) {
                // Match: export function name(...): ReturnType;
                const re = new RegExp(
                    `(export function ${fn}\\([^)]*\\)):\\s*([^;]+);`,
                    'g'
                );
                content = content.replace(re, (match, sig, ret) => {
                    changes++;
                    return `${sig}: Promise<${ret.trim()}>;`;
                });
            }
        }
        if (rule.class && rule.methods) {
            // Class methods - need to match within the right class
            // Strategy: find the class block, then replace methods within it
            const classStart = content.indexOf(`export class ${rule.class} `);
            if (classStart === -1) continue;

            // Find the end of the class (matching braces)
            let depth = 0;
            let classEnd = classStart;
            for (let i = classStart; i < content.length; i++) {
                if (content[i] === '{') depth++;
                else if (content[i] === '}') {
                    depth--;
                    if (depth === 0) { classEnd = i + 1; break; }
                }
            }

            const before = content.slice(0, classStart);
            let classBody = content.slice(classStart, classEnd);
            const after = content.slice(classEnd);

            for (const method of rule.methods) {
                // Match method signatures like:  methodName(...): ReturnType;
                const re = new RegExp(
                    `(  ${method}\\([^)]*\\)):\\s*([^;]+);`,
                    'g'
                );
                classBody = classBody.replace(re, (match, sig, ret) => {
                    changes++;
                    return `${sig}: Promise<${ret.trim()}>;`;
                });
            }

            content = before + classBody + after;
        }
    }

    if (content !== original) {
        await writeFile(filePath, content);
        console.log(`Patched ${rel} (${changes} changes)`);
        totalChanges += changes;
    }
}

console.log(`\nDone. ${totalChanges} total async method signatures wrapped with Promise<>.`);
