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
	const results = await searchSetlists(client, { artistName, date, venueName, city });

	return json({ setlists: results });
}
