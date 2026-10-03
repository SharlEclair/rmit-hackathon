/**
 * The transaction seam for the feature layer.
 *
 * `docs/handoff/01-STATE.md` section 5 item 4: "`src/lib/db/queries/**` is the only place SQL may
 * live. Features call repository functions. **Every write takes a transaction**, because trap T7
 * requires the event and the state change it describes to commit together."
 *
 * A feature therefore needs an `Executor`, and it cannot get one by importing the driver --
 * `04-INTERFACES.md` section 3 freezes `getSql`/`getDb` as the only driver surface and
 * `04-TECH-ARCHITECTURE.md` section 4 property 2 says nothing outside `src/lib/db/` writes to
 * Postgres. This module is the one place that bridges the two: it opens the transaction and hands
 * the feature a handle it can only use by calling repository functions.
 *
 * Why a helper rather than `getDb(config.databaseUrl)` at each call site: the URL comes from
 * `config.ts`, and a call site that reads the environment itself would be a second `process.env`
 * reader (forbidden, WP-01). Reading the config here keeps that rule intact.
 */

import { getConfig } from '@/lib/config';

import { getSql } from './client';
import type { Executor } from './queries/courses';

/**
 * Run `work` inside one transaction. Rolls back on throw, commits on return.
 *
 * `databaseUrl` unset is a degraded configuration (D77), not a fatal one, so this throws at the
 * point of use with a route-mappable message rather than at module load.
 */
export async function withTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
  const config = getConfig();
  if (config.databaseUrl === null) {
    throw new Error('DATABASE_URL is not set; refusing to open a database connection');
  }
  const sql = getSql(config.databaseUrl);
  const result = await sql.begin(async (tx) => work(tx));
  return result as T;
}
