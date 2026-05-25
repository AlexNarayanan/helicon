import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { createSetlistFmClient } from '$lib/server/setlistfm/client.js';
import { importOneRow, parseConcertTsv } from '$lib/server/import.js';

const SENTINEL_USER_ID = 1;

export async function POST({ request }) {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'file field is required');

	const text = await file.text();
	const { rows, malformed } = parseConcertTsv(text);

	const client = createSetlistFmClient();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const emit = (obj: unknown) => {
				controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
			};

			emit({ type: 'start', totalRows: rows.length, malformedCount: malformed.length });

			let ok = 0;
			let notFound = 0;
			let errored = 0;

			for (const m of malformed) {
				emit({ type: 'malformed', ...m });
			}

			for (const row of rows) {
				let result;
				try {
					result = await importOneRow(db, client, row, SENTINEL_USER_ID);
				} catch (err) {
					result = {
						status: 'error' as const,
						line: row.line,
						artist: row.artist,
						date: row.rawDate,
						venue: row.venue,
						reason: err instanceof Error ? err.message : String(err)
					};
				}
				if (result.status === 'ok') ok++;
				else if (result.status === 'not_found') notFound++;
				else errored++;
				emit({ type: 'row', ...result });
			}

			emit({
				type: 'summary',
				total: rows.length,
				ok,
				notFound,
				error: errored,
				malformed: malformed.length,
				successRate: rows.length === 0 ? 0 : ok / rows.length
			});
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no'
		}
	});
}
