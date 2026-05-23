import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { users } from '../src/lib/server/db/schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = postgres(url);
const db = drizzle(client);

await migrate(db, { migrationsFolder: './drizzle/migrations' });

await db
	.insert(users)
	.values({ displayName: 'Helicon User' })
	.onConflictDoNothing();

console.log('Seed complete.');
await client.end();
