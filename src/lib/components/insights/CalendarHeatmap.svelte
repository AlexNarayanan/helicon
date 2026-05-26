<script lang="ts">
	import { base } from '$app/paths';

	type MonthCount = { month: number; count: number };

	let items = $state<MonthCount[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredMonth = $state<{ label: string; count: number } | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	const CELL_SIZE = 56;
	const CELL_GAP = 6;

	const byMonth = $derived.by(() => {
		const m = new Map<number, number>();
		for (const it of items) m.set(it.month, it.count);
		return m;
	});

	const months = $derived(
		MONTH_LABELS.map((label, i) => ({
			label,
			month: i + 1,
			count: byMonth.get(i + 1) ?? 0
		}))
	);

	const maxCount = $derived(items.length > 0 ? Math.max(...items.map((d) => d.count)) : 1);

	function cellColor(count: number): string {
		if (count === 0) return 'var(--color-border)';
		const opacity = 0.3 + 0.7 * (count / maxCount);
		return `color-mix(in srgb, var(--color-primary) ${Math.round(opacity * 100)}%, transparent)`;
	}

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
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Show Density by Month</h2>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if items.length === 0}
		<p style="color: var(--color-text-muted);">No data yet.</p>
	{:else}
		<div
			class="flex flex-wrap"
			style="gap: {CELL_GAP}px;"
			data-testid="calendar-heatmap"
		>
			{#each months as m (m.month)}
				<div
					class="flex flex-col items-center justify-center rounded"
					style="
						width: {CELL_SIZE}px;
						height: {CELL_SIZE}px;
						background-color: {cellColor(m.count)};
						cursor: {m.count > 0 ? 'pointer' : 'default'};
					"
					role="presentation"
					data-testid={m.count > 0 ? 'calendar-cell-active' : 'calendar-cell'}
					data-month={m.month}
					onmouseenter={(e) => {
						hoveredMonth = { label: m.label, count: m.count };
						tooltipX = e.clientX;
						tooltipY = e.clientY;
					}}
					onmousemove={(e) => {
						tooltipX = e.clientX;
						tooltipY = e.clientY;
					}}
					onmouseleave={() => (hoveredMonth = null)}
				>
					<span class="text-xs font-semibold" style="color: var(--color-text);">{m.label}</span>
					<span class="text-xs" style="color: var(--color-text-muted);">{m.count}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Floating tooltip -->
{#if hoveredMonth && hoveredMonth.count > 0}
	<div
		data-testid="calendar-tooltip"
		class="pointer-events-none fixed z-50 rounded px-3 py-2 text-sm shadow-lg"
		style="left: {tooltipX + 16}px; top: {tooltipY - 40}px; background-color: var(--color-surface-alt); color: var(--color-text); border: 1px solid var(--color-border);"
	>
		<div class="font-semibold">{hoveredMonth.label}</div>
		<div class="text-xs" style="color: var(--color-text-muted);">
			{hoveredMonth.count} show{hoveredMonth.count !== 1 ? 's' : ''}
		</div>
	</div>
{/if}
