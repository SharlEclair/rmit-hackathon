/**
 * The Postgres connection.
 *
 * **Nothing writes to Postgres except `src/lib/db/`** (`04` S4, property 2). Features call
 * repository functions; they never import this module's driver directly.
 *
 * Query layer: Drizzle ORM over the `postgres` driver (`04` S2.1, D37). Prisma is rejected.
 * Migrations are committed SQL files applied by `migrate.ts`, not by drizzle-kit -- see
 * decision **D74** and the note in `migrate.ts`.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;
export type Database = ReturnType<typeof drizzle>;

let cachedUrl: string | null = null;
let cachedSql: Sql | null = null;
let cachedDb: Database | null = null;

/**
 * Get (and cache) the driver for a connection string.
 *
 * One pool per URL. The URL comes from `config.ts`, which is the only module allowed to
 * read `process.env`.
 */
export function getSql(url: string): Sql {
  if (cachedSql !== null && cachedUrl === url) return cachedSql;
  if (cachedSql !== null) void cachedSql.end({ timeout: 0 });
  cachedSql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // A notice is database chatter, not an application log line. Silence it so a NOTICE
    // can never carry a row value into a log (C7).
    onnotice: () => undefined,
  });
  cachedUrl = url;
  cachedDb = drizzle(cachedSql);
  return cachedSql;
}

/**
 * The Drizzle handle, or a throw when `DATABASE_URL` is unset.
 *
 * `databaseUrl` being `null` is a *degraded* configuration problem, not a fatal one (D77),
 * so the throw happens here, at the point of use, rather than at module load.
 */
export function getDb(databaseUrl: string | null): Database {
  if (databaseUrl === null) {
    throw new Error('DATABASE_URL is not set; refusing to open a database connection');
  }
  getSql(databaseUrl);
  if (cachedDb === null) {
    throw new Error('database handle was not initialised');
  }
  return cachedDb;
}

/**
 * Liveness probe for `/api/health`. Opens one connection and runs one statement.
 *
 * Returns `down` -- never throws -- when `DATABASE_URL` is unset or the server does not
 * answer, because WP-01 requires the process to survive both.
 */
export async function probeDatabase(databaseUrl: string | null): Promise<'up' | 'down'> {
  if (databaseUrl === null) return 'down';
  try {
    await getSql(databaseUrl)`select 1 as ok`;
    return 'up';
  } catch {
    return 'down';
  }
}

/**
 * Release the pool. Called by scripts and by tests so a finished process exits promptly
 * instead of waiting on an idle socket.
 */
export async function closeDb(): Promise<void> {
  const sql = cachedSql;
  cachedSql = null;
  cachedDb = null;
  cachedUrl = null;
  if (sql !== null) await sql.end({ timeout: 5 });
}
