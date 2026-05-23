import { test, expect } from '@playwright/test';
import setlistFixture from '../fixtures/setlistfm/setlist-by-id.json';

test.describe('new attendance flow', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/setlistfm/search**', (route) =>
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({ setlists: [setlistFixture] })
			})
		);
		await page.route('**/api/attendances', (route) => {
			if (route.request().method() === 'POST') {
				route.fulfill({
					contentType: 'application/json',
					status: 201,
					body: JSON.stringify({ attendanceId: 42 })
				});
			}
		});
	});

	test('page renders form with three inputs', async ({ page }) => {
		await page.goto('/attendances/new');
		await expect(page.getByRole('heading', { name: 'Log a show' })).toBeVisible();
		await expect(page.getByLabel('Artist')).toBeVisible();
		await expect(page.getByLabel('Date')).toBeVisible();
		await expect(page.getByLabel(/Venue/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
	});

	test('search shows setlist results', async ({ page }) => {
		await page.goto('/attendances/new');
		await page.getByLabel('Artist').fill('Metallica');
		await page.getByLabel('Date').fill('2023-08-11');
		await page.getByRole('button', { name: 'Search' }).click();

		await expect(page.getByText('Madison Square Garden')).toBeVisible();
		await expect(page.getByText('M72 World Tour')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	test('saving a result shows confirmation', async ({ page }) => {
		await page.goto('/attendances/new');
		await page.getByLabel('Artist').fill('Metallica');
		await page.getByLabel('Date').fill('2023-08-11');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

		await page.getByRole('button', { name: 'Save' }).first().click();
		await expect(page.getByTestId('saved-confirmation')).toBeVisible();
		await expect(page.getByText(/Show saved/)).toBeVisible();
	});
});
