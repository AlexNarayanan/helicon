import type { DB } from './db/index.js';
import type { SetlistFmClient } from './setlistfm/client.js';
import type { SetlistFmSetlist } from './setlistfm/types.js';
import { parseSetlistDate, saveAttendanceFromSeed, searchSetlists } from './attendances.js';

export interface ParsedRow {
	line: number;
	rawDate: string;
	artist: string;
	openers: string;
	venue: string;
}

export interface MalformedRow {
	line: number;
	raw: string;
	reason: string;
}

export type ImportResult =
	| {
			status: 'ok';
			line: number;
			artist: string;
			date: string;
			venue: string;
			attendanceId: number;
			showId: number;
			performanceCount: number;
	  }
	| {
			status: 'not_found' | 'error';
			line: number;
			artist: string;
			date: string;
			venue: string;
			reason: string;
	  };

const MAX_DATE_DRIFT_DAYS = 2;

export function parseConcertTsv(text: string): {
	rows: ParsedRow[];
	malformed: MalformedRow[];
} {
	const rows: ParsedRow[] = [];
	const malformed: MalformedRow[] = [];
	const lines = text.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const lineNumber = i + 1;
		if (raw.trim() === '') continue;

		const fields = raw.split('|');

		if (i === 0 && fields[0]?.trim().toLowerCase() === 'date') continue;

		if (fields.length < 4) {
			malformed.push({
				line: lineNumber,
				raw,
				reason: 'fewer than 4 pipe-delimited fields'
			});
			continue;
		}

		const [rawDate, artist, openers, venue] = fields;
		if (!rawDate.trim() || !artist.trim() || !venue.trim()) {
			malformed.push({
				line: lineNumber,
				raw,
				reason: 'missing required field (date, artist, or venue)'
			});
			continue;
		}

		rows.push({
			line: lineNumber,
			rawDate: rawDate.trim(),
			artist: artist.trim(),
			openers: openers.trim(),
			venue: venue.trim()
		});
	}

	return { rows, malformed };
}

/**
 * Returns YYYY-MM-DD candidates for a raw date string. The benchmark file is
 * mostly M/D/YYYY (US) but at least one row uses D/M/YYYY, so when both
 * orderings are plausible we return both and let the caller try each.
 */
export function tryParseDates(raw: string): string[] {
	const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (!m) return [];
	const a = +m[1];
	const b = +m[2];
	const year = m[3];
	const pad = (n: number) => String(n).padStart(2, '0');
	const candidates: string[] = [];

	if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
		candidates.push(`${year}-${pad(a)}-${pad(b)}`);
	}
	if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
		const flipped = `${year}-${pad(b)}-${pad(a)}`;
		if (!candidates.includes(flipped)) candidates.push(flipped);
	}
	return candidates;
}

function dateDistanceDays(a: string, b: string): number {
	const [ay, am, ad] = a.split('-').map(Number);
	const [by, bm, bd] = b.split('-').map(Number);
	return Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000;
}

function withinDriftWindow(setlist: SetlistFmSetlist, targetDate: string): boolean {
	return (
		dateDistanceDays(parseSetlistDate(setlist.eventDate), targetDate) <= MAX_DATE_DRIFT_DAYS
	);
}

/**
 * setlist.fm's artist search is brittle for popular short names like "Primus"
 * or "Devin Townsend" — collaborations and tribute acts crowd out the canonical
 * MBID. When the artist path fails, fall back to searching by venue+date and
 * matching the artist name from the results. Tries the top 3 venue candidates
 * because names like "House of Blues" map to several entries (renames, alt
 * spellings).
 */
