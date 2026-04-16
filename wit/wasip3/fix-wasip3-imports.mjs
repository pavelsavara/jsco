import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, normalize } from 'path';

function walk(dir, cb) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, cb);
        else if (e.name.endsWith('.d.ts')) cb(p);
    }
}

let hostFixed = 0, guestFixed = 0;
walk('wit/wasip3/types', (filePath) => {
    if (filePath === normalize('wit/wasip3/types/wasip3-types.d.ts')) return;
    let content = readFileSync(filePath, 'utf8');
    const orig = content;

    // Remove import type line from host files
    content = content.replace(/^import type \{ WasiStreamReadable, WasiStreamWritable, WasiFuture \} from '[^']+wasip3-types\.js';\n/m, '');

    // Remove /// <reference path> to wasip3-types from guest files
    content = content.replace(/^\/\/\/ <reference path="[^"]*wasip3-types\.d\.ts" \/>\n/m, '');

    if (content !== orig) {
        writeFileSync(filePath, content);
        if (filePath.includes('host')) hostFixed++;
        else guestFixed++;
    }
});
console.log(`Host files fixed: ${hostFixed}`);
console.log(`Guest files fixed: ${guestFixed}`);
