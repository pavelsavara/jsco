// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Post-process generated WASIp3 .d.ts files:
// Replace simplified stream/future types with WasiStreamReadable, WasiStreamWritable, WasiFuture wrappers.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { glob } from 'node:fs/promises';

const base = resolve('wit/wasip3/types');

// ─── Replacement rules ───
// Each rule targets a specific file pattern + a regex to match the exact signature line.
// The replacement callback transforms the matched line.

const rules = [
    // ── CLI stdin ──
    {
        file: 'wasi-cli-stdin.d.ts',
        match: /^(\s*export function readViaStream\(\)): \[Uint8Array, (Result<void, ErrorCode>)\];$/,
        replace: (m, sig, res) => `${sig}: [WasiStreamWritable<Uint8Array>, WasiFuture<${res}>];`,
    },
    // ── CLI stdout ──
    {
        file: 'wasi-cli-stdout.d.ts',
        match: /^(\s*export function writeViaStream)\(data: Uint8Array\): void;$/,
        replace: (m, fn) => `${fn}(data: WasiStreamReadable<Uint8Array>): WasiFuture<void>;`,
    },
    // ── CLI stderr ──
    {
        file: 'wasi-cli-stderr.d.ts',
        match: /^(\s*export function writeViaStream)\(data: Uint8Array\): void;$/,
        replace: (m, fn) => `${fn}(data: WasiStreamReadable<Uint8Array>): WasiFuture<void>;`,
    },
    // ── Filesystem types: Descriptor methods ──
    {
        file: 'wasi-filesystem-types.d.ts',
        match: /^(\s+readViaStream\(offset: Filesize\)): \[Uint8Array, (Result<void, ErrorCode>)\];$/,
        replace: (m, sig, res) => `${sig}: [WasiStreamWritable<Uint8Array>, WasiFuture<${res}>];`,
    },
    {
        file: 'wasi-filesystem-types.d.ts',
        match: /^(\s+writeViaStream)\(data: Uint8Array, (offset: Filesize)\): void;$/,
        replace: (m, fn, rest) => `${fn}(data: WasiStreamReadable<Uint8Array>, ${rest}): WasiFuture<void>;`,
    },
    {
        file: 'wasi-filesystem-types.d.ts',
        match: /^(\s+appendViaStream)\(data: Uint8Array\): void;$/,
        replace: (m, fn) => `${fn}(data: WasiStreamReadable<Uint8Array>): WasiFuture<void>;`,
    },
    {
        file: 'wasi-filesystem-types.d.ts',
        match: /^(\s+readDirectory\(\)): \[Array<DirectoryEntry>, (Result<void, ErrorCode>)\];$/,
        replace: (m, sig, res) => `${sig}: [WasiStreamWritable<DirectoryEntry>, WasiFuture<${res}>];`,
    },
    // ── Sockets types: TcpSocket ──
    {
        file: 'wasi-sockets-types.d.ts',
        match: /^(\s+listen\(\)): Array<TcpSocket>;$/,
        replace: (m, sig) => `${sig}: WasiStreamWritable<TcpSocket>;`,
    },
    {
        file: 'wasi-sockets-types.d.ts',
        match: null,
        class: 'TcpSocket',
        method: 'send',
        matchLine: /^(\s+send)\(data: Uint8Array\): void;$/,
        replaceLine: (m, fn) => `${fn}(data: WasiStreamReadable<Uint8Array>): WasiFuture<void>;`,
    },
    {
        file: 'wasi-sockets-types.d.ts',
        match: null,
        class: 'TcpSocket',
        method: 'receive',
        matchLine: /^(\s+receive\(\)): \[Uint8Array, (Result<void, ErrorCode>)\];$/,
        replaceLine: (m, sig, res) => `${sig}: [WasiStreamWritable<Uint8Array>, WasiFuture<${res}>];`,
    },
    // ── HTTP types: Request ──
    {
        file: 'wasi-http-types.d.ts',
        match: /^(\s+static 'new'\(headers: Headers), contents: Uint8Array \| undefined, trailers: (Result<Trailers \| undefined, ErrorCode>), (options: RequestOptions \| undefined)\): \[Request, (Result<void, ErrorCode>)\];$/,
        replace: (m, start, trailersType, opts, futType) =>
            `${start}, contents: WasiStreamReadable<Uint8Array> | undefined, trailers: WasiFuture<${trailersType}>, ${opts}): [Request, WasiFuture<${futType}>];`,
    },
    {
        file: 'wasi-http-types.d.ts',
        match: /^(\s+static consumeBody\(this_: Request), res: (Result<void, ErrorCode>)\): \[Uint8Array, (Result<Trailers \| undefined, ErrorCode>)\];$/,
        replace: (m, start, resParam, trailersRes) =>
            `${start}, res: WasiFuture<${resParam}>): [WasiStreamWritable<Uint8Array>, WasiFuture<${trailersRes}>];`,
    },
    {
        file: 'wasi-http-types.d.ts',
        match: /^(\s+static 'new'\(headers: Headers), contents: Uint8Array \| undefined, trailers: (Result<Trailers \| undefined, ErrorCode>)\): \[Response, (Result<void, ErrorCode>)\];$/,
        replace: (m, start, trailersType, futType) =>
            `${start}, contents: WasiStreamReadable<Uint8Array> | undefined, trailers: WasiFuture<${trailersType}>): [Response, WasiFuture<${futType}>];`,
    },
    {
        file: 'wasi-http-types.d.ts',
        match: /^(\s+static consumeBody\(this_: Response), res: (Result<void, ErrorCode>)\): \[Uint8Array, (Result<Trailers \| undefined, ErrorCode>)\];$/,
        replace: (m, start, resParam, trailersRes) =>
            `${start}, res: WasiFuture<${resParam}>): [WasiStreamWritable<Uint8Array>, WasiFuture<${trailersRes}>];`,
    },
];

