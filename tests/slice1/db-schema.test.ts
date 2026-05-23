import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.js';

let container: StartedPostgreSqlContainer;
let client: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();
	client = postgres(container.getConnectionUri());
	db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle/migrations' });
}, 60_000);

afterAll(async () => {
	await client.end();
	await container.stop();
});

describe('tables exist and accept CRUD', () => {
	it('inserts and reads a user (sentinel)', async () => {
		const [user] = await db
			.insert(schema.users)
			.values({ displayName: 'Helicon User' })
			.returning();
		expect(user.id).toBeTypeOf('number');
		expect(user.displayName).toBe('Helicon User');

		const rows = await db.select().from(schema.users);
		expect(rows.length).toBeGreaterThanOrEqual(1);
	});

	it('inserts and reads an artist', async () => {
		const [artist] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-metallica', name: 'Metallica', sortName: 'Metallica' })
			.returning();
		expect(artist.id).toBeTypeOf('number');
		expect(artist.name).toBe('Metallica');
	});

	it('inserts and reads a venue', async () => {
		const [venue] = await db
			.insert(schema.venues)
			.values({
				setlistfmId: 'venue-001',
				name: 'Madison Square Garden',
				city: 'New York',
				country: 'US',
				lat: 40.7505,
				lng: -73.9934
			})
			.returning();
		expect(venue.id).toBeTypeOf('number');
		expect(venue.name).toBe('Madison Square Garden');
	});

	it('inserts and reads a song', async () => {
		const [artist] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-slayer', name: 'Slayer', sortName: 'Slayer' })
			.returning();

		const [song] = await db
			.insert(schema.songs)
			.values({ name: 'Raining Blood', artistId: artist.id, normalizedName: 'raining blood' })
			.returning();
		expect(song.name).toBe('Raining Blood');
		expect(song.artistId).toBe(artist.id);
	});

	it('inserts full chain: user → venue → show → artist → tour → performance → song → setlist_song → attendance', async () => {
		const [user] = await db
			.insert(schema.users)
			.values({ displayName: 'Test Fan' })
			.returning();
		const [headliner] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-iron-maiden', name: 'Iron Maiden', sortName: 'Iron Maiden' })
			.returning();
		const [opener] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-opener', name: 'The Raven Age', sortName: 'Raven Age' })
			.returning();
		const [venue] = await db
			.insert(schema.venues)
			.values({
				setlistfmId: 'venue-wembley',
				name: 'Wembley Stadium',
				city: 'London',
				country: 'GB'
			})
			.returning();

		const [show] = await db
			.insert(schema.shows)
			.values({ venueId: venue.id, showDate: '2024-08-11' })
			.returning();
		expect(show.id).toBeTypeOf('number');

		const [tour] = await db
			.insert(schema.tours)
			.values({ artistId: headliner.id, name: 'The Future Past Tour' })
			.returning();

		const [song] = await db
			.insert(schema.songs)
			.values({ name: 'The Trooper', artistId: headliner.id, normalizedName: 'the trooper' })
			.returning();

		const [openerPerf] = await db
			.insert(schema.performances)
			.values({
				showId: show.id,
				artistId: opener.id,
				billingOrder: 0,
				setlistfmSetlistId: 'sl-opener',
				rawJson: { source: 'test', artist: 'opener' }
			})
			.returning();

		const [headlinerPerf] = await db
			.insert(schema.performances)
			.values({
				showId: show.id,
				artistId: headliner.id,
				billingOrder: 1,
				tourId: tour.id,
				setlistfmSetlistId: 'sl-headliner',
				rawJson: { source: 'test', artist: 'headliner' }
			})
			.returning();

		const [setlistSong] = await db
			.insert(schema.setlistSongs)
			.values({
				performanceId: headlinerPerf.id,
				songId: song.id,
				setNumber: 1,
				position: 1,
				isEncore: false,
				isCover: false
			})
			.returning();
		expect(setlistSong.performanceId).toBe(headlinerPerf.id);

		const [attendance] = await db
			.insert(schema.attendances)
			.values({ userId: user.id, showId: show.id, attendanceStatus: 'confirmed' })
			.returning();
		expect(attendance.id).toBeTypeOf('number');
		expect(attendance.showId).toBe(show.id);

		// the two performances exist on the same show with distinct billing orders
		expect(openerPerf.billingOrder).toBe(0);
		expect(headlinerPerf.billingOrder).toBe(1);
	});
});

