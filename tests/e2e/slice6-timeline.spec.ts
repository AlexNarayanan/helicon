import { test, expect } from '@playwright/test';

const mockAttendances = [
	{
		id: 1,
		showDate: '2019-10-25',
		status: 'confirmed',
		venueName: 'The Forum',
		venueCity: 'Los Angeles',
		venueCountry: 'US',
		artists: [{ name: 'Tool', billingOrder: 0 }]
	},
	{
		id: 2,
		showDate: '2022-06-18',
		status: 'confirmed',
		venueName: 'Wembley Arena',
		venueCity: 'London',
		venueCountry: 'GB',
		artists: [{ name: 'Iron Maiden', billingOrder: 0 }]
	},
	{
		id: 3,
		showDate: '2023-08-11',
		status: 'confirmed',
		venueName: 'Madison Square Garden',
		venueCity: 'New York',
		venueCountry: 'US',
		artists: [
			{ name: 'Metallica', billingOrder: 1 },
			{ name: 'Pantera', billingOrder: 0 }
		]
	}
];

test.describe('timeline visualization', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/attendances', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify(mockAttendances)
				});
			} else {
				route.continue();
			}
		});
	});

	test('renders one mark per show', async ({ page }) => {
		await page.goto('/viz/timeline');
		// First visit compiles layerchart modules; allow extra time for cold start
		const marks = page.getByTestId('timeline-mark');
		await expect(marks).toHaveCount(3, { timeout: 20000 });
	});

	test('marks have monotonically increasing cx for chronological dates', async ({ page }) => {
		await page.goto('/viz/timeline');
		// marks are sorted by date asc in the component, so DOM order matches date order
		const attrs = await page.locator('[data-testid="timeline-mark"]').evaluateAll((els) =>
			els.map((el) => ({
				date: el.getAttribute('data-date') ?? '',
				cx: parseFloat(el.getAttribute('cx') ?? '0')
			}))
		);
		const sorted = [...attrs].sort((a, b) => a.date.localeCompare(b.date));
		for (let i = 1; i < sorted.length; i++) {
			expect(sorted[i].cx).toBeGreaterThan(sorted[i - 1].cx);
		}
	});

	test('tooltip shows headliner name and support count on hover', async ({ page }) => {
		await page.goto('/viz/timeline');
		const metallicaMark = page.locator('[data-testid="timeline-mark"][data-date="2023-08-11"]');
		await metallicaMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Metallica');
		await expect(tooltip).toContainText('+1 support');
	});

	test('tooltip shows date and venue on hover', async ({ page }) => {
		await page.goto('/viz/timeline');
		const ironMaidenMark = page.locator('[data-testid="timeline-mark"][data-date="2022-06-18"]');
		await ironMaidenMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Iron Maiden');
		await expect(tooltip).toContainText('2022-06-18');
		await expect(tooltip).toContainText('Wembley Arena');
	});

	test('legend lists all headliner artist names', async ({ page }) => {
		await page.goto('/viz/timeline');
		const legend = page.getByTestId('timeline-legend');
		await expect(legend).toContainText('Metallica');
		await expect(legend).toContainText('Iron Maiden');
		await expect(legend).toContainText('Tool');
	});

	test('single-artist show has no support badge in tooltip', async ({ page }) => {
		await page.goto('/viz/timeline');
		const toolMark = page.locator('[data-testid="timeline-mark"][data-date="2019-10-25"]');
		await toolMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Tool');
		await expect(tooltip).not.toContainText('support');
	});
});
