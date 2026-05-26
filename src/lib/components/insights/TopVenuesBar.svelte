<script lang="ts">
	import { base } from '$app/paths';

	type VenueCount = {
		venueId: number;
		venueName: string;
		venueCity: string;
		venueCountry: string;
		showCount: number;
	};

	let items = $state<VenueCount[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

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
				<div class="flex items-center gap-3" data-testid="top-venues-bar">
					<span class="w-48 shrink-0 truncate text-sm" style="color: var(--color-text);"
						>{item.venueName} — {item.venueCity}</span
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
				</div>
			{/each}
		</div>
	{/if}
</div>
