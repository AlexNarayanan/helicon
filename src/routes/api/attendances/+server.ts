import { json, error } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import {
	artists,
	attendances,
	performances,
	shows,
	venues
} from '$lib/server/db/schema.js';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { saveAttendanceFromSeed } from '$lib/server/attendances.js';

const SENTINEL_USER_ID = 1;

export async function GET() {
	const rows = await db
		.select({
			id: attendances.id,
			showId: shows.id,
			showDate: shows.showDate,
			status: attendances.attendanceStatus,
			venueName: venues.name,
			venueCity: venues.city,
			venueCountry: venues.country
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.where(eq(attendances.userId, SENTINEL_USER_ID))
		.orderBy(desc(shows.showDate));

	if (rows.length === 0) return json([]);

	const showIds = rows.map((r) => r.showId);
	const perfRows = await db
		.select({
			showId: performances.showId,
			artistName: artists.name,
			billingOrder: performances.billingOrder
		})
		.from(performances)
		.innerJoin(artists, eq(performances.artistId, artists.id))
		.where(inArray(performances.showId, showIds))
		.orderBy(performances.showId, desc(performances.billingOrder));

	const artistsByShow = new Map<number, Array<{ name: string; billingOrder: number }>>();
	for (const p of perfRows) {
		const arr = artistsByShow.get(p.showId) ?? [];
		arr.push({ name: p.artistName, billingOrder: p.billingOrder });
		artistsByShow.set(p.showId, arr);
	}

	return json(
		rows.map((r) => ({
			id: r.id,
			showDate: r.showDate,
			status: r.status,
			venueName: r.venueName,
			venueCity: r.venueCity,
			venueCountry: r.venueCountry,
			artists: artistsByShow.get(r.showId) ?? []
		}))
	);
}

export async function POST({ request }) {
	const body = await request.json();
	const { setlistId, status, notes } = body;

	if (!setlistId) throw error(400, 'setlistId is required');
	if (status !== 'confirmed' && status !== 'planned') throw error(400, 'invalid status');

	const client = createSetlistFmClient();

	const result = await saveAttendanceFromSeed(db, client, {
		seedSetlistId: setlistId,
		status,
		userId: SENTINEL_USER_ID,
		notes
	});

	return json(result, { status: 201 });
}
