// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { test, expect } from '@playwright/test';

test('echo component loads and runs in browser', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox lacks WebAssembly.promising()');

    await page.goto('/');
    // Wait for the test to complete
    await page.waitForFunction(() => window.__testResults && ('success' in window.__testResults), { timeout: 10000 });

    const results = await page.evaluate(() => window.__testResults);

    if (!results.success) {
        console.error('Browser error:', results.error); // eslint-disable-line no-console
        console.error('Stack:', results.stack); // eslint-disable-line no-console
    }

    expect(results.success).toBe(true);
    expect(results.boolResult).toBe(true);
    expect(results.u8Result).toBe(42);
    expect(results.exportKeys).toContain('jsco:test/echo-primitives@0.1.0');
});

test('WASI hello-world in browser', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox lacks WebAssembly.promising()');

    await page.goto('/tests/browser/hello-world.html');
    await page.waitForFunction(() => window.__testResults && ('success' in window.__testResults), { timeout: 10000 });

    const results = await page.evaluate(() => window.__testResults);

    if (!results.success) {
        console.error('Browser error:', results.error); // eslint-disable-line no-console
        console.error('Stack:', results.stack); // eslint-disable-line no-console
    }

    expect(results.success).toBe(true);
    expect(results.stdout).toContain('hello from jsco');
});

test('hello-city record passing in browser', async ({ page }) => {
    // Uses noJspi: true, works in both Chromium and Firefox
    await page.goto('/tests/browser/hello-city.html');
    await page.waitForFunction(() => window.__testResults && ('success' in window.__testResults), { timeout: 10000 });

    const results = await page.evaluate(() => window.__testResults);

    if (!results.success) {
        console.error('Browser error:', results.error); // eslint-disable-line no-console
        console.error('Stack:', results.stack); // eslint-disable-line no-console
    }

    expect(results.success).toBe(true);
    expect(results.logMessages.length).toBe(1);
    expect(results.greeting).toContain('Welcome to Prague');
    expect(results.greeting).toContain('drink');
});
