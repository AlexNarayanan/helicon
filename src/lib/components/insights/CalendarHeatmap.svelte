<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	type MonthCount = { month: number; count: number };

	let items = $state<MonthCount[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredMonth = $state<{ label: string; count: number } | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	// Theme colors read from CSS vars at runtime so we can compute cell luminance.
	let primaryRgb = $state<[number, number, number]>([0, 0, 0]);
	let surfaceAltRgb = $state<[number, number, number]>([255, 255, 255]);
	let borderRgb = $state<[number, number, number]>([0, 0, 0]);

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
		primaryRgb = parseColor(cs.getPropertyValue('--color-primary'));
		surfaceAltRgb = parseColor(cs.getPropertyValue('--color-surface-alt'));
		borderRgb = parseColor(cs.getPropertyValue('--color-border'));
	}

	function relativeLuminance([r, g, b]: [number, number, number]): number {
		const toLin = (c: number) => {
			const s = c / 255;
			return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		};
		return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
	}

	function blend(
		fg: [number, number, number],
		bg: [number, number, number],
		alpha: number
	): [number, number, number] {
		return [
			fg[0] * alpha + bg[0] * (1 - alpha),
			fg[1] * alpha + bg[1] * (1 - alpha),
			fg[2] * alpha + bg[2] * (1 - alpha)
		];
	}

	function cellAlpha(count: number): number {
		if (count === 0) return 0;
		return 0.3 + 0.7 * (count / maxCount);
	}

	function cellColor(count: number): string {
		if (count === 0) return 'var(--color-border)';
		const opacity = cellAlpha(count);
		return `color-mix(in srgb, var(--color-primary) ${Math.round(opacity * 100)}%, transparent)`;
	}

	function cellTextColor(count: number): string {
		const composite =
			count === 0 ? borderRgb : blend(primaryRgb, surfaceAltRgb, cellAlpha(count));
		return relativeLuminance(composite) < 0.5 ? '#ffffff' : '#111111';
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

	onMount(() => {
		readThemeColors();
		const observer = new MutationObserver(readThemeColors);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		load();
		return () => observer.disconnect();
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
				{@const textColor = cellTextColor(m.count)}
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
					<span class="text-xs font-semibold" style="color: {textColor};">{m.label}</span>
					<span class="text-xs" style="color: {textColor}; opacity: 0.75;">{m.count}</span>
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
