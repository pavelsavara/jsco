import { test, expect } from '@playwright/test';

test('hello component loads and runs in browser', async ({ page }) => {
    await page.goto('/');
    // Wait for the test to complete
    await page.waitForFunction(() => window.__testResults && ('success' in window.__testResults), { timeout: 10000 });

    const results = await page.evaluate(() => window.__testResults);

    if (!results.success) {
        console.error('Browser error:', results.error);
        console.error('Stack:', results.stack);
    }

    expect(results.success).toBe(true);
    expect(results.message).toBe('Welcome to Prague, we invite you for a drink!');
    expect(results.exportKeys).toContain('hello:city/greeter');
});
