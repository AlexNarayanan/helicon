import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.js';
import {
	getMostSeenArtists,
	getShowCountsByDay,
	getCoPerformerPairs,
	getCumulativeDiscoveries
} from '../../src/lib/server/insights.js';

let container: StartedPostgreSqlContainer;
let pgClient: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;

let userId: number;
let metallicaId: number;
let penteraId: number;
let slayerId: number;
let msgId: number;
let forumId: number;
let show1Id: number; // MSG 2023-08-11 — Metallica (hl) + Pantera (op)
let show2Id: number; // MSG 2022-06-10 — Metallica (hl) + Slayer (op)
let show3Id: number; // Forum 2021-05-15 — Pantera solo

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();
	pgClient = postgres(container.getConnectionUri());
	db = drizzle(pgClient, { schema });
	await migrate(db, { migrationsFolder: './drizzle/migrations' });

	const [user] = await db.insert(schema.users).values({ displayName: 'Fan' }).returning();
	userId = user.id;

	const [metallica] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-ins-metallica', name: 'Metallica', sortName: 'Metallica' })
		.returning();
	metallicaId = metallica.id;

	const [pantera] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-ins-pantera', name: 'Pantera', sortName: 'Pantera' })
		.returning();
	penteraId = pantera.id;

	const [slayer] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-ins-slayer', name: 'Slayer', sortName: 'Slayer' })
		.returning();
	slayerId = slayer.id;

	const [msg] = await db
		.insert(schema.venues)
		.values({ setlistfmId: 'venue-ins-msg', name: 'Madison Square Garden', city: 'New York', country: 'US', lat: 40.75, lng: -73.99 })
		.returning();
	msgId = msg.id;

	const [forum] = await db
		.insert(schema.venues)
		.values({ setlistfmId: 'venue-ins-forum', name: 'The Forum', city: 'Los Angeles', country: 'US', lat: 33.96, lng: -118.34 })
		.returning();
	forumId = forum.id;

	const [show1] = await db.insert(schema.shows).values({ venueId: msgId, showDate: '2023-08-11' }).returning();
	show1Id = show1.id;
	const [show2] = await db.insert(schema.shows).values({ venueId: msgId, showDate: '2022-06-10' }).returning();
	show2Id = show2.id;
	const [show3] = await db.insert(schema.shows).values({ venueId: forumId, showDate: '2021-05-15' }).returning();
	show3Id = show3.id;

	const [perf1Met] = await db
		.insert(schema.performances)
		.values({ showId: show1Id, artistId: metallicaId, billingOrder: 1, updatedAt: new Date() })
		.returning();
	await db.insert(schema.performances).values({ showId: show1Id, artistId: penteraId, billingOrder: 0, updatedAt: new Date() });

	const [perf2Met] = await db
		.insert(schema.performances)
		.values({ showId: show2Id, artistId: metallicaId, billingOrder: 1, updatedAt: new Date() })
		.returning();
	await db.insert(schema.performances).values({ showId: show2Id, artistId: slayerId, billingOrder: 0, updatedAt: new Date() });

	await db.insert(schema.performances).values({ showId: show3Id, artistId: penteraId, billingOrder: 0, updatedAt: new Date() });

	// Songs for cumulative discoveries
	const [masterOfPuppets] = await db
		.insert(schema.songs)
		.values({ name: 'Master of Puppets', artistId: metallicaId, normalizedName: 'master-ins-mop' })
		.returning();
	const [enterSandman] = await db
		.insert(schema.songs)
		.values({ name: 'Enter Sandman', artistId: metallicaId, normalizedName: 'master-ins-es' })
		.returning();

	await db.insert(schema.setlistSongs).values({
		performanceId: perf1Met.id, songId: masterOfPuppets.id,
		setNumber: 1, position: 1, isEncore: false, isCover: false
	});
	await db.insert(schema.setlistSongs).values({
		performanceId: perf1Met.id, songId: enterSandman.id,
		setNumber: 1, position: 2, isEncore: false, isCover: false
	});
	await db.insert(schema.setlistSongs).values({
		performanceId: perf2Met.id, songId: masterOfPuppets.id,
		setNumber: 1, position: 1, isEncore: false, isCover: false
	});

	await db.insert(schema.attendances).values([
		{ userId, showId: show1Id, attendanceStatus: 'confirmed', updatedAt: new Date() },
		{ userId, showId: show2Id, attendanceStatus: 'confirmed', updatedAt: new Date() },
		{ userId, showId: show3Id, attendanceStatus: 'confirmed', updatedAt: new Date() }
	]);
}, 120_000);

afterAll(async () => {
	await pgClient.end();
	await container.stop();
});

