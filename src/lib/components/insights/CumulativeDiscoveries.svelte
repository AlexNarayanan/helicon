<script lang="ts">
	import { base } from '$app/paths';
	import { Chart, Svg, Axis, Spline } from 'layerchart';
	import { scaleTime, scaleLinear, curveStepAfter, max } from 'd3';

	type DiscoveryPoint = { date: string; count: number };
	type CumulativeData = {
		artists: DiscoveryPoint[];
		venues: DiscoveryPoint[];
		songs: DiscoveryPoint[];
	};

	type SeriesKey = 'artists' | 'venues' | 'songs';

	let data = $state<CumulativeData | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let activeSeries = $state<SeriesKey>('artists');

	const SERIES_LABELS: Record<SeriesKey, string> = {
		artists: 'Artists',
		venues: 'Venues',
		songs: 'Songs'
	};

	const SERIES_COLORS: Record<SeriesKey, string> = {
		artists: '#4f86c6',
		venues: '#e07b39',
		songs: '#6abf69'
	};

	type ChartPoint = { date: Date; count: number; series: SeriesKey };

	const allPoints = $derived.by<ChartPoint[]>(() => {
		if (!data) return [];
		const points: ChartPoint[] = [];
		for (const key of ['artists', 'venues', 'songs'] as SeriesKey[]) {
			for (const d of data[key]) {
				points.push({ date: new Date(d.date), count: d.count, series: key });
			}
		}
		return points;
	});

	function seriesPoints(key: SeriesKey): ChartPoint[] {
		return allPoints.filter((p) => p.series === key);
	}

	const maxCount = $derived.by(() => {
		if (!data) return 10;
		return (
			Math.max(
				...(['artists', 'venues', 'songs'] as SeriesKey[]).flatMap((k) =>
					data![k].map((d) => d.count)
				)
			) || 10
		);
	});

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
</script>

<div class="rounded-lg p-6" style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);">
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-lg font-semibold" style="color: var(--color-text);">Cumulative Discoveries</h2>
		<div class="flex gap-2">
			{#each ['artists', 'venues', 'songs'] as key (key)}
				<button
					onclick={() => { activeSeries = key as SeriesKey; }}
					class="rounded px-3 py-1 text-sm font-medium transition-all"
					style="
						background-color: {activeSeries === key ? SERIES_COLORS[key as SeriesKey] : 'transparent'};
						color: {activeSeries === key ? '#fff' : 'var(--color-text-muted)'};
						border: 1px solid {activeSeries === key ? SERIES_COLORS[key as SeriesKey] : 'var(--color-border)'};
					"
					data-testid="cumulative-series-toggle"
					data-series={key}
				>
					{SERIES_LABELS[key as SeriesKey]}
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if !data || allPoints.length === 0}
		<p style="color: var(--color-text-muted);">No data yet.</p>
	{:else}
		<div style="height: 240px;" data-testid="cumulative-chart">
			<Chart
				data={allPoints}
				x={(d: ChartPoint) => d.date}
				y={(d: ChartPoint) => d.count}
				xScale={scaleTime()}
				yScale={scaleLinear().domain([0, maxCount]).nice()}
				padding={{ top: 16, right: 24, bottom: 40, left: 48 }}
			>
				<Svg>
					<Axis
						placement="bottom"
						ticks={6}
						tickLabelProps={{ style: 'fill: var(--color-text-muted); font-size: 11px;' }}
					/>
					<Axis
						placement="left"
						ticks={5}
						tickLabelProps={{ style: 'fill: var(--color-text-muted); font-size: 11px;' }}
					/>

					<!-- Background (dimmed) series -->
					{#each ['artists', 'venues', 'songs'] as key (key)}
						{#if key !== activeSeries}
							<Spline
								data={seriesPoints(key as SeriesKey)}
								x={(d: ChartPoint) => d.date}
								y={(d: ChartPoint) => d.count}
								curve={curveStepAfter}
								stroke={SERIES_COLORS[key as SeriesKey]}
								strokeWidth={1.5}
								strokeOpacity={0.2}
							/>
						{/if}
					{/each}

					<!-- Active series on top -->
					<Spline
						data={seriesPoints(activeSeries)}
						x={(d: ChartPoint) => d.date}
						y={(d: ChartPoint) => d.count}
						curve={curveStepAfter}
						stroke={SERIES_COLORS[activeSeries]}
						strokeWidth={2.5}
						strokeOpacity={1}
					/>
				</Svg>
			</Chart>
		</div>
	{/if}
</div>
