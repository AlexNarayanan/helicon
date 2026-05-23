import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { saveAttendance } from '$lib/server/attendances.js';

const SENTINEL_USER_ID = 1;

export async function POST({ request }) {
	const body = await request.json();
	const { setlistId, status, notes } = body;

	if (!setlistId) throw error(400, 'setlistId is required');
	if (status !== 'confirmed' && status !== 'planned') throw error(400, 'invalid status');

	const client = createSetlistFmClient();
	const setlist = await client.getSetlist(setlistId);

	const result = await saveAttendance(db, setlist, status, SENTINEL_USER_ID, notes);

	return json(result, { status: 201 });
}