async function findBestMatchViaVenue(
	client: SetlistFmClient,
	row: ParsedRow,
	targetDate: string
): Promise<SetlistFmSetlist | undefined> {
	const [y, m, d] = targetDate.split('-');
	const sfDate = `${d}-${m}-${y}`;

	const artistLower = row.artist.toLowerCase();
	const artistTokens = artistLower.split(/\s+/).filter((t) => t.length >= 3);
	const artistMatches = (s: SetlistFmSetlist): boolean => {
		if (!withinDriftWindow(s, targetDate)) return false;
		const n = s.artist.name.toLowerCase();
		if (n.includes(artistLower) || artistLower.includes(n)) return true;
		return artistTokens.length > 0 && artistTokens.every((t) => n.includes(t));
	};

	// One free-text venueName + date call. Cheaper and more reliable than
	// enumerating venue ids — for popular short names like "Orpheum Theater",
	// searchVenues returns dozens of unrelated venues in arbitrary order, and
	// the canonical match (e.g. Boston Orpheum, page-2 index-5) sits past any
	// reasonable candidate cap.
	try {
		const direct = await client.searchSetlists({ venueName: row.venue, date: sfDate });
		return direct.setlist.find(artistMatches);
	} catch (err) {
		if (err instanceof Error && err.message.includes('404')) return undefined;
		throw err;
	}
}

async function findBestMatch(
	client: SetlistFmClient,
	row: ParsedRow,
	targetDate: string
): Promise<SetlistFmSetlist | undefined> {
	const withVenue = await searchSetlists(client, {
		artistName: row.artist,
		date: targetDate,
		venueName: row.venue
	});
	const acceptable = withVenue.find((s) => withinDriftWindow(s, targetDate));
	if (acceptable) return acceptable;

	if (row.openers) {
		// Maybe the headliner is misspelled or never posted a setlist. Try the
		// first opener instead — they were at the same venue on the same date.
		const firstOpener = row.openers.split(',')[0]?.trim();
		if (firstOpener) {
			const viaOpener = await searchSetlists(client, {
				artistName: firstOpener,
				date: targetDate,
				venueName: row.venue
			});
			const opener = viaOpener.find((s) => withinDriftWindow(s, targetDate));
			if (opener) return opener;
		}
	}

	return findBestMatchViaVenue(client, row, targetDate);
}

export async function importOneRow(
	db: DB,
	client: SetlistFmClient,
	row: ParsedRow,
	userId: number
): Promise<ImportResult> {
	const dateCandidates = tryParseDates(row.rawDate);
	if (dateCandidates.length === 0) {
		return {
			status: 'error',
			line: row.line,
			artist: row.artist,
			date: row.rawDate,
			venue: row.venue,
			reason: `unparseable date: ${row.rawDate}`
		};
	}

	let matched: { setlist: SetlistFmSetlist; targetDate: string } | undefined;

	for (const targetDate of dateCandidates) {
		try {
			const setlist = await findBestMatch(client, row, targetDate);
			if (setlist) {
				matched = { setlist, targetDate };
				break;
			}
		} catch (err) {
			return {
				status: 'error',
				line: row.line,
				artist: row.artist,
				date: targetDate,
				venue: row.venue,
				reason: err instanceof Error ? err.message : String(err)
			};
		}
	}

	if (!matched) {
		return {
			status: 'not_found',
			line: row.line,
			artist: row.artist,
			date: dateCandidates[0],
			venue: row.venue,
			reason: `no setlist.fm match for ${row.artist} on ${dateCandidates.join(' or ')} at ${row.venue}`
		};
	}

	try {
		const result = await saveAttendanceFromSeed(db, client, {
			seedSetlistId: matched.setlist.id,
			status: 'confirmed',
			userId
		});
		return {
			status: 'ok',
			line: row.line,
			artist: row.artist,
			date: parseSetlistDate(matched.setlist.eventDate),
			venue: matched.setlist.venue.name,
			attendanceId: result.attendanceId,
			showId: result.showId,
			performanceCount: result.performanceCount
		};
	} catch (err) {
		return {
			status: 'error',
			line: row.line,
			artist: row.artist,
			date: matched.targetDate,
			venue: row.venue,
			reason: err instanceof Error ? err.message : String(err)
		};
	}
}
