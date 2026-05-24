import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.js';
import {
	getMostPlayedSongs,
	getMostRareSongs,
	getMostCommonVenues,
	getArtistsBothOpenerAndHeadliner,
	getOpenersPerShowDistribution,
	getReportFilters
} from '../../src/lib/server/reports.js';

let container: StartedPostgreSqlContainer;
let pgClient: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;

// Seeded IDs
let userId: number;
let metallicaId: number;
let penteraId: number;
let slayerId: number;
let msgId: number;
let forumId: number;
let show1Id: number; // MSG 2023-08-11 — Metallica (headliner) + Pantera (opener)
let show2Id: number; // MSG 2022-06-10 — Metallica (headliner) + Slayer (opener)
let show3Id: number; // Forum 2021-05-15 — Pantera solo (headliner)

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();
	pgClient = postgres(container.getConnectionUri());
	db = drizzle(pgClient, { schema });
	await migrate(db, { migrationsFolder: './drizzle/migrations' });

	// Seed user
	const [user] = await db.insert(schema.users).values({ displayName: 'Fan' }).returning();
	userId = user.id;

	// Seed artists
	const [metallica] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-metallica', name: 'Metallica', sortName: 'Metallica' })
		.returning();
	metallicaId = metallica.id;

	const [pantera] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-pantera', name: 'Pantera', sortName: 'Pantera' })
		.returning();
	penteraId = pantera.id;

	const [slayer] = await db
		.insert(schema.artists)
		.values({ setlistfmMbid: 'mbid-slayer', name: 'Slayer', sortName: 'Slayer' })
		.returning();
	slayerId = slayer.id;

	// Seed venues
	const [msg] = await db
		.insert(schema.venues)
		.values({
			setlistfmId: 'venue-msg',
			name: 'Madison Square Garden',
			city: 'New York',
			country: 'US',
			lat: 40.7505,
			lng: -73.9934
		})
		.returning();
	msgId = msg.id;

	const [forum] = await db
		.insert(schema.venues)
		.values({
			setlistfmId: 'venue-forum',
			name: 'The Forum',
			city: 'Los Angeles',
			country: 'US',
			lat: 33.958,
			lng: -118.342
		})
		.returning();
	forumId = forum.id;

	// Seed shows
	const [show1] = await db
		.insert(schema.shows)
		.values({ venueId: msgId, showDate: '2023-08-11' })
		.returning();
	show1Id = show1.id;

	const [show2] = await db
		.insert(schema.shows)
		.values({ venueId: msgId, showDate: '2022-06-10' })
		.returning();
	show2Id = show2.id;

	const [show3] = await db
		.insert(schema.shows)
		.values({ venueId: forumId, showDate: '2021-05-15' })
		.returning();
	show3Id = show3.id;

	// Seed performances
	// show1: Metallica (headliner billing=1), Pantera (opener billing=0)
	const [perf1Metallica] = await db
		.insert(schema.performances)
		.values({ showId: show1Id, artistId: metallicaId, billingOrder: 1, updatedAt: new Date() })
		.returning();
	const [perf1Pantera] = await db
		.insert(schema.performances)
		.values({ showId: show1Id, artistId: penteraId, billingOrder: 0, updatedAt: new Date() })
		.returning();

	// show2: Metallica (headliner billing=1), Slayer (opener billing=0)
	const [perf2Metallica] = await db
		.insert(schema.performances)
		.values({ showId: show2Id, artistId: metallicaId, billingOrder: 1, updatedAt: new Date() })
		.returning();
	const [perf2Slayer] = await db
		.insert(schema.performances)
		.values({ showId: show2Id, artistId: slayerId, billingOrder: 0, updatedAt: new Date() })
		.returning();

	// show3: Pantera solo (headliner billing=0, only performer)
	const [perf3Pantera] = await db
		.insert(schema.performances)
		.values({ showId: show3Id, artistId: penteraId, billingOrder: 0, updatedAt: new Date() })
		.returning();

	// Seed songs
	const [masterOfPuppets] = await db
		.insert(schema.songs)
		.values({ name: 'Master of Puppets', artistId: metallicaId, normalizedName: 'master of puppets' })
		.returning();
	const [enterSandman] = await db
		.insert(schema.songs)
		.values({ name: 'Enter Sandman', artistId: metallicaId, normalizedName: 'enter sandman' })
		.returning();
	const [cowboys] = await db
		.insert(schema.songs)
		.values({ name: 'Cowboys from Hell', artistId: penteraId, normalizedName: 'cowboys from hell' })
		.returning();
	const [rainingBlood] = await db
		.insert(schema.songs)
		.values({ name: 'Raining Blood', artistId: slayerId, normalizedName: 'raining blood' })
		.returning();
	const [walk] = await db
		.insert(schema.songs)
		.values({ name: 'Walk', artistId: penteraId, normalizedName: 'walk' })
		.returning();

	// Seed setlist_songs
	// show1 Metallica set: Master of Puppets + Enter Sandman
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf1Metallica.id, songId: masterOfPuppets.id, setNumber: 1, position: 1, isEncore: false, isCover: false });
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf1Metallica.id, songId: enterSandman.id, setNumber: 1, position: 2, isEncore: false, isCover: false });
	// show1 Pantera set: Cowboys from Hell
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf1Pantera.id, songId: cowboys.id, setNumber: 1, position: 1, isEncore: false, isCover: false });
	// show2 Metallica set: Master of Puppets (played again)
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf2Metallica.id, songId: masterOfPuppets.id, setNumber: 1, position: 1, isEncore: false, isCover: false });
	// show2 Slayer set: Raining Blood
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf2Slayer.id, songId: rainingBlood.id, setNumber: 1, position: 1, isEncore: false, isCover: false });
	// show3 Pantera set: Walk
	await db
		.insert(schema.setlistSongs)
		.values({ performanceId: perf3Pantera.id, songId: walk.id, setNumber: 1, position: 1, isEncore: false, isCover: false });

	// Seed attendances: user attended all 3 shows
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

