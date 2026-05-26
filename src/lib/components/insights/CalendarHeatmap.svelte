<script lang="ts">
	import { base } from '$app/paths';

	type DayCount = { date: string; count: number };

	let items = $state<DayCount[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredDay = $state<DayCount | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	const CELL_SIZE = 11;
	const CELL_GAP = 2;
	const STEP = CELL_SIZE + CELL_GAP;
	const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// Group items by year
	const byYear = $derived.by(() => {
		const map = new Map<number, Map<string, number>>();
		for (const item of items) {
			const year = parseInt(item.date.slice(0, 4), 10);
			if (!map.has(year)) map.set(year, new Map());
			map.get(year)!.set(item.date, item.count);
		}
		return map;
	});

	const years = $derived([...byYear.keys()].sort((a, b) => a - b));

	const maxCount = $derived(items.length > 0 ? Math.max(...items.map((d) => d.count)) : 1);

	function cellColor(count: number): string {
		if (count === 0) return 'var(--color-border)';
		const opacity = 0.3 + 0.7 * (count / maxCount);
		return `color-mix(in srgb, var(--color-primary) ${Math.round(opacity * 100)}%, transparent)`;
	}

	function getDaysForYear(year: number): { date: string; count: number; dow: number; week: number }[] {
		const cells: { date: string; count: number; dow: number; week: number }[] = [];
		const counts = byYear.get(year) ?? new Map<string, number>();

		const jan1 = new Date(year, 0, 1);
		const dec31 = new Date(year, 11, 31);
		const startDow = jan1.getDay(); // 0=Sun

		let d = new Date(jan1);
		let weekIdx = 0;

		while (d <= dec31) {
			const iso = d.toISOString().slice(0, 10);
			const dow = d.getDay();
			cells.push({
				date: iso,
				count: counts.get(iso) ?? 0,
				dow,
				week: weekIdx
			});
			if (dow === 6) weekIdx++;
			d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
		}

		// The first week index offset: Jan 1 starts on startDow, so first "week column" is 0
		// but cells before Jan 1 in that week row aren't shown
		return cells;
	}

	function getMonthLabelPositions(year: number): { label: string; x: number }[] {
		const positions: { label: string; x: number }[] = [];
		let currentMonth = -1;
		let weekIdx = 0;
		const jan1 = new Date(year, 0, 1);
		let d = new Date(jan1);
		const dec31 = new Date(year, 11, 31);

		while (d <= dec31) {
			const month = d.getMonth();
			if (month !== currentMonth) {
				positions.push({ label: MONTH_LABELS[month], x: weekIdx * STEP });
				currentMonth = month;
			}
			const dow = d.getDay();
			if (dow === 6) weekIdx++;
			d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
		}
		return positions;
	}

	const YEAR_LABEL_WIDTH = 36;
	const HEADER_HEIGHT = 18;

	function totalWeeksForYear(year: number): number {
		const dec31 = new Date(year, 11, 31);
		const jan1 = new Date(year, 0, 1);
		const startDow = jan1.getDay();
		const dayOfYear = Math.floor((dec31.getTime() - jan1.getTime()) / 86400000);
		return Math.ceil((dayOfYear + 1 + startDow) / 7);
	}

	const totalWidth = $derived(() => {
		if (years.length === 0) return 800;
		return YEAR_LABEL_WIDTH + totalWeeksForYear(years[0]) * STEP + 40;
	});

	async function load() {
		try {
			const res = await fetch(`${base}/api/insights?type=calendar`);
			if (!res.ok) throw new Error(await res.text());
			items = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});
</script>

<div class="rounded-lg p-6" style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);">
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Show Density Calendar</h2>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if items.length === 0}
		<p style="color: var(--color-text-muted);">No data yet.</p>
	{:else}
		<div class="overflow-x-auto" data-testid="calendar-heatmap">
			<div style="display: flex; flex-direction: column; gap: 24px;">
				{#each years as year (year)}
					{@const days = getDaysForYear(year)}
					{@const monthLabels = getMonthLabelPositions(year)}
					{@const numWeeks = totalWeeksForYear(year)}
					{@const svgWidth = YEAR_LABEL_WIDTH + numWeeks * STEP + 4}
					{@const svgHeight = HEADER_HEIGHT + 7 * STEP + 4}
					<svg width={svgWidth} height={svgHeight} data-testid="calendar-year" data-year={year}>
						<!-- Year label -->
						<text
							x={0}
							y={HEADER_HEIGHT + 3 * STEP + CELL_SIZE / 2}
							text-anchor="start"
							dominant-baseline="middle"
							font-size="11"
							style="fill: var(--color-text-muted);"
						>{year}</text>

						<!-- Month labels -->
						{#each monthLabels as ml}
							<text
								x={YEAR_LABEL_WIDTH + ml.x}
								y={HEADER_HEIGHT - 4}
								text-anchor="start"
								font-size="10"
								style="fill: var(--color-text-muted);"
							>{ml.label}</text>
						{/each}

						<!-- Cells -->
						{#each days as day (day.date)}
							<rect
								x={YEAR_LABEL_WIDTH + day.week * STEP}
								y={HEADER_HEIGHT + day.dow * STEP}
								width={CELL_SIZE}
								height={CELL_SIZE}
								rx={2}
								fill={cellColor(day.count)}
								role="presentation"
								style="cursor: {day.count > 0 ? 'pointer' : 'default'};"
								data-testid={day.count > 0 ? 'calendar-cell-active' : 'calendar-cell'}
								data-date={day.date}
								onmouseenter={(e) => {
									if (day.count > 0) {
										hoveredDay = day;
										tooltipX = e.clientX;
										tooltipY = e.clientY;
									}
								}}
								onmousemove={(e) => {
									tooltipX = e.clientX;
									tooltipY = e.clientY;
								}}
								onmouseleave={() => (hoveredDay = null)}
							/>
						{/each}
					</svg>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Floating tooltip -->
{#if hoveredDay}
	<div
		data-testid="calendar-tooltip"
		class="pointer-events-none fixed z-50 rounded px-3 py-2 text-sm shadow-lg"
		style="left: {tooltipX + 16}px; top: {tooltipY - 40}px; background-color: var(--color-surface-alt); color: var(--color-text); border: 1px solid var(--color-border);"
	>
		<div class="font-semibold">{hoveredDay.date}</div>
		<div class="text-xs" style="color: var(--color-text-muted);">
			{hoveredDay.count} show{hoveredDay.count !== 1 ? 's' : ''}
		</div>
	</div>
{/if}
