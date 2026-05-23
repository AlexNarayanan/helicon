import { test, expect } from '@playwright/test';

const mockList = [
	{
		id: 1,
		showDate: '2023-08-11',
		venueName: 'Madison Square Garden',
		venueCity: 'New York',
		venueCountry: 'US',
		status: 'confirmed',
		artists: [
			{ name: 'Metallica', billingOrder: 1 },
			{ name: 'Pantera', billingOrder: 0 }
		]
	},
	{
		id: 2,
		showDate: '2022-06-18',
		venueName: 'Wembley Arena',
		venueCity: 'London',
		venueCountry: 'GB',
		status: 'confirmed',
		artists: [{ name: 'Iron Maiden', billingOrder: 0 }]
	},
	{
		id: 3,
		showDate: '2019-10-25',
		venueName: 'The Forum',
		venueCity: 'Los Angeles',
		venueCountry: 'US',
		status: 'confirmed',
		artists: [{ name: 'Tool', billingOrder: 0 }]
	}
];

const mockDetail = {
	id: 1,
	status: 'confirmed',
	notes: '',
	showId: 100,
	showDate: '2023-08-11',
	lastSyncedAt: '2026-05-23T00:00:00.000Z',
	venue: {
		name: 'Madison Square Garden',
		city: 'New York',
		state: 'NY',
		country: 'US'
	},
	performances: [
		{
			id: 11,
			billingOrder: 1,
			artistName: 'Metallica',
			tourName: 'M72 World Tour',
			setlistfmUrl:
				'https://www.setlist.fm/setlist/metallica/2023/madison-square-garden-new-york-ny-usa-3bd6ca6e.html',
			sets: [
				{
					setNumber: 1,
					isEncore: false,
					songs: [
						{ position: 1, name: 'Battery', info: '', isCover: false },
						{ position: 2, name: 'Master of Puppets', info: '', isCover: false },
						{ position: 3, name: 'Fuel', info: '', isCover: false }
					]
				},
				{
					setNumber: 2,
					isEncore: true,
					songs: [{ position: 1, name: 'Enter Sandman', info: '', isCover: false }]
				}
			]
		},
		{
			id: 10,
			billingOrder: 0,
			artistName: 'Pantera',
			tourName: 'Reunion Tour',
			setlistfmUrl: 'https://www.setlist.fm/setlist/pantera/2023/opener-001.html',
			sets: [
				{
					setNumber: 1,
					isEncore: false,
					songs: [
						{ position: 1, name: 'A New Level', info: '', isCover: false },
						{ position: 2, name: 'Walk', info: '', isCover: false }
					]
				}
			]
		}
	]
};

test.describe('attendance list & detail', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/attendances', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockList) });
			} else {
				route.continue();
			}
		});
		await page.route('**/api/attendances/**', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockDetail) });
			} else {
				route.continue();
			}
		});
	});

	test('list page shows 3 attendance rows', async ({ page }) => {
		await page.goto('/attendances');
		const rows = page.getByTestId('attendance-row');
		await expect(rows).toHaveCount(3);
		await expect(rows.first()).toContainText('Madison Square Garden');
	});

	test('list rows are sorted by date descending and show full lineup', async ({ page }) => {
		await page.goto('/attendances');
		const rows = page.getByTestId('attendance-row');
		// First row: two-artist lineup with headliner first (billing_order desc)
		await expect(rows.nth(0)).toContainText('Metallica');
		await expect(rows.nth(0)).toContainText('Pantera');
		await expect(rows.nth(1)).toContainText('Iron Maiden');
		await expect(rows.nth(2)).toContainText('Tool');
	});

	test('clicking first row navigates to detail page', async ({ page }) => {
		await page.goto('/attendances');
		await page.getByTestId('attendance-row').first().getByRole('link').click();
		await expect(page).toHaveURL(/\/attendances\/1/);
	});

	test('detail page shows venue, date, and both performances ordered headliner-first', async ({
		page
	}) => {
		await page.goto('/attendances/1');
		const detail = page.getByTestId('attendance-detail');
		await expect(detail).toBeVisible();
		await expect(detail).toContainText('Madison Square Garden');
		await expect(detail).toContainText('New York');

		const perfs = page.getByTestId('performance');
		await expect(perfs).toHaveCount(2);
		// In DOM order: first section is headliner (billing_order desc)
		await expect(perfs.nth(0)).toContainText('Metallica');
		await expect(perfs.nth(0)).toContainText('M72 World Tour');
		await expect(perfs.nth(0)).toContainText('Headliner');
		await expect(perfs.nth(1)).toContainText('Pantera');
		await expect(perfs.nth(1)).toContainText('Support');
	});

	test('detail page shows full setlist with encore for headliner', async ({ page }) => {
		await page.goto('/attendances/1');
		const headliner = page.getByTestId('performance').first();
		await expect(headliner).toContainText('Battery');
		await expect(headliner).toContainText('Master of Puppets');
		await expect(headliner).toContainText('Fuel');
		await expect(headliner).toContainText('Enter Sandman');
		await expect(headliner).toContainText('Encore');
	});

	test('detail page has setlist.fm link per performance', async ({ page }) => {
		await page.goto('/attendances/1');
		const links = page.getByRole('link', { name: /setlist\.fm/ });
		await expect(links).toHaveCount(2);
	});

	test('detail page exposes Re-sync action', async ({ page }) => {
		await page.goto('/attendances/1');
		await expect(page.getByRole('button', { name: /Re-sync/ })).toBeVisible();
	});
});
