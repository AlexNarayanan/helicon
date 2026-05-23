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

	it('inserts and reads an attendance with setlist and setlist_songs', async () => {
		const [user] = await db
			.insert(schema.users)
			.values({ displayName: 'Test Fan' })
			.returning();
		const [artist] = await db
			.insert(schema.artists)
			.values({ setlistfmMbid: 'mbid-iron-maiden', name: 'Iron Maiden', sortName: 'Iron Maiden' })
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
		const [song] = await db
			.insert(schema.songs)
			.values({ name: 'The Trooper', artistId: artist.id, normalizedName: 'the trooper' })
			.returning();

		const [attendance] = await db
			.insert(schema.attendances)
			.values({
				userId: user.id,
				artistId: artist.id,
				venueId: venue.id,
				showDate: '2024-08-11',
				attendanceStatus: 'confirmed'
			})
			.returning();
		expect(attendance.id).toBeTypeOf('number');

		const [setlist] = await db
			.insert(schema.setlists)
			.values({ attendanceId: attendance.id, rawJson: { source: 'test' }, tourName: 'World Tour' })
			.returning();
		expect(setlist.attendanceId).toBe(attendance.id);

		const [setlistSong] = await db
			.insert(schema.setlistSongs)
			.values({
				setlistId: setlist.id,
				songId: song.id,
				setNumber: 1,
				position: 1,
				isEncore: false,
				isCover: false
			})
			.returning();
		expect(setlistSong.songId).toBe(song.id);
	});
});

describe('indexes exist', () => {
	it('attendances_user_id_show_date_idx is present', async () => {
		const rows = await client`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'attendances' AND indexname = 'attendances_user_id_show_date_idx'
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
