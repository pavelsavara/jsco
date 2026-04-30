// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// For each name listed in scripts/reserved-props.cjs and scripts/reserved-wit-names.cjs,
// count how many times it appears as a whole-word identifier across the release bundles.
// Usage:
//   node scripts/count-reserved-usage.mjs            # combined totals, sorted by count asc
//   node scripts/count-reserved-usage.mjs --zero     # only names with 0 occurrences
//   node scripts/count-reserved-usage.mjs --csv      # CSV output (per-bundle columns)

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist', 'release');

const args = new Set(process.argv.slice(2));
const onlyZero = args.has('--zero');
const csv = args.has('--csv');

// Load reserved lists via require so the .cjs files work as authored.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const reservedProps = require(join(repoRoot, 'scripts', 'reserved-props.cjs'));
const reservedWit = require(join(repoRoot, 'scripts', 'reserved-wit-names.cjs'));

const sources = new Map();
for (const n of reservedProps) sources.set(n, 'props');
for (const n of reservedWit) {
    if (sources.has(n)) sources.set(n, 'both');
    else sources.set(n, 'wit');
}

const bundleFiles = readdirSync(distDir).filter((f) => f.endsWith('.js')).sort();
const bundles = bundleFiles.map((f) => ({ name: f, code: readFileSync(join(distDir, f), 'utf8') }));

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const results = [];
for (const [name, source] of sources) {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, 'g');
    const perBundle = {};
    let total = 0;
    for (const b of bundles) {
        const m = b.code.match(re);
        const c = m ? m.length : 0;
        perBundle[b.name] = c;
        total += c;
    }
    results.push({ name, source, total, perBundle });
}

results.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));

if (csv) {
    const header = ['name', 'source', 'total', ...bundles.map((b) => b.name)].join(',');
    console.log(header);
    for (const r of results) {
        if (onlyZero && r.total !== 0) continue;
        const cols = [r.name, r.source, r.total, ...bundles.map((b) => r.perBundle[b.name])];
        console.log(cols.join(','));
    }
} else {
    const filtered = onlyZero ? results.filter((r) => r.total === 0) : results;
    const nameW = Math.max(4, ...filtered.map((r) => r.name.length));
    console.log(`${'name'.padEnd(nameW)}  src    total  ` + bundles.map((b) => b.name.padStart(8)).join(' '));
    console.log('-'.repeat(nameW + 8 + 9 + bundles.length * 9));
    for (const r of filtered) {
        const row = `${r.name.padEnd(nameW)}  ${r.source.padEnd(5)}  ${String(r.total).padStart(5)}  ` +
            bundles.map((b) => String(r.perBundle[b.name]).padStart(8)).join(' ');
        console.log(row);
    }
    console.log('-'.repeat(nameW + 8 + 9 + bundles.length * 9));
    const zeros = results.filter((r) => r.total === 0).length;
    const nonzero = results.length - zeros;
    console.log(`Total names: ${results.length}  (zero-occurrence: ${zeros}, present: ${nonzero})`);
    console.log(`  reserved-props.cjs only:   ${[...sources.values()].filter((v) => v === 'props').length}`);
    console.log(`  reserved-wit-names only:   ${[...sources.values()].filter((v) => v === 'wit').length}`);
    console.log(`  in both lists:             ${[...sources.values()].filter((v) => v === 'both').length}`);
}
