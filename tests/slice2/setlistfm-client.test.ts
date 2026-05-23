import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSetlistFmClient } from '../../src/lib/server/setlistfm/client.js';
import searchArtistsFixture from '../fixtures/setlistfm/search-artists.json';
import searchSetlistsFixture from '../fixtures/setlistfm/search-setlists.json';
import searchVenuesFixture from '../fixtures/setlistfm/search-venues.json';
import setlistByIdFixture from '../fixtures/setlistfm/setlist-by-id.json';

const BASE = 'https://api.setlist.fm/rest/1.0';
const TEST_API_KEY = 'test-api-key-12345';

const server = setupServer(
	http.get(`${BASE}/search/artists`, () => HttpResponse.json(searchArtistsFixture)),
	http.get(`${BASE}/search/venues`, () => HttpResponse.json(searchVenuesFixture)),
	http.get(`${BASE}/search/setlists`, () => HttpResponse.json(searchSetlistsFixture)),
	http.get(`${BASE}/setlist/:id`, () => HttpResponse.json(setlistByIdFixture))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('request headers', () => {
	it('sends x-api-key and Accept: application/json', async () => {
		let capturedHeaders: Headers | undefined;
		server.use(
			http.get(`${BASE}/search/artists`, ({ request }) => {
				capturedHeaders = request.headers;
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchArtists({ artistName: 'Metallica' });
		expect(capturedHeaders?.get('x-api-key')).toBe(TEST_API_KEY);
		expect(capturedHeaders?.get('accept')).toBe('application/json');
	});
});

describe('searchArtists', () => {
	it('returns parsed artists and pagination', async () => {
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		const result = await client.searchArtists({ artistName: 'Metallica' });
		expect(result.artist).toHaveLength(2);
		expect(result.artist[0].mbid).toBe('65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab');
		expect(result.artist[0].name).toBe('Metallica');
		expect(result.total).toBe(2);
		expect(result.page).toBe(1);
	});

	it('sends artistName as query param', async () => {
		let capturedUrl: URL | undefined;
		server.use(
			http.get(`${BASE}/search/artists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchArtists({ artistName: 'Metallica' });
		expect(capturedUrl?.searchParams.get('artistName')).toBe('Metallica');
		expect(capturedUrl?.searchParams.get('p')).toBe('1');
	});

	it('sends custom page number', async () => {
		let capturedUrl: URL | undefined;
		server.use(
			http.get(`${BASE}/search/artists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchArtists({ artistName: 'Metallica', page: 3 });
		expect(capturedUrl?.searchParams.get('p')).toBe('3');
	});
});

describe('searchVenues', () => {
	it('returns parsed venues with city coords', async () => {
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		const result = await client.searchVenues({ name: 'Madison Square Garden' });
		expect(result.venue).toHaveLength(1);
		const venue = result.venue[0];
		expect(venue.id).toBe('6bd6ca6e');
		expect(venue.name).toBe('Madison Square Garden');
		expect(venue.city.name).toBe('New York');
		expect(venue.city.country.code).toBe('US');
		expect(venue.city.coords?.lat).toBe(40.7505);
		expect(venue.city.coords?.long).toBe(-73.9934);
	});

	it('sends only present venue query params', async () => {
		let capturedUrl: URL | undefined;
		server.use(
			http.get(`${BASE}/search/venues`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchVenuesFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchVenues({ name: 'Madison Square Garden', cityName: 'New York' });
		expect(capturedUrl?.searchParams.get('name')).toBe('Madison Square Garden');
		expect(capturedUrl?.searchParams.get('cityName')).toBe('New York');
		expect(capturedUrl?.searchParams.has('stateCode')).toBe(false);
	});
});

describe('searchSetlists', () => {
	it('returns parsed setlists with nested artist, venue, tour, sets', async () => {
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		const result = await client.searchSetlists({
			artistMbid: '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab'
		});
		expect(result.setlist).toHaveLength(1);
		const sl = result.setlist[0];
		expect(sl.id).toBe('3bd6ca6e');
		expect(sl.artist.name).toBe('Metallica');
		expect(sl.venue.name).toBe('Madison Square Garden');
		expect(sl.tour?.name).toBe('M72 World Tour');
		expect(sl.sets.set).toHaveLength(2);
		expect(sl.sets.set[0].song).toHaveLength(3);
		expect(sl.sets.set[0].song[0].name).toBe('Battery');
		expect(sl.sets.set[1].encore).toBe(1);
		expect(sl.sets.set[1].song[0].name).toBe('Enter Sandman');
	});

	it('sends artistMbid as query param', async () => {
		let capturedUrl: URL | undefined;
		server.use(
			http.get(`${BASE}/search/setlists`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(searchSetlistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchSetlists({ artistMbid: '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab', year: 2023 });
		expect(capturedUrl?.searchParams.get('artistMbid')).toBe(
			'65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab'
		);
		expect(capturedUrl?.searchParams.get('year')).toBe('2023');
	});
});

describe('getSetlist', () => {
	it('returns a single setlist by id', async () => {
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		const sl = await client.getSetlist('3bd6ca6e');
		expect(sl.id).toBe('3bd6ca6e');
		expect(sl.artist.mbid).toBe('65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab');
		expect(sl.eventDate).toBe('11-08-2023');
	});

	it('requests /setlist/{id} URL', async () => {
		let capturedUrl: URL | undefined;
		server.use(
			http.get(`${BASE}/setlist/:id`, ({ request }) => {
				capturedUrl = new URL(request.url);
				return HttpResponse.json(setlistByIdFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.getSetlist('3bd6ca6e');
		expect(capturedUrl?.pathname).toBe('/rest/1.0/setlist/3bd6ca6e');
	});
});

describe('LRU cache', () => {
	it('serves identical requests from cache without a second HTTP call', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/search/artists`, () => {
				callCount++;
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchArtists({ artistName: 'Metallica' });
		await client.searchArtists({ artistName: 'Metallica' });
		expect(callCount).toBe(1);
	});

	it('does not share cache between different queries', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/search/artists`, () => {
				callCount++;
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity });
		await client.searchArtists({ artistName: 'Metallica' });
		await client.searchArtists({ artistName: 'Slayer' });
		expect(callCount).toBe(2);
	});

	it('evicts oldest entry when cache is full', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/search/artists`, () => {
				callCount++;
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({ apiKey: TEST_API_KEY, rps: Infinity, cacheSize: 1 });
		await client.searchArtists({ artistName: 'Metallica' });
		await client.searchArtists({ artistName: 'Slayer' }); // evicts Metallica
		await client.searchArtists({ artistName: 'Metallica' }); // cache miss
		expect(callCount).toBe(3);
	});
});

describe('retries', () => {
	it('retries on 500 and succeeds when server recovers', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/search/artists`, () => {
				callCount++;
				if (callCount < 3) return new HttpResponse(null, { status: 500 });
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({
			apiKey: TEST_API_KEY,
			rps: Infinity,
			retryDelayMs: 0
		});
		const result = await client.searchArtists({ artistName: 'Metallica' });
		expect(callCount).toBe(3);
		expect(result.artist[0].name).toBe('Metallica');
	});

	it('retries on 429', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/search/artists`, () => {
				callCount++;
				if (callCount === 1) return new HttpResponse(null, { status: 429 });
				return HttpResponse.json(searchArtistsFixture);
			})
		);
		const client = createSetlistFmClient({
			apiKey: TEST_API_KEY,
			rps: Infinity,
			retryDelayMs: 0
		});
		const result = await client.searchArtists({ artistName: 'Metallica' });
		expect(callCount).toBe(2);
		expect(result.artist[0].name).toBe('Metallica');
	});

	it('throws after exhausting retries', async () => {
		server.use(
			http.get(`${BASE}/search/artists`, () => new HttpResponse(null, { status: 500 }))
		);
		const client = createSetlistFmClient({
			apiKey: TEST_API_KEY,
			rps: Infinity,
			maxRetries: 2,
			retryDelayMs: 0
		});
		await expect(client.searchArtists({ artistName: 'Metallica' })).rejects.toThrow(
			'setlist.fm API error: 500'
		);
	});

	it('does not retry on 404', async () => {
		let callCount = 0;
		server.use(
			http.get(`${BASE}/setlist/:id`, () => {
				callCount++;
				return new HttpResponse(null, { status: 404 });
			})
		);
		const client = createSetlistFmClient({
			apiKey: TEST_API_KEY,
			rps: Infinity,
			retryDelayMs: 0
		});
		await expect(client.getSetlist('nonexistent')).rejects.toThrow('setlist.fm API error: 404');
		expect(callCount).toBe(1);
	});
});
