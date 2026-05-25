<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	type ArtistEntry = { name: string; billingOrder: number };
	type Attendance = {
		id: number;
		showDate: string;
		artists: ArtistEntry[];
		venueName: string;
		venueCity: string;
		venueCountry: string;
		status: 'confirmed' | 'planned';
	};

	let attendances = $state<Attendance[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

	function formatDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-');
		const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatLineup(artists: ArtistEntry[]): string {
		if (artists.length === 0) return '—';
		// artists already arrive sorted by billing_order desc (headliner first)
		return artists.map((a) => a.name).join(', ');
	}

	onMount(async () => {
		try {
			const res = await fetch(`${base}/api/attendances`);
			if (!res.ok) throw new Error(await res.text());
			attendances = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load shows';
		} finally {
			loading = false;
		}
	});
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-3xl font-bold" style="color: var(--color-text);">Shows</h1>
		<a
			href="{base}/attendances/new"
			class="rounded px-4 py-2 text-sm font-semibold"
			style="background-color: var(--color-primary); color: var(--color-surface);"
		>
			+ Log show
		</a>
	</div>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if attendances.length === 0}
		<p style="color: var(--color-text-muted);">No shows logged yet.</p>
	{:else}
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr style="border-bottom: 1px solid var(--color-border);">
					<th class="py-2 pr-6 text-left font-semibold" style="color: var(--color-text-muted);"
						>Date</th
					>
					<th class="py-2 pr-6 text-left font-semibold" style="color: var(--color-text-muted);"
						>Lineup</th
					>
					<th class="py-2 pr-6 text-left font-semibold" style="color: var(--color-text-muted);"
						>Venue</th
					>
					<th class="py-2 text-left font-semibold" style="color: var(--color-text-muted);"
						>Status</th
					>
				</tr>
			</thead>
			<tbody>
				{#each attendances as att (att.id)}
					<tr data-testid="attendance-row" style="border-bottom: 1px solid var(--color-border);">
						<td class="py-3 pr-6" style="color: var(--color-text-muted);"
							>{formatDate(att.showDate)}</td
						>
						<td class="py-3 pr-6">
							<a
								href="{base}/attendances/{att.id}"
								class="font-medium hover:underline"
								style="color: var(--color-text);"
							>
								{formatLineup(att.artists)}
							</a>
						</td>
						<td class="py-3 pr-6" style="color: var(--color-text-muted);">
							{att.venueName}, {att.venueCity}
						</td>
						<td class="py-3">
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium"
								style="{att.status === 'confirmed'
									? 'background-color: var(--color-primary); color: var(--color-surface);'
									: 'background-color: var(--color-border); color: var(--color-text-muted);'}"
							>
								{att.status}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
