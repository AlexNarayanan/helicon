CREATE TYPE "public"."attendance_status" AS ENUM('confirmed', 'planned');--> statement-breakpoint
CREATE TABLE "artists" (
	"id" serial PRIMARY KEY NOT NULL,
	"setlistfm_mbid" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text DEFAULT '' NOT NULL,
	"disambiguation" text DEFAULT '',
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artists_setlistfm_mbid_unique" UNIQUE("setlistfm_mbid")
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"venue_id" integer NOT NULL,
	"show_date" date NOT NULL,
	"notes" text DEFAULT '',
	"setlistfm_setlist_id" text,
	"setlist_fetched_at" timestamp,
	"attendance_status" "attendance_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setlist_songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"setlist_id" integer NOT NULL,
	"song_id" integer NOT NULL,
	"set_number" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"is_encore" boolean DEFAULT false NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"cover_artist_id" integer,
	"info" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "setlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_id" integer NOT NULL,
	"raw_json" jsonb NOT NULL,
	"tour_name" text DEFAULT '',
	CONSTRAINT "setlists_attendance_id_unique" UNIQUE("attendance_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"artist_id" integer NOT NULL,
	"normalized_name" text NOT NULL,
	CONSTRAINT "songs_artist_normalized_unique" UNIQUE("artist_id","normalized_name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"setlistfm_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '',
	"country" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venues_setlistfm_id_unique" UNIQUE("setlistfm_id")
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_cover_artist_id_artists_id_fk" FOREIGN KEY ("cover_artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendances_user_id_show_date_idx" ON "attendances" USING btree ("user_id","show_date");--> statement-breakpoint
CREATE INDEX "setlist_songs_song_id_idx" ON "setlist_songs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "songs_artist_id_normalized_name_idx" ON "songs" USING btree ("artist_id","normalized_name");--> statement-breakpoint
CREATE INDEX "venues_lat_lng_idx" ON "venues" USING btree ("lat","lng");