describe('getMostPlayedSongs', () => {
	it('returns songs ordered by play count descending', async () => {
		const rows = await getMostPlayedSongs(db, {});
		expect(rows.length).toBeGreaterThanOrEqual(1);
		expect(rows[0].songName).toBe('Master of Puppets');
		expect(rows[0].artistName).toBe('Metallica');
		expect(rows[0].playCount).toBe(2);
	});

	it('filters by artistId', async () => {
		const rows = await getMostPlayedSongs(db, { artistId: metallicaId });
		// Only Metallica performances: Master of Puppets (2), Enter Sandman (1)
		expect(rows).toHaveLength(2);
		expect(rows[0].songName).toBe('Master of Puppets');
		expect(rows[0].playCount).toBe(2);
		expect(rows.find((r) => r.artistName === 'Slayer')).toBeUndefined();
		expect(rows.find((r) => r.artistName === 'Pantera')).toBeUndefined();
	});

	it('filters by yearStart', async () => {
		// Only show1 (2023) has songs played in 2023
		const rows = await getMostPlayedSongs(db, { yearStart: 2023 });
		// show1 Metallica: Master of Puppets (1), Enter Sandman (1); show1 Pantera: Cowboys from Hell (1)
		expect(rows.every((r) => r.playCount === 1)).toBe(true);
		const names = rows.map((r) => r.songName);
		expect(names).toContain('Master of Puppets');
		expect(names).not.toContain('Walk'); // Walk is from show3 (2021)
	});

	it('filters by venueId', async () => {
		const rows = await getMostPlayedSongs(db, { venueId: forumId });
		// Only show3 at Forum: Walk (1)
		expect(rows).toHaveLength(1);
		expect(rows[0].songName).toBe('Walk');
	});
});

describe('getMostRareSongs', () => {
	it('returns songs with lowest play count first', async () => {
		const rows = await getMostRareSongs(db, {});
		expect(rows.length).toBeGreaterThanOrEqual(1);
		// All songs except Master of Puppets have playCount=1
		expect(rows[0].playCount).toBe(1);
		// Master of Puppets (playCount=2) should not appear first
		expect(rows[0].songName).not.toBe('Master of Puppets');
	});

	it('Master of Puppets is last (highest play count) in ascending order', async () => {
		const rows = await getMostRareSongs(db, {});
		const masterIdx = rows.findIndex((r) => r.songName === 'Master of Puppets');
		// If it appears, it should be at the end
		if (masterIdx !== -1) {
			expect(masterIdx).toBe(rows.length - 1);
		}
	});
});

