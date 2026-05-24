// Plain-JS migration + seed runner — used by the production entrypoint.
// Runs migrations then ensures the sentinel user (id=1) exists.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const client = postgres(url);
const db = drizzle(client);

await migrate(db, { migrationsFolder: resolve(__dirname, '../drizzle/migrations') });

await client`
  INSERT INTO users (display_name) VALUES ('Helicon User')
  ON CONFLICT DO NOTHING
`;

console.log('Migrations and seed complete.');
await client.end();
