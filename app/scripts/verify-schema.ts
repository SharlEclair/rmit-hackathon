#!/usr/bin/env node
/**
 * Schema-drift guard.
 *
 * Decision **D74** makes the committed SQL files the schema of record, and
 * `src/lib/db/schema.ts` exists only so queries are typed. That split has one failure mode
 * worth a gate: someone adds a column to a migration, or renames one in the Drizzle
 * definition, and the two quietly disagree. TypeScript cannot see it -- both sides are
 * internally consistent -- and the symptom appears later as a runtime `column does not
 * exist` in whatever feature touched it.
 *
 * This script compares the two representations and fails on:
 *   - a table in `schema.ts` that the database does not have, or vice versa;
 *   - a column in `schema.ts` that the table does not have, or vice versa.
 *
 * Run it after `pnpm db:migrate`:
 *
 *     pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
 *
 * It reads the database only. It never writes, and it never prints a connection string.
 */

import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import { getConfig } from '../src/lib/config';
import * as schema from '../src/lib/db/schema';

/** The migration ledger, created by the runner and deliberately absent from `schema.ts`. */
const LEDGER = 'schema_migrations';

interface DbColumn {
  table_name: string;
  column_name: string;
}

function isDrizzleTable(value: unknown): value is PgTable {
  if (typeof value !== 'object' || value === null) return false;
  return Object.getOwnPropertySymbols(value).some(
    (symbol) => symbol.toString() === 'Symbol(drizzle:Name)',
  );
}

function collectSchemaTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!isDrizzleTable(value)) continue;
    const name = getTableName(value);
    const columns = new Set(Object.values(getTableColumns(value)).map((column) => column.name));
    if (tables.has(name)) {
      throw new Error(`schema.ts defines the table "${name}" more than once`);
    }
    tables.set(name, columns);
  }
  return tables;
}

async function main(): Promise<void> {
  const config = getConfig();
  if (config.databaseUrl === null) {
    process.stderr.write('CONFIG_INVALID: DATABASE_URL\n');
    process.exit(78);
  }

  const declarared = collectSchemaTables();
  if (declarared.size === 0) {
    process.stderr.write('schema.ts exported no Drizzle tables; nothing to compare\n');
    process.exit(1);
  }

  const sql = postgres(config.databaseUrl, { max: 1, onnotice: () => undefined });
  const problems: string[] = [];
  try {
    // Base tables only. `information_schema.columns` also lists views, and the two views in
    // `0009_views.sql` are deliberately absent from `schema.ts`: Drizzle does not need them for
    // typed queries, and declaring one would imply it is writable. Counting them here would make
    // this gate fail on a correct schema -- which it did, on its first run.
    const rows = await sql<DbColumn[]>`
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.table_name <> ${LEDGER}
      order by c.table_name, c.column_name
    `;

    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      const existing = actual.get(row.table_name);
      if (existing === undefined) actual.set(row.table_name, new Set([row.column_name]));
      else existing.add(row.column_name);
    }

    for (const [table, columns] of declarared) {
      const dbColumns = actual.get(table);
      if (dbColumns === undefined) {
        problems.push(`table "${table}" is in schema.ts but not in the database`);
        continue;
      }
      for (const column of columns) {
        if (!dbColumns.has(column)) {
          problems.push(`${table}.${column} is in schema.ts but not in the database`);
        }
      }
      for (const column of dbColumns) {
        if (!columns.has(column)) {
          problems.push(`${table}.${column} is in the database but not in schema.ts`);
        }
      }
      actual.delete(table);
    }
    for (const table of actual.keys()) {
      problems.push(`table "${table}" is in the database but not in schema.ts`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (problems.length > 0) {
    process.stderr.write(`SCHEMA_DRIFT: ${problems.length} difference(s) between the SQL and schema.ts\n`);
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `schema drift: none (${declarared.size} tables, ` +
      `${[...declarared.values()].reduce((total, columns) => total + columns.size, 0)} columns)\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
