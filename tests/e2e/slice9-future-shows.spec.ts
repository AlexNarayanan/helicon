import { test, expect } from '@playwright/test';

// A date in the past so the "Fetch setlist" button appears
const PAST_SHOW_DATE = '2024-01-15';

const mockList = [
	{
		id: 10,
		showDate: PAST_SHOW_DATE,
		status: 'planned',
		venueName: 'Kia Forum',
		venueCity: 'Los Angeles',
		venueCountry: 'US',
		artists: [{ name: 'Tool', billingOrder: 0 }]
	},
	{
		id: 11,
		showDate: '2023-06-01',
		status: 'confirmed',
		venueName: 'Red Rocks',
		venueCity: 'Morrison',
		venueCountry: 'US',
		artists: [{ name: 'Radiohead', billingOrder: 0 }]
	}
];

const mockPlannedDetail = {
	id: 10,
	status: 'planned',
	notes: '',
	showId: 200,
	showDate: PAST_SHOW_DATE,
	lastSyncedAt: null,
	venue: { name: 'Kia Forum', city: 'Los Angeles', state: 'CA', country: 'US' },
	performances: []
};

const mockConfirmedDetail = {
	id: 10,
	status: 'confirmed',
	notes: '',
	showId: 200,
	showDate: PAST_SHOW_DATE,
	lastSyncedAt: new Date().toISOString(),
	venue: { name: 'Kia Forum', city: 'Los Angeles', state: 'CA', country: 'US' },
	performances: [
		{
			id: 300,
			billingOrder: 0,
			artistName: 'Tool',
			tourName: null,
			setlistfmUrl: 'https://www.setlist.fm/setlist/tool/2024/kia-forum-abc.html',
			sets: [
				{
					setNumber: 1,
					isEncore: false,
					songs: [{ position: 1, name: 'Pneuma', info: '', isCover: false }]
				}
			]
		}
	]
};

test.describe('future-show handling (slice 9)', () => {
	test('planned badge appears in list for planned shows', async ({ page }) => {
		await page.route('**/api/attendances', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockList) });
			} else {
				route.continue();
			}
		});

		await page.goto('/helicon/attendances');
		const rows = page.getByTestId('attendance-row');
		await expect(rows).toHaveCount(2);

		// First row is planned (sorted by date desc, 2024-01-15 > 2023-06-01)
		const plannedRow = rows.nth(0);
		await expect(plannedRow).toContainText('planned');
		await expect(plannedRow).toContainText('Tool');

		// Second row is confirmed
		const confirmedRow = rows.nth(1);
		await expect(confirmedRow).toContainText('confirmed');
	});

	test('Fetch setlist button appears for planned past shows', async ({ page }) => {
		await page.route('**/api/attendances/10', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify(mockPlannedDetail)
				});
			} else {
				route.continue();
			}
		});

		await page.goto('/helicon/attendances/10');
		await expect(page.getByRole('button', { name: /Fetch setlist/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Re-sync/i })).not.toBeVisible();
		await expect(page.getByTestId('status-badge')).toContainText('planned');
	});

	test('Re-sync button (not Fetch) appears for confirmed shows', async ({ page }) => {
		const confirmedDetail = { ...mockPlannedDetail, status: 'confirmed' };
		await page.route('**/api/attendances/10', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify(confirmedDetail)
				});
			} else {
				route.continue();
			}
		});

		await page.goto('/helicon/attendances/10');
		await expect(page.getByRole('button', { name: /Re-sync/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Fetch setlist/i })).not.toBeVisible();
	});

	test('clicking Fetch setlist resyncs and upgrades status to confirmed', async ({ page }) => {
		let patched = false;

		await page.route('**/api/attendances/10', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify(patched ? mockConfirmedDetail : mockPlannedDetail)
				});
			} else if (route.request().method() === 'PATCH') {
				patched = true;
				route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 10 }) });
			} else {
				route.continue();
			}
		});

		await page.route('**/api/shows/200/resync', (route) => {
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({ performanceCount: 1 })
			});
		});

		await page.goto('/helicon/attendances/10');
		await expect(page.getByRole('button', { name: /Fetch setlist/i })).toBeVisible();

		await page.getByRole('button', { name: /Fetch setlist/i }).click();

		// After the flow completes, UI should reload with confirmed state
		await expect(page.getByTestId('status-badge')).toContainText('confirmed');
		await expect(page.getByRole('button', { name: /Re-sync/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Fetch setlist/i })).not.toBeVisible();
		// The performance should be rendered
		await expect(page.getByTestId('performance')).toHaveCount(1);
		await expect(page.getByTestId('performance')).toContainText('Tool');
	});
});
