// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

// Reports raw and gzipped sizes for every *.js file under dist/release
// and the total, plus a guard mode (--check) against bundle-size.json.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const releaseDir = join(root, 'dist', 'release');
const baselinePath = join(root, 'bundle-size.json');

const checkMode = argv.includes('--check');
// Allow CI to run with a tolerance budget; default 5%.
const toleranceArg = argv.find((a) => a.startsWith('--tolerance='));
const tolerance = toleranceArg ? Number(toleranceArg.split('=')[1]) : 0.05;
const writeMode = argv.includes('--write');

if (!existsSync(releaseDir)) {
    console.error(`No release build found at ${releaseDir}. Run \`npm run build:release\` first.`);
    exit(1);
}

const files = readdirSync(releaseDir).filter((f) => f.endsWith('.js')).sort();
/** @type {Record<string, { raw: number, gzip: number }>} */
const sizes = {};
let totalRaw = 0;
let totalGzip = 0;
for (const f of files) {
    const buf = readFileSync(join(releaseDir, f));
    const raw = buf.length;
    const gzip = gzipSync(buf, { level: 9 }).length;
    sizes[f] = { raw, gzip };
    totalRaw += raw;
    totalGzip += gzip;
}
sizes['__TOTAL__'] = { raw: totalRaw, gzip: totalGzip };

function fmt(n) { return n.toLocaleString('en-US'); }

const widthName = Math.max(8, ...files.map((f) => f.length));
console.log('');
console.log(`Bundle sizes (${releaseDir}):`);
console.log('  ' + 'file'.padEnd(widthName) + '  ' + 'raw'.padStart(10) + '  ' + 'gzip'.padStart(10));
console.log('  ' + '-'.repeat(widthName) + '  ' + '-'.repeat(10) + '  ' + '-'.repeat(10));
for (const f of files) {
    const { raw, gzip } = sizes[f];
    console.log('  ' + f.padEnd(widthName) + '  ' + fmt(raw).padStart(10) + '  ' + fmt(gzip).padStart(10));
}
console.log('  ' + '-'.repeat(widthName) + '  ' + '-'.repeat(10) + '  ' + '-'.repeat(10));
console.log('  ' + 'TOTAL'.padEnd(widthName) + '  ' + fmt(totalRaw).padStart(10) + '  ' + fmt(totalGzip).padStart(10));
console.log('');

if (writeMode) {
    const out = JSON.stringify({ tolerance, sizes }, null, 4) + '\n';
    const fs = await import('node:fs');
    fs.writeFileSync(baselinePath, out);
    console.log(`Wrote baseline to ${baselinePath}`);
    exit(0);
}

if (checkMode) {
    if (!existsSync(baselinePath)) {
        console.error(`No baseline at ${baselinePath}. Run \`npm run size:write\` to create one.`);
        exit(1);
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const tol = baseline.tolerance ?? tolerance;
    let failed = false;
    for (const [name, base] of Object.entries(baseline.sizes)) {
        const cur = sizes[name];
        if (!cur) {
            console.error(`MISSING: ${name} not produced by current build.`);
            failed = true;
            continue;
        }
        const limit = Math.ceil(base.gzip * (1 + tol));
        if (cur.gzip > limit) {
            console.error(`REGRESSION: ${name} gzip ${fmt(cur.gzip)} > limit ${fmt(limit)} (baseline ${fmt(base.gzip)} + ${(tol * 100).toFixed(1)}%)`);
            failed = true;
        }
    }
    if (failed) {
        console.error('');
        console.error('Bundle size regression detected. If intentional, run `npm run size:write` to update bundle-size.json.');
        exit(1);
    }
    console.log(`All sizes within +${(tol * 100).toFixed(1)}% of baseline.`);
}
