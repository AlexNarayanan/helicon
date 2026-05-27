<script lang="ts">
	import { base } from '$app/paths';
	import { Chart, Svg, Axis, Spline, Area } from 'layerchart';
	import { scaleTime, scaleLinear, curveStepAfter } from 'd3';

	type DiscoveryPoint = { date: string; count: number };
	type CumulativeData = {
		artists: DiscoveryPoint[];
		venues: DiscoveryPoint[];
		songs: DiscoveryPoint[];
	};

	type SeriesKey = 'artists' | 'venues' | 'songs';

	type UnifiedPoint = {
		date: Date;
		artists: number;
		venues: number;
		songs: number;
		artistsPct: number;
		venuesPct: number;
		songsPct: number;
	};

	let data = $state<CumulativeData | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredIdx = $state<number | null>(null);

	const SERIES_KEYS: SeriesKey[] = ['artists', 'venues', 'songs'];
	const SERIES_LABELS: Record<SeriesKey, string> = {
		artists: 'Artists',
		venues: 'Venues',
		songs: 'Songs'
	};
	const SERIES_SUBLABELS: Record<SeriesKey, string> = {
		artists: 'unique seen',
		venues: 'unique seen',
		songs: 'unique heard'
	};
	const SERIES_COLORS: Record<SeriesKey, string> = {
		artists: 'var(--color-primary)',
		venues: 'var(--color-secondary)',
		songs: 'color-mix(in srgb, var(--color-primary) 50%, var(--color-secondary) 50%)'
	};

	const finalTotals = $derived.by<Record<SeriesKey, number>>(() => {
		const totals: Record<SeriesKey, number> = { artists: 0, venues: 0, songs: 0 };
		if (!data) return totals;
		for (const key of SERIES_KEYS) {
			const arr = data[key];
			totals[key] = arr.length > 0 ? arr[arr.length - 1].count : 0;
		}
		return totals;
	});

	const unified = $derived.by<UnifiedPoint[]>(() => {
		if (!data) return [];
		// Use artists' dates as the canonical timeline — server returns the same date set across all three.
		const dateSet = new Set<string>();
		for (const key of SERIES_KEYS) for (const d of data[key]) dateSet.add(d.date);
		const dates = [...dateSet].sort();

		const idx = (arr: DiscoveryPoint[]): Map<string, number> => {
			const m = new Map<string, number>();
			for (const d of arr) m.set(d.date, d.count);
			return m;
		};
		const ai = idx(data.artists);
		const vi = idx(data.venues);
		const si = idx(data.songs);

		const points: UnifiedPoint[] = [];
		let lastA = 0,
			lastV = 0,
			lastS = 0;
		for (const ds of dates) {
			lastA = ai.get(ds) ?? lastA;
			lastV = vi.get(ds) ?? lastV;
			lastS = si.get(ds) ?? lastS;
			points.push({
				date: new Date(ds),
				artists: lastA,
				venues: lastV,
				songs: lastS,
				artistsPct: finalTotals.artists > 0 ? (lastA / finalTotals.artists) * 100 : 0,
				venuesPct: finalTotals.venues > 0 ? (lastV / finalTotals.venues) * 100 : 0,
				songsPct: finalTotals.songs > 0 ? (lastS / finalTotals.songs) * 100 : 0
			});
		}
		return points;
	});

	const displayCounts = $derived.by<Record<SeriesKey, number>>(() => {
		if (hoveredIdx === null || !unified[hoveredIdx]) return finalTotals;
		const p = unified[hoveredIdx];
		return { artists: p.artists, venues: p.venues, songs: p.songs };
	});

	function handlePointerMove(e: PointerEvent, xScale: (d: Date) => number) {
		const target = e.currentTarget as SVGRectElement;
		const rect = target.getBoundingClientRect();
		const px = e.clientX - rect.left;
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < unified.length; i++) {
			const cx = xScale(unified[i].date);
			const d = Math.abs(cx - px);
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			}
		}
		hoveredIdx = bestIdx;
	}

	function handlePointerLeave() {
		hoveredIdx = null;
	}

	async function load() {
		try {
			const res = await fetch(`${base}/api/insights?type=cumulative`);
			if (!res.ok) throw new Error(await res.text());
			data = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	const PADDING = { top: 16, right: 56, bottom: 40, left: 48 };
</script>

<div class="rounded-lg p-6" style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);">
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Cumulative Discoveries</h2>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if unified.length === 0}
		<p style="color: var(--color-text-muted);">No data yet.</p>
	{:else}
		<!-- Stat cards -->
		<div class="mb-5 grid grid-cols-3 gap-3" data-testid="cumulative-stats">
			{#each SERIES_KEYS as key (key)}
				<div
					class="rounded p-3"
					style="
						background-color: var(--color-surface);
						border-left: 3px solid {SERIES_COLORS[key]};
					"
					data-testid="cumulative-stat"
					data-series={key}
				>
					<div
						class="text-xs font-semibold uppercase tracking-wide"
						style="color: {SERIES_COLORS[key]};"
					>
						{SERIES_LABELS[key]}
					</div>
					<div
						class="mt-1 text-2xl font-bold tabular-nums"
						style="color: var(--color-text);"
						data-testid="cumulative-stat-value"
					>
						{displayCounts[key]}
					</div>
					<div class="text-xs" style="color: var(--color-text-muted);">
						{SERIES_SUBLABELS[key]}
					</div>
				</div>
			{/each}
		</div>

		<!-- Chart -->
		<div style="height: 260px;" data-testid="cumulative-chart">
			<Chart
				data={unified}
				x={(d: UnifiedPoint) => d.date}
				xScale={scaleTime()}
				yScale={scaleLinear().domain([0, 100])}
				padding={PADDING}
				let:xScale
				let:yScale
				let:width
				let:height
			>
				<Svg>
					<Axis
							placement="bottom"
							ticks={6}
							tickLabelProps={{ style: 'fill: var(--color-text-muted); font-size: 11px;' }}
						/>
						<Axis
							placement="left"
							ticks={[0, 25, 50, 75, 100]}
							format={(v: number) => `${v}%`}
							tickLabelProps={{ style: 'fill: var(--color-text-muted); font-size: 11px;' }}
						/>

						<!-- Areas (fills) -->
						<Area
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y1={(d: UnifiedPoint) => d.artistsPct}
							curve={curveStepAfter}
							fill={SERIES_COLORS.artists}
							fillOpacity={0.12}
						/>
						<Area
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y1={(d: UnifiedPoint) => d.venuesPct}
							curve={curveStepAfter}
							fill={SERIES_COLORS.venues}
							fillOpacity={0.12}
						/>
						<Area
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y1={(d: UnifiedPoint) => d.songsPct}
							curve={curveStepAfter}
							fill={SERIES_COLORS.songs}
							fillOpacity={0.12}
						/>

						<!-- Splines (lines on top) -->
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.artistsPct}
							curve={curveStepAfter}
							stroke={SERIES_COLORS.artists}
							strokeWidth={2}
						/>
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.venuesPct}
							curve={curveStepAfter}
							stroke={SERIES_COLORS.venues}
							strokeWidth={2}
						/>
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.songsPct}
							curve={curveStepAfter}
							stroke={SERIES_COLORS.songs}
							strokeWidth={2}
						/>

						<!-- End-of-line labels -->
						{@const lastPt = unified[unified.length - 1]}
						<text
							x={xScale(lastPt.date) + 6}
							y={yScale(lastPt.artistsPct)}
							dominant-baseline="middle"
							font-size="11"
							font-weight="600"
							style="fill: {SERIES_COLORS.artists};"
						>artists</text>
						<text
							x={xScale(lastPt.date) + 6}
							y={yScale(lastPt.venuesPct)}
							dominant-baseline="middle"
							font-size="11"
							font-weight="600"
							style="fill: {SERIES_COLORS.venues};"
						>venues</text>
						<text
							x={xScale(lastPt.date) + 6}
							y={yScale(lastPt.songsPct)}
							dominant-baseline="middle"
							font-size="11"
							font-weight="600"
							style="fill: {SERIES_COLORS.songs};"
						>songs</text>

						<!-- Hover guide + dots -->
						{#if hoveredIdx !== null && unified[hoveredIdx]}
							{@const hp = unified[hoveredIdx]}
							{@const hx = xScale(hp.date)}
							<line
								x1={hx}
								x2={hx}
								y1={0}
								y2={height}
								stroke="var(--color-text-muted)"
								stroke-width={1}
								stroke-dasharray="3 3"
								opacity={0.6}
								pointer-events="none"
							/>
							<circle cx={hx} cy={yScale(hp.artistsPct)} r={4} fill={SERIES_COLORS.artists} pointer-events="none" />
							<circle cx={hx} cy={yScale(hp.venuesPct)} r={4} fill={SERIES_COLORS.venues} pointer-events="none" />
							<circle cx={hx} cy={yScale(hp.songsPct)} r={4} fill={SERIES_COLORS.songs} pointer-events="none" />
						{/if}

						<!-- Hover capture overlay -->
						<rect
							x={0}
							y={0}
							width={width}
							height={height}
							fill="transparent"
							role="presentation"
							style="cursor: crosshair;"
							onpointermove={(e) => handlePointerMove(e, xScale)}
						onpointerleave={handlePointerLeave}
						data-testid="cumulative-hover-overlay"
					/>
				</Svg>
			</Chart>
		</div>
	{/if}
</div>
