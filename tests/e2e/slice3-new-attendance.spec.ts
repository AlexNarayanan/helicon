import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const setlistFixture = JSON.parse(
	readFileSync(resolve(__dirname, '../fixtures/setlistfm/setlist-by-id.json'), 'utf-8')
);

const mockDetail = {
	id: 42,
	status: 'confirmed',
	notes: '',
	showId: 100,
	showDate: '2023-08-11',
	lastSyncedAt: '2026-05-23T00:00:00.000Z',
	venue: { name: 'Madison Square Garden', city: 'New York', state: 'NY', country: 'US' },
	performances: [
		{
			id: 21,
			billingOrder: 1,
			artistName: 'Metallica',
			tourName: 'M72 World Tour',
			setlistfmUrl: 'https://www.setlist.fm/setlist/metallica/2023/madison-square-garden-3bd6ca6e.html',
			sets: [
				{
					setNumber: 1,
					isEncore: false,
					songs: [{ position: 1, name: 'Battery', info: '', isCover: false }]
				}
			]
		},
		{
			id: 20,
			billingOrder: 0,
			artistName: 'Pantera',
			tourName: 'Reunion Tour',
			setlistfmUrl: 'https://www.setlist.fm/setlist/pantera/2023/opener-001.html',
			sets: [
				{
					setNumber: 1,
					isEncore: false,
					songs: [{ position: 1, name: 'Walk', info: '', isCover: false }]
				}
			]
		}
	]
};

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
					body: JSON.stringify({ attendanceId: 42, showId: 100, performanceCount: 2 })
				});
			} else {
				route.continue();
			}
		});
		await page.route('**/api/attendances/42', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockDetail) });
		});
	});

	test('page renders form with three inputs and lineup-discovery hint', async ({ page }) => {
		await page.goto('/helicon/attendances/new');
		await expect(page.getByRole('heading', { name: 'Log a show' })).toBeVisible();
		await expect(page.getByLabel('Artist')).toBeVisible();
		await expect(page.getByLabel('Date')).toBeVisible();
		await expect(page.getByLabel(/Venue/)).toBeVisible();
		await expect(page.getByText(/pull in the rest of the lineup/i)).toBeVisible();
	});

	test('search shows setlist results', async ({ page }) => {
		await page.goto('/helicon/attendances/new');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Artist').fill('Metallica');
		await page.getByLabel('Date').fill('2023-08-11');
		await page.getByRole('button', { name: 'Search' }).click();

		await expect(page.getByText('Madison Square Garden')).toBeVisible();
		await expect(page.getByText('M72 World Tour')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	test('saving a result shows confirmation that links to the show with both artists', async ({
		page
	}) => {
		await page.goto('/helicon/attendances/new');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Artist').fill('Metallica');
		await page.getByLabel('Date').fill('2023-08-11');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

		await page.getByRole('button', { name: 'Save' }).first().click();
		await expect(page.getByTestId('saved-confirmation')).toBeVisible();

		await page.getByRole('link', { name: 'View attendance' }).click();
		const detail = page.getByTestId('attendance-detail');
		await expect(detail).toBeVisible();
		// Both opener and headliner present
		await expect(page.getByTestId('performance')).toHaveCount(2);
		await expect(detail).toContainText('Metallica');
		await expect(detail).toContainText('Pantera');
	});
});
