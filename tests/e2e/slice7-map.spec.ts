import { test, expect } from '@playwright/test';

const mockVenueData = [
	{
		venueId: 1,
		venueName: 'Madison Square Garden',
		venueCity: 'New York',
		venueState: 'NY',
		venueCountry: 'US',
		lat: 40.7505,
		lng: -73.9934,
		showCount: 2,
		shows: [
			{
				showId: 1,
				showDate: '2023-08-11',
				artists: [
					{ name: 'Metallica', billingOrder: 1 },
					{ name: 'Pantera', billingOrder: 0 }
				]
			},
			{
				showId: 2,
				showDate: '2024-01-15',
				artists: [{ name: 'Ozzy Osbourne', billingOrder: 0 }]
			}
		]
	},
	{
		venueId: 2,
		venueName: 'The Forum',
		venueCity: 'Los Angeles',
		venueState: 'CA',
		venueCountry: 'US',
		lat: 33.9584,
		lng: -118.3416,
		showCount: 1,
		shows: [
			{
				showId: 3,
				showDate: '2019-10-25',
				artists: [{ name: 'Tool', billingOrder: 0 }]
			}
		]
	},
	{
		venueId: 3,
		venueName: 'A Venue Without Coords',
		venueCity: 'Nowhere',
		venueState: null,
		venueCountry: 'US',
		lat: null,
		lng: null,
		showCount: 1,
		shows: [
			{
				showId: 4,
				showDate: '2022-05-01',
				artists: [{ name: 'Ghost', billingOrder: 0 }]
			}
		]
	}
];

test.describe('map visualization', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/viz/map', (route) => {
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify(mockVenueData)
			});
		});
	});

	test('renders one marker per venue with coordinates', async ({ page }) => {
		await page.goto('/viz/map');
		const markers = page.getByTestId('map-marker');
		// 2 out of 3 venues have coords; the third (venueId 3) has null lat/lng
		await expect(markers).toHaveCount(2, { timeout: 20000 });
	});

	test('venue with more shows has a larger marker', async ({ page }) => {
		await page.goto('/viz/map');
		await page.waitForSelector('[data-testid="map-marker"]', { timeout: 20000 });

		const msgMarker = page.locator('[data-testid="map-marker"][data-venue-id="1"]');
		const forumMarker = page.locator('[data-testid="map-marker"][data-venue-id="2"]');

		await expect(msgMarker).toHaveAttribute('data-show-count', '2');
		await expect(forumMarker).toHaveAttribute('data-show-count', '1');

		const msgSize = await msgMarker.evaluate((el: HTMLElement) => parseInt(el.style.width));
		const forumSize = await forumMarker.evaluate((el: HTMLElement) => parseInt(el.style.width));
		expect(msgSize).toBeGreaterThan(forumSize);
	});

	test('click marker opens popup with venue name and lineup', async ({ page }) => {
		await page.goto('/viz/map');
		await page.waitForSelector('[data-testid="map-marker"]', { timeout: 20000 });

		const msgMarker = page.locator('[data-testid="map-marker"][data-venue-id="1"]');
		await msgMarker.click();

		const popup = page.locator('.maplibregl-popup');
		await expect(popup).toBeVisible();
		await expect(popup).toContainText('Madison Square Garden');
		await expect(popup).toContainText('New York');
		await expect(popup).toContainText('Metallica');
		await expect(popup).toContainText('Pantera');
	});

	test('popup lists all shows at the venue with dates', async ({ page }) => {
		await page.goto('/viz/map');
		await page.waitForSelector('[data-testid="map-marker"]', { timeout: 20000 });

		const msgMarker = page.locator('[data-testid="map-marker"][data-venue-id="1"]');
		await msgMarker.click();

		const popup = page.locator('.maplibregl-popup');
		await expect(popup).toContainText('2023-08-11');
		await expect(popup).toContainText('2024-01-15');
		await expect(popup).toContainText('Ozzy Osbourne');
	});

	test('venue without coordinates does not get a marker', async ({ page }) => {
		await page.goto('/viz/map');
		await page.waitForSelector('[data-testid="map-marker"]', { timeout: 20000 });

		const noCoordMarker = page.locator('[data-testid="map-marker"][data-venue-id="3"]');
		await expect(noCoordMarker).not.toBeAttached();
	});
});
