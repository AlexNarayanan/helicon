<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();

	type Song = {
		position: number;
		name: string;
		info: string;
		isCover: boolean;
		coverArtistName?: string;
	};
	type SetGroup = {
		setNumber: number;
		isEncore: boolean;
		songs: Song[];
	};
	type Performance = {
		id: number;
		billingOrder: number;
		artistName: string;
		tourName: string | null;
		setlistfmUrl: string | null;
		sets: SetGroup[];
	};
	type AttendanceDetail = {
		id: number;
		status: 'confirmed' | 'planned';
		notes: string;
		showId: number;
		showDate: string;
		lastSyncedAt: string | null;
		venue: { name: string; city: string; state: string; country: string };
		performances: Performance[];
	};

	let attendance = $state<AttendanceDetail | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let resyncing = $state(false);

	function formatDate(dateStr: string): string {
		const [year, month, day] = dateStr.split('-');
		const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
	}

	function performanceLabel(p: Performance, total: number): string {
		if (total === 1) return '';
		if (p.billingOrder === total - 1) return 'Headliner';
		return 'Support';
	}

	async function load() {
		try {
			const res = await fetch(`/api/attendances/${data.id}`);
			if (!res.ok) throw new Error(await res.text());
			attendance = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load show';
		} finally {
			loading = false;
		}
	}

	async function resync() {
		if (!attendance) return;
		resyncing = true;
		try {
			const res = await fetch(`/api/shows/${attendance.showId}/resync`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await load();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Resync failed';
		} finally {
			resyncing = false;
		}
	}

	onMount(load);
</script>

<div class="mx-auto max-w-2xl">
	<a href="/attendances" class="mb-6 inline-block text-sm" style="color: var(--color-text-muted);">
		← All shows
	</a>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if attendance}
		<div data-testid="attendance-detail">
			<h1 class="mb-1 text-3xl font-bold" style="color: var(--color-text);">
				{attendance.venue.name}
			</h1>
			<p class="mb-1 text-lg" style="color: var(--color-text-muted);">
				{attendance.venue.city}{attendance.venue.state ? `, ${attendance.venue.state}` : ''}
			</p>
			<p class="mb-6 text-sm" style="color: var(--color-text-muted);">
				{formatDate(attendance.showDate)}
			</p>

			<div class="mb-6">
				<button
					onclick={resync}
					disabled={resyncing}
					class="rounded px-3 py-1.5 text-xs font-semibold"
					style="background-color: var(--color-border); color: var(--color-text);"
				>
					{resyncing ? 'Syncing…' : 'Re-sync from setlist.fm'}
				</button>
			</div>

			{#if attendance.performances.length === 0}
				<p class="text-sm" style="color: var(--color-text-muted);">No performances recorded.</p>
			{:else}
				{#each attendance.performances as perf (perf.id)}
					<section
						data-testid="performance"
						data-billing-order={perf.billingOrder}
						class="mb-10"
					>
						<div class="mb-3 flex items-baseline gap-3">
							<h2 class="text-2xl font-bold" style="color: var(--color-text);">
								{perf.artistName}
							</h2>
							{#if performanceLabel(perf, attendance.performances.length)}
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium"
									style="background-color: var(--color-border); color: var(--color-text-muted);"
								>
									{performanceLabel(perf, attendance.performances.length)}
								</span>
							{/if}
						</div>
						{#if perf.tourName}
							<p class="mb-3 text-sm" style="color: var(--color-text-muted);">{perf.tourName}</p>
						{/if}

						{#if perf.sets.length > 0}
							{#each perf.sets as set (set.setNumber)}
								<div class="mb-4">
									<h3
										class="mb-2 text-xs font-semibold uppercase tracking-wide"
										style="color: var(--color-text-muted);"
									>
										{set.isEncore ? 'Encore' : 'Set'}
									</h3>
									<ol class="flex flex-col gap-1">
										{#each set.songs as song (song.position)}
											<li class="flex items-baseline gap-2">
												<span
													class="w-5 shrink-0 text-right text-xs"
													style="color: var(--color-text-muted);">{song.position}.</span
												>
												<span style="color: var(--color-text);">{song.name}</span>
												{#if song.isCover && song.coverArtistName}
													<span class="text-xs" style="color: var(--color-text-muted);"
														>(cover – {song.coverArtistName})</span
													>
												{/if}
												{#if song.info}
													<span class="text-xs" style="color: var(--color-text-muted);"
														>[{song.info}]</span
													>
												{/if}
											</li>
										{/each}
									</ol>
								</div>
							{/each}
						{:else}
							<p class="text-sm" style="color: var(--color-text-muted);">No setlist recorded.</p>
						{/if}

						{#if perf.setlistfmUrl}
							<a
								href={perf.setlistfmUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-2 inline-block text-xs"
								style="color: var(--color-primary);"
							>
								View on setlist.fm →
							</a>
						{/if}
					</section>
				{/each}
			{/if}
		</div>
	{/if}
</div>