describe('uniqueness constraints', () => {
	it('rejects duplicate (venue_id, show_date) on shows', async () => {
		const [v] = await db
			.insert(schema.venues)
			.values({ setlistfmId: 'venue-unique-show', name: 'V', city: 'C', country: 'US' })
			.returning();
		await db.insert(schema.shows).values({ venueId: v.id, showDate: '2024-01-01' });
		await expect(
			db.insert(schema.shows).values({ venueId: v.id, showDate: '2024-01-01' })
		).rejects.toThrow();
	});

	it('rejects duplicate (show_id, artist_id) on performances', async () => {
		const [v] = await db
			.insert(schema.venues)
			.values({ setlistfmId: 'venue-perf-art', name: 'V', city: 'C', country: 'US' })
			.returning();
		const [s] = await db
			.insert(schema.shows)
			.values({ venueId: v.id, showDate: '2024-02-01' })
			.returning();
		const [a] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-perf-art', name: 'A', sortName: 'A' })
			.returning();
		await db
			.insert(schema.performances)
			.values({ showId: s.id, artistId: a.id, billingOrder: 0 });
		await expect(
			db
				.insert(schema.performances)
				.values({ showId: s.id, artistId: a.id, billingOrder: 1 })
		).rejects.toThrow();
	});

	it('rejects duplicate (show_id, billing_order) on performances', async () => {
		const [v] = await db
			.insert(schema.venues)
			.values({ setlistfmId: 'venue-perf-bill', name: 'V', city: 'C', country: 'US' })
			.returning();
		const [s] = await db
			.insert(schema.shows)
			.values({ venueId: v.id, showDate: '2024-03-01' })
			.returning();
		const [a1] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-perf-bill-1', name: 'A1', sortName: 'A1' })
			.returning();
		const [a2] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-perf-bill-2', name: 'A2', sortName: 'A2' })
			.returning();
		await db
			.insert(schema.performances)
			.values({ showId: s.id, artistId: a1.id, billingOrder: 0 });
		await expect(
			db
				.insert(schema.performances)
				.values({ showId: s.id, artistId: a2.id, billingOrder: 0 })
		).rejects.toThrow();
	});

	it('rejects duplicate (user_id, show_id) on attendances', async () => {
		const [u] = await db
			.insert(schema.users)
			.values({ displayName: 'Dup' })
			.returning();
		const [v] = await db
			.insert(schema.venues)
			.values({ setlistfmId: 'venue-att-dup', name: 'V', city: 'C', country: 'US' })
			.returning();
		const [s] = await db
			.insert(schema.shows)
			.values({ venueId: v.id, showDate: '2024-04-01' })
			.returning();
		await db.insert(schema.attendances).values({ userId: u.id, showId: s.id });
		await expect(
			db.insert(schema.attendances).values({ userId: u.id, showId: s.id })
		).rejects.toThrow();
	});
});

describe('indexes exist', () => {
	it('attendances_user_id_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'attendances' AND indexname = 'attendances_user_id_idx'
    `;
		expect(rows.length).toBe(1);
	});

	it('shows_show_date_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'shows' AND indexname = 'shows_show_date_idx'
    `;
		expect(rows.length).toBe(1);
	});

	it('performances_artist_id_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'performances' AND indexname = 'performances_artist_id_idx'
    `;
		expect(rows.length).toBe(1);
	});

	it('setlist_songs_song_id_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'setlist_songs' AND indexname = 'setlist_songs_song_id_idx'
    `;
		expect(rows.length).toBe(1);
	});

	it('songs_artist_id_normalized_name_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'songs' AND indexname = 'songs_artist_id_normalized_name_idx'
    `;
		expect(rows.length).toBe(1);
	});

	it('venues_lat_lng_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'venues' AND indexname = 'venues_lat_lng_idx'
    `;
		expect(rows.length).toBe(1);
	});
});
