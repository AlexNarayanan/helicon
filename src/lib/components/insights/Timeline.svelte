<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Chart, Svg, Axis } from 'layerchart';
	import { scaleTime, scaleOrdinal, select, zoom, zoomIdentity } from 'd3';
	import { schemeTableau10 } from 'd3';
	import type { ZoomBehavior, ZoomTransform, ZoomScale } from 'd3';
	import type { ScaleTime } from 'd3';
	import type { Focus } from './focus';
	import { focusEquals } from './focus';

	type Artist = { name: string; billingOrder: number };
	type Attendance = {
		id: number;
		showDate: string;
		status: string;
		venueId: number;
		venueName: string;
		venueCity: string;
		venueCountry: string;
		artists: Artist[];
	};
	type TimelineItem = Attendance & {
		date: Date;
		headliner: string;
		supportCount: number;
		artistNameSet: Set<string>;
		monthOfYear: number;
	};

	let {
		focus = $bindable<Focus | null>(null),
		onFocusChange = undefined as ((focus: Focus | null) => void) | undefined
	} = $props();

	let items = $state<TimelineItem[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredItem = $state<TimelineItem | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let transform = $state<ZoomTransform>(zoomIdentity);

	const PADDING = { top: 24, right: 24, bottom: 40, left: 24 };

	const headliners = $derived([...new Set(items.map((d) => d.headliner))]);
	const colorScale = $derived(
		scaleOrdinal<string, string>(schemeTableau10 as string[]).domain(headliners)
	);

	function itemMatches(item: TimelineItem, f: Focus): boolean {
		if (f.kind === 'artists') {
			for (const n of f.names) if (item.artistNameSet.has(n)) return true;
			return false;
		}
		if (f.kind === 'venue') return item.venueId === f.venueId;
		if (f.kind === 'month') return item.monthOfYear === f.month;
		return false;
	}

	function circleOpacity(item: TimelineItem): number {
		if (focus === null) {
			return hoveredItem && hoveredItem.id !== item.id ? 0.35 : 1;
		}
		return itemMatches(item, focus) ? 1 : 0.15;
	}

	function circleStrokeWidth(item: TimelineItem): number {
		return focus !== null && itemMatches(item, focus) ? 3 : 2;
	}

	function setFocus(next: Focus | null) {
		focus = next;
		onFocusChange?.(next);
		if (next === null) hoveredItem = null;
	}

	function handleMarkClick(item: TimelineItem) {
		const candidate: Focus = {
			kind: 'artists',
			names: item.artists.map((a) => a.name),
			originShowId: item.id
		};
		setFocus(focusEquals(focus, candidate) ? null : candidate);
	}

	function handleBackgroundClick() {
		setFocus(null);
	}

	let overlayEl = $state<SVGRectElement | null>(null);

	// We store a reference to a mutable scale that we can rescale for zoom.
	// This is captured from LayerChart's xScale via the template.
	let capturedXScale = $state<ScaleTime<number, number> | null>(null);

	// Zoomed x scale — only available after capturedXScale is set
	const xScaleZoomed = $derived.by(() => {
		if (!capturedXScale) return null;
		return transform.rescaleX(capturedXScale as unknown as ZoomScale);
	});

	onMount(async () => {
		try {
			const res = await fetch(`${base}/api/attendances`);
			if (!res.ok) throw new Error(await res.text());
			const data: Attendance[] = await res.json();
			items = data
				.map((d) => {
					const date = new Date(d.showDate);
					return {
						...d,
						date,
						headliner: d.artists[0]?.name ?? 'Unknown',
						supportCount: Math.max(0, d.artists.length - 1),
						artistNameSet: new Set(d.artists.map((a) => a.name)),
						monthOfYear: date.getUTCMonth() + 1
					};
				})
				.sort((a, b) => a.date.getTime() - b.date.getTime());
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	// Attach zoom behavior once overlayEl is ready
	$effect(() => {
		if (!overlayEl || items.length === 0) return;

		const zoomBehavior: ZoomBehavior<SVGRectElement, unknown> = zoom<SVGRectElement, unknown>()
			.scaleExtent([1, 50])
			.on('zoom', (event) => {
				transform = event.transform;
			});

		select(overlayEl).call(zoomBehavior);

		return () => {
			select(overlayEl).on('.zoom', null);
		};
	});
</script>

<div class="rounded-lg p-6" style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);">
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Timeline</h2>
	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if items.length === 0}
		<p style="color: var(--color-text-muted);">No shows logged yet. <a href="{base}/attendances/new" style="color: var(--color-primary);">Log a show</a> to see it here.</p>
	{:else}
		<div style="height: 160px;">
			<Chart
				data={items}
				x={(d: TimelineItem) => d.date}
				xScale={scaleTime()}
				padding={PADDING}
				let:height
				let:width
				let:xScale
			>
				<Svg>
					{@const zoomedScale = (() => {
						// Capture the LayerChart xScale as our base each render,
						// so that zoom transform is applied to the correct domain/range
						capturedXScale = xScale.copy() as ScaleTime<number, number>;
						return xScaleZoomed ?? xScale;
					})()}

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

					<!-- Invisible overlay for zoom/pan & background click -->
					<rect
						bind:this={overlayEl}
						x={0}
						y={0}
						width={width}
						height={height}
						fill="transparent"
						role="presentation"
						style="cursor: grab;"
						onclick={handleBackgroundClick}
						onkeydown={(e) => { if (e.key === 'Escape') handleBackgroundClick(); }}
						data-testid="timeline-background"
					/>

					<!-- Marks, one per show -->
					{#each items as item (item.id)}
						<circle
							cx={zoomedScale(item.date)}
							cy={height / 2}
							r={9}
							fill={colorScale(item.headliner)}
							stroke="var(--color-surface-alt)"
							stroke-width={circleStrokeWidth(item)}
							opacity={circleOpacity(item)}
							style="cursor: pointer; transition: opacity 0.15s;"
							role="button"
							tabindex={0}
							aria-label="{item.headliner} at {item.venueName} on {item.showDate}"
							data-testid="timeline-mark"
							data-date={item.showDate}
							data-headliner={item.headliner}
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
							onclick={(e) => {
								e.stopPropagation();
								handleMarkClick(item);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.stopPropagation();
									handleMarkClick(item);
								}
							}}
						/>
					{/each}
				</Svg>
			</Chart>
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
