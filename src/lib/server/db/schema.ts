import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
	doublePrecision
} from 'drizzle-orm/pg-core';

export const attendanceStatusEnum = pgEnum('attendance_status', ['confirmed', 'planned']);

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	displayName: text('display_name').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const artists = pgTable('artists', {
	id: serial('id').primaryKey(),
	setlistfmMbid: text('setlistfm_mbid').notNull().unique(),
	name: text('name').notNull(),
	sortName: text('sort_name').notNull().default(''),
	disambiguation: text('disambiguation').default(''),
	fetchedAt: timestamp('fetched_at').defaultNow().notNull()
});

export const venues = pgTable(
	'venues',
	{
		id: serial('id').primaryKey(),
		setlistfmId: text('setlistfm_id').notNull().unique(),
		name: text('name').notNull(),
		city: text('city').notNull().default(''),
		state: text('state').default(''),
		country: text('country').notNull().default(''),
		lat: doublePrecision('lat'),
		lng: doublePrecision('lng'),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull()
	},
	(t) => [index('venues_lat_lng_idx').on(t.lat, t.lng)]
);

export const tours = pgTable(
	'tours',
	{
		id: serial('id').primaryKey(),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		name: text('name').notNull()
	},
	(t) => [unique('tours_artist_name_unique').on(t.artistId, t.name)]
);

export const shows = pgTable(
	'shows',
	{
		id: serial('id').primaryKey(),
		venueId: integer('venue_id')
			.notNull()
			.references(() => venues.id),
		showDate: date('show_date').notNull(),
		lastSyncedAt: timestamp('last_synced_at')
	},
	(t) => [
		unique('shows_venue_date_unique').on(t.venueId, t.showDate),
		index('shows_show_date_idx').on(t.showDate)
	]
);

export const songs = pgTable(
	'songs',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		normalizedName: text('normalized_name').notNull()
	},
	(t) => [
		index('songs_artist_id_normalized_name_idx').on(t.artistId, t.normalizedName),
		unique('songs_artist_normalized_unique').on(t.artistId, t.normalizedName)
	]
);

export const performances = pgTable(
	'performances',
	{
		id: serial('id').primaryKey(),
		showId: integer('show_id')
			.notNull()
			.references(() => shows.id),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		billingOrder: integer('billing_order').notNull(),
		tourId: integer('tour_id').references(() => tours.id),
		setlistfmSetlistId: text('setlistfm_setlist_id').unique(),
		rawJson: jsonb('raw_json'),
		setlistFetchedAt: timestamp('setlist_fetched_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(t) => [
		unique('performances_show_artist_unique').on(t.showId, t.artistId),
		unique('performances_show_billing_unique').on(t.showId, t.billingOrder),
		index('performances_artist_id_idx').on(t.artistId),
		index('performances_tour_id_idx').on(t.tourId)
	]
);

export const attendances = pgTable(
	'attendances',
	{
		id: serial('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		showId: integer('show_id')
			.notNull()
			.references(() => shows.id),
		attendanceStatus: attendanceStatusEnum('attendance_status').notNull().default('confirmed'),
		notes: text('notes').default(''),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(t) => [
		unique('attendances_user_show_unique').on(t.userId, t.showId),
		index('attendances_user_id_idx').on(t.userId)
	]
);

export const setlistSongs = pgTable(
	'setlist_songs',
	{
		id: serial('id').primaryKey(),
		performanceId: integer('performance_id')
			.notNull()
			.references(() => performances.id),
		songId: integer('song_id')
			.notNull()
			.references(() => songs.id),
		setNumber: integer('set_number').notNull().default(1),
		position: integer('position').notNull(),
		isEncore: boolean('is_encore').notNull().default(false),
		isCover: boolean('is_cover').notNull().default(false),
		coverArtistId: integer('cover_artist_id').references(() => artists.id),
		info: text('info').default('')
	},
	(t) => [
		index('setlist_songs_song_id_idx').on(t.songId),
		index('setlist_songs_performance_id_idx').on(t.performanceId)
	]
);
