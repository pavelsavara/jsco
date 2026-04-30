// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Patches WASIp3 WIT files in wit/wasip3-copy to be parseable by jco 1.17.6:
// 1. Remove duplicate `package` lines (keep first only)
// 2. Remove `async` keyword from func declarations
// 3. Replace `stream<T>` with `list<T>`
// 4. Replace `future<T>` with `T` (unwrap one level)

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'node:fs/promises';

const base = resolve('wit/wasip3-copy');

// Collect all .wit files recursively
const witFiles = [];
for await (const entry of glob('**/*.wit', { cwd: base })) {
    witFiles.push(resolve(base, entry));
}

console.log(`Found ${witFiles.length} WIT files to patch.\n`);

for (const filePath of witFiles) {
    const rel = filePath.slice(base.length + 1).replace(/\\/g, '/');
    let content = await readFile(filePath, 'utf8');
    const original = content;

    // 1. Remove duplicate package lines — keep only the first `package ...;`
    let firstPackage = true;
    content = content.replace(/^package [^;]+;\s*$/gm, (match) => {
        if (firstPackage) {
            firstPackage = false;
            return match;
        }
        return ''; // remove subsequent package lines
    });

    // 2. Remove `async` keyword before `func`
    content = content.replace(/\basync\s+func\b/g, 'func');

    // 3. Replace `future<T>` with `T` (unwrap)
    // Need to handle nested angle brackets properly
    content = replaceFuture(content);

    // 4. Replace `stream<T>` with `list<T>`
    content = content.replace(/\bstream</g, 'list<');

    if (content !== original) {
        await writeFile(filePath, content);
        console.log(`Patched: ${rel}`);
    } else {
        console.log(`No changes: ${rel}`);
    }
}

console.log('\nDone patching.');

/**
 * Replace `future<T>` with just `T`, handling nested angle brackets.
 * E.g. `future<result<_, error-code>>` becomes `result<_, error-code>`
 */
function replaceFuture(text) {
    let result = '';
    let i = 0;
    const prefix = 'future<';
    while (i < text.length) {
        const idx = text.indexOf(prefix, i);
        if (idx === -1) {
            result += text.slice(i);
            break;
        }
        result += text.slice(i, idx);
        // Find matching closing >
        let depth = 1;
        let j = idx + prefix.length;
        while (j < text.length && depth > 0) {
            if (text[j] === '<') depth++;
            else if (text[j] === '>') depth--;
            j++;
        }
        // Extract inner content (without the outer future< ... >)
        const inner = text.slice(idx + prefix.length, j - 1);
        result += inner;
        i = j;
    }
    return result;
}
