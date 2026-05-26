import { test, expect } from '@playwright/test';

test('homepage loads and shows Helicon title', async ({ page }) => {
	await page.goto('/helicon');
	await expect(page.getByRole('heading', { name: 'Helicon' })).toBeVisible();
});

test('health endpoint returns ok', async ({ request }) => {
	const res = await request.get('/helicon/api/health');
	expect(res.ok()).toBe(true);
	const body = await res.json();
	expect(body.status).toBe('ok');
});

test('nav links are present', async ({ page }) => {
	await page.goto('/helicon');
	await expect(page.getByRole('link', { name: 'Shows' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Insights' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
});

test('theme swatches are rendered', async ({ page }) => {
	await page.goto('/helicon');
	const swatches = page.locator('[data-theme-swatch]');
	await expect(swatches).toHaveCount(4);
});

test('animated helicon icon is present in header', async ({ page }) => {
	await page.goto('/helicon');
	const icon = page.locator('header svg[aria-label="Helicon"]');
	await expect(icon).toBeVisible();
});
