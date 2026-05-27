<script lang="ts">
	import Timeline from '$lib/components/insights/Timeline.svelte';
	import TopArtistsBar from '$lib/components/insights/TopArtistsBar.svelte';
	import TopVenuesBar from '$lib/components/insights/TopVenuesBar.svelte';
	import CalendarHeatmap from '$lib/components/insights/CalendarHeatmap.svelte';
	import CoPerformersChord from '$lib/components/insights/CoPerformersChord.svelte';
	import CumulativeDiscoveries from '$lib/components/insights/CumulativeDiscoveries.svelte';
	import type { Focus } from '$lib/components/insights/focus';
	import { focusEquals } from '$lib/components/insights/focus';

	let focus = $state<Focus | null>(null);

	function toggleFocus(candidate: Focus) {
		focus = focusEquals(focus, candidate) ? null : candidate;
	}

	function handleFocusChange(next: Focus | null) {
		focus = next;
	}

	function handleArtistClick(artistName: string) {
		toggleFocus({ kind: 'artists', names: [artistName] });
	}

	function handleVenueClick(venueId: number) {
		toggleFocus({ kind: 'venue', venueId });
	}

	function handleMonthClick(month: number) {
		toggleFocus({ kind: 'month', month });
	}
</script>

<div class="mx-auto max-w-6xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Insights</h1>

	<div class="flex flex-col gap-8">
		<!-- Timeline -->
		<Timeline bind:focus onFocusChange={handleFocusChange} />

		<!-- Bar charts side by side -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<TopArtistsBar onArtistClick={handleArtistClick} />
			<TopVenuesBar onVenueClick={handleVenueClick} />
		</div>

		<!-- Calendar heatmap -->
		<CalendarHeatmap onMonthClick={handleMonthClick} />

		<!-- Chord and Cumulative side by side -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<CoPerformersChord />
			<CumulativeDiscoveries />
		</div>
	</div>
</div>
