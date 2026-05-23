import type { DB } from './db/index.js';
import { artists, venues, songs, attendances, setlists, setlistSongs } from './db/schema.js';
import type { SetlistFmSetlist } from './setlistfm/types.js';
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

export async function saveAttendance(
	db: DB,
	setlist: SetlistFmSetlist,
	status: 'confirmed' | 'planned',
	userId: number,
	notes?: string
): Promise<{ attendanceId: number }> {
	const [artist] = await db
		.insert(artists)
		.values({
			setlistfmMbid: setlist.artist.mbid,
			name: setlist.artist.name,
			sortName: setlist.artist.sortName,
			disambiguation: setlist.artist.disambiguation ?? ''
		})
		.onConflictDoUpdate({
			target: artists.setlistfmMbid,
			set: { name: setlist.artist.name, sortName: setlist.artist.sortName }
		})
		.returning();

	const v = setlist.venue;
	const [venue] = await db
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
		.returning();

	const [attendance] = await db
		.insert(attendances)
		.values({
			userId,
			artistId: artist.id,
			venueId: venue.id,
			showDate: parseSetlistDate(setlist.eventDate),
			notes: notes ?? '',
			setlistfmSetlistId: setlist.id,
			setlistFetchedAt: new Date(),
			attendanceStatus: status
		})
		.returning();

	const [setlistRow] = await db
		.insert(setlists)
		.values({
			attendanceId: attendance.id,
			rawJson: setlist as unknown as Record<string, unknown>,
			tourName: setlist.tour?.name ?? ''
		})
		.returning();

	for (let setIdx = 0; setIdx < setlist.sets.set.length; setIdx++) {
		const set = setlist.sets.set[setIdx];
		const setNumber = setIdx + 1;
		const isEncore = set.encore !== undefined;

		for (let songIdx = 0; songIdx < set.song.length; songIdx++) {
			const songData = set.song[songIdx];

			let songArtistId = artist.id;
			let coverArtistId: number | null = null;

			if (songData.cover) {
				const [coverArtist] = await db
					.insert(artists)
					.values({
						setlistfmMbid: songData.cover.mbid,
						name: songData.cover.name,
						sortName: songData.cover.sortName,
						disambiguation: songData.cover.disambiguation ?? ''
					})
					.onConflictDoUpdate({
						target: artists.setlistfmMbid,
						set: { name: songData.cover.name }
					})
					.returning();
				songArtistId = coverArtist.id;
				coverArtistId = coverArtist.id;
			}

			const normalizedName = normalizeSongName(songData.name);

			const [song] = await db
				.insert(songs)
				.values({ name: songData.name, artistId: songArtistId, normalizedName })
				.onConflictDoUpdate({
					target: [songs.artistId, songs.normalizedName],
					set: { name: songData.name }
				})
				.returning();

			await db.insert(setlistSongs).values({
				setlistId: setlistRow.id,
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

	return { attendanceId: attendance.id };
}
