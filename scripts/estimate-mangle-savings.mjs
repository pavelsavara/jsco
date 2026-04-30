// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Estimate raw byte savings if a name were converted from `.name`/`name(`/`name:` style
// member usage to a single-letter mangled identifier `[a]`. The string literal still
// has to be declared once (`const a="name"` ≈ 8 + name.length bytes per bundle that uses it),
// so we only count occurrences of the form:
//   .name        — member access, savings = name.length + 1 - 3
//   name:        — object property key shorthand (would become [a]:)
// We exclude bare quoted "name" usage (those wouldn't benefit; they're already string values).

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist', 'release');

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const reservedProps = require(join(repoRoot, 'scripts', 'reserved-props.cjs'));
const reservedWit = require(join(repoRoot, 'scripts', 'reserved-wit-names.cjs'));
const sources = new Map();
for (const n of reservedProps) sources.set(n, 'props');
for (const n of reservedWit) sources.set(n, sources.has(n) ? 'both' : 'wit');

const bundles = readdirSync(distDir).filter((f) => f.endsWith('.js')).sort()
    .map((f) => ({ name: f, code: readFileSync(join(distDir, f), 'utf8') }));

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const rows = [];
for (const [name, source] of sources) {
    const e = escapeRe(name);
    // member access: `.name` followed by non-ident (or end)
    const memberRe = new RegExp(`\\.${e}(?![a-zA-Z0-9_$])`, 'g');
    // string literal as standalone: "name" or 'name'
    const literalRe = new RegExp(`(?:"${e}"|'${e}')`, 'g');
    let memberHits = 0, literalHits = 0, bundlesUsing = 0;
    for (const b of bundles) {
        const m = b.code.match(memberRe);
        const l = b.code.match(literalRe);
        const mc = m ? m.length : 0;
        const lc = l ? l.length : 0;
        memberHits += mc;
        literalHits += lc;
        if (mc > 0 || lc > 0) bundlesUsing += 1;
    }
    // Each member hit currently costs `.name` (name.length+1). After refactor: `[a]` (3 chars).
    // Savings per member hit = name.length + 1 - 3 = name.length - 2.
    // Const declaration cost per bundle that uses it: `const a="name"` ≈ name.length + 11.
    // (We're optimistic: the existing reserved entry currently makes the literal not appear at all,
    // since terser drops it; after refactor, the literal is forced via the const decl.)
    const perSiteSaving = Math.max(0, name.length - 2);
    const declCost = (name.length + 11) * bundlesUsing;
    const grossSaving = memberHits * perSiteSaving;
    const netSaving = grossSaving - declCost;
    rows.push({ name, source, len: name.length, memberHits, literalHits, bundlesUsing, grossSaving, declCost, netSaving });
}

rows.sort((a, b) => b.netSaving - a.netSaving);

const top = rows.filter((r) => r.netSaving > 0);
const nameW = Math.max(4, ...top.slice(0, 50).map((r) => r.name.length));
console.log(`${'name'.padEnd(nameW)}  src    len  member  literal  bndl   gross   decl   net`);
console.log('-'.repeat(nameW + 60));
let totalNet = 0, totalGross = 0;
for (const r of top.slice(0, 50)) {
    totalNet += r.netSaving;
    totalGross += r.grossSaving;
    console.log(`${r.name.padEnd(nameW)}  ${r.source.padEnd(5)}  ${String(r.len).padStart(3)}  ${String(r.memberHits).padStart(6)}  ${String(r.literalHits).padStart(7)}  ${String(r.bundlesUsing).padStart(4)}  ${String(r.grossSaving).padStart(5)}  ${String(r.declCost).padStart(5)}  ${String(r.netSaving).padStart(5)}`);
}
console.log('-'.repeat(nameW + 60));
const totalsAll = rows.reduce((acc, r) => ({
    gross: acc.gross + Math.max(0, r.grossSaving),
    net: acc.net + Math.max(0, r.netSaving),
}), { gross: 0, net: 0 });
console.log(`Top-50 (positive net only): gross=${totalGross}  net=${totalNet}`);
console.log(`All names (positive net only): gross=${totalsAll.gross}  net=${totalsAll.net}`);
console.log(`Names with positive net savings: ${top.length}`);
