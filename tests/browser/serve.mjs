// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..', '..');

// Detect which build output directory exists (debug preferred, release fallback)
const distSubdir = existsSync(join(root, 'dist', 'debug')) ? 'debug' : 'release';

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Rewrite /dist/<file> to /dist/<debug|release>/<file>
    let pathname = url.pathname;
    if (pathname.startsWith('/dist/') && !pathname.startsWith('/dist/debug/') && !pathname.startsWith('/dist/release/')) {
        pathname = '/dist/' + distSubdir + pathname.slice('/dist'.length);
    }
    const filePath = join(root, pathname === '/' ? 'tests/browser/index.html' : pathname);

    try {
        const data = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3210, () => {
    console.log('Test server on http://localhost:3210');
});
