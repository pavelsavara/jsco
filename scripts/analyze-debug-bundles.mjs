// Analyze debug bundles for duplicated TS sources.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = 'dist/debug';
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const sourceMap = new Map(); // norm src -> [{bundle, sz}]

function diskSize(rel) {
    const abs = resolve(rel);
    if (!existsSync(abs)) return 0;
    try { return statSync(abs).size; } catch { return 0; }
}

for (const f of files) {
    const map = JSON.parse(readFileSync(join(dir, f + '.map'), 'utf8'));
    for (let i = 0; i < map.sources.length; i++) {
        const src = map.sources[i];
        const norm = src.replace(/\\/g, '/').replace(/^.*\/jsco2\//, '').replace(/^file:\/\/\//, '').replace(/^[a-zA-Z]:\//, '');
        // Bundle source paths are like "../../src/foo.ts" — also handle url style
        const cleaned = norm.replace(/^\.\.\/+/g, '').replace(/^\/+/, '');
        const sz = diskSize(cleaned);
        if (!sourceMap.has(cleaned)) sourceMap.set(cleaned, []);
        sourceMap.get(cleaned).push({ bundle: f, sz });
    }
}

const dups = [];
for (const [src, refs] of sourceMap.entries()) {
    if (refs.length > 1) dups.push({ src, refs });
}
dups.sort((a, b) => (b.refs[0].sz * (b.refs.length - 1)) - (a.refs[0].sz * (a.refs.length - 1)));

console.log('Sources present in >1 bundle (top 60 by extra-copy bytes):');
console.log('cnt  src-B  extraB  src -> bundles');
for (const d of dups.slice(0, 60)) {
    const extra = d.refs[0].sz * (d.refs.length - 1);
    console.log(
        String(d.refs.length).padStart(2),
        String(d.refs[0].sz).padStart(6),
        String(extra).padStart(7),
        d.src,
        '->',
        d.refs.map((r) => r.bundle.replace('.js', '')).join(','),
    );
}

const totalSrc = [...sourceMap.values()].reduce((a, refs) => a + refs[0].sz, 0);
const totalDupExtra = dups.reduce((a, d) => a + d.refs[0].sz * (d.refs.length - 1), 0);
console.log('');
console.log('Unique TS source files:', sourceMap.size);
console.log('Files appearing in >1 bundle:', dups.length);
console.log('Total source bytes (unique):', totalSrc);
console.log('Total extra-copy source bytes (sum over redundant copies):', totalDupExtra);
console.log('Ratio extra/unique:', (totalDupExtra / totalSrc).toFixed(2));

// Per-bundle counts.
console.log('');
console.log('Per-bundle source count (debug):');
const perBundle = new Map();
for (const refs of sourceMap.values()) for (const r of refs) {
    perBundle.set(r.bundle, (perBundle.get(r.bundle) || 0) + 1);
}
for (const [b, n] of [...perBundle.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ', b.padEnd(28), n.toString().padStart(4), 'sources');
}
