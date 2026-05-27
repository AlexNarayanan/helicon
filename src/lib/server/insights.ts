import { sql } from 'drizzle-orm';
import type { DB } from './db/index.js';

const SENTINEL_USER_ID = 1;

export interface ArtistCount {
	artistId: number;
	artistName: string;
	showCount: number;
}

export interface MonthCount {
	month: number;
	count: number;
}

export interface CoPerformerData {
	artists: { id: number; name: string }[];
	pairs: { sourceId: number; targetId: number; count: number }[];
}

export interface DiscoveryPoint {
	date: string;
	count: number;
}

export interface CumulativeDiscoveriesData {
	artists: DiscoveryPoint[];
	venues: DiscoveryPoint[];
	songs: DiscoveryPoint[];
}

export async function getMostSeenArtists(db: DB): Promise<ArtistCount[]> {
	const rows = (await db.execute(sql`
		SELECT
			a.id AS artist_id,
			a.name AS artist_name,
			COUNT(DISTINCT s.id)::int AS show_count
		FROM attendances att
		JOIN shows s ON s.id = att.show_id
		JOIN performances p ON p.show_id = s.id
		JOIN artists a ON a.id = p.artist_id
		WHERE att.user_id = ${SENTINEL_USER_ID}
		GROUP BY a.id, a.name
		ORDER BY show_count DESC
		LIMIT 10
	`)) as Record<string, unknown>[];

	return rows.map((r) => ({
		artistId: Number(r.artist_id),
		artistName: String(r.artist_name),
		showCount: Number(r.show_count)
	}));
}

export async function getShowCountsByMonth(db: DB): Promise<MonthCount[]> {
	const rows = (await db.execute(sql`
		SELECT
			EXTRACT(MONTH FROM s.show_date::date)::int AS month,
			COUNT(*)::int AS count
		FROM attendances att
		JOIN shows s ON s.id = att.show_id
		WHERE att.user_id = ${SENTINEL_USER_ID}
		GROUP BY EXTRACT(MONTH FROM s.show_date::date)
		ORDER BY month
	`)) as Record<string, unknown>[];

	return rows.map((r) => ({
		month: Number(r.month),
		count: Number(r.count)
	}));
}

export async function getCoPerformerPairs(db: DB): Promise<CoPerformerData> {
	// Get top 15 artists by attendance count
	const topArtistsRows = (await db.execute(sql`
		SELECT
			a.id,
			a.name,
			COUNT(DISTINCT s.id)::int AS show_count
		FROM attendances att
		JOIN shows s ON s.id = att.show_id
		JOIN performances p ON p.show_id = s.id
		JOIN artists a ON a.id = p.artist_id
		WHERE att.user_id = ${SENTINEL_USER_ID}
		GROUP BY a.id, a.name
		ORDER BY show_count DESC
		LIMIT 15
	`)) as Record<string, unknown>[];

	const topArtists = topArtistsRows.map((r) => ({
		id: Number(r.id),
		name: String(r.name)
	}));

	if (topArtists.length < 2) {
		return { artists: topArtists, pairs: [] };
	}

	const topArtistIds = topArtists.map((a) => a.id);

	// Self-join performances for attended shows to find co-performers
	const pairsRows = (await db.execute(sql`
		SELECT
			p1.artist_id AS source_id,
			p2.artist_id AS target_id,
			COUNT(DISTINCT p1.show_id)::int AS count
		FROM performances p1
		JOIN performances p2
			ON p1.show_id = p2.show_id
			AND p1.artist_id < p2.artist_id
		JOIN attendances att ON att.show_id = p1.show_id
		WHERE att.user_id = ${SENTINEL_USER_ID}
			AND p1.artist_id = ANY(ARRAY[${sql.join(topArtistIds.map((id) => sql`${id}`), sql`, `)}]::int[])
			AND p2.artist_id = ANY(ARRAY[${sql.join(topArtistIds.map((id) => sql`${id}`), sql`, `)}]::int[])
		GROUP BY p1.artist_id, p2.artist_id
		ORDER BY count DESC
	`)) as Record<string, unknown>[];

	const pairs = pairsRows.map((r) => ({
		sourceId: Number(r.source_id),
		targetId: Number(r.target_id),
		count: Number(r.count)
	}));

	return { artists: topArtists, pairs };
}

export async function getCumulativeDiscoveries(db: DB): Promise<CumulativeDiscoveriesData> {
	// Cumulative unique artists seen over time
	const artistRows = (await db.execute(sql`
		WITH first_seen AS (
			SELECT
				a.id AS artist_id,
				MIN(s.show_date::date) AS first_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			JOIN performances p ON p.show_id = s.id
			JOIN artists a ON a.id = p.artist_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
			GROUP BY a.id
		),
		all_show_dates AS (
			SELECT DISTINCT s.show_date::date AS show_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
		)
		SELECT
			d.show_date::text AS date,
			COUNT(fs.artist_id) FILTER (WHERE fs.first_date <= d.show_date)::int AS count
		FROM all_show_dates d
		LEFT JOIN first_seen fs ON fs.first_date <= d.show_date
		GROUP BY d.show_date
		ORDER BY d.show_date
	`)) as Record<string, unknown>[];

	// Cumulative unique venues seen over time
	const venueRows = (await db.execute(sql`
		WITH first_seen AS (
			SELECT
				v.id AS venue_id,
				MIN(s.show_date::date) AS first_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			JOIN venues v ON v.id = s.venue_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
			GROUP BY v.id
		),
		all_show_dates AS (
			SELECT DISTINCT s.show_date::date AS show_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
		)
		SELECT
			d.show_date::text AS date,
			COUNT(fs.venue_id) FILTER (WHERE fs.first_date <= d.show_date)::int AS count
		FROM all_show_dates d
		LEFT JOIN first_seen fs ON fs.first_date <= d.show_date
		GROUP BY d.show_date
		ORDER BY d.show_date
	`)) as Record<string, unknown>[];

	// Cumulative unique songs heard over time
	const songRows = (await db.execute(sql`
		WITH first_seen AS (
			SELECT
				sl.song_id,
				MIN(s.show_date::date) AS first_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			JOIN performances p ON p.show_id = s.id
			JOIN setlist_songs sl ON sl.performance_id = p.id
			WHERE att.user_id = ${SENTINEL_USER_ID}
			GROUP BY sl.song_id
		),
		all_show_dates AS (
			SELECT DISTINCT s.show_date::date AS show_date
			FROM attendances att
			JOIN shows s ON s.id = att.show_id
			WHERE att.user_id = ${SENTINEL_USER_ID}
		)
		SELECT
			d.show_date::text AS date,
			COUNT(fs.song_id) FILTER (WHERE fs.first_date <= d.show_date)::int AS count
		FROM all_show_dates d
		LEFT JOIN first_seen fs ON fs.first_date <= d.show_date
		GROUP BY d.show_date
		ORDER BY d.show_date
	`)) as Record<string, unknown>[];

	return {
		artists: artistRows.map((r) => ({ date: String(r.date), count: Number(r.count) })),
		venues: venueRows.map((r) => ({ date: String(r.date), count: Number(r.count) })),
		songs: songRows.map((r) => ({ date: String(r.date), count: Number(r.count) }))
	};
}
