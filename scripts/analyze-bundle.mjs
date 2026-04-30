// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Per-source attribution of dist/release/*.js bytes via source maps.
// For every output byte, look up the originating source file via the source
// map and accumulate. Reports the top contributors and rolls up by directory.
//
// Usage:
//   node scripts/analyze-bundle.mjs                # all bundles, top 30 each
//   node scripts/analyze-bundle.mjs index.js       # one bundle
//   node scripts/analyze-bundle.mjs --limit 50     # different cap
//   node scripts/analyze-bundle.mjs --rollup       # group by top-level src dir

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist', 'release');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 30;
const rollup = args.includes('--rollup');
const filtered = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const targetBundles = filtered.length > 0 ? filtered : null;

const bundleFiles = readdirSync(distDir).filter((f) => f.endsWith('.js') && (!targetBundles || targetBundles.includes(f))).sort();

function normalizeSource(s) {
    if (!s) return '<unknown>';
    // Strip leading ../ chains and any drive prefix; collapse to a workspace-relative path.
    let n = s.replace(/\\/g, '/');
    // Drop everything up to and including '/jsco2/' or '/jsco/' if present.
    const m = n.match(/\/jsco2?\/(.+)$/);
    if (m) n = m[1];
    // Collapse leading ../
    while (n.startsWith('../')) n = n.slice(3);
    return n;
}

function topDir(src) {
    if (src === '<unknown>') return '<unknown>';
    const parts = src.split('/');
    if (parts[0] === 'src' && parts.length >= 3) return parts.slice(0, 3).join('/');
    if (parts[0] === 'src' && parts.length >= 2) return parts.slice(0, 2).join('/');
    return parts[0] ?? '<unknown>';
}

function pad(s, n) { return String(s).padEnd(n); }
function padR(s, n) { return String(s).padStart(n); }

let grandTotal = 0;
const summary = [];

for (const bundleFile of bundleFiles) {
    const codePath = join(distDir, bundleFile);
    const mapPath = codePath + '.map';
    const code = readFileSync(codePath, 'utf8');
    let mapJson;
    try {
        mapJson = JSON.parse(readFileSync(mapPath, 'utf8'));
    } catch {
        console.error(`(no map for ${bundleFile}, skipping)`);
        continue;
    }
    const map = new TraceMap(mapJson);

    // For each character in the minified output, determine the source file.
    // Walk lines and columns; each character is attributed to whichever source
    // contains the *most recent* mapping at or before that column.
    const perSource = new Map();
    const lines = code.split('\n');
    for (let line = 0; line < lines.length; line++) {
        const lineText = lines[line];
        let curSource = '<unknown>';
        let curUntilCol = 0;
        // Pre-compute mappings on this line by sweeping columns. Cheap: just
        // call originalPositionFor once per column where the answer changes.
        // We approximate by sampling at every column — the cost is O(L*C) but
        // bundles are <500 KB so this completes in <1 s.
        for (let col = 0; col < lineText.length; col++) {
            if (col >= curUntilCol) {
                const op = originalPositionFor(map, { line: line + 1, column: col });
                curSource = normalizeSource(op.source);
                // Find next column with different source: try a binary-ish jump.
                // Simpler: just advance one column and re-check on next iteration.
                curUntilCol = col + 1;
            }
            perSource.set(curSource, (perSource.get(curSource) ?? 0) + 1);
        }
        // Newline byte
        perSource.set(curSource, (perSource.get(curSource) ?? 0) + 1);
    }

    const total = code.length;
    grandTotal += total;
    const rows = [...perSource.entries()].map(([src, bytes]) => ({ src, bytes, pct: bytes / total * 100 }));
    rows.sort((a, b) => b.bytes - a.bytes);

    summary.push({ bundle: bundleFile, total, rows });

    console.log(`\n=== ${bundleFile}  (${total.toLocaleString()} bytes raw) ===`);
    if (rollup) {
        const byDir = new Map();
        for (const r of rows) {
            const d = topDir(r.src);
            byDir.set(d, (byDir.get(d) ?? 0) + r.bytes);
        }
        const dirRows = [...byDir.entries()].map(([d, b]) => ({ d, b, pct: b / total * 100 }));
        dirRows.sort((a, b) => b.b - a.b);
        console.log(`${pad('directory', 40)}  ${padR('bytes', 8)}  ${padR('%', 6)}`);
        console.log('-'.repeat(40 + 2 + 8 + 2 + 6));
        for (const r of dirRows) {
            console.log(`${pad(r.d, 40)}  ${padR(r.b.toLocaleString(), 8)}  ${padR(r.pct.toFixed(1), 6)}`);
        }
    } else {
        console.log(`${pad('source', 60)}  ${padR('bytes', 8)}  ${padR('%', 6)}`);
        console.log('-'.repeat(60 + 2 + 8 + 2 + 6));
        for (const r of rows.slice(0, limit)) {
            console.log(`${pad(r.src, 60)}  ${padR(r.bytes.toLocaleString(), 8)}  ${padR(r.pct.toFixed(1), 6)}`);
        }
    }
}

console.log(`\nGrand total: ${grandTotal.toLocaleString()} bytes across ${bundleFiles.length} bundle(s).`);
