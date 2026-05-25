import { describe, expect, it } from 'vitest';
import { parseConcertTsv, tryParseDates } from '../src/lib/server/import.js';

describe('parseConcertTsv', () => {
	it('parses a header row + data rows with pipe delimiter', () => {
		const text = [
			'date|artist|openers|venue|notes|imageURL',
			'05/15/2011|System Of A Down|Gogol Bordello|Shoreline Amphitheatre|SOAD Reunion Tour|http://example.com/x.jpg'
		].join('\n');
		const { rows, malformed } = parseConcertTsv(text);
		expect(malformed).toHaveLength(0);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			line: 2,
			rawDate: '05/15/2011',
			artist: 'System Of A Down',
			openers: 'Gogol Bordello',
			venue: 'Shoreline Amphitheatre'
		});
	});

	it('skips blank lines and a header without "date" header detection ambiguity', () => {
		const text = [
			'date|artist|openers|venue',
			'',
			'05/15/2011|A|B|V',
			'',
			'06/15/2011|C||V2'
		].join('\n');
		const { rows, malformed } = parseConcertTsv(text);
		expect(malformed).toHaveLength(0);
		expect(rows.map((r) => r.line)).toEqual([3, 5]);
		expect(rows[1].openers).toBe('');
	});

	it('flags rows with fewer than 4 fields as malformed', () => {
		const text = ['date|artist|openers|venue', 'liliana eda'].join('\n');
		const { rows, malformed } = parseConcertTsv(text);
		expect(rows).toHaveLength(0);
		expect(malformed).toHaveLength(1);
		expect(malformed[0].line).toBe(2);
		expect(malformed[0].raw).toBe('liliana eda');
	});

	it('flags rows with empty required fields as malformed', () => {
		const text = ['date|artist|openers|venue', '|Periphery||Paradise'].join('\n');
		const { rows, malformed } = parseConcertTsv(text);
		expect(rows).toHaveLength(0);
		expect(malformed).toHaveLength(1);
		expect(malformed[0].reason).toMatch(/missing/);
	});

	it('handles CRLF line endings', () => {
		const text = 'date|artist|openers|venue\r\n05/15/2011|A|B|V\r\n';
		const { rows } = parseConcertTsv(text);
		expect(rows).toHaveLength(1);
		expect(rows[0].rawDate).toBe('05/15/2011');
	});

	it('does not skip the first row when it lacks a "date" header', () => {
		const text = '05/15/2011|A|B|V';
		const { rows } = parseConcertTsv(text);
		expect(rows).toHaveLength(1);
		expect(rows[0].line).toBe(1);
	});
});

describe('tryParseDates', () => {
	it('parses unambiguous US M/D/YYYY', () => {
		expect(tryParseDates('5/15/2011')).toEqual(['2011-05-15']);
		expect(tryParseDates('11/30/2018')).toEqual(['2018-11-30']);
	});

	it('returns two candidates when both M/D and D/M are plausible', () => {
		expect(tryParseDates('05/06/2011')).toEqual(['2011-05-06', '2011-06-05']);
	});

	it('returns only D/M/YYYY when the first number exceeds 12', () => {
		expect(tryParseDates('23/01/2020')).toEqual(['2020-01-23']);
	});

	it('zero-pads day and month', () => {
		expect(tryParseDates('1/2/2020')).toEqual(['2020-01-02', '2020-02-01']);
	});

	it('returns empty array on unparseable input', () => {
		expect(tryParseDates('not a date')).toEqual([]);
		expect(tryParseDates('2020-01-15')).toEqual([]);
	});
});
