import { readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const typesDir = 'wit/wasip3/types';
const base = {
    compilerOptions: {
        target: 'es2022',
        skipLibCheck: false,
        moduleResolution: 'node',
        noEmit: true,
        strict: true,
        module: 'es2022',
    },
};

// Discover all guest worlds: wit/wasip3/types/{pkg}/{world}/guest
const worlds = [];
for (const pkg of readdirSync(typesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const pkgDir = join(typesDir, pkg.name);
    for (const world of readdirSync(pkgDir, { withFileTypes: true })) {
        if (!world.isDirectory()) continue;
        const guestDir = join(pkgDir, world.name, 'guest');
        if (existsSync(guestDir)) {
            worlds.push({ pkg: pkg.name, world: world.name, path: guestDir });
        }
    }
}

let totalErrors = 0;
const tmpConfig = 'tsconfig.wasip3-guest-tmp.json';

for (const w of worlds) {
    const config = {
        ...base,
        include: [
            `${typesDir}/wasip3-types.d.ts`,
            `${w.path}/**/*.d.ts`,
        ],
    };
    writeFileSync(tmpConfig, JSON.stringify(config, null, 2));

    try {
        execSync(`npx tsc -p ${tmpConfig}`, { stdio: 'pipe', encoding: 'utf8' });
        console.log(`✓ ${w.pkg}/${w.world}/guest — 0 errors`);
    } catch (e) {
        const lines = e.stdout.split('\n').filter(l => l.includes('error TS'));
        totalErrors += lines.length;
        console.log(`✗ ${w.pkg}/${w.world}/guest — ${lines.length} errors`);
        for (const line of lines.slice(0, 5)) {
            console.log(`  ${line.trim()}`);
        }
        if (lines.length > 5) console.log(`  ... and ${lines.length - 5} more`);
    }
}

// Cleanup
import('fs').then(fs => fs.unlinkSync(tmpConfig));

console.log(`\nTotal guest errors: ${totalErrors}`);
