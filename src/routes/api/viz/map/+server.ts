import { json } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { attendances, artists, performances, shows, venues } from '$lib/server/db/schema.js';

const SENTINEL_USER_ID = 1;

export async function GET() {
	const rows = await db
		.select({
			venueId: venues.id,
			venueName: venues.name,
			venueCity: venues.city,
			venueState: venues.state,
			venueCountry: venues.country,
			lat: venues.lat,
			lng: venues.lng,
			showId: shows.id,
			showDate: shows.showDate
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.where(eq(attendances.userId, SENTINEL_USER_ID));

	if (rows.length === 0) return json([]);

	const showIds = [...new Set(rows.map((r) => r.showId))];
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

	type VenueAccum = {
		venueId: number;
		venueName: string;
		venueCity: string;
		venueState: string | null;
		venueCountry: string;
		lat: number | null;
		lng: number | null;
		shows: Array<{
			showId: number;
			showDate: string;
			artists: Array<{ name: string; billingOrder: number }>;
		}>;
	};

	const venueMap = new Map<number, VenueAccum>();
	for (const row of rows) {
		if (!venueMap.has(row.venueId)) {
			venueMap.set(row.venueId, {
				venueId: row.venueId,
				venueName: row.venueName,
				venueCity: row.venueCity,
				venueState: row.venueState ?? null,
				venueCountry: row.venueCountry,
				lat: row.lat ?? null,
				lng: row.lng ?? null,
				shows: []
			});
		}
		venueMap.get(row.venueId)!.shows.push({
			showId: row.showId,
			showDate: row.showDate,
			artists: artistsByShow.get(row.showId) ?? []
		});
	}

	return json(
		[...venueMap.values()].map((v) => ({ ...v, showCount: v.shows.length }))
	);
}