describe('getMostSeenArtists', () => {
	it('returns artists ordered by show count descending', async () => {
		const rows = await getMostSeenArtists(db);
		expect(rows.length).toBeGreaterThanOrEqual(1);
		// Metallica appeared in 2 shows; Pantera in 2; Slayer in 1 — top should be 2-show artists
		const metallica = rows.find((r) => r.artistName === 'Metallica');
		expect(metallica).toBeDefined();
		expect(metallica!.showCount).toBe(2);
	});

	it('returns at most 10 rows', async () => {
		const rows = await getMostSeenArtists(db);
		expect(rows.length).toBeLessThanOrEqual(10);
	});

	it('returns expected shape: artistId, artistName, showCount as numbers', async () => {
		const rows = await getMostSeenArtists(db);
		for (const r of rows) {
			expect(r.artistId).toBeTypeOf('number');
			expect(r.artistName).toBeTypeOf('string');
			expect(r.showCount).toBeTypeOf('number');
		}
	});

	it('slayer appears with showCount=1', async () => {
		const rows = await getMostSeenArtists(db);
		const slayer = rows.find((r) => r.artistName === 'Slayer');
		expect(slayer).toBeDefined();
		expect(slayer!.showCount).toBe(1);
	});
});

describe('getShowCountsByDay', () => {
	it('returns one row per unique show date', async () => {
		const rows = await getShowCountsByDay(db);
		expect(rows.length).toBe(3);
		const dates = rows.map((r) => r.date);
		expect(dates).toContain('2021-05-15');
		expect(dates).toContain('2022-06-10');
		expect(dates).toContain('2023-08-11');
	});

	it('each row has date in YYYY-MM-DD format and numeric count >= 1', async () => {
		const rows = await getShowCountsByDay(db);
		for (const r of rows) {
			expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(r.count).toBeTypeOf('number');
			expect(r.count).toBeGreaterThanOrEqual(1);
		}
	});

	it('rows are ordered by date ascending', async () => {
		const rows = await getShowCountsByDay(db);
		for (let i = 1; i < rows.length; i++) {
			expect(rows[i].date >= rows[i - 1].date).toBe(true);
		}
	});
});

describe('getCoPerformerPairs', () => {
	it('returns an object with artists and pairs arrays', async () => {
		const result = await getCoPerformerPairs(db);
		expect(Array.isArray(result.artists)).toBe(true);
		expect(Array.isArray(result.pairs)).toBe(true);
	});

	it('includes Metallica and Pantera as top artists', async () => {
		const result = await getCoPerformerPairs(db);
		const names = result.artists.map((a) => a.name);
		expect(names).toContain('Metallica');
		expect(names).toContain('Pantera');
	});

	it('Metallica + Pantera co-performance pair exists with count >= 1', async () => {
		const result = await getCoPerformerPairs(db);
		const metallica = result.artists.find((a) => a.name === 'Metallica');
		const pantera = result.artists.find((a) => a.name === 'Pantera');
		expect(metallica).toBeDefined();
		expect(pantera).toBeDefined();

		const pair = result.pairs.find(
			(p) =>
				(p.sourceId === metallica!.id && p.targetId === pantera!.id) ||
				(p.sourceId === pantera!.id && p.targetId === metallica!.id)
		);
		expect(pair).toBeDefined();
		expect(pair!.count).toBeGreaterThanOrEqual(1);
	});

	it('each pair has sourceId < targetId', async () => {
		const result = await getCoPerformerPairs(db);
		for (const p of result.pairs) {
			expect(p.sourceId).toBeLessThan(p.targetId);
		}
	});
});

describe('getCumulativeDiscoveries', () => {
	it('returns artists, venues, and songs arrays', async () => {
		const result = await getCumulativeDiscoveries(db);
		expect(Array.isArray(result.artists)).toBe(true);
		expect(Array.isArray(result.venues)).toBe(true);
		expect(Array.isArray(result.songs)).toBe(true);
	});

	it('artist counts are non-decreasing over time', async () => {
		const result = await getCumulativeDiscoveries(db);
		for (let i = 1; i < result.artists.length; i++) {
			expect(result.artists[i].count).toBeGreaterThanOrEqual(result.artists[i - 1].count);
		}
	});

	it('venue counts are non-decreasing over time', async () => {
		const result = await getCumulativeDiscoveries(db);
		for (let i = 1; i < result.venues.length; i++) {
			expect(result.venues[i].count).toBeGreaterThanOrEqual(result.venues[i - 1].count);
		}
	});

	it('final artist count equals 3 (Metallica, Pantera, Slayer)', async () => {
		const result = await getCumulativeDiscoveries(db);
		expect(result.artists.length).toBeGreaterThan(0);
		const finalCount = result.artists[result.artists.length - 1].count;
		expect(finalCount).toBe(3);
	});

	it('final venue count equals 2 (MSG and Forum)', async () => {
		const result = await getCumulativeDiscoveries(db);
		expect(result.venues.length).toBeGreaterThan(0);
		const finalCount = result.venues[result.venues.length - 1].count;
		expect(finalCount).toBe(2);
	});

	it('song counts are non-decreasing over time', async () => {
		const result = await getCumulativeDiscoveries(db);
		for (let i = 1; i < result.songs.length; i++) {
			expect(result.songs[i].count).toBeGreaterThanOrEqual(result.songs[i - 1].count);
		}
	});
});
