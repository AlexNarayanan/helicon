<script lang="ts">
	import { base } from '$app/paths';
	import { chord, ribbon, arc, scaleOrdinal } from 'd3';
	import { schemeTableau10 } from 'd3';

	type CoPerformerData = {
		artists: { id: number; name: string }[];
		pairs: { sourceId: number; targetId: number; count: number }[];
	};

	let data = $state<CoPerformerData | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredArc = $state<string | null>(null);

	const WIDTH = 500;
	const HEIGHT = 500;
	const OUTER_RADIUS = 200;
	const INNER_RADIUS = 185;
	const cx = WIDTH / 2;
	const cy = HEIGHT / 2;

	const colorScale = $derived(
		data
			? scaleOrdinal<string, string>(schemeTableau10 as string[]).domain(
					data.artists.map((a) => a.name)
				)
			: scaleOrdinal<string, string>()
	);

	const chordLayout = $derived.by(() => {
		if (!data || data.artists.length < 2) return null;

		const n = data.artists.length;
		const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
		const idToIndex = new Map<number, number>(data.artists.map((a, i) => [a.id, i]));

		for (const pair of data.pairs) {
			const si = idToIndex.get(pair.sourceId);
			const ti = idToIndex.get(pair.targetId);
			if (si !== undefined && ti !== undefined) {
				matrix[si][ti] += pair.count;
				matrix[ti][si] += pair.count;
			}
		}

		const chordFn = chord().padAngle(0.04);
		return chordFn(matrix);
	});

	const arcPath = $derived.by(() => {
		return arc<{ startAngle: number; endAngle: number; value: number }>()
			.innerRadius(INNER_RADIUS)
			.outerRadius(OUTER_RADIUS);
	});

	const ribbonPath = $derived.by(() => {
		return ribbon<
			{ source: { startAngle: number; endAngle: number }; target: { startAngle: number; endAngle: number } },
			{ startAngle: number; endAngle: number }
		>().radius(INNER_RADIUS);
	});

	function arcMidAngle(d: { startAngle: number; endAngle: number }): number {
		return (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
	}

	function labelX(d: { startAngle: number; endAngle: number }): number {
		return Math.cos(arcMidAngle(d)) * (OUTER_RADIUS + 12);
	}

	function labelY(d: { startAngle: number; endAngle: number }): number {
		return Math.sin(arcMidAngle(d)) * (OUTER_RADIUS + 12);
	}

	function labelAnchor(d: { startAngle: number; endAngle: number }): string {
		const mid = arcMidAngle(d);
		return Math.cos(mid) > 0.1 ? 'start' : Math.cos(mid) < -0.1 ? 'end' : 'middle';
	}

	async function load() {
		try {
			const res = await fetch(`${base}/api/insights?type=coPerformers`);
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
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Co-Performance Connections</h2>
	<p class="mb-4 text-sm" style="color: var(--color-text-muted);">
		Ribbons connect artists who shared a bill at an attended show. Thickness reflects number of shared shows.
	</p>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if !data || data.artists.length < 2}
		<p style="color: var(--color-text-muted);">Not enough co-performance data yet.</p>
	{:else if !chordLayout || chordLayout.length === 0}
		<p style="color: var(--color-text-muted);">No shared bills found between top artists.</p>
	{:else}
		<div class="flex justify-center" data-testid="chord-diagram">
			<svg width={WIDTH} height={HEIGHT} viewBox="0 0 {WIDTH} {HEIGHT}">
				<g transform="translate({cx},{cy})">
					<!-- Ribbons -->
					{#each chordLayout as c (c.source.index + '-' + c.target.index)}
						{@const sourceArtist = data.artists[c.source.index]}
						{@const isHighlighted = hoveredArc === null || hoveredArc === sourceArtist?.name || hoveredArc === data.artists[c.target.index]?.name}
						<path
							d={ribbonPath(c) ?? ''}
							fill={colorScale(sourceArtist?.name ?? '')}
							opacity={isHighlighted ? 0.6 : 0.1}
							stroke="none"
							style="transition: opacity 0.2s;"
						/>
					{/each}

					<!-- Arcs -->
					{#each chordLayout.groups as group (group.index)}
						{@const artist = data.artists[group.index]}
						<path
							d={arcPath(group) ?? ''}
							fill={colorScale(artist?.name ?? '')}
							opacity={hoveredArc === null || hoveredArc === artist?.name ? 1 : 0.4}
							role="presentation"
							style="cursor: pointer; transition: opacity 0.2s;"
							onmouseenter={() => { hoveredArc = artist?.name ?? null; }}
							onmouseleave={() => { hoveredArc = null; }}
							data-testid="chord-arc"
							data-artist={artist?.name}
						/>

						<!-- Labels for arcs with enough angular space -->
						{#if group.endAngle - group.startAngle > 0.15}
							<text
								x={labelX(group)}
								y={labelY(group)}
								text-anchor={labelAnchor(group)}
								dominant-baseline="middle"
								font-size="11"
								style="fill: var(--color-text); pointer-events: none;"
							>{artist?.name}</text>
						{/if}
					{/each}
				</g>
			</svg>
		</div>
	{/if}
</div>
