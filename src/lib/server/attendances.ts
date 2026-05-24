import { eq, sql } from 'drizzle-orm';
import type { DB } from './db/index.js';
import {
	artists,
	venues,
	songs,
	attendances,
	performances,
	setlistSongs,
	shows,
	tours
} from './db/schema.js';
import type { SetlistFmArtist, SetlistFmSetlist } from './setlistfm/types.js';
import type { SetlistFmClient } from './setlistfm/client.js';

export function normalizeSongName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function parseSetlistDate(eventDate: string): string {
	const [day, month, year] = eventDate.split('-');
	return `${year}-${month}-${day}`;
}

export async function searchSetlists(
	client: SetlistFmClient,
	params: { artistName: string; date?: string; venueName?: string; city?: string }
): Promise<SetlistFmSetlist[]> {
	const artistRes = await client.searchArtists({ artistName: params.artistName });
	if (!artistRes.artist.length) return [];

	// setlist.fm may return multiple artists with similar names (e.g. "Tesseract" before
	// "TesseracT"). Try up to 3 candidates whose names are plausible matches so we don't
	// silently use the wrong MBID.
	const queryLower = params.artistName.toLowerCase();
	const candidates = artistRes.artist
		.filter((a) => {
			const n = a.name.toLowerCase();
			return n.startsWith(queryLower) || queryLower.startsWith(n);
		})
		.slice(0, 3);
	if (candidates.length === 0) candidates.push(artistRes.artist[0]);

	let setlistDate: string | undefined;
	let targetDateMs: number | undefined;
	if (params.date) {
		const [year, month, day] = params.date.split('-');
		setlistDate = `${day}-${month}-${year}`;
		targetDateMs = Date.UTC(+year, +month - 1, +day);
	}

	// setlist.fm returns 404 when there are zero results — not a real error
	async function trySearch(
		p: Parameters<typeof client.searchSetlists>[0]
	): Promise<SetlistFmSetlist[]> {
		try {
			return (await client.searchSetlists(p)).setlist;
		} catch (err) {
			if (err instanceof Error && err.message.includes('404')) return [];
			throw err;
		}
	}

	async function searchForMbid(mbid: string): Promise<SetlistFmSetlist[]> {
		// Phase 1: exact date + venue + city (all user-supplied constraints)
		const exact = await trySearch({
			artistMbid: mbid,
			date: setlistDate,
			venueName: params.venueName,
			cityName: params.city
		});
		if (exact.length > 0) return exact;

		if (!setlistDate || targetDateMs === undefined) return [];

		// Phase 2: exact date only — venue/city text may not match setlist.fm's naming
		const dateOnly = await trySearch({ artistMbid: mbid, date: setlistDate });
		if (dateOnly.length > 0) return dateOnly;

		// Phase 3: whole year, artist only — catches API quirks where the exact date
		// param returns nothing; sort by proximity so the closest show floats to the top
		const year = +params.date!.split('-')[0];
		const yearResults = await trySearch({ artistMbid: mbid, year });
		return yearResults.sort((a, b) => {
			const [ad, am, ay] = a.eventDate.split('-').map(Number);
			const [bd, bm, by] = b.eventDate.split('-').map(Number);
			const distA = Math.abs(Date.UTC(ay, am - 1, ad) - targetDateMs!);
			const distB = Math.abs(Date.UTC(by, bm - 1, bd) - targetDateMs!);
			return distA - distB;
		});
	}

	for (const candidate of candidates) {
		const results = await searchForMbid(candidate.mbid);
		if (results.length > 0) return results;
	}
	return [];
}

async function upsertArtist(db: DB, a: SetlistFmArtist): Promise<number> {
	const [row] = await db
		.insert(artists)
		.values({
			setlistfmMbid: a.mbid,
			name: a.name,
			sortName: a.sortName,
			disambiguation: a.disambiguation ?? ''
		})
		.onConflictDoUpdate({
			target: artists.setlistfmMbid,
			set: { name: a.name, sortName: a.sortName }
		})
		.returning({ id: artists.id });
	return row.id;
}

async function upsertVenue(db: DB, v: SetlistFmSetlist['venue']): Promise<number> {
	const [row] = await db
		.insert(venues)
		.values({
			setlistfmId: v.id,
			name: v.name,
			city: v.city.name,
			state: v.city.state ?? '',
			country: v.city.country.code,
			lat: v.city.coords?.lat,
			lng: v.city.coords?.long
		})
		.onConflictDoUpdate({
			target: venues.setlistfmId,
			set: { name: v.name }
		})
		.returning({ id: venues.id });
	return row.id;
}

async function upsertShow(db: DB, venueId: number, showDate: string): Promise<number> {
	const [row] = await db
		.insert(shows)
		.values({ venueId, showDate })
		.onConflictDoUpdate({
			target: [shows.venueId, shows.showDate],
			set: { venueId: sql`excluded.venue_id` }
		})
		.returning({ id: shows.id });
	return row.id;
}

async function upsertTour(db: DB, artistId: number, name: string): Promise<number> {
	const [row] = await db
		.insert(tours)
		.values({ artistId, name })
		.onConflictDoUpdate({
			target: [tours.artistId, tours.name],
			set: { name }
		})
		.returning({ id: tours.id });
	return row.id;
}

