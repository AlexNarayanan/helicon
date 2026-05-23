import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.js';
import { saveAttendance } from '../../src/lib/server/attendances.js';
import type { SetlistFmSetlist } from '../../src/lib/server/setlistfm/types.js';
import setlistByIdFixture from '../fixtures/setlistfm/setlist-by-id.json';

let container: StartedPostgreSqlContainer;
let pgClient: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: number;

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();
	pgClient = postgres(container.getConnectionUri());
	db = drizzle(pgClient, { schema });
	await migrate(db, { migrationsFolder: './drizzle/migrations' });
	const [user] = await db.insert(schema.users).values({ displayName: 'Test Fan' }).returning();
	userId = user.id;
}, 60_000);

afterAll(async () => {
	await pgClient.end();
	await container.stop();
});

describe('saveAttendance', () => {
	it('persists artist, venue, attendance, setlist, and songs', async () => {
		const setlist = setlistByIdFixture as SetlistFmSetlist;
		const { attendanceId } = await saveAttendance(db, setlist, 'confirmed', userId);

		expect(attendanceId).toBeTypeOf('number');

		// attendance row
		const [att] = await db
			.select()
			.from(schema.attendances)
			.where(eq(schema.attendances.id, attendanceId));
		expect(att).toBeDefined();
		expect(att.setlistfmSetlistId).toBe('3bd6ca6e');
		expect(att.showDate).toBe('2023-08-11');
		expect(att.attendanceStatus).toBe('confirmed');

		// setlist row
		const setlistRows = await db
			.select()
			.from(schema.setlists)
			.where(eq(schema.setlists.attendanceId, attendanceId));
		expect(setlistRows).toHaveLength(1);
		expect(setlistRows[0].tourName).toBe('M72 World Tour');

		// songs: Battery, Master of Puppets, Fuel, Enter Sandman
		const songRows = await db.select().from(schema.songs);
		const songNames = songRows.map((s) => s.name);
		expect(songNames).toContain('Battery');
		expect(songNames).toContain('Master of Puppets');
		expect(songNames).toContain('Enter Sandman');

		// setlist_songs: 4 total (3 main set + 1 encore)
		const setlistSongRows = await db
			.select()
			.from(schema.setlistSongs)
			.where(eq(schema.setlistSongs.setlistId, setlistRows[0].id));
		expect(setlistSongRows).toHaveLength(4);

		const encore = setlistSongRows.find((ss) => ss.isEncore);
		expect(encore).toBeDefined();
		expect(encore!.setNumber).toBe(2);
		expect(encore!.position).toBe(1);

		// artist row
		const artistRows = await db
			.select()
			.from(schema.artists)
			.where(eq(schema.artists.setlistfmMbid, '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab'));
		expect(artistRows).toHaveLength(1);
		expect(artistRows[0].name).toBe('Metallica');

		// venue row
		const venueRows = await db
			.select()
			.from(schema.venues)
			.where(eq(schema.venues.setlistfmId, '6bd6ca6e'));
		expect(venueRows).toHaveLength(1);
		expect(venueRows[0].name).toBe('Madison Square Garden');
		expect(venueRows[0].lat).toBeCloseTo(40.7505);
	});

	it('upserts artist and venue on second save of same setlist', async () => {
		const setlist = setlistByIdFixture as SetlistFmSetlist;
		await saveAttendance(db, setlist, 'confirmed', userId);
		const { attendanceId } = await saveAttendance(db, setlist, 'confirmed', userId);
		expect(attendanceId).toBeTypeOf('number');

		// Artist should still be exactly one row for this mbid
		const artistRows = await db
			.select()
			.from(schema.artists)
			.where(eq(schema.artists.setlistfmMbid, '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab'));
		expect(artistRows).toHaveLength(1);
	});

	it('normalizes song names for deduplication across saves', async () => {
		const setlist = setlistByIdFixture as SetlistFmSetlist;
		await saveAttendance(db, setlist, 'confirmed', userId);
		await saveAttendance(db, setlist, 'confirmed', userId);

		// "Battery" should appear once in songs table (upserted)
		const batteryRows = await db
			.select()
			.from(schema.songs)
			.where(eq(schema.songs.normalizedName, 'battery'));
		expect(batteryRows).toHaveLength(1);
	});
});
