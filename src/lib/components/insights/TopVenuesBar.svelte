<script lang="ts">
	import { base } from '$app/paths';

	type VenueCount = {
		venueId: number;
		venueName: string;
		venueCity: string;
		venueCountry: string;
		showCount: number;
	};

	let { onVenueClick = undefined as ((venueId: number) => void) | undefined } = $props();

	let items = $state<VenueCount[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let hoveredLabel = $state<string | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	const maxCount = $derived(items.length > 0 ? items[0].showCount : 1);

	async function load() {
		try {
			const res = await fetch(`${base}/api/insights?type=topVenues`);
			if (!res.ok) throw new Error(await res.text());
			items = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	function showTooltipIfTruncated(e: MouseEvent, label: string) {
		const el = e.currentTarget as HTMLElement | null;
		if (el && el.scrollWidth > el.clientWidth) {
			hoveredLabel = label;
			tooltipX = e.clientX;
			tooltipY = e.clientY;
		} else {
			hoveredLabel = null;
		}
	}

	function moveTooltip(e: MouseEvent) {
		if (hoveredLabel !== null) {
			tooltipX = e.clientX;
			tooltipY = e.clientY;
		}
	}

	$effect(() => {
		load();
	});
</script>

<div class="rounded-lg p-6" style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);">
	<h2 class="mb-4 text-lg font-semibold" style="color: var(--color-text);">Top 10 Most-Visited Venues</h2>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if items.length === 0}
		<p style="color: var(--color-text-muted);">No data yet.</p>
	{:else}
		<div class="flex flex-col gap-2" data-testid="top-venues-bars">
			{#each items as item (item.venueId)}
				{@const pct = (item.showCount / maxCount) * 100}
				{@const label = `${item.venueName} — ${item.venueCity}`}
				<button
					class="flex items-center gap-3 text-left"
					onclick={() => onVenueClick?.(item.venueId)}
					data-testid="top-venues-bar"
					data-venue-id={item.venueId}
				>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class="w-48 shrink-0 truncate text-sm"
						style="color: var(--color-text);"
						onmouseenter={(e) => showTooltipIfTruncated(e, label)}
						onmousemove={moveTooltip}
						onmouseleave={() => (hoveredLabel = null)}>{label}</span
					>
					<div class="relative flex-1" style="height: 20px;">
						<div
							class="absolute inset-y-0 left-0 rounded-sm"
							style="width: {pct}%; background-color: var(--color-primary); opacity: {0.4 + 0.6 * (pct / 100)};"
						></div>
					</div>
					<span class="w-8 shrink-0 text-right text-sm font-medium" style="color: var(--color-text);"
						>{item.showCount}</span
					>
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if hoveredLabel}
	<div
		data-testid="top-venues-tooltip"
		class="pointer-events-none fixed z-50 rounded px-3 py-2 text-sm shadow-lg"
		style="left: {tooltipX + 16}px; top: {tooltipY - 40}px; background-color: var(--color-surface-alt); color: var(--color-text); border: 1px solid var(--color-border);"
	>
		{hoveredLabel}
	</div>
{/if}