async function upsertPerformance(
	db: DB,
	params: {
		showId: number;
		artistId: number;
		billingOrder: number;
		tourId: number | null;
		setlistfmSetlistId: string;
		rawJson: SetlistFmSetlist;
	}
): Promise<number> {
	const [row] = await db
		.insert(performances)
		.values({
			showId: params.showId,
			artistId: params.artistId,
			billingOrder: params.billingOrder,
			tourId: params.tourId,
			setlistfmSetlistId: params.setlistfmSetlistId,
			rawJson: params.rawJson as unknown as Record<string, unknown>,
			setlistFetchedAt: new Date(),
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [performances.showId, performances.artistId],
			set: {
				billingOrder: params.billingOrder,
				tourId: params.tourId,
				setlistfmSetlistId: params.setlistfmSetlistId,
				rawJson: params.rawJson as unknown as Record<string, unknown>,
				setlistFetchedAt: new Date(),
				updatedAt: new Date()
			}
		})
		.returning({ id: performances.id });
	return row.id;
}

async function replaceSetlistSongs(
	db: DB,
	performanceId: number,
	performingArtistId: number,
	setlist: SetlistFmSetlist
): Promise<void> {
	await db.delete(setlistSongs).where(eq(setlistSongs.performanceId, performanceId));

	for (let setIdx = 0; setIdx < setlist.sets.set.length; setIdx++) {
		const set = setlist.sets.set[setIdx];
		const setNumber = setIdx + 1;
		const isEncore = set.encore !== undefined;

		for (let songIdx = 0; songIdx < set.song.length; songIdx++) {
			const songData = set.song[songIdx];

			let songArtistId = performingArtistId;
			let coverArtistId: number | null = null;

			if (songData.cover) {
				const id = await upsertArtist(db, songData.cover);
				songArtistId = id;
				coverArtistId = id;
			}

			const normalizedName = normalizeSongName(songData.name);

			const [song] = await db
				.insert(songs)
				.values({ name: songData.name, artistId: songArtistId, normalizedName })
				.onConflictDoUpdate({
					target: [songs.artistId, songs.normalizedName],
					set: { name: songData.name }
				})
				.returning({ id: songs.id });

			await db.insert(setlistSongs).values({
				performanceId,
				songId: song.id,
				setNumber,
				position: songIdx + 1,
				isEncore,
				isCover: songData.cover != null,
				coverArtistId,
				info: songData.info ?? ''
			});
		}
	}
}

/**
 * Sort discovered setlists into billing order. setlist.fm does not expose lineup
 * order, so we use `lastUpdated` ascending — headliner setlists are typically
 * posted/edited later than openers. Index 0 = first support, N = headliner.
 * TODO: expose a manual reorder UI on the detail page.
 */
function assignBillingOrder(setlists: SetlistFmSetlist[]): SetlistFmSetlist[] {
	return [...setlists].sort((a, b) => {
		const aDate = Date.parse(a.lastUpdated);
		const bDate = Date.parse(b.lastUpdated);
		if (aDate !== bDate) return aDate - bDate;
		return a.id.localeCompare(b.id);
	});
}

export async function persistShowFromSetlists(
	db: DB,
	allSetlists: SetlistFmSetlist[]
): Promise<{ showId: number; performanceCount: number }> {
	if (allSetlists.length === 0) throw new Error('persistShowFromSetlists: no setlists provided');

	const venueData = allSetlists[0].venue;
	const showDate = parseSetlistDate(allSetlists[0].eventDate);

	const venueId = await upsertVenue(db, venueData);
	const showId = await upsertShow(db, venueId, showDate);

	const ordered = assignBillingOrder(allSetlists);

	for (let i = 0; i < ordered.length; i++) {
		const setlist = ordered[i];
		const artistId = await upsertArtist(db, setlist.artist);
		const tourId = setlist.tour?.name ? await upsertTour(db, artistId, setlist.tour.name) : null;

		const performanceId = await upsertPerformance(db, {
			showId,
			artistId,
			billingOrder: i,
			tourId,
			setlistfmSetlistId: setlist.id,
			rawJson: setlist
		});

		await replaceSetlistSongs(db, performanceId, artistId, setlist);
	}

	await db.update(shows).set({ lastSyncedAt: new Date() }).where(eq(shows.id, showId));

	return { showId, performanceCount: ordered.length };
}

export async function saveAttendanceFromSeed(
	db: DB,
	client: SetlistFmClient,
	params: {
		seedSetlistId: string;
		status: 'confirmed' | 'planned';
		userId: number;
		notes?: string;
	}
): Promise<{ attendanceId: number; showId: number; performanceCount: number }> {
	const seed = await client.getSetlist(params.seedSetlistId);

	const discovered = await client.searchAllSetlistsAtVenueOnDate(
		seed.venue.id,
		seed.eventDate
	);

	const byId = new Map<string, SetlistFmSetlist>();
	byId.set(seed.id, seed);
	for (const s of discovered) byId.set(s.id, s);
	const allSetlists = [...byId.values()];

	const { showId, performanceCount } = await persistShowFromSetlists(db, allSetlists);

	const [att] = await db
		.insert(attendances)
		.values({
			userId: params.userId,
			showId,
			attendanceStatus: params.status,
			notes: params.notes ?? '',
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [attendances.userId, attendances.showId],
			set: {
				attendanceStatus: params.status,
				notes: params.notes ?? '',
				updatedAt: new Date()
			}
		})
		.returning({ id: attendances.id });

	return { attendanceId: att.id, showId, performanceCount };
}
