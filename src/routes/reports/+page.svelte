<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import MultiSelect from 'svelte-multiselect';

	type ReportType =
		| 'mostPlayedSongs'
		| 'mostRareSongs'
		| 'mostCommonVenues'
		| 'bothOpenerAndHeadliner'
		| 'openersDistribution';

	type SongRow = { songName: string; artistName: string; playCount: number };
	type VenueRow = {
		venueId: number;
		venueName: string;
		venueCity: string;
		venueCountry: string;
		showCount: number;
	};
	type BothRolesRow = { artistName: string; headlinerCount: number; openerCount: number };
	type DistributionRow = { openerCount: number; showCount: number };
	type ReportRow = SongRow | VenueRow | BothRolesRow | DistributionRow;

	const REPORT_LABELS: Record<ReportType, string> = {
		mostPlayedSongs: 'Most Played Songs',
		mostRareSongs: 'Rarest Songs',
		mostCommonVenues: 'Most Visited Venues',
		bothOpenerAndHeadliner: 'Artists Seen as Both Opener & Headliner',
		openersDistribution: 'Openers Per Show Distribution'
	};

	const FILTERABLE: ReportType[] = ['mostPlayedSongs', 'mostRareSongs', 'mostCommonVenues'];

	type SelectOption = { label: string; value: number };

	let reportType = $state<ReportType>('mostPlayedSongs');
	let selectedArtists = $state<SelectOption[]>([]);
	let selectedVenues = $state<SelectOption[]>([]);
	let yearStart = $state<string>('');
	let yearEnd = $state<string>('');

	let availableArtists = $state<{ id: number; name: string }[]>([]);
	let availableVenues = $state<{ id: number; name: string; city: string }[]>([]);
	const artistOptions = $derived<SelectOption[]>(
		availableArtists.map((a) => ({ label: a.name, value: a.id }))
	);
	const venueOptions = $derived<SelectOption[]>(
		availableVenues.map((v) => ({ label: `${v.name}, ${v.city}`, value: v.id }))
	);
	let results = $state<ReportRow[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

	const isFilterable = $derived(FILTERABLE.includes(reportType));

	async function fetchFilters() {
		const res = await fetch(`${base}/api/reports/filters`);
		if (!res.ok) return;
		const data = await res.json();
		availableArtists = data.artists;
		availableVenues = data.venues;
	}

	async function fetchReport() {
		loading = true;
		errorMsg = '';
		try {
			const params = new URLSearchParams({ type: reportType });
			if (isFilterable) {
				selectedArtists.forEach((o) => params.append('artistId', String(o.value)));
				selectedVenues.forEach((o) => params.append('venueId', String(o.value)));
				if (yearStart) params.set('yearStart', yearStart);
				if (yearEnd) params.set('yearEnd', yearEnd);
			}
			const res = await fetch(`${base}/api/reports?${params}`);
			if (!res.ok) throw new Error(await res.text());
			results = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load report';
		} finally {
			loading = false;
		}
	}

	function onReportTypeChange() {
		selectedArtists = [];
		selectedVenues = [];
		fetchReport();
	}

	function onFilterChange() {
		fetchReport();
	}

	onMount(async () => {
		await fetchFilters();
		await fetchReport();
	});
</script>

<div class="mx-auto max-w-4xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Reports</h1>

	<!-- Report type selector -->
	<div class="mb-6">
		<label
			for="report-type"
			class="mb-1 block text-xs font-semibold uppercase tracking-wide"
			style="color: var(--color-text-muted);"
		>
			Report
		</label>
		<select
			id="report-type"
			bind:value={reportType}
			onchange={onReportTypeChange}
			class="rounded border px-3 py-2 text-sm"
			style="background-color: var(--color-surface-alt); color: var(--color-text); border-color: var(--color-border);"
			data-testid="report-type-select"
		>
			{#each Object.entries(REPORT_LABELS) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>
	</div>

	<!-- Filters (only for filterable reports) -->
	{#if isFilterable}
		<div
			class="mb-6 flex flex-col gap-4 rounded-lg p-4"
			style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);"
			data-testid="filters-panel"
		>
			<!-- Row 1: Artist, Venue -->
			<div class="flex flex-wrap gap-4">
				<div class="flex flex-col gap-1">
					<label
						for="artist-filter"
						class="text-xs font-semibold uppercase tracking-wide"
						style="color: var(--color-text-muted);"
					>
						Artist
					</label>
					<div data-testid="artist-filter" class="w-56">
						<MultiSelect
							id="artist-filter"
							options={artistOptions}
							bind:selected={selectedArtists}
							onchange={onFilterChange}
							placeholder="All artists"
							--sms-bg="var(--color-surface)"
							--sms-border="1px solid var(--color-border)"
							--sms-border-radius="4px"
							--sms-text-color="var(--color-text)"
							--sms-placeholder-color="var(--color-text-muted)"
							--sms-options-bg="var(--color-surface-alt)"
							--sms-options-border="1px solid var(--color-border)"
							--sms-options-border-radius="4px"
							--sms-font-size="0.875rem"
							--sms-min-height="34px"
							--sms-selected-bg="var(--color-surface-alt)"
							--sms-selected-text-color="var(--color-text)"
							--sms-active-color="var(--color-border)"
						/>
					</div>
				</div>

				{#if reportType !== 'mostCommonVenues'}
					<div class="flex flex-col gap-1">
						<label
							for="venue-filter"
							class="text-xs font-semibold uppercase tracking-wide"
							style="color: var(--color-text-muted);"
						>
							Venue
						</label>
						<div data-testid="venue-filter" class="w-64">
							<MultiSelect
								id="venue-filter"
								options={venueOptions}
								bind:selected={selectedVenues}
								onchange={onFilterChange}
								placeholder="All venues"
								--sms-bg="var(--color-surface)"
								--sms-border="1px solid var(--color-border)"
								--sms-border-radius="4px"
								--sms-text-color="var(--color-text)"
								--sms-placeholder-color="var(--color-text-muted)"
								--sms-options-bg="var(--color-surface-alt)"
								--sms-options-border="1px solid var(--color-border)"
								--sms-options-border-radius="4px"
								--sms-font-size="0.875rem"
								--sms-min-height="34px"
								--sms-selected-bg="var(--color-surface-alt)"
								--sms-selected-text-color="var(--color-text)"
								--sms-active-color="var(--color-border)"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Row 2: Year range -->
			<div class="flex gap-4">
				<div class="flex flex-col gap-1">
					<label
						for="year-start"
						class="text-xs font-semibold uppercase tracking-wide"
						style="color: var(--color-text-muted);"
					>
						Year from
					</label>
					<input
						id="year-start"
						type="number"
						bind:value={yearStart}
						oninput={onFilterChange}
						min="1900"
						max="2100"
						placeholder="e.g. 2020"
						class="w-28 rounded border px-3 py-1.5 text-sm"
						style="background-color: var(--color-surface); color: var(--color-text); border-color: var(--color-border);"
						data-testid="year-start"
					/>
				</div>

				<div class="flex flex-col gap-1">
					<label
						for="year-end"
						class="text-xs font-semibold uppercase tracking-wide"
						style="color: var(--color-text-muted);"
					>
						Year to
					</label>
					<input
						id="year-end"
						type="number"
						bind:value={yearEnd}
						oninput={onFilterChange}
						min="1900"
						max="2100"
						placeholder="e.g. 2024"
						class="w-28 rounded border px-3 py-1.5 text-sm"
						style="background-color: var(--color-surface); color: var(--color-text); border-color: var(--color-border);"
						data-testid="year-end"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if loading}
		<p style="color: var(--color-text-muted);">Loading…</p>
	{:else if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else if results.length === 0}
		<p style="color: var(--color-text-muted);">No data found for the selected filters.</p>
	{:else}
		<div
			class="overflow-hidden rounded-lg"
			style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border);"
			data-testid="report-results"
		>
			{#if reportType === 'mostPlayedSongs' || reportType === 'mostRareSongs'}
				<table class="w-full text-sm">
					<thead>
						<tr style="background-color: var(--color-surface-alt);">
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">#</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Song</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Artist</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Times Played</th
							>
						</tr>
					</thead>
					<tbody>
						{#each results as row, i (i)}
							{@const r = row as SongRow}
							<tr
								style="border-top: 1px solid var(--color-border);"
								data-testid="report-row"
							>
								<td class="px-4 py-3" style="color: var(--color-text-muted);">{i + 1}</td>
								<td class="px-4 py-3 font-medium" style="color: var(--color-text);"
									>{r.songName}</td
								>
								<td class="px-4 py-3" style="color: var(--color-text-muted);">{r.artistName}</td>
								<td class="px-4 py-3 text-right" style="color: var(--color-text);"
									>{r.playCount}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if reportType === 'mostCommonVenues'}
				<table class="w-full text-sm">
					<thead>
						<tr style="background-color: var(--color-surface-alt);">
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">#</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Venue</th
							>
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">City</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Shows</th
							>
						</tr>
					</thead>
					<tbody>
						{#each results as row, i (i)}
							{@const r = row as VenueRow}
							<tr style="border-top: 1px solid var(--color-border);" data-testid="report-row">
								<td class="px-4 py-3" style="color: var(--color-text-muted);">{i + 1}</td>
								<td class="px-4 py-3 font-medium" style="color: var(--color-text);"
									>{r.venueName}</td
								>
								<td class="px-4 py-3" style="color: var(--color-text-muted);"
									>{r.venueCity}, {r.venueCountry}</td
								>
								<td class="px-4 py-3 text-right" style="color: var(--color-text);"
									>{r.showCount}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if reportType === 'bothOpenerAndHeadliner'}
				<table class="w-full text-sm">
					<thead>
						<tr style="background-color: var(--color-surface-alt);">
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Artist</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Headliner Shows</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Opener Shows</th
							>
						</tr>
					</thead>
					<tbody>
						{#each results as row, i (i)}
							{@const r = row as BothRolesRow}
							<tr style="border-top: 1px solid var(--color-border);" data-testid="report-row">
								<td class="px-4 py-3 font-medium" style="color: var(--color-text);"
									>{r.artistName}</td
								>
								<td class="px-4 py-3 text-right" style="color: var(--color-text);"
									>{r.headlinerCount}</td
								>
								<td class="px-4 py-3 text-right" style="color: var(--color-text);"
									>{r.openerCount}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if reportType === 'openersDistribution'}
				<table class="w-full text-sm">
					<thead>
						<tr style="background-color: var(--color-surface-alt);">
							<th
								class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Number of Openers</th
							>
							<th
								class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
								style="color: var(--color-text-muted);">Shows</th
							>
						</tr>
					</thead>
					<tbody>
						{#each results as row, i (i)}
							{@const r = row as DistributionRow}
							<tr style="border-top: 1px solid var(--color-border);" data-testid="report-row">
								<td class="px-4 py-3" style="color: var(--color-text);"
									>{r.openerCount === 0 ? 'Solo (no openers)' : r.openerCount}</td
								>
								<td class="px-4 py-3 text-right" style="color: var(--color-text);"
									>{r.showCount}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}
</div>
