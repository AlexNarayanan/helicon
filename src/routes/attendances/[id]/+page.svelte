<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

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

	// Edit mode state
	let editing = $state(false);
	let localPerfs = $state<Performance[]>([]);
	let pendingNames = $state<Record<number, string>>({});
	let savingName = $state<Record<number, boolean>>({});
	let deletingId = $state<number | null>(null);

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

	function showIsInPast(dateStr: string): boolean {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [y, m, d] = dateStr.split('-').map(Number);
		return new Date(y, m - 1, d) < today;
	}

	async function load() {
		try {
			const res = await fetch(`${base}/api/attendances/${data.id}`);
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
			const res = await fetch(`${base}/api/shows/${attendance.showId}/resync`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text());
			await load();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Resync failed';
		} finally {
			resyncing = false;
		}
	}

	async function fetchSetlist() {
		if (!attendance) return;
		resyncing = true;
		try {
			const resyncRes = await fetch(`${base}/api/shows/${attendance.showId}/resync`, { method: 'POST' });
			if (!resyncRes.ok) throw new Error(await resyncRes.text());
			const patchRes = await fetch(`${base}/api/attendances/${attendance.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'confirmed' })
			});
			if (!patchRes.ok) throw new Error(await patchRes.text());
			await load();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Fetch failed';
		} finally {
			resyncing = false;
		}
	}

	function startEdit() {
		if (!attendance) return;
		localPerfs = attendance.performances.map((p) => ({ ...p }));
		pendingNames = {};
		for (const p of attendance.performances) {
			pendingNames[p.id] = p.artistName;
		}
		editing = true;
	}

	async function stopEdit() {
		editing = false;
		await load();
	}

	async function saveArtistName(perfId: number) {
		const name = (pendingNames[perfId] ?? '').trim();
		const current = localPerfs.find((p) => p.id === perfId)?.artistName ?? '';
		if (!name || name === current) return;

		savingName[perfId] = true;
		try {
			const res = await fetch(`${base}/api/performances/${perfId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artistName: name })
			});
			if (!res.ok) throw new Error(await res.text());
			const idx = localPerfs.findIndex((p) => p.id === perfId);
			if (idx !== -1) localPerfs[idx] = { ...localPerfs[idx], artistName: name };
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to rename';
		} finally {
			savingName[perfId] = false;
		}
	}

	async function moveUp(index: number) {
		if (index <= 0) return;
		const temp = localPerfs[index - 1];
		localPerfs[index - 1] = localPerfs[index];
		localPerfs[index] = temp;
		await sendReorder();
	}

	async function moveDown(index: number) {
		if (index >= localPerfs.length - 1) return;
		const temp = localPerfs[index + 1];
		localPerfs[index + 1] = localPerfs[index];
		localPerfs[index] = temp;
		await sendReorder();
	}

	async function sendReorder() {
		if (!attendance) return;
		try {
			const res = await fetch(`${base}/api/shows/${attendance.showId}/reorder`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ performanceIds: localPerfs.map((p) => p.id) })
			});
			if (!res.ok) throw new Error(await res.text());
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to reorder';
		}
	}

	async function deletePerformance(perfId: number) {
		if (!confirm('Remove this act from the show?')) return;
		deletingId = perfId;
		try {
			const res = await fetch(`${base}/api/performances/${perfId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text());
			localPerfs = localPerfs.filter((p) => p.id !== perfId);
			delete pendingNames[perfId];
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to delete';
		} finally {
			deletingId = null;
		}
	}

	onMount(load);
</script>

<div class="mx-auto max-w-2xl">
	<a href="{base}/attendances" class="mb-6 inline-block text-sm" style="color: var(--color-text-muted);">
		← All shows
	</a>

	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if attendance}
		<div data-testid="attendance-detail">
			<div class="mb-2 flex items-center gap-3">
				<h1 class="text-3xl font-bold" style="color: var(--color-text);">
					{attendance.venue.name}
				</h1>
				<span
					data-testid="status-badge"
					class="rounded-full px-2 py-0.5 text-xs font-medium"
					style="{attendance.status === 'confirmed'
						? 'background-color: var(--color-primary); color: var(--color-surface);'
						: 'background-color: var(--color-border); color: var(--color-text-muted);'}"
				>
					{attendance.status}
				</span>
			</div>
			<p class="mb-1 text-lg" style="color: var(--color-text-muted);">
				{attendance.venue.city}{attendance.venue.state ? `, ${attendance.venue.state}` : ''}
			</p>
			<p class="mb-6 text-sm" style="color: var(--color-text-muted);">
				{formatDate(attendance.showDate)}
			</p>

			<div class="mb-6">
				{#if attendance.status === 'planned' && showIsInPast(attendance.showDate)}
					<button
						onclick={fetchSetlist}
						disabled={resyncing}
						class="rounded px-3 py-1.5 text-xs font-semibold"
						style="background-color: var(--color-primary); color: var(--color-surface);"
					>
						{resyncing ? 'Fetching…' : 'Fetch setlist'}
					</button>
					<p class="mt-1 text-xs" style="color: var(--color-text-muted);">
						This show has passed — we'll pull all setlists and mark it confirmed.
					</p>
				{:else}
					<button
						onclick={resync}
						disabled={resyncing}
						class="rounded px-3 py-1.5 text-xs font-semibold"
						style="background-color: var(--color-border); color: var(--color-text);"
					>
						{resyncing ? 'Syncing…' : 'Re-sync from setlist.fm'}
					</button>
				{/if}
			</div>

			{#if attendance.performances.length === 0}
				<p class="text-sm" style="color: var(--color-text-muted);">No performances recorded.</p>
			{:else}
				<div class="mb-4 flex items-center justify-between">
					<span
						class="text-xs font-semibold uppercase tracking-widest"
						style="color: var(--color-text-muted);"
					>Lineup</span>
					{#if editing}
						<button
							onclick={stopEdit}
							class="rounded px-3 py-1 text-xs font-semibold"
							style="background-color: var(--color-primary); color: var(--color-surface);"
						>
							Done
						</button>
					{:else}
						<button
							onclick={startEdit}
							class="rounded px-3 py-1 text-xs font-medium"
							style="background-color: var(--color-border); color: var(--color-text);"
						>
							Edit lineup
						</button>
					{/if}
				</div>

				{#each (editing ? localPerfs : attendance.performances) as perf, i (perf.id)}
					<section
						data-testid="performance"
						data-billing-order={perf.billingOrder}
						class="mb-10"
					>
						{#if editing}
							<div class="mb-3 flex items-center gap-2">
								<div class="flex flex-col gap-0.5">
									<button
										onclick={() => moveUp(i)}
										disabled={i === 0}
										title="Move up"
										class="rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-25"
										style="background-color: var(--color-border); color: var(--color-text-muted);"
									>▲</button>
									<button
										onclick={() => moveDown(i)}
										disabled={i === localPerfs.length - 1}
										title="Move down"
										class="rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-25"
										style="background-color: var(--color-border); color: var(--color-text-muted);"
									>▼</button>
								</div>

								<input
									type="text"
									value={pendingNames[perf.id]}
									oninput={(e) => { pendingNames[perf.id] = e.currentTarget.value; }}
									onblur={() => saveArtistName(perf.id)}
									onkeydown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
									disabled={savingName[perf.id]}
									class="min-w-0 flex-1 rounded px-2 py-1 text-xl font-bold"
									style="background-color: var(--color-surface-alt); color: var(--color-text); border: 1px solid var(--color-border); outline-color: var(--color-primary);"
								/>

								{#if localPerfs.length > 1}
									<span
										class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
										style="background-color: var(--color-border); color: var(--color-text-muted);"
									>
										{i === 0 ? 'Headliner' : 'Support'}
									</span>
								{/if}

								<button
									onclick={() => deletePerformance(perf.id)}
									disabled={deletingId === perf.id}
									title="Remove from show"
									class="shrink-0 rounded px-2 py-1 text-sm font-bold"
									style="color: #ef4444; background-color: color-mix(in srgb, #ef4444 12%, transparent);"
								>
									{deletingId === perf.id ? '…' : '✕'}
								</button>
							</div>
						{:else}
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
						{/if}

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