describe('getMostCommonVenues', () => {
	it('returns venues ordered by show count descending', async () => {
		const rows = await getMostCommonVenues(db, {});
		expect(rows[0].venueName).toBe('Madison Square Garden');
		expect(rows[0].showCount).toBe(2);
		const forum = rows.find((r) => r.venueName === 'The Forum');
		expect(forum?.showCount).toBe(1);
	});

	it('filters by artistId — only venues where artist performed', async () => {
		// Metallica only at MSG, not Forum
		const rows = await getMostCommonVenues(db, { artistId: metallicaId });
		expect(rows).toHaveLength(1);
		expect(rows[0].venueName).toBe('Madison Square Garden');
		expect(rows[0].showCount).toBe(2);
	});

	it('filters by yearStart', async () => {
		// yearStart=2022 includes show1 (2023) and show2 (2022) at MSG; excludes show3 (2021) at Forum
		const rows = await getMostCommonVenues(db, { yearStart: 2022 });
		expect(rows.some((r) => r.venueName === 'Madison Square Garden')).toBe(true);
		expect(rows.find((r) => r.venueName === 'The Forum')).toBeUndefined();
	});

	it('filters by yearEnd', async () => {
		// yearEnd=2021 includes only show3 (2021) at Forum
		const rows = await getMostCommonVenues(db, { yearEnd: 2021 });
		expect(rows).toHaveLength(1);
		expect(rows[0].venueName).toBe('The Forum');
	});
});

describe('getArtistsBothOpenerAndHeadliner', () => {
	it('returns only artists seen in both roles', async () => {
		const rows = await getArtistsBothOpenerAndHeadliner(db);
		// Pantera: opener at show1, headliner at show3
		// Metallica: headliner only
		// Slayer: opener only
		expect(rows).toHaveLength(1);
		expect(rows[0].artistName).toBe('Pantera');
		expect(rows[0].headlinerCount).toBe(1);
		expect(rows[0].openerCount).toBe(1);
	});

	it('excludes headliner-only and opener-only artists', async () => {
		const rows = await getArtistsBothOpenerAndHeadliner(db);
		const names = rows.map((r) => r.artistName);
		expect(names).not.toContain('Metallica');
		expect(names).not.toContain('Slayer');
	});
});

describe('getOpenersPerShowDistribution', () => {
	it('returns correct opener count distribution', async () => {
		const rows = await getOpenersPerShowDistribution(db);
		// show1: 2 performances → 1 opener; show2: 2 → 1 opener; show3: 1 → 0 openers
		const solo = rows.find((r) => r.openerCount === 0);
		const oneOpener = rows.find((r) => r.openerCount === 1);
		expect(solo?.showCount).toBe(1);
		expect(oneOpener?.showCount).toBe(2);
	});

	it('rows are ordered by opener count ascending', async () => {
		const rows = await getOpenersPerShowDistribution(db);
		for (let i = 1; i < rows.length; i++) {
			expect(rows[i].openerCount).toBeGreaterThanOrEqual(rows[i - 1].openerCount);
		}
	});
});

describe('getReportFilters', () => {
	it('returns all attended artists and venues', async () => {
		const { artists: arts, venues: vens } = await getReportFilters(db);
		const artistNames = arts.map((a) => a.name);
		expect(artistNames).toContain('Metallica');
		expect(artistNames).toContain('Pantera');
		expect(artistNames).toContain('Slayer');
		const venueNames = vens.map((v) => v.name);
		expect(venueNames).toContain('Madison Square Garden');
		expect(venueNames).toContain('The Forum');
	});

	it('returns id and name for artists', async () => {
		const { artists: arts } = await getReportFilters(db);
		for (const a of arts) {
			expect(a.id).toBeTypeOf('number');
			expect(a.name).toBeTypeOf('string');
		}
	});
});
