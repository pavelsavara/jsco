// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..', '..');

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const filePath = join(root, url.pathname === '/' ? 'tests/browser/index.html' : url.pathname);

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
