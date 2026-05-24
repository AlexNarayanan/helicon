import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { performances } from '$lib/server/db/schema.js';

export async function POST({ params, request }) {
	const showId = parseInt(params.id);
	if (isNaN(showId)) throw error(400, 'Invalid ID');

	const body = await request.json();
	const { performanceIds } = body as { performanceIds?: number[] };

	if (!Array.isArray(performanceIds) || performanceIds.length === 0) {
		throw error(400, 'performanceIds must be a non-empty array');
	}

	// Verify all IDs belong to this show
	const existing = await db
		.select({ id: performances.id })
		.from(performances)
		.where(eq(performances.showId, showId));

	const existingIds = new Set(existing.map((p) => p.id));
	if (!performanceIds.every((id) => existingIds.has(id))) {
		throw error(400, 'Some performance IDs do not belong to this show');
	}

	const n = performanceIds.length;

	// Two-pass transaction: temp negative values avoid uniqueness conflicts
	await db.transaction(async (tx) => {
		for (let i = 0; i < n; i++) {
			await tx
				.update(performances)
				.set({ billingOrder: -(i + 1) })
				.where(eq(performances.id, performanceIds[i]));
		}
		// performanceIds[0] = headliner → highest billingOrder (n-1)
		for (let i = 0; i < n; i++) {
			await tx
				.update(performances)
				.set({ billingOrder: n - 1 - i })
				.where(eq(performances.id, performanceIds[i]));
		}
	});

	return json({ ok: true });
}
