import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { getMostCommonVenues } from '$lib/server/reports.js';
import {
	getMostSeenArtists,
	getShowCountsByDay,
	getCoPerformerPairs,
	getCumulativeDiscoveries
} from '$lib/server/insights.js';

const INSIGHT_TYPES = [
	'topArtists',
	'topVenues',
	'calendar',
	'coPerformers',
	'cumulative'
] as const;

type InsightType = (typeof INSIGHT_TYPES)[number];

export async function GET({ url }) {
	const type = url.searchParams.get('type') as InsightType | null;
	if (!type || !INSIGHT_TYPES.includes(type)) {
		throw error(400, `type must be one of: ${INSIGHT_TYPES.join(', ')}`);
	}

	switch (type) {
		case 'topArtists':
			return json(await getMostSeenArtists(db));
		case 'topVenues':
			return json(await getMostCommonVenues(db, {}));
		case 'calendar':
			return json(await getShowCountsByDay(db));
		case 'coPerformers':
			return json(await getCoPerformerPairs(db));
		case 'cumulative':
			return json(await getCumulativeDiscoveries(db));
	}
}
