import { json, error } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { artists, performances, setlistSongs } from '$lib/server/db/schema.js';

export async function PATCH({ params, request }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const body = await request.json();
	const { artistName } = body as { artistName?: string };

	if (artistName !== undefined) {
		if (typeof artistName !== 'string' || artistName.trim() === '') {
			throw error(400, 'artistName must be a non-empty string');
		}

		const [perf] = await db
			.select({ artistId: performances.artistId })
			.from(performances)
			.where(eq(performances.id, id));

		if (!perf) throw error(404, 'Performance not found');

		await db
			.update(artists)
			.set({ name: artistName.trim() })
			.where(eq(artists.id, perf.artistId));
	}

	return json({ id });
}

export async function DELETE({ params }) {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(400, 'Invalid ID');

	const [perf] = await db
		.select({ showId: performances.showId })
		.from(performances)
		.where(eq(performances.id, id));

	if (!perf) throw error(404, 'Performance not found');

	await db.transaction(async (tx) => {
		await tx.delete(setlistSongs).where(eq(setlistSongs.performanceId, id));
		await tx.delete(performances).where(eq(performances.id, id));

		// Compact billing orders for remaining performances so labels stay correct
		const remaining = await tx
			.select({ id: performances.id })
			.from(performances)
			.where(eq(performances.showId, perf.showId))
			.orderBy(asc(performances.billingOrder));

		// Two-pass to avoid uniqueness conflicts during renumbering
		for (let i = 0; i < remaining.length; i++) {
			await tx
				.update(performances)
				.set({ billingOrder: -(i + 1) })
				.where(eq(performances.id, remaining[i].id));
		}
		for (let i = 0; i < remaining.length; i++) {
			await tx
				.update(performances)
				.set({ billingOrder: i })
				.where(eq(performances.id, remaining[i].id));
		}
	});

	return json({ id });
}
