import { test, expect } from '@playwright/test';

const mockFilters = {
	artists: [
		{ id: 1, name: 'Metallica' },
		{ id: 2, name: 'Pantera' },
		{ id: 3, name: 'Slayer' }
	],
	venues: [
		{ id: 1, name: 'Madison Square Garden', city: 'New York' },
		{ id: 2, name: 'The Forum', city: 'Los Angeles' }
	]
};

const mockMostPlayedSongs = [
	{ songName: 'Master of Puppets', artistName: 'Metallica', playCount: 5 },
	{ songName: 'Enter Sandman', artistName: 'Metallica', playCount: 3 },
	{ songName: 'Cowboys from Hell', artistName: 'Pantera', playCount: 2 }
];

const mockMostRareSongs = [
	{ songName: 'Blackened', artistName: 'Metallica', playCount: 1 },
	{ songName: 'Walk', artistName: 'Pantera', playCount: 1 }
];

const mockMostCommonVenues = [
	{
		venueId: 1,
		venueName: 'Madison Square Garden',
		venueCity: 'New York',
		venueCountry: 'US',
		showCount: 4
	},
	{
		venueId: 2,
		venueName: 'The Forum',
		venueCity: 'Los Angeles',
		venueCountry: 'US',
		showCount: 2
	}
];

const mockBothRoles = [{ artistName: 'Pantera', headlinerCount: 2, openerCount: 3 }];

const mockOpenersDistribution = [
	{ openerCount: 0, showCount: 2 },
	{ openerCount: 1, showCount: 4 },
	{ openerCount: 2, showCount: 1 }
];

test.describe('reports page', () => {
	test.beforeEach(async ({ page }) => {
		// Single handler to avoid glob overlap between /api/reports and /api/reports/filters
		await page.route('**/api/reports**', (route) => {
			const url = new URL(route.request().url());
			if (url.pathname.endsWith('/filters')) {
				route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockFilters) });
				return;
			}
			const type = url.searchParams.get('type');
			switch (type) {
				case 'mostPlayedSongs':
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify(mockMostPlayedSongs)
					});
					break;
				case 'mostRareSongs':
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify(mockMostRareSongs)
					});
					break;
				case 'mostCommonVenues':
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify(mockMostCommonVenues)
					});
					break;
				case 'bothOpenerAndHeadliner':
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify(mockBothRoles)
					});
					break;
				case 'openersDistribution':
					route.fulfill({
						contentType: 'application/json',
						body: JSON.stringify(mockOpenersDistribution)
					});
					break;
				default:
					route.fulfill({ status: 400, body: 'bad type' });
			}
		});
	});

	test('renders the reports page with default report (most played songs)', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-type-select')).toBeVisible({ timeout: 10000 });
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await expect(page.getByTestId('report-results')).toContainText('Master of Puppets');
		await expect(page.getByTestId('report-results')).toContainText('Metallica');
		await expect(page.getByTestId('report-results')).toContainText('5');
	});

	test('shows filters panel for filterable report types', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('filters-panel')).toBeVisible({ timeout: 10000 });
		// Artist filter should be populated from filters API
		const artistFilter = page.getByTestId('artist-filter');
		await expect(artistFilter).toContainText('Metallica');
		await expect(artistFilter).toContainText('Pantera');
	});

	test('switching to most rare songs updates the table', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await page.getByTestId('report-type-select').selectOption('mostRareSongs');
		await expect(page.getByTestId('report-results')).toContainText('Blackened', { timeout: 10000 });
		await expect(page.getByTestId('report-results')).toContainText('Walk');
	});

	test('switching to most common venues shows venue table', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await page.getByTestId('report-type-select').selectOption('mostCommonVenues');
		await expect(page.getByTestId('report-results')).toContainText('Madison Square Garden', {
			timeout: 10000
		});
		await expect(page.getByTestId('report-results')).toContainText('New York');
		await expect(page.getByTestId('report-results')).toContainText('4');
	});

	test('both opener and headliner report shows correct columns', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await page.getByTestId('report-type-select').selectOption('bothOpenerAndHeadliner');
		await expect(page.getByTestId('report-results')).toContainText('Pantera', { timeout: 10000 });
		await expect(page.getByTestId('report-results')).toContainText('Headliner Shows');
		await expect(page.getByTestId('report-results')).toContainText('Opener Shows');
	});

	test('openers distribution report renders correctly', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await page.getByTestId('report-type-select').selectOption('openersDistribution');
		await expect(page.getByTestId('report-results')).toContainText('Solo (no openers)', {
			timeout: 10000
		});
		await expect(page.getByTestId('report-results')).toContainText('Number of Openers');
	});

	test('no filters panel for non-filterable reports', async ({ page }) => {
		await page.goto('/reports');
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		await page.getByTestId('report-type-select').selectOption('bothOpenerAndHeadliner');
		await expect(page.getByTestId('report-results')).toContainText('Pantera', { timeout: 10000 });
		await expect(page.getByTestId('filters-panel')).not.toBeVisible();
	});

	test('results table has correct row count', async ({ page }) => {
		await page.goto('/reports');
		// mostPlayedSongs has 3 mock rows
		await expect(page.getByTestId('report-results')).toBeVisible({ timeout: 10000 });
		const rows = page.getByTestId('report-row');
		await expect(rows).toHaveCount(3);
	});
});
