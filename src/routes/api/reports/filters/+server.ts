import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { getReportFilters } from '$lib/server/reports.js';

export async function GET() {
	return json(await getReportFilters(db));
}
