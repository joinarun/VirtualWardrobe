import { test, expect } from '@playwright/test';

test('customer and staff shells are distinct at desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A new way to find your favourite drape.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Store workspace' })).toBeVisible();
  await page.goto('/staff');
  await expect(page.getByRole('heading', { name: 'Your store, thoughtfully managed.' })).toBeVisible();
  await expect(page.getByText('Workspace foundation')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByRole('link', { name: 'Customer storefront' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('API liveness and readiness are real and worker paths are not public', async ({ request }) => {
  const health = await request.get('/api/v1/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: 'UP', executionMode: 'api', imageProvider: 'mock' });
  const internal = await request.get('/internal/tasks/try-on');
  expect(internal.status()).toBe(403);
});
