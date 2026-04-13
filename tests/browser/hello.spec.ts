// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { test, expect } from '@playwright/test';

test('echo component loads and runs in browser', async ({ page }) => {
    await page.goto('/');
    // Wait for the test to complete
    await page.waitForFunction(() => window.__testResults && ('success' in window.__testResults), { timeout: 10000 });

    const results = await page.evaluate(() => window.__testResults);

    if (!results.success) {
        console.error('Browser error:', results.error);
        console.error('Stack:', results.stack);
    }

    expect(results.success).toBe(true);
    expect(results.boolResult).toBe(true);
    expect(results.u8Result).toBe(42);
    expect(results.exportKeys).toContain('jsco:test/echo-primitives@0.1.0');
});
