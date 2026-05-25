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

test.describe('helicon icon structure', () => {
	test('icon is visible in the header', async ({ page }) => {
		await page.goto('/helicon');
		await expect(page.locator('header svg[aria-label="Helicon"]')).toBeVisible();
	});

	test('icon has lyre frame: 5 paths and 2 lines', async ({ page }) => {
		await page.goto('/helicon');
		const svg = page.locator('header svg[aria-label="Helicon"]');
		// 2 curved arms + 3 animated strings = 5 paths; crossbar + base = 2 lines
		await expect(svg.locator('path')).toHaveCount(5);
		await expect(svg.locator('line')).toHaveCount(2);
	});

	test('animated string d attributes change as animation runs', async ({ page }) => {
		await page.goto('/helicon');

		const getDs = () =>
			page.evaluate(() =>
				Array.from(document.querySelectorAll('header svg path[stroke-width="1.2"]')).map((p) =>
					p.getAttribute('d')
				)
			);

		const before = await getDs();
		expect(before).toHaveLength(3);
		expect(before[0]).not.toBeNull();

		// Poll until at least one animated path changes (up to 2 s)
		await page.waitForFunction(
			(initial: (string | null)[]) =>
				Array.from(document.querySelectorAll('header svg path[stroke-width="1.2"]')).some(
					(p, i) => p.getAttribute('d') !== initial[i]
				),
			before,
			{ timeout: 2000 }
		);

		const after = await getDs();
		expect(before.some((d, i) => d !== after[i])).toBe(true);
	});
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
