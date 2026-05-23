import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { resyncShow } from '$lib/server/shows.js';

export async function POST({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const client = createSetlistFmClient();
	const result = await resyncShow(db, client, id);
	return json(result);
}
