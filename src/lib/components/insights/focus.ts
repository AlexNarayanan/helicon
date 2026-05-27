export type Focus =
	| { kind: 'artists'; names: string[]; originShowId?: number }
	| { kind: 'venue'; venueId: number }
	| { kind: 'month'; month: number };

export function focusEquals(a: Focus | null, b: Focus | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === 'artists' && b.kind === 'artists') {
		if (a.originShowId !== b.originShowId) return false;
		if (a.names.length !== b.names.length) return false;
		for (let i = 0; i < a.names.length; i++) if (a.names[i] !== b.names[i]) return false;
		return true;
	}
	if (a.kind === 'venue' && b.kind === 'venue') return a.venueId === b.venueId;
	if (a.kind === 'month' && b.kind === 'month') return a.month === b.month;
	return false;
}
