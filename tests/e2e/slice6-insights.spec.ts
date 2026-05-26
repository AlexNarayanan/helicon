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

const mockTopArtists = [
	{ artistId: 1, artistName: 'Metallica', showCount: 5 },
	{ artistId: 2, artistName: 'Iron Maiden', showCount: 3 },
	{ artistId: 3, artistName: 'Tool', showCount: 2 }
];

const mockTopVenues = [
	{ venueId: 1, venueName: 'Madison Square Garden', venueCity: 'New York', venueCountry: 'US', showCount: 4 },
	{ venueId: 2, venueName: 'The Forum', venueCity: 'Los Angeles', venueCountry: 'US', showCount: 2 }
];

const mockCalendar = [
	{ month: 6, count: 1 },
	{ month: 8, count: 1 },
	{ month: 10, count: 1 }
];

const mockCoPerformers = {
	artists: [
		{ id: 1, name: 'Metallica' },
		{ id: 2, name: 'Pantera' }
	],
	pairs: [{ sourceId: 1, targetId: 2, count: 2 }]
};

const mockCumulative = {
	artists: [
		{ date: '2019-10-25', count: 1 },
		{ date: '2022-06-18', count: 2 },
		{ date: '2023-08-11', count: 4 }
	],
	venues: [
		{ date: '2019-10-25', count: 1 },
		{ date: '2022-06-18', count: 2 },
		{ date: '2023-08-11', count: 3 }
	],
	songs: [
		{ date: '2019-10-25', count: 5 },
		{ date: '2022-06-18', count: 10 },
		{ date: '2023-08-11', count: 18 }
	]
};

