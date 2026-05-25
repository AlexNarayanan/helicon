<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Chart, Svg, Axis } from 'layerchart';
	import { scaleTime, scaleOrdinal } from 'd3';
	import { schemeTableau10 } from 'd3';

	type Artist = { name: string; billingOrder: number };
	type Attendance = {
		id: number;
		showDate: string;
		status: string;
		venueName: string;
		venueCity: string;
		venueCountry: string;
		artists: Artist[];
	};
	type TimelineItem = Attendance & {
		date: Date;
		headliner: string;
		supportCount: number;
	};

	let items = $state<TimelineItem[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredItem = $state<TimelineItem | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	const headliners = $derived([...new Set(items.map((d) => d.headliner))]);
	const colorScale = $derived(
		scaleOrdinal<string, string>(schemeTableau10 as string[]).domain(headliners)
	);

	onMount(async () => {
		try {
			const res = await fetch(`${base}/api/attendances`);
			if (!res.ok) throw new Error(await res.text());
			const data: Attendance[] = await res.json();
			items = data
				.map((d) => ({
					...d,
					date: new Date(d.showDate),
					headliner: d.artists[0]?.name ?? 'Unknown',
					supportCount: Math.max(0, d.artists.length - 1)
				}))
				.sort((a, b) => a.date.getTime() - b.date.getTime());
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});
</script>

<div class="mx-auto max-w-6xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Timeline</h1>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if items.length === 0}
		<p style="color: var(--color-text-muted);">No shows logged yet. <a href="{base}/attendances/new" style="color: var(--color-primary);">Log a show</a> to see it here.</p>
	{:else}
		<div
			class="rounded-lg p-6"
			style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);"
		>
			<div style="height: 160px;">
				<Chart
					data={items}
					x={(d: TimelineItem) => d.date}
					xScale={scaleTime()}
					padding={{ top: 24, right: 24, bottom: 40, left: 24 }}
					let:xScale
					let:height
					let:width
				>
					<Svg>
						<Axis
							placement="bottom"
							ticks={6}
							tickLabelProps={{ style: 'fill: var(--color-text-muted); font-size: 11px;' }}
						/>
						<!-- Track line -->
						<line
							x1={0}
							y1={height / 2}
							x2={width}
							y2={height / 2}
							style="stroke: var(--color-border);"
							stroke-width={1}
						/>
						<!-- Marks, one per show -->
						{#each items as item (item.id)}
							<circle
								cx={xScale(item.date)}
								cy={height / 2}
								r={9}
								fill={colorScale(item.headliner)}
								stroke="var(--color-surface-alt)"
								stroke-width={2}
								opacity={hoveredItem && hoveredItem.id !== item.id ? 0.35 : 1}
								style="cursor: pointer; transition: opacity 0.15s;"
								role="img"
								aria-label="{item.headliner} at {item.venueName} on {item.showDate}"
								data-testid="timeline-mark"
								data-date={item.showDate}
								onmouseenter={(e) => {
									hoveredItem = item;
									tooltipX = e.clientX;
									tooltipY = e.clientY;
								}}
								onmousemove={(e) => {
									tooltipX = e.clientX;
									tooltipY = e.clientY;
								}}
								onmouseleave={() => (hoveredItem = null)}
							/>
						{/each}
					</Svg>
				</Chart>
			</div>

			<!-- Legend -->
			<div class="mt-2 flex flex-wrap gap-4" data-testid="timeline-legend">
				{#each headliners as name}
					<div class="flex items-center gap-1.5 text-xs" style="color: var(--color-text-muted);">
						<span
							class="inline-block h-2.5 w-2.5 rounded-full"
							style="background-color: {colorScale(name)};"
						></span>
						{name}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Floating tooltip -->
{#if hoveredItem}
	<div
		data-testid="timeline-tooltip"
		class="pointer-events-none fixed z-50 rounded px-3 py-2 text-sm shadow-lg"
		style="left: {tooltipX + 16}px; top: {tooltipY - 56}px; background-color: var(--color-surface-alt); color: var(--color-text); border: 1px solid var(--color-border);"
	>
		<div class="font-semibold">{hoveredItem.headliner}</div>
		{#if hoveredItem.supportCount > 0}
			<div class="text-xs" style="color: var(--color-text-muted);">
				+{hoveredItem.supportCount} support
			</div>
		{/if}
		<div class="mt-1 text-xs" style="color: var(--color-text-muted);">{hoveredItem.showDate}</div>
		<div class="text-xs" style="color: var(--color-text-muted);">
			{hoveredItem.venueName}, {hoveredItem.venueCity}
		</div>
	</div>
{/if}
