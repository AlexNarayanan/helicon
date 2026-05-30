import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
	getMostPlayedSongs,
	getMostRareSongs,
	getMostCommonVenues,
	getArtistsBothOpenerAndHeadliner,
	getOpenersPerShowDistribution,
	type ReportFilters
} from '$lib/server/reports.js';

const REPORT_TYPES = [
	'mostPlayedSongs',
	'mostRareSongs',
	'mostCommonVenues',
	'bothOpenerAndHeadliner',
	'openersDistribution'
] as const;

type ReportType = (typeof REPORT_TYPES)[number];

function parseFilters(url: URL): ReportFilters {
	const artistIds = url.searchParams
		.getAll('artistId')
		.map((v) => parseInt(v, 10))
		.filter((v) => !isNaN(v));
	const venueIds = url.searchParams
		.getAll('venueId')
		.map((v) => parseInt(v, 10))
		.filter((v) => !isNaN(v));
	const yearStart = url.searchParams.get('yearStart');
	const yearEnd = url.searchParams.get('yearEnd');
	return {
		artistIds: artistIds.length ? artistIds : undefined,
		venueIds: venueIds.length ? venueIds : undefined,
		yearStart: yearStart ? parseInt(yearStart, 10) : undefined,
		yearEnd: yearEnd ? parseInt(yearEnd, 10) : undefined
	};
}

export async function GET({ url }) {
	const type = url.searchParams.get('type') as ReportType | null;
	if (!type || !REPORT_TYPES.includes(type)) {
		throw error(400, `type must be one of: ${REPORT_TYPES.join(', ')}`);
	}

	const filters = parseFilters(url);

	switch (type) {
		case 'mostPlayedSongs':
			return json(await getMostPlayedSongs(db, filters));
		case 'mostRareSongs':
			return json(await getMostRareSongs(db, filters));
		case 'mostCommonVenues':
			return json(await getMostCommonVenues(db, filters));
		case 'bothOpenerAndHeadliner':
			return json(await getArtistsBothOpenerAndHeadliner(db));
		case 'openersDistribution':
			return json(await getOpenersPerShowDistribution(db));
	}
}
