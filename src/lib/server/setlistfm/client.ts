import type {
	SearchArtistsResponse,
	SearchSetlistsResponse,
	SearchVenuesResponse,
	SetlistFmSetlist
} from './types.js';

const BASE_URL = 'https://api.setlist.fm/rest/1.0';

class LRUCache {
	private cache = new Map<string, unknown>();
	private readonly maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	get(key: string): unknown {
		if (!this.cache.has(key)) return undefined;
		const value = this.cache.get(key);
		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key: string, value: unknown): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value!;
			this.cache.delete(firstKey);
		}
		this.cache.set(key, value);
	}
}

class RateLimiter {
	private lastRequestTime = 0;
	private readonly minIntervalMs: number;

	constructor(rps: number) {
		this.minIntervalMs = Number.isFinite(rps) ? 1000 / rps : 0;
	}

	async acquire(): Promise<void> {
		if (this.minIntervalMs === 0) return;
		const now = Date.now();
		const wait = this.lastRequestTime + this.minIntervalMs - now;
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		this.lastRequestTime = Date.now();
	}
}

export interface SetlistFmClientOptions {
	apiKey?: string;
	rps?: number;
	cacheSize?: number;
	maxRetries?: number;
	retryDelayMs?: number;
}

export function createSetlistFmClient(options: SetlistFmClientOptions = {}) {
	const apiKey = options.apiKey ?? process.env.SETLISTFM_API_KEY ?? '';
	const rateLimiter = new RateLimiter(options.rps ?? 2);
	const cache = new LRUCache(options.cacheSize ?? 200);
	const maxRetries = options.maxRetries ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 1000;

	async function fetchJson<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
		const url = new URL(`${BASE_URL}${path}`);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, String(v));
		}
		const cacheKey = url.toString();

		const cached = cache.get(cacheKey);
		if (cached !== undefined) return cached as T;

		await rateLimiter.acquire();

		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** (attempt - 1)));
			}

			const response = await fetch(url.toString(), {
				headers: {
					'x-api-key': apiKey,
					Accept: 'application/json'
				}
			});

			if (response.ok) {
				const data = (await response.json()) as T;
				cache.set(cacheKey, data);
				return data;
			}

			if (response.status === 429 || response.status >= 500) {
				lastError = new Error(`setlist.fm API error: ${response.status} ${response.statusText}`);
				continue;
			}

			throw new Error(`setlist.fm API error: ${response.status} ${response.statusText}`);
		}

		throw lastError ?? new Error('setlist.fm request failed');
	}

	return {
		searchArtists(params: { artistName: string; page?: number }): Promise<SearchArtistsResponse> {
			return fetchJson('/search/artists', { artistName: params.artistName, p: params.page ?? 1 });
		},

		searchVenues(params: {
			name?: string;
			cityName?: string;
			stateCode?: string;
			country?: string;
			page?: number;
		}): Promise<SearchVenuesResponse> {
			const raw: Record<string, string | number> = { p: params.page ?? 1 };
			if (params.name) raw.name = params.name;
			if (params.cityName) raw.cityName = params.cityName;
			if (params.stateCode) raw.stateCode = params.stateCode;
			if (params.country) raw.country = params.country;
			return fetchJson('/search/venues', raw);
		},

		searchSetlists(params: {
			artistMbid?: string;
			venueId?: string;
			venueName?: string;
			date?: string;
			year?: number;
			page?: number;
		}): Promise<SearchSetlistsResponse> {
			const raw: Record<string, string | number> = { p: params.page ?? 1 };
			if (params.artistMbid) raw.artistMbid = params.artistMbid;
			if (params.venueId) raw.venueId = params.venueId;
			if (params.venueName) raw.venueName = params.venueName;
			if (params.date) raw.date = params.date;
			if (params.year) raw.year = params.year;
			return fetchJson('/search/setlists', raw);
		},

		async searchAllSetlistsAtVenueOnDate(
			venueId: string,
			date: string,
			maxPages = 5
		): Promise<SetlistFmSetlist[]> {
			const all: SetlistFmSetlist[] = [];
			for (let page = 1; page <= maxPages; page++) {
				let response: SearchSetlistsResponse;
				try {
					response = await this.searchSetlists({ venueId, date, page });
				} catch (err) {
					// setlist.fm returns 404 when there are zero results — treat as empty page
					if (err instanceof Error && err.message.includes('404')) break;
					throw err;
				}
				all.push(...response.setlist);
				if (response.setlist.length < response.itemsPerPage) break;
				if (page === maxPages) {
					console.warn(
						`searchAllSetlistsAtVenueOnDate: hit MAX_PAGES=${maxPages} for venue ${venueId} on ${date}`
					);
				}
			}
			return all;
		},

		getSetlist(id: string): Promise<SetlistFmSetlist> {
			return fetchJson(`/setlist/${id}`);
		}
	};
}

export type SetlistFmClient = ReturnType<typeof createSetlistFmClient>;