// ─── Collect all .d.ts files ───
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
    const fileRules = rules.filter(r => r.file === fileName);
    if (fileRules.length === 0) continue;

    let content = await readFile(filePath, 'utf8');
    const original = content;
    let changes = 0;
    const lines = content.split('\n');

    // For class-scoped rules, find class boundaries
    const classRules = fileRules.filter(r => r.class);
    const lineRules = fileRules.filter(r => r.match);

    // Apply line-level rules (non-class-scoped)
    for (const rule of lineRules) {
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(rule.match);
            if (m) {
                lines[i] = rule.replace(...m);
                changes++;
            }
        }
    }

    // Apply class-scoped rules
    if (classRules.length > 0) {
        let currentClass = null;
        let classDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const classMatch = lines[i].match(/^\s*export class (\w+)/);
            if (classMatch) {
                currentClass = classMatch[1];
                classDepth = 0;
            }
            // Track brace depth within class
            if (currentClass) {
                for (const ch of lines[i]) {
                    if (ch === '{') classDepth++;
                    else if (ch === '}') {
                        classDepth--;
                        if (classDepth === 0) currentClass = null;
                    }
                }
            }

            // Apply matching class rules
            for (const rule of classRules) {
                if (currentClass === rule.class) {
                    const m = lines[i].match(rule.matchLine);
                    if (m) {
                        lines[i] = rule.replaceLine(...m);
                        changes++;
                    }
                }
            }
        }
    }

    content = lines.join('\n');

    if (changes > 0) {
        // Determine if this is a guest file (declare module) or host file (export)
        const isGuest = content.includes('declare module ');
        const relImport = relative(dirname(filePath), resolve(base, 'wasip3-types')).replace(/\\/g, '/');
        const relPath = relImport.startsWith('.') ? relImport : './' + relImport;

        if (isGuest) {
            // For guest files, add a triple-slash reference directive
            const refLine = `/// <reference path="${relPath}.d.ts" />\n`;
            if (!content.includes(refLine.trim())) {
                content = refLine + content;
            }
        } else {
            // For host files, add an import type statement after the first line
            const importLine = `import type { WasiStreamReadable, WasiStreamWritable, WasiFuture } from '${relPath}.js';\n`;
            const firstNewline = content.indexOf('\n');
            content = content.slice(0, firstNewline + 1) + importLine + content.slice(firstNewline + 1);
        }

        await writeFile(filePath, content);
        console.log(`Patched ${rel} (${changes} changes)`);
        totalChanges += changes;
    }
}

console.log(`\nDone. ${totalChanges} total stream/future type replacements.`);
