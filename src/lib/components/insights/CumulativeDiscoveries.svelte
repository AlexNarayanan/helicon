<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
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
	// Theme colors resolved to concrete rgb() strings at runtime — SVG presentation
	// attributes like fill/stroke don't reliably accept color-mix() values, so we
	// blend in JS and emit a real rgb() string instead.
	let seriesColors = $state<Record<SeriesKey, string>>({
		artists: 'rgb(124, 92, 191)',
		venues: 'rgb(74, 156, 197)',
		songs: 'rgb(99, 124, 194)'
	});

	function parseColor(value: string): [number, number, number] {
		const v = value.trim();
		if (v.startsWith('#')) {
			const hex = v.slice(1);
			const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
			const n = parseInt(expanded, 16);
			return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
		}
		const m = v.match(/rgba?\(([^)]+)\)/);
		if (m) {
			const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
			return [parts[0], parts[1], parts[2]];
		}
		return [0, 0, 0];
	}

	function readThemeColors() {
		const cs = getComputedStyle(document.documentElement);
		const p = parseColor(cs.getPropertyValue('--color-primary'));
		const s = parseColor(cs.getPropertyValue('--color-secondary'));
		const mix: [number, number, number] = [
			Math.round((p[0] + s[0]) / 2),
			Math.round((p[1] + s[1]) / 2),
			Math.round((p[2] + s[2]) / 2)
		];
		seriesColors = {
			artists: `rgb(${p[0]}, ${p[1]}, ${p[2]})`,
			venues: `rgb(${s[0]}, ${s[1]}, ${s[2]})`,
			songs: `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
		};
	}

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

	onMount(() => {
		readThemeColors();
		const observer = new MutationObserver(readThemeColors);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		load();
		return () => observer.disconnect();
	});

	const PADDING = { top: 16, right: 24, bottom: 40, left: 48 };
</script>

<div
	class="flex h-full flex-col rounded-lg p-6"
	style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);"
>
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
						border-left: 3px solid {seriesColors[key]};
					"
					data-testid="cumulative-stat"
					data-series={key}
				>
					<div
						class="text-xs font-semibold uppercase tracking-wide"
						style="color: {seriesColors[key]};"
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
		<div class="min-h-0 flex-1" style="min-height: 260px;" data-testid="cumulative-chart">
			<Chart
				data={unified}
				x={(d: UnifiedPoint) => d.date}
				y={(d: UnifiedPoint) => Math.max(d.artistsPct, d.venuesPct, d.songsPct)}
				xScale={scaleTime()}
				yScale={scaleLinear()}
				yDomain={[0, 100]}
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
							fill={seriesColors.artists}
							fillOpacity={0.12}
						/>
						<Area
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y1={(d: UnifiedPoint) => d.venuesPct}
							curve={curveStepAfter}
							fill={seriesColors.venues}
							fillOpacity={0.12}
						/>
						<Area
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y1={(d: UnifiedPoint) => d.songsPct}
							curve={curveStepAfter}
							fill={seriesColors.songs}
							fillOpacity={0.12}
						/>

						<!-- Splines (lines on top) -->
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.artistsPct}
							curve={curveStepAfter}
							stroke={seriesColors.artists}
							strokeWidth={2}
							fill="none"
						/>
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.venuesPct}
							curve={curveStepAfter}
							stroke={seriesColors.venues}
							strokeWidth={2}
							fill="none"
						/>
						<Spline
							data={unified}
							x={(d: UnifiedPoint) => d.date}
							y={(d: UnifiedPoint) => d.songsPct}
							curve={curveStepAfter}
							stroke={seriesColors.songs}
							strokeWidth={2}
							fill="none"
						/>

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
							<circle cx={hx} cy={yScale(hp.artistsPct)} r={4} fill={seriesColors.artists} pointer-events="none" />
							<circle cx={hx} cy={yScale(hp.venuesPct)} r={4} fill={seriesColors.venues} pointer-events="none" />
							<circle cx={hx} cy={yScale(hp.songsPct)} r={4} fill={seriesColors.songs} pointer-events="none" />
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
