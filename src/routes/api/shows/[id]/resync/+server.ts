import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { resyncShow } from '$lib/server/shows.js';

export async function POST({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const client = createSetlistFmClient();

	try {
		const result = await resyncShow(db, client, id);
		return json(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Resync failed';
		if (msg.includes('429')) throw error(429, 'setlist.fm rate limit hit — try again in a moment');
		if (msg.includes('401')) throw error(502, 'Invalid setlist.fm API key — check SETLISTFM_API_KEY');
		throw error(502, msg);
	}
}
