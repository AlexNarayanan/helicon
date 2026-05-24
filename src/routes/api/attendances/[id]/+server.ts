import { json, error } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db/index.js';
import {
	artists,
	attendances,
	performances,
	setlistSongs,
	shows,
	songs,
	tours,
	venues
} from '$lib/server/db/schema.js';

interface Song {
	position: number;
	name: string;
	info: string;
	isCover: boolean;
	coverArtistName?: string;
}

interface SetGroup {
	setNumber: number;
	isEncore: boolean;
	songs: Song[];
}

export async function GET({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const [att] = await db
		.select({
			id: attendances.id,
			status: attendances.attendanceStatus,
			notes: attendances.notes,
			showId: shows.id,
			showDate: shows.showDate,
			lastSyncedAt: shows.lastSyncedAt,
			venueName: venues.name,
			venueCity: venues.city,
			venueState: venues.state,
			venueCountry: venues.country
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.where(eq(attendances.id, id));

	if (!att) throw error(404, 'Attendance not found');

	const perfRows = await db
		.select({
			id: performances.id,
			billingOrder: performances.billingOrder,
			setlistfmSetlistId: performances.setlistfmSetlistId,
			rawJson: performances.rawJson,
			artistName: artists.name,
			tourName: tours.name
		})
		.from(performances)
		.innerJoin(artists, eq(performances.artistId, artists.id))
		.leftJoin(tours, eq(performances.tourId, tours.id))
		.where(eq(performances.showId, att.showId))
		.orderBy(desc(performances.billingOrder));

	const performanceIds = perfRows.map((p) => p.id);
	const coverArtists = alias(artists, 'cover_artists');
	const songRows = performanceIds.length
		? await db
				.select({
					performanceId: setlistSongs.performanceId,
					setNumber: setlistSongs.setNumber,
					position: setlistSongs.position,
					isEncore: setlistSongs.isEncore,
					isCover: setlistSongs.isCover,
					info: setlistSongs.info,
					songName: songs.name,
					coverArtistName: coverArtists.name
				})
				.from(setlistSongs)
				.innerJoin(songs, eq(setlistSongs.songId, songs.id))
				.leftJoin(coverArtists, eq(setlistSongs.coverArtistId, coverArtists.id))
				.where(inArray(setlistSongs.performanceId, performanceIds))
				.orderBy(setlistSongs.performanceId, setlistSongs.setNumber, setlistSongs.position)
		: [];

	const setsByPerformance = new Map<number, Map<number, SetGroup>>();
	for (const row of songRows) {
		let setMap = setsByPerformance.get(row.performanceId);
		if (!setMap) {
			setMap = new Map();
			setsByPerformance.set(row.performanceId, setMap);
		}
		if (!setMap.has(row.setNumber)) {
			setMap.set(row.setNumber, {
				setNumber: row.setNumber,
				isEncore: row.isEncore,
				songs: []
			});
		}
		setMap.get(row.setNumber)!.songs.push({
			position: row.position,
			name: row.songName,
			info: row.info ?? '',
			isCover: row.isCover,
			coverArtistName: row.coverArtistName ?? undefined
		});
	}

	const performancesPayload = perfRows.map((p) => {
		const setMap = setsByPerformance.get(p.id);
		const sets = setMap
			? Array.from(setMap.values()).sort((a, b) => a.setNumber - b.setNumber)
			: [];
		const rawJson = p.rawJson as { url?: string } | null;
		return {
			id: p.id,
			billingOrder: p.billingOrder,
			artistName: p.artistName,
			tourName: p.tourName ?? null,
			setlistfmUrl: rawJson?.url ?? null,
			sets
		};
	});

	return json({
		id: att.id,
		status: att.status,
		notes: att.notes ?? '',
		showId: att.showId,
		showDate: att.showDate,
		lastSyncedAt: att.lastSyncedAt,
		venue: {
			name: att.venueName,
			city: att.venueCity,
			state: att.venueState ?? '',
			country: att.venueCountry
		},
		performances: performancesPayload
	});
}

export async function PATCH({ params, request }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const body = await request.json();
	const { status, notes } = body as { status?: string; notes?: string };

	if (status !== undefined && status !== 'confirmed' && status !== 'planned') {
		throw error(400, 'invalid status');
	}

	const updates: {
		attendanceStatus?: 'confirmed' | 'planned';
		notes?: string;
		updatedAt: Date;
	} = { updatedAt: new Date() };

	if (status === 'confirmed' || status === 'planned') updates.attendanceStatus = status;
	if (notes !== undefined) updates.notes = notes;

	const [updated] = await db
		.update(attendances)
		.set(updates)
		.where(eq(attendances.id, id))
		.returning({ id: attendances.id });

	if (!updated) throw error(404, 'Attendance not found');
	return json({ id: updated.id });
}
