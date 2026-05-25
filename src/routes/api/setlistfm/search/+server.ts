import { json, error } from '@sveltejs/kit';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { searchSetlists } from '$lib/server/attendances.js';

export async function GET({ url }) {
	const artistName = url.searchParams.get('artistName');
	if (!artistName) throw error(400, 'artistName is required');

	const date = url.searchParams.get('date') ?? undefined;
	const venueName = url.searchParams.get('venueName') ?? undefined;
	const city = url.searchParams.get('city') ?? undefined;

	const client = createSetlistFmClient();

	try {
		const results = await searchSetlists(client, { artistName, date, venueName, city });
		return json({ setlists: results });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Search failed';
		if (msg.includes('429')) throw error(429, 'setlist.fm rate limit hit — try again in a moment');
		if (msg.includes('401')) throw error(502, 'Invalid setlist.fm API key — check SETLISTFM_API_KEY');
		throw error(502, msg);
	}
}
