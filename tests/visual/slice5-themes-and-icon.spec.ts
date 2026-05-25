import { test, expect } from '@playwright/test';
import { THEMES } from '../../src/lib/themes';

test.describe('theme visual regression', () => {
	for (const theme of THEMES) {
		test(`homepage renders correctly for theme "${theme}"`, async ({ page }) => {
			// Freeze rAF so animated icon is static and screenshots are deterministic
			await page.addInitScript(() => {
				window.requestAnimationFrame = () => 1;
			});
			// Pre-set theme in localStorage so the inline script + onMount pick it up
			await page.addInitScript((t: string) => {
				localStorage.setItem('helicon-theme', t);
			}, theme);

			await page.goto('/helicon');

			// Wait for data-theme to reflect the chosen theme
			await page.waitForFunction(
				(t: string) => document.documentElement.getAttribute('data-theme') === t,
				theme
			);

			await expect(page).toHaveScreenshot(`theme-${theme}.png`, { fullPage: true });
		});
	}
});


test.describe('theme switcher', () => {
	// Wait for Svelte hydration before interacting
	async function waitForHydration(page: import('@playwright/test').Page) {
		await page.waitForLoadState('networkidle');
	}

	test('clicking a swatch applies the new theme', async ({ page }) => {
		await page.goto('/helicon');
		await waitForHydration(page);

		await page.locator('[data-theme-swatch="vinyl"]').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'vinyl');
	});

	test('switched theme is saved to localStorage', async ({ page }) => {
		await page.goto('/helicon');
		await waitForHydration(page);

		await page.locator('[data-theme-swatch="neon"]').click();
		await page.waitForFunction(() => localStorage.getItem('helicon-theme') === 'neon', null, {
			timeout: 2000
		});

		const stored = await page.evaluate(() => localStorage.getItem('helicon-theme'));
		expect(stored).toBe('neon');
	});

	test('theme persists across reload', async ({ page }) => {
		await page.goto('/helicon');
		await waitForHydration(page);

		await page.locator('[data-theme-swatch="paper"]').click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');

		await page.reload();
		await page.waitForFunction(
			() => document.documentElement.getAttribute('data-theme') === 'paper'
		);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
	});
});
