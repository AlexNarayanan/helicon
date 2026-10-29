import { sql, eq, desc, asc, and, count, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { attendances, artists, performances, setlistSongs, shows, songs, venues } from './db/schema.js';

const SENTINEL_USER_ID = 1;

export interface ReportFilters {
	artistIds?: number[];
	venueIds?: number[];
	yearStart?: number;
	yearEnd?: number;
}

export interface SongShowDetail {
	showId: number;
	showDate: string;
	venueName: string;
	venueCity: string;
	venueCountry: string;
}

export interface SongPlayCount {
	songId: number;
	songName: string;
	artistName: string;
	playCount: number;
	shows: SongShowDetail[];
}

export interface VenueShowDetail {
	showId: number;
	showDate: string;
	artistNames: string[];
}

export interface VenueCount {
	venueId: number;
	venueName: string;
	venueCity: string;
	venueCountry: string;
	showCount: number;
	shows: VenueShowDetail[];
}

export interface ArtistShowDetail {
	showId: number;
	showDate: string;
	venueName: string;
	venueCity: string;
	venueCountry: string;
	role: 'headliner' | 'opener';
}

export interface ArtistBothRoles {
	artistId: number;
	artistName: string;
	headlinerCount: number;
	openerCount: number;
	shows: ArtistShowDetail[];
}

export interface OpenerDistribution {
	openerCount: number;
	showCount: number;
}

function yearRangeFilters(filters: ReportFilters): (SQL | undefined)[] {
	return [
		filters.yearStart !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int >= ${filters.yearStart}`
			: undefined,
		filters.yearEnd !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int <= ${filters.yearEnd}`
			: undefined
	];
}

function songFilters(filters: ReportFilters): (SQL | undefined)[] {
	return [
		eq(attendances.userId, SENTINEL_USER_ID),
		filters.artistIds?.length ? inArray(performances.artistId, filters.artistIds) : undefined,
		filters.venueIds?.length ? inArray(shows.venueId, filters.venueIds) : undefined,
		...yearRangeFilters(filters)
	];
}

async function getSongShowDetails(
	db: DB,
	songIds: number[],
	filters: ReportFilters
): Promise<Map<number, SongShowDetail[]>> {
	if (songIds.length === 0) return new Map();

	const rows = await db
		.select({
			songId: songs.id,
			showId: shows.id,
			showDate: shows.showDate,
			venueName: venues.name,
			venueCity: venues.city,
			venueCountry: venues.country
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.innerJoin(performances, eq(performances.showId, shows.id))
		.innerJoin(setlistSongs, eq(setlistSongs.performanceId, performances.id))
		.innerJoin(songs, eq(setlistSongs.songId, songs.id))
		.where(and(inArray(songs.id, songIds), ...songFilters(filters)))
		.orderBy(desc(shows.showDate));

	const map = new Map<number, SongShowDetail[]>();
	const seen = new Set<string>();
	for (const r of rows) {
		const key = `${r.songId}:${r.showId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const arr = map.get(r.songId) ?? [];
		arr.push({
			showId: r.showId,
			showDate: r.showDate,
			venueName: r.venueName,
			venueCity: r.venueCity,
			venueCountry: r.venueCountry
		});
		map.set(r.songId, arr);
	}
	return map;
}

async function getVenueShowDetails(
	db: DB,
	venueIds: number[],
	filters: ReportFilters
): Promise<Map<number, VenueShowDetail[]>> {
	if (venueIds.length === 0) return new Map();

	const conditions: (SQL | undefined)[] = [
		eq(attendances.userId, SENTINEL_USER_ID),
		inArray(venues.id, venueIds),
		filters.artistIds?.length ? inArray(performances.artistId, filters.artistIds) : undefined,
		...yearRangeFilters(filters)
	];

	const rows = await db
		.select({
			venueId: venues.id,
			showId: shows.id,
			showDate: shows.showDate,
			artistName: artists.name
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.innerJoin(performances, eq(performances.showId, shows.id))
		.innerJoin(artists, eq(artists.id, performances.artistId))
		.where(and(...conditions))
		.orderBy(desc(shows.showDate), desc(performances.billingOrder));

	const byVenue = new Map<number, Map<number, VenueShowDetail>>();
	for (const r of rows) {
		let showMap = byVenue.get(r.venueId);
		if (!showMap) {
			showMap = new Map();
			byVenue.set(r.venueId, showMap);
		}
		let detail = showMap.get(r.showId);
		if (!detail) {
			detail = { showId: r.showId, showDate: r.showDate, artistNames: [] };
			showMap.set(r.showId, detail);
		}
		detail.artistNames.push(r.artistName);
	}

	const result = new Map<number, VenueShowDetail[]>();
	for (const [venueId, showMap] of byVenue) {
		result.set(venueId, [...showMap.values()]);
	}
	return result;
}

async function getArtistShowDetails(
	db: DB,
	artistIds: number[]
): Promise<Map<number, ArtistShowDetail[]>> {
	if (artistIds.length === 0) return new Map();

	const rows = (await db.execute(sql`
		WITH show_max_billing AS (
			SELECT show_id, MAX(billing_order) AS max_billing_order
			FROM performances
			GROUP BY show_id
		)
		SELECT
			p.artist_id AS artist_id,
			s.id AS show_id,
			s.show_date AS show_date,
			v.name AS venue_name,
			v.city AS venue_city,
			v.country AS venue_country,
			CASE WHEN p.billing_order = smb.max_billing_order THEN 'headliner' ELSE 'opener' END AS role
		FROM performances p
		JOIN attendances att ON att.show_id = p.show_id
		JOIN show_max_billing smb ON smb.show_id = p.show_id
		JOIN shows s ON s.id = p.show_id
		JOIN venues v ON v.id = s.venue_id
		WHERE att.user_id = ${SENTINEL_USER_ID}
			AND p.artist_id = ANY(ARRAY[${sql.join(
				artistIds.map((id) => sql`${id}`),
				sql`, `
			)}]::int[])
		ORDER BY s.show_date DESC
	`)) as Record<string, unknown>[];

	const map = new Map<number, ArtistShowDetail[]>();
	for (const r of rows) {
		const artistId = Number(r.artist_id);
		const arr = map.get(artistId) ?? [];
		arr.push({
			showId: Number(r.show_id),
			showDate: String(r.show_date),
			venueName: String(r.venue_name),
			venueCity: String(r.venue_city),
			venueCountry: String(r.venue_country),
			role: r.role === 'headliner' ? 'headliner' : 'opener'
		});
		map.set(artistId, arr);
	}
	return map;
}

export async function getMostPlayedSongs(
	db: DB,
	filters: ReportFilters
): Promise<SongPlayCount[]> {
	const playCnt = count(setlistSongs.id);
	const rows = await db
		.select({ songId: songs.id, songName: songs.name, artistName: artists.name, playCount: playCnt })
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(performances, eq(performances.showId, shows.id))
		.innerJoin(setlistSongs, eq(setlistSongs.performanceId, performances.id))
		.innerJoin(songs, eq(setlistSongs.songId, songs.id))
		.innerJoin(artists, eq(artists.id, songs.artistId))
		.where(and(...songFilters(filters)))
		.groupBy(songs.id, songs.name, artists.name)
		.orderBy(desc(playCnt))
		.limit(20);
	const mapped = rows.map((r) => ({ ...r, playCount: Number(r.playCount) }));
	const detailMap = await getSongShowDetails(db, mapped.map((r) => r.songId), filters);
	return mapped.map((r) => ({ ...r, shows: detailMap.get(r.songId) ?? [] }));
}

export async function getMostRareSongs(db: DB, filters: ReportFilters): Promise<SongPlayCount[]> {
	const playCnt = count(setlistSongs.id);
	const rows = await db
		.select({ songId: songs.id, songName: songs.name, artistName: artists.name, playCount: playCnt })
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(performances, eq(performances.showId, shows.id))
		.innerJoin(setlistSongs, eq(setlistSongs.performanceId, performances.id))
		.innerJoin(songs, eq(setlistSongs.songId, songs.id))
		.innerJoin(artists, eq(artists.id, songs.artistId))
		.where(and(...songFilters(filters)))
		.groupBy(songs.id, songs.name, artists.name)
		.orderBy(asc(playCnt), asc(songs.name))
		.limit(20);
	const mapped = rows.map((r) => ({ ...r, playCount: Number(r.playCount) }));
	const detailMap = await getSongShowDetails(db, mapped.map((r) => r.songId), filters);
	return mapped.map((r) => ({ ...r, shows: detailMap.get(r.songId) ?? [] }));
}

export async function getMostCommonVenues(
	db: DB,
	filters: ReportFilters
): Promise<VenueCount[]> {
	const conditions: (SQL | undefined)[] = [
		eq(attendances.userId, SENTINEL_USER_ID),
		filters.artistIds?.length ? inArray(performances.artistId, filters.artistIds) : undefined,
		...yearRangeFilters(filters)
	];

	const showCnt = sql<number>`COUNT(DISTINCT ${shows.id})`;
	const rows = await db
		.select({
			venueId: venues.id,
			venueName: venues.name,
			venueCity: venues.city,
			venueCountry: venues.country,
			showCount: showCnt
		})
		.from(attendances)
		.innerJoin(shows, eq(attendances.showId, shows.id))
		.innerJoin(venues, eq(shows.venueId, venues.id))
		.innerJoin(performances, eq(performances.showId, shows.id))
		.where(and(...conditions))
		.groupBy(venues.id, venues.name, venues.city, venues.country)
		.orderBy(desc(showCnt))
		.limit(10);
	const mapped = rows.map((r) => ({ ...r, showCount: Number(r.showCount) }));
	const detailMap = await getVenueShowDetails(db, mapped.map((r) => r.venueId), filters);
	return mapped.map((r) => ({ ...r, shows: detailMap.get(r.venueId) ?? [] }));
}

export async function getArtistsBothOpenerAndHeadliner(db: DB): Promise<ArtistBothRoles[]> {
	const rows = (await db.execute(sql`
		WITH show_max_billing AS (
			SELECT show_id, MAX(billing_order) AS max_billing_order
			FROM performances
			GROUP BY show_id
		),
		attended_perfs AS (
			SELECT p.artist_id, p.billing_order, smb.max_billing_order
			FROM performances p
			JOIN attendances att ON att.show_id = p.show_id
			JOIN show_max_billing smb ON smb.show_id = p.show_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
		)
		SELECT
			a.id AS artist_id,
			a.name AS artist_name,
			COUNT(*) FILTER (WHERE ap.billing_order = ap.max_billing_order) AS headliner_count,
			COUNT(*) FILTER (WHERE ap.billing_order < ap.max_billing_order) AS opener_count
		FROM attended_perfs ap
		JOIN artists a ON a.id = ap.artist_id
		GROUP BY a.id, a.name
		HAVING
			COUNT(*) FILTER (WHERE ap.billing_order = ap.max_billing_order) > 0
			AND COUNT(*) FILTER (WHERE ap.billing_order < ap.max_billing_order) > 0
		ORDER BY (
			COUNT(*) FILTER (WHERE ap.billing_order = ap.max_billing_order) +
			COUNT(*) FILTER (WHERE ap.billing_order < ap.max_billing_order)
		) DESC
	`)) as Record<string, unknown>[];
	const mapped = rows.map((r) => ({
		artistId: Number(r.artist_id),
		artistName: String(r.artist_name),
		headlinerCount: Number(r.headliner_count),
		openerCount: Number(r.opener_count)
	}));
	const detailMap = await getArtistShowDetails(
		db,
		mapped.map((r) => r.artistId)
	);
	return mapped.map((r) => ({ ...r, shows: detailMap.get(r.artistId) ?? [] }));
}

export async function getOpenersPerShowDistribution(db: DB): Promise<OpenerDistribution[]> {
	const rows = (await db.execute(sql`
		WITH attended_shows AS (
			SELECT DISTINCT show_id FROM attendances WHERE user_id = ${SENTINEL_USER_ID}
		),
		show_perf_counts AS (
			SELECT p.show_id, COUNT(p.id) AS perf_count
			FROM performances p
			JOIN attended_shows ats ON ats.show_id = p.show_id
			GROUP BY p.show_id
		)
		SELECT
			(perf_count - 1)::int AS opener_count,
			COUNT(*)::int AS show_count
		FROM show_perf_counts
		GROUP BY (perf_count - 1)
		ORDER BY opener_count
	`)) as Record<string, unknown>[];
	return rows.map((r) => ({
		openerCount: Number(r.opener_count),
		showCount: Number(r.show_count)
	}));
}

export async function getReportFilters(db: DB): Promise<{
	artists: { id: number; name: string }[];
	venues: { id: number; name: string; city: string }[];
}> {
	const attendedArtists = await db
		.selectDistinct({ id: artists.id, name: artists.name })
		.from(artists)
		.innerJoin(performances, eq(performances.artistId, artists.id))
		.innerJoin(shows, eq(shows.id, performances.showId))
		.innerJoin(attendances, eq(attendances.showId, shows.id))
		.where(eq(attendances.userId, SENTINEL_USER_ID))
		.orderBy(artists.name);

	const attendedVenues = await db
		.selectDistinct({ id: venues.id, name: venues.name, city: venues.city })
		.from(venues)
		.innerJoin(shows, eq(shows.venueId, venues.id))
		.innerJoin(attendances, eq(attendances.showId, shows.id))
		.where(eq(attendances.userId, SENTINEL_USER_ID))
		.orderBy(venues.name);

	return { artists: attendedArtists, venues: attendedVenues };
}
