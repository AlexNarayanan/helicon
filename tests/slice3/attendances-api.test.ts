import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.js';
import { saveAttendanceFromSeed } from '../../src/lib/server/attendances.js';
import { resyncShow } from '../../src/lib/server/shows.js';
import { createSetlistFmClient } from '../../src/lib/server/setlistfm/client.js';
import setlistByIdFixture from '../fixtures/setlistfm/setlist-by-id.json';
import setlistOpenerFixture from '../fixtures/setlistfm/setlist-by-id-opener.json';
import setlistsByVenueDateFixture from '../fixtures/setlistfm/setlists-by-venue-date.json';

const SETLISTFM_BASE = 'https://api.setlist.fm/rest/1.0';

const handlers = [
	http.get(`${SETLISTFM_BASE}/setlist/3bd6ca6e`, () => HttpResponse.json(setlistByIdFixture)),
	http.get(`${SETLISTFM_BASE}/setlist/opener-001`, () => HttpResponse.json(setlistOpenerFixture)),
	http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
		const url = new URL(request.url);
		const venueId = url.searchParams.get('venueId');
		const date = url.searchParams.get('date');
		const page = url.searchParams.get('p');
		if (venueId === '6bd6ca6e' && date === '11-08-2023' && page === '1') {
			return HttpResponse.json(setlistsByVenueDateFixture);
		}
		// empty subsequent pages
		return HttpResponse.json({
			type: 'setlists',
			total: 2,
			page: parseInt(page ?? '1'),
			itemsPerPage: 20,
			setlist: []
		});
	})
];

const mswServer = setupServer(...handlers);

let container: StartedPostgreSqlContainer;
let pgClient: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: number;

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();
	mswServer.listen({ onUnhandledRequest: 'bypass' });
	pgClient = postgres(container.getConnectionUri());
	db = drizzle(pgClient, { schema });
	await migrate(db, { migrationsFolder: './drizzle/migrations' });
	const [user] = await db.insert(schema.users).values({ displayName: 'Test Fan' }).returning();
	userId = user.id;
}, 60_000);

afterEach(() => mswServer.resetHandlers(...handlers));

afterAll(async () => {
	mswServer.close();
	await pgClient.end();
	await container.stop();
});

async function freshDbState() {
	// Truncate between scenarios so each test starts clean (keeping users intact)
	await db.delete(schema.setlistSongs);
	await db.delete(schema.performances);
	await db.delete(schema.attendances);
	await db.delete(schema.shows);
	await db.delete(schema.tours);
	await db.delete(schema.songs);
	await db.delete(schema.artists);
	await db.delete(schema.venues);
}

describe('saveAttendanceFromSeed', () => {
	it('creates a show with all performances at that venue+date', async () => {
		await freshDbState();
		const client = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const result = await saveAttendanceFromSeed(db, client, {
			seedSetlistId: '3bd6ca6e',
			status: 'confirmed',
			userId
		});

		expect(result.attendanceId).toBeTypeOf('number');
		expect(result.showId).toBeTypeOf('number');
		expect(result.performanceCount).toBe(2);

		const showRows = await db.select().from(schema.shows);
		expect(showRows).toHaveLength(1);
		expect(showRows[0].showDate).toBe('2023-08-11');
		expect(showRows[0].lastSyncedAt).not.toBeNull();

		const perfRows = await db
			.select()
			.from(schema.performances)
			.where(eq(schema.performances.showId, result.showId));
		expect(perfRows).toHaveLength(2);

		// billing_order is assigned by lastUpdated ascending; Pantera (Aug 11) < Metallica (Aug 12)
		const ordered = [...perfRows].sort((a, b) => a.billingOrder - b.billingOrder);
		const artistsById = await db.select().from(schema.artists);
		const nameById = new Map(artistsById.map((a) => [a.id, a.name]));
		expect(nameById.get(ordered[0].artistId)).toBe('Pantera');
		expect(nameById.get(ordered[1].artistId)).toBe('Metallica');
		expect(ordered[0].billingOrder).toBe(0);
		expect(ordered[1].billingOrder).toBe(1);

		// tours: both bands' tours persisted
		const tourRows = await db.select().from(schema.tours);
		const tourNames = tourRows.map((t) => t.name).sort();
		expect(tourNames).toEqual(['M72 World Tour', 'Reunion Tour']);

		// setlist_songs for the headliner
		const metallicaPerf = ordered[1];
		const headlinerSongs = await db
			.select()
			.from(schema.setlistSongs)
			.where(eq(schema.setlistSongs.performanceId, metallicaPerf.id));
		expect(headlinerSongs).toHaveLength(4);
		expect(headlinerSongs.find((s) => s.isEncore)?.setNumber).toBe(2);

		// attendance row
		const [att] = await db
			.select()
			.from(schema.attendances)
			.where(eq(schema.attendances.id, result.attendanceId));
		expect(att.showId).toBe(result.showId);
		expect(att.userId).toBe(userId);
		expect(att.attendanceStatus).toBe('confirmed');
	});

	it('is idempotent: re-saving the same seed updates rather than duplicates', async () => {
		await freshDbState();
		const client = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const first = await saveAttendanceFromSeed(db, client, {
			seedSetlistId: '3bd6ca6e',
			status: 'confirmed',
			userId
		});
		const second = await saveAttendanceFromSeed(db, client, {
			seedSetlistId: '3bd6ca6e',
			status: 'confirmed',
			userId,
			notes: 'updated note'
		});

		expect(second.attendanceId).toBe(first.attendanceId);
		expect(second.showId).toBe(first.showId);

		const perfRows = await db.select().from(schema.performances);
		expect(perfRows).toHaveLength(2);

		const setlistSongRows = await db.select().from(schema.setlistSongs);
		// 4 headliner + 2 opener songs = 6 (delete-then-insert in replaceSetlistSongs prevents duplication)
		expect(setlistSongRows).toHaveLength(6);

		const [att] = await db
			.select()
			.from(schema.attendances)
			.where(eq(schema.attendances.id, first.attendanceId));
		expect(att.notes).toBe('updated note');
	});

	it('dedupes songs by (artist, normalized_name) across performances', async () => {
		await freshDbState();
		const client = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		await saveAttendanceFromSeed(db, client, {
			seedSetlistId: '3bd6ca6e',
			status: 'confirmed',
			userId
		});

		const songRows = await db.select().from(schema.songs);
		// Metallica: Battery, Master of Puppets, Fuel, Enter Sandman = 4
		// Pantera: A New Level, Walk = 2
		// Total distinct songs: 6
		expect(songRows).toHaveLength(6);
	});
});

describe('resyncShow', () => {
	it('re-pulls all performances and updates last_synced_at', async () => {
		await freshDbState();
		const client = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const { showId } = await saveAttendanceFromSeed(db, client, {
			seedSetlistId: '3bd6ca6e',
			status: 'confirmed',
			userId
		});

		const beforeRows = await db
			.select()
			.from(schema.shows)
			.where(eq(schema.shows.id, showId));
		const beforeSynced = beforeRows[0].lastSyncedAt;

		await new Promise((r) => setTimeout(r, 10));

		const result = await resyncShow(db, client, showId);
		expect(result.performanceCount).toBe(2);

		const [show] = await db
			.select()
			.from(schema.shows)
			.where(eq(schema.shows.id, showId));
		expect(show.lastSyncedAt!.getTime()).toBeGreaterThan(beforeSynced!.getTime());
	});
});
