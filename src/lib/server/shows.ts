import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { performances, shows } from './db/schema.js';
import { persistShowFromSetlists } from './attendances.js';
import type { SetlistFmClient } from './setlistfm/client.js';
import type { SetlistFmSetlist } from './setlistfm/types.js';

export async function resyncShow(
	db: DB,
	client: SetlistFmClient,
	showId: number
): Promise<{ performanceCount: number }> {
	const [show] = await db
		.select({ id: shows.id, venueId: shows.venueId, showDate: shows.showDate })
		.from(shows)
		.where(eq(shows.id, showId));
	if (!show) throw new Error(`resyncShow: show ${showId} not found`);

	const existing = await db
		.select({ setlistfmId: performances.setlistfmSetlistId, rawJson: performances.rawJson })
		.from(performances)
		.where(eq(performances.showId, showId));

	const venueSetlistfmId =
		(existing.find((p) => p.rawJson) ?.rawJson as unknown as SetlistFmSetlist | undefined)?.venue.id;

	const eventDateForApi = show.showDate.split('-').reverse().join('-');

	const discoveredFromApi = venueSetlistfmId
		? await client.searchAllSetlistsAtVenueOnDate(venueSetlistfmId, eventDateForApi)
		: [];

	const byId = new Map<string, SetlistFmSetlist>();
	for (const p of existing) {
		if (p.rawJson) {
			const raw = p.rawJson as unknown as SetlistFmSetlist;
			byId.set(raw.id, raw);
		}
	}
	for (const s of discoveredFromApi) byId.set(s.id, s);

	const allSetlists = [...byId.values()];
	if (allSetlists.length === 0) return { performanceCount: 0 };

	const { performanceCount } = await persistShowFromSetlists(db, allSetlists);
	return { performanceCount };
}
