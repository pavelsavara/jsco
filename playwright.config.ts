// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    timeout: 30000,
    use: {
        headless: true,
        baseURL: 'http://localhost:3210',
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
        {
            name: 'firefox',
            use: { browserName: 'firefox' },
        },
    ],
    webServer: {
        command: 'node tests/browser/serve.mjs',
        port: 3210,
        reuseExistingServer: true,
    },
});
