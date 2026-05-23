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
	params: { artistName: string; date?: string; venueName?: string }
): Promise<SetlistFmSetlist[]> {
	const artistRes = await client.searchArtists({ artistName: params.artistName });
	if (!artistRes.artist.length) return [];

	const mbid = artistRes.artist[0].mbid;

	let setlistDate: string | undefined;
	if (params.date) {
		const [year, month, day] = params.date.split('-');
		setlistDate = `${day}-${month}-${year}`;
	}

	const setlistRes = await client.searchSetlists({
		artistMbid: mbid,
		date: setlistDate,
		venueName: params.venueName
	});

	return setlistRes.setlist;
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
