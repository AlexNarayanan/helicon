<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';

	type VenueShow = {
		showId: number;
		showDate: string;
		artists: Array<{ name: string; billingOrder: number }>;
	};

	type VenueData = {
		venueId: number;
		venueName: string;
		venueCity: string;
		venueState: string | null;
		venueCountry: string;
		lat: number | null;
		lng: number | null;
		showCount: number;
		shows: VenueShow[];
	};

	let mapContainer = $state<HTMLDivElement | undefined>(undefined);
	let loading = $state(true);
	let errorMsg = $state('');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let markerInstances: any[] = [];

	const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

	function buildPopupHTML(venue: VenueData): string {
		const location = [venue.venueCity, venue.venueState, venue.venueCountry]
			.filter(Boolean)
			.join(', ');
		const showsHTML = [...venue.shows]
			.sort((a, b) => b.showDate.localeCompare(a.showDate))
			.map((s) => {
				const lineup = [...s.artists]
					.sort((a, b) => b.billingOrder - a.billingOrder)
					.map((a) => a.name)
					.join(', ');
				return `<div class="map-show-row"><span class="map-show-date">${s.showDate}</span>${lineup ? ` — ${lineup}` : ''}</div>`;
			})
			.join('');
		return `<div class="map-popup"><strong>${venue.venueName}</strong><div class="map-popup-loc">${location}</div>${showsHTML}</div>`;
	}

	onMount(async () => {
		let venueData: VenueData[] = [];
		try {
			const res = await fetch(`${base}/api/viz/map`);
			if (!res.ok) throw new Error(await res.text());
			venueData = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load';
			loading = false;
			return;
		}

		try {
			const { Map: MapGL, Marker, Popup } = await import('maplibre-gl');

			const map = new MapGL({
				container: mapContainer!,
				style: MAP_STYLE,
				center: [0, 20],
				zoom: 1.5
			});

			mapInstance = map;

			map.on('load', () => {
				for (const venue of venueData.filter((v) => v.lat != null && v.lng != null)) {
					const size = Math.min(12 + venue.showCount * 6, 36);

					const el = document.createElement('div');
					el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background-color:var(--color-primary,#7c3aed);border:2px solid white;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4);`;
					el.setAttribute('data-testid', 'map-marker');
					el.setAttribute('data-venue-id', String(venue.venueId));
					el.setAttribute('data-show-count', String(venue.showCount));

					const popup = new Popup({ offset: size / 2 + 4, maxWidth: '280px' }).setHTML(
						buildPopupHTML(venue)
					);

					const marker = new Marker({ element: el })
						.setLngLat([venue.lng!, venue.lat!])
						.setPopup(popup)
						.addTo(map);

					markerInstances.push(marker);
				}
				loading = false;
			});
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to initialize map';
			loading = false;
		}
	});

	onDestroy(() => {
		for (const m of markerInstances) m.remove();
		mapInstance?.remove();
	});
</script>

<div class="mx-auto max-w-6xl">
	<h1 class="mb-8 text-3xl font-bold" style="color: var(--color-text);">Map</h1>

	{#if errorMsg}
		<p style="color: #ef4444;">{errorMsg}</p>
	{:else}
		<div
			class="relative overflow-hidden rounded-lg"
			style="border: 1px solid var(--color-border);"
		>
			{#if loading}
				<div
					class="absolute inset-0 z-10 flex items-center justify-center"
					style="background-color: var(--color-surface-alt);"
				>
					<p style="color: var(--color-text-muted);">Loading…</p>
				</div>
			{/if}
			<div bind:this={mapContainer} class="h-[540px] w-full"></div>
		</div>
	{/if}
</div>

<style>
	:global(.map-popup) {
		font-size: 13px;
		line-height: 1.5;
	}
	:global(.map-popup strong) {
		display: block;
		font-size: 14px;
		margin-bottom: 2px;
	}
	:global(.map-popup-loc) {
		color: #888;
		font-size: 12px;
		margin-bottom: 6px;
	}
	:global(.map-show-row) {
		padding: 2px 0;
		font-size: 12px;
	}
	:global(.map-show-date) {
		font-weight: 600;
	}
</style>
