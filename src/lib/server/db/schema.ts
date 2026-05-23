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

export const attendances = pgTable(
	'attendances',
	{
		id: serial('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		venueId: integer('venue_id')
			.notNull()
			.references(() => venues.id),
		showDate: date('show_date').notNull(),
		notes: text('notes').default(''),
		setlistfmSetlistId: text('setlistfm_setlist_id'),
		setlistFetchedAt: timestamp('setlist_fetched_at'),
		attendanceStatus: attendanceStatusEnum('attendance_status').notNull().default('confirmed'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(t) => [index('attendances_user_id_show_date_idx').on(t.userId, t.showDate)]
);

export const setlists = pgTable('setlists', {
	id: serial('id').primaryKey(),
	attendanceId: integer('attendance_id')
		.notNull()
		.unique()
		.references(() => attendances.id),
	rawJson: jsonb('raw_json').notNull(),
	tourName: text('tour_name').default('')
});

export const setlistSongs = pgTable(
	'setlist_songs',
	{
		id: serial('id').primaryKey(),
		setlistId: integer('setlist_id')
			.notNull()
			.references(() => setlists.id),
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
	(t) => [index('setlist_songs_song_id_idx').on(t.songId)]
);
