<script lang="ts">
	import Timeline from '$lib/components/insights/Timeline.svelte';
	import TopArtistsBar from '$lib/components/insights/TopArtistsBar.svelte';
	import TopVenuesBar from '$lib/components/insights/TopVenuesBar.svelte';
	import CalendarHeatmap from '$lib/components/insights/CalendarHeatmap.svelte';
	import CoPerformersChord from '$lib/components/insights/CoPerformersChord.svelte';
	import CumulativeDiscoveries from '$lib/components/insights/CumulativeDiscoveries.svelte';

	let focusedArtist = $state<string | null>(null);

	function handleArtistFocus(artist: string | null) {
		focusedArtist = artist;
	}

	function handleBarClick(artistName: string) {
		focusedArtist = focusedArtist === artistName ? null : artistName;
	}
</script>

<div class="mx-auto max-w-6xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Insights</h1>

	<div class="flex flex-col gap-8">
		<!-- Timeline -->
		<Timeline bind:focusedArtist onArtistFocus={handleArtistFocus} />

		<!-- Bar charts side by side -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<TopArtistsBar onArtistClick={handleBarClick} />
			<TopVenuesBar />
		</div>

		<!-- Calendar heatmap -->
		<CalendarHeatmap />

		<!-- Chord and Cumulative side by side -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<CoPerformersChord />
			<CumulativeDiscoveries />
		</div>
	</div>
</div>