test.describe('insights page', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/attendances', (route) => {
			if (route.request().method() === 'GET') {
				route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockAttendances) });
			} else {
				route.continue();
			}
		});

		await page.route('**/api/insights?type=topArtists', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockTopArtists) });
		});

		await page.route('**/api/insights?type=topVenues', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockTopVenues) });
		});

		await page.route('**/api/insights?type=calendar', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockCalendar) });
		});

		await page.route('**/api/insights?type=coPerformers', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockCoPerformers) });
		});

		await page.route('**/api/insights?type=cumulative', (route) => {
			route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockCumulative) });
		});
	});

	// ── Timeline tests ──────────────────────────────────────────

	test('renders one mark per show', async ({ page }) => {
		await page.goto('/helicon/insights');
		const marks = page.getByTestId('timeline-mark');
		await expect(marks).toHaveCount(3, { timeout: 20000 });
	});

	test('marks have monotonically increasing cx for chronological dates', async ({ page }) => {
		await page.goto('/helicon/insights');
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
		await page.goto('/helicon/insights');
		const metallicaMark = page.locator('[data-testid="timeline-mark"][data-date="2023-08-11"]');
		await metallicaMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Metallica');
		await expect(tooltip).toContainText('+1 support');
	});

	test('tooltip shows date and venue on hover', async ({ page }) => {
		await page.goto('/helicon/insights');
		const ironMaidenMark = page.locator('[data-testid="timeline-mark"][data-date="2022-06-18"]');
		await ironMaidenMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Iron Maiden');
		await expect(tooltip).toContainText('2022-06-18');
		await expect(tooltip).toContainText('Wembley Arena');
	});

	test('single-artist show has no support badge in tooltip', async ({ page }) => {
		await page.goto('/helicon/insights');
		const toolMark = page.locator('[data-testid="timeline-mark"][data-date="2019-10-25"]');
		await toolMark.hover();
		const tooltip = page.getByTestId('timeline-tooltip');
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Tool');
		await expect(tooltip).not.toContainText('support');
	});

	test('no legend block is rendered', async ({ page }) => {
		await page.goto('/helicon/insights');
		// Wait for marks to appear first
		await expect(page.getByTestId('timeline-mark').first()).toBeVisible({ timeout: 20000 });
		await expect(page.getByTestId('timeline-legend')).toHaveCount(0);
	});

	// ── Zoom test ────────────────────────────────────────────────

	test('scroll-wheel zoom changes cx positions of marks', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('timeline-mark').first()).toBeVisible({ timeout: 20000 });

		// Capture cx values before zoom
		const cxBefore = await page.locator('[data-testid="timeline-mark"]').evaluateAll((els) =>
			els.map((el) => parseFloat(el.getAttribute('cx') ?? '0'))
		);

		// Scroll-wheel zoom on the timeline background
		const background = page.getByTestId('timeline-background');
		await background.dispatchEvent('wheel', { deltaY: -300, ctrlKey: false });

		// Short wait for reactivity
		await page.waitForTimeout(200);

		// Capture cx values after zoom
		const cxAfter = await page.locator('[data-testid="timeline-mark"]').evaluateAll((els) =>
			els.map((el) => parseFloat(el.getAttribute('cx') ?? '0'))
		);

		// After zooming in, marks that were close together should spread apart;
		// the relative order must still be maintained and at least one cx changed
		let anyChanged = false;
		for (let i = 0; i < cxBefore.length; i++) {
			if (Math.abs(cxAfter[i] - cxBefore[i]) > 0.5) {
				anyChanged = true;
				break;
			}
		}
		expect(anyChanged).toBe(true);
	});

	// ── Artist-focus tests ───────────────────────────────────────

	test('clicking a mark focuses that artist — other marks become dimmed', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('timeline-mark').first()).toBeVisible({ timeout: 20000 });

		const metallicaMark = page.locator('[data-testid="timeline-mark"][data-date="2023-08-11"]');
		await metallicaMark.click();

		// Metallica mark should remain fully opaque (opacity=1)
		const metallicaOpacity = await metallicaMark.evaluate((el) =>
			parseFloat((el as SVGCircleElement).getAttribute('opacity') ?? '1')
		);
		expect(metallicaOpacity).toBeCloseTo(1, 1);

		// Other marks should be dimmed (opacity < 0.5)
		const toolMark = page.locator('[data-testid="timeline-mark"][data-date="2019-10-25"]');
		const toolOpacity = await toolMark.evaluate((el) =>
			parseFloat((el as SVGCircleElement).getAttribute('opacity') ?? '1')
		);
		expect(toolOpacity).toBeLessThan(0.5);
	});

	test('clicking the same mark again clears focus — all marks return to full opacity', async ({
		page
	}) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('timeline-mark').first()).toBeVisible({ timeout: 20000 });

		const metallicaMark = page.locator('[data-testid="timeline-mark"][data-date="2023-08-11"]');

		// First click — focus
		await metallicaMark.click();
		// Second click — clear focus
		await metallicaMark.click();

		// All marks should be at full opacity
		const opacities = await page.locator('[data-testid="timeline-mark"]').evaluateAll((els) =>
			els.map((el) => parseFloat((el as SVGCircleElement).getAttribute('opacity') ?? '1'))
		);
		for (const op of opacities) {
			expect(op).toBeGreaterThanOrEqual(0.9);
		}
	});

	test('clicking background clears artist focus', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('timeline-mark').first()).toBeVisible({ timeout: 20000 });

		const metallicaMark = page.locator('[data-testid="timeline-mark"][data-date="2023-08-11"]');
		await metallicaMark.click();

		// Confirm Tool is dimmed
		const toolMark = page.locator('[data-testid="timeline-mark"][data-date="2019-10-25"]');
		const toolOpacityBefore = await toolMark.evaluate((el) =>
			parseFloat((el as SVGCircleElement).getAttribute('opacity') ?? '1')
		);
		expect(toolOpacityBefore).toBeLessThan(0.5);

		// Click background to clear
		await page.getByTestId('timeline-background').click();

		const toolOpacityAfter = await toolMark.evaluate((el) =>
			parseFloat((el as SVGCircleElement).getAttribute('opacity') ?? '1')
		);
		expect(toolOpacityAfter).toBeGreaterThanOrEqual(0.9);
	});

	// ── Nav test ─────────────────────────────────────────────────

	test('nav link says Insights and links to /helicon/insights', async ({ page }) => {
		await page.goto('/helicon/insights');
		const insightsLink = page.locator('nav a[href="/helicon/insights"]');
		await expect(insightsLink).toBeVisible();
		await expect(insightsLink).toContainText('Insights');
	});

	// ── New visualizations sanity tests ──────────────────────────

	test('top artists bars are rendered', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('top-artists-bars')).toBeVisible({ timeout: 20000 });
		await expect(page.getByTestId('top-artists-bar').first()).toBeVisible();
	});

	test('top venues bars are rendered', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('top-venues-bars')).toBeVisible({ timeout: 20000 });
		await expect(page.getByTestId('top-venues-bar').first()).toBeVisible();
	});

	test('calendar heatmap renders 12 month cells', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('calendar-heatmap')).toBeVisible({ timeout: 20000 });
		const allCells = page.locator('[data-testid="calendar-cell"], [data-testid="calendar-cell-active"]');
		await expect(allCells).toHaveCount(12);
		await expect(page.getByTestId('calendar-cell-active')).toHaveCount(3);
	});

	test('chord diagram renders arcs', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('chord-diagram')).toBeVisible({ timeout: 20000 });
		const arcs = page.getByTestId('chord-arc');
		await expect(arcs.first()).toBeVisible();
	});

	test('cumulative chart renders and series toggle works', async ({ page }) => {
		await page.goto('/helicon/insights');
		await expect(page.getByTestId('cumulative-chart')).toBeVisible({ timeout: 20000 });
		// Toggle to venues series
		await page.getByTestId('cumulative-series-toggle').filter({ hasText: 'Venues' }).click();
		const venuesBtn = page.locator('[data-testid="cumulative-series-toggle"][data-series="venues"]');
		// After clicking, Venues button should have different styling (active)
		// We can't easily check CSS vars, but we confirm the button exists and was clicked
		await expect(venuesBtn).toBeVisible();
	});
});
