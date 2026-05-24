import { sql, eq, desc, asc, and, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { attendances, artists, performances, setlistSongs, shows, songs, venues } from './db/schema.js';

const SENTINEL_USER_ID = 1;

export interface ReportFilters {
	artistId?: number;
	venueId?: number;
	yearStart?: number;
	yearEnd?: number;
}

export interface SongPlayCount {
	songName: string;
	artistName: string;
	playCount: number;
}

export interface VenueCount {
	venueId: number;
	venueName: string;
	venueCity: string;
	venueCountry: string;
	showCount: number;
}

export interface ArtistBothRoles {
	artistName: string;
	headlinerCount: number;
	openerCount: number;
}

export interface OpenerDistribution {
	openerCount: number;
	showCount: number;
}

function songFilters(filters: ReportFilters): (SQL | undefined)[] {
	return [
		eq(attendances.userId, SENTINEL_USER_ID),
		filters.artistId !== undefined ? eq(performances.artistId, filters.artistId) : undefined,
		filters.venueId !== undefined ? eq(shows.venueId, filters.venueId) : undefined,
		filters.yearStart !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int >= ${filters.yearStart}`
			: undefined,
		filters.yearEnd !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int <= ${filters.yearEnd}`
			: undefined
	];
}

export async function getMostPlayedSongs(
	db: DB,
	filters: ReportFilters
): Promise<SongPlayCount[]> {
	const playCnt = count(setlistSongs.id);
	const rows = await db
		.select({ songName: songs.name, artistName: artists.name, playCount: playCnt })
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
	return rows.map((r) => ({ ...r, playCount: Number(r.playCount) }));
}

export async function getMostRareSongs(db: DB, filters: ReportFilters): Promise<SongPlayCount[]> {
	const playCnt = count(setlistSongs.id);
	const rows = await db
		.select({ songName: songs.name, artistName: artists.name, playCount: playCnt })
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
	return rows.map((r) => ({ ...r, playCount: Number(r.playCount) }));
}

export async function getMostCommonVenues(
	db: DB,
	filters: ReportFilters
): Promise<VenueCount[]> {
	const conditions: (SQL | undefined)[] = [
		eq(attendances.userId, SENTINEL_USER_ID),
		filters.artistId !== undefined ? eq(performances.artistId, filters.artistId) : undefined,
		filters.yearStart !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int >= ${filters.yearStart}`
			: undefined,
		filters.yearEnd !== undefined
			? sql`EXTRACT(YEAR FROM ${shows.showDate}::date)::int <= ${filters.yearEnd}`
			: undefined
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
	return rows.map((r) => ({ ...r, showCount: Number(r.showCount) }));
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
	return rows.map((r) => ({
		artistName: String(r.artist_name),
		headlinerCount: Number(r.headliner_count),
		openerCount: Number(r.opener_count)
	}));
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
