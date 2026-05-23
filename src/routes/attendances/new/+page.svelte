<script lang="ts">
	import type { SetlistFmSetlist } from '$lib/server/setlistfm/types.js';

	type Phase = 'idle' | 'searching' | 'results' | 'saving' | 'saved' | 'error';

	let artistName = $state('');
	let date = $state('');
	let venueName = $state('');
	let phase = $state<Phase>('idle');
	let results = $state<SetlistFmSetlist[]>([]);
	let savedId = $state<number | null>(null);
	let errorMsg = $state('');

	async function search() {
		phase = 'searching';
		results = [];
		errorMsg = '';

		const params = new URLSearchParams({ artistName });
		if (date) params.set('date', date);
		if (venueName) params.set('venueName', venueName);

		try {
			const res = await fetch(`/api/setlistfm/search?${params}`);
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			results = data.setlists;
			phase = 'results';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Search failed';
			phase = 'error';
		}
	}

	async function save(setlist: SetlistFmSetlist) {
		phase = 'saving';
		errorMsg = '';

		try {
			const res = await fetch('/api/attendances', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ setlistId: setlist.id, status: 'confirmed' })
			});
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			savedId = data.attendanceId;
			phase = 'saved';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Save failed';
			phase = 'error';
		}
	}

	function formatDate(eventDate: string): string {
		const [day, month, year] = eventDate.split('-');
		return `${year}-${month}-${day}`;
	}

	function songCount(setlist: SetlistFmSetlist): number {
		return setlist.sets.set.reduce((acc, s) => acc + s.song.length, 0);
	}
</script>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Log a show</h1>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
		class="mb-8 flex flex-col gap-4"
	>
		<div class="flex flex-col gap-1">
			<label for="artist-input" class="text-sm font-medium" style="color: var(--color-text);">
				Artist
			</label>
			<input
				id="artist-input"
				type="text"
				bind:value={artistName}
				placeholder="e.g. Metallica"
				required
				class="rounded border px-3 py-2 text-sm"
				style="background: var(--color-surface); border-color: var(--color-border); color: var(--color-text);"
			/>
		</div>

		<div class="flex flex-col gap-1">
			<label for="date-input" class="text-sm font-medium" style="color: var(--color-text);">
				Date
			</label>
			<input
				id="date-input"
				type="date"
				bind:value={date}
				class="rounded border px-3 py-2 text-sm"
				style="background: var(--color-surface); border-color: var(--color-border); color: var(--color-text);"
			/>
		</div>

		<div class="flex flex-col gap-1">
			<label for="venue-input" class="text-sm font-medium" style="color: var(--color-text);">
				Venue <span style="color: var(--color-text-muted);">(optional)</span>
			</label>
			<input
				id="venue-input"
				type="text"
				bind:value={venueName}
				placeholder="e.g. Madison Square Garden"
				class="rounded border px-3 py-2 text-sm"
				style="background: var(--color-surface); border-color: var(--color-border); color: var(--color-text);"
			/>
		</div>

		<button
			type="submit"
			disabled={phase === 'searching' || phase === 'saving'}
			class="rounded px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
			style="background: var(--color-primary); color: var(--color-surface);"
		>
			{phase === 'searching' ? 'Searching…' : 'Search'}
		</button>
	</form>

	{#if phase === 'saved'}
		<div
			class="rounded border px-4 py-3 text-sm"
			style="border-color: var(--color-primary); color: var(--color-text);"
			data-testid="saved-confirmation"
		>
			Show saved! <a href="/attendances/{savedId}" style="color: var(--color-primary);">View attendance</a>
		</div>
	{/if}

	{#if phase === 'error'}
		<div class="rounded border px-4 py-3 text-sm" style="border-color: #ef4444; color: #ef4444;">
			{errorMsg}
		</div>
	{/if}

	{#if phase === 'results' || phase === 'saving'}
		{#if results.length === 0}
			<p class="text-sm" style="color: var(--color-text-muted);">No setlists found.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each results as setlist (setlist.id)}
					<li
						class="flex items-start justify-between rounded border px-4 py-3"
						style="border-color: var(--color-border);"
					>
						<div class="flex flex-col gap-1">
							<span class="font-semibold" style="color: var(--color-text);">
								{setlist.artist.name}
							</span>
							<span class="text-sm" style="color: var(--color-text-muted);">
								{setlist.venue.name}, {setlist.venue.city.name}
							</span>
							<span class="text-sm" style="color: var(--color-text-muted);">
								{formatDate(setlist.eventDate)}
								{#if setlist.tour}· {setlist.tour.name}{/if}
								· {songCount(setlist)} songs
							</span>
						</div>
						<button
							onclick={() => save(setlist)}
							disabled={phase === 'saving'}
							class="ml-4 shrink-0 rounded px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
							style="background: var(--color-primary); color: var(--color-surface);"
						>
							Save
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
