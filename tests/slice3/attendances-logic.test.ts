import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSetlistFmClient } from '../../src/lib/server/setlistfm/client.js';
import { normalizeSongName, parseSetlistDate, searchSetlists } from '../../src/lib/server/attendances.js';
import searchArtistsFixture from '../fixtures/setlistfm/search-artists.json';
import searchSetlistsFixture from '../fixtures/setlistfm/search-setlists.json';

const SETLISTFM_BASE = 'https://api.setlist.fm/rest/1.0';

const mswServer = setupServer(
	http.get(`${SETLISTFM_BASE}/search/artists`, () => HttpResponse.json(searchArtistsFixture)),
	http.get(`${SETLISTFM_BASE}/search/setlists`, () => HttpResponse.json(searchSetlistsFixture))
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('normalizeSongName', () => {
	it('lowercases and strips punctuation', () => {
		expect(normalizeSongName('Master of Puppets')).toBe('master of puppets');
		expect(normalizeSongName('Enter Sandman!')).toBe('enter sandman');
		expect(normalizeSongName('Whiskey in the Jar (Live)')).toBe('whiskey in the jar live');
	});

	it('collapses multiple spaces', () => {
		expect(normalizeSongName('One  Two   Three')).toBe('one two three');
	});
});

describe('parseSetlistDate', () => {
	it('converts DD-MM-YYYY to YYYY-MM-DD', () => {
		expect(parseSetlistDate('11-08-2023')).toBe('2023-08-11');
		expect(parseSetlistDate('01-01-2020')).toBe('2020-01-01');
	});
});

describe('searchSetlists', () => {
	it('searches by artist name, converts date format, returns setlists', async () => {
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const results = await searchSetlists(sfClient, { artistName: 'Metallica', date: '2023-08-11' });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe('3bd6ca6e');
		expect(results[0].artist.name).toBe('Metallica');
	});

	it('returns empty array when artist not found', async () => {
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/artists`, () =>
				HttpResponse.json({ artist: [], total: 0, page: 1, itemsPerPage: 20 })
			)
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const results = await searchSetlists(sfClient, { artistName: 'UnknownBand' });
		expect(results).toHaveLength(0);
	});

	it('passes venueName to setlist search', async () => {
		let capturedUrl: URL | undefined;
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchSetlistsFixture);
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		await searchSetlists(sfClient, { artistName: 'Metallica', venueName: 'Madison Square Garden' });
		expect(capturedUrl?.searchParams.get('venueName')).toBe('Madison Square Garden');
	});

	it('passes cityName to setlist search', async () => {
		let capturedUrl: URL | undefined;
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchSetlistsFixture);
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		await searchSetlists(sfClient, { artistName: 'Metallica', city: 'Boston' });
		expect(capturedUrl?.searchParams.get('cityName')).toBe('Boston');
	});

	it('converts YYYY-MM-DD date to DD-MM-YYYY for setlist.fm', async () => {
		let capturedUrl: URL | undefined;
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchSetlistsFixture);
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		await searchSetlists(sfClient, { artistName: 'Metallica', date: '2023-08-11' });
		expect(capturedUrl?.searchParams.get('date')).toBe('11-08-2023');
	});

	it('falls back through phases and sorts by date proximity when all date searches return no results', async () => {
		// Phase 1 (date+venue+city) → 404, Phase 2 (date only) → 404, Phase 3 (year) → results
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				const url = new URL(request.url);
				if (url.searchParams.has('date')) {
					return new HttpResponse(null, { status: 404 });
				}
				return HttpResponse.json({
					setlist: [
						{ ...searchSetlistsFixture.setlist[0], id: 'far-after', eventDate: '15-06-2014' },
						{ ...searchSetlistsFixture.setlist[0], id: 'exact', eventDate: '28-04-2014' },
						{ ...searchSetlistsFixture.setlist[0], id: 'close-before', eventDate: '01-04-2014' }
					],
					total: 3,
					page: 1,
					itemsPerPage: 20
				});
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity, maxRetries: 0 });
		const results = await searchSetlists(sfClient, { artistName: 'Metallica', date: '2014-04-28' });
		// exact match first, then closest before (27 days), then farthest (48 days)
		expect(results.map((r) => r.id)).toEqual(['exact', 'close-before', 'far-after']);
	});

	it('phase 3 year search uses only artistMbid+year (no venue/city) so it cannot 404 on extra filters', async () => {
		const yearCallUrls: URL[] = [];
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				const url = new URL(request.url);
				if (url.searchParams.has('date')) {
					return new HttpResponse(null, { status: 404 });
				}
				yearCallUrls.push(url);
				return HttpResponse.json(searchSetlistsFixture);
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity, maxRetries: 0 });
		await searchSetlists(sfClient, {
			artistName: 'Metallica',
			date: '2023-08-11',
			city: 'Boston',
			venueName: 'Brighton Music Hall'
		});
		// Only one year call should happen (phase 3); it must NOT include venue or city
		expect(yearCallUrls).toHaveLength(1);
		expect(yearCallUrls[0].searchParams.get('cityName')).toBeNull();
		expect(yearCallUrls[0].searchParams.get('venueName')).toBeNull();
		expect(yearCallUrls[0].searchParams.get('year')).toBe('2023');
	});
});

describe('searchAllSetlistsAtVenueOnDate', () => {
	it('aggregates pages until a partial page is returned', async () => {
		const calls: string[] = [];
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, ({ request }) => {
				const url = new URL(request.url);
				const page = url.searchParams.get('p') ?? '1';
				calls.push(page);
				if (page === '1') {
					return HttpResponse.json({
						type: 'setlists',
						total: 25,
						page: 1,
						itemsPerPage: 20,
						setlist: Array.from({ length: 20 }, (_, i) => ({ id: `p1-${i}` }))
					});
				}
				return HttpResponse.json({
					type: 'setlists',
					total: 25,
					page: 2,
					itemsPerPage: 20,
					setlist: Array.from({ length: 5 }, (_, i) => ({ id: `p2-${i}` }))
				});
			})
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const all = await sfClient.searchAllSetlistsAtVenueOnDate('venue-1', '11-08-2023');
		expect(all).toHaveLength(25);
		expect(calls).toEqual(['1', '2']);
	});

	it('caps at MAX_PAGES and warns', async () => {
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, () =>
				HttpResponse.json({
					type: 'setlists',
					total: 1000,
					page: 1,
					itemsPerPage: 20,
					setlist: Array.from({ length: 20 }, (_, i) => ({ id: `x-${i}` }))
				})
			)
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity });
		const all = await sfClient.searchAllSetlistsAtVenueOnDate('venue-x', '11-08-2023', 3);
		expect(all).toHaveLength(60);
	});

	it('returns empty array on 404', async () => {
		mswServer.use(
			http.get(`${SETLISTFM_BASE}/search/setlists`, () => new HttpResponse(null, { status: 404 }))
		);
		const sfClient = createSetlistFmClient({ apiKey: 'test', rps: Infinity, maxRetries: 0 });
		const all = await sfClient.searchAllSetlistsAtVenueOnDate('venue-empty', '11-08-2023');
		expect(all).toEqual([]);
	});
});
