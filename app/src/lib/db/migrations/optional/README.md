# `migrations/optional/` - not scanned by the runner

This directory is **not** part of the default migration chain.

`src/lib/db/migrate.ts` lists migrations with a non-recursive `readdir` over
`src/lib/db/migrations/` and matches file names against `^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$`.
A file under `optional/` is therefore never read, never applied, and never recorded in the
`schema_migrations` ledger. Nothing here affects `pnpm db:migrate` or `pnpm start`'s
`--check` head comparison.

## What belongs here

Exactly one thing today: the future `source_chunks.embedding` migration.

`docs/06-DATA-MODEL.md` section 6.8 rule 4 and section 7.2.3 keep `embedding vector(1536)` out of
the base migration:

> `source_chunks.embedding` (`vector(1536)`) is **not** created by the base migration. It is added
> by an optional migration when the embedding upgrade is enabled, behind the same interface, and
> the retrieval path must work with the column absent.

That reading is recorded as decision **A14** in the WP-02 handoff. D38 keeps retrieval on Postgres
full-text search (`source_chunks.search_tsv`) with no separate vector database, and the decisions
register declines pgvector for the MVP. So:

- no `create extension vector` and no reference to the `vector` type appears anywhere in the
  default chain (migrations `0001`-`0010`);
- the retrieval path must work with the column absent, which means the code cannot assume it
  exists even after this optional migration is applied on some other machine.

When the embedding upgrade is actually enabled, the migration goes here, not in the default chain,
and it is applied by an explicit operator action rather than by `pnpm db:migrate`.

## Rules for anything added here

1. **The same migration rules still apply.** `docs/06` section 6.7 is not relaxed by living in this
   directory: forward-only, one logical change per file, `NNNN_<short_description>.sql`, and the
   table's privacy class in a SQL comment (6.7 rule 4).
2. **Do not renumber into the default chain.** A file that the runner has never recorded has no
   ledger row, so moving it into `migrations/` makes it look like a new migration and it is applied
   on the next run. Moving it back is then a checksum you cannot undo without a database reset.
3. **A destructive statement still needs its header note.** 6.7 rule 3 requires a migration that
   drops a column, drops a table or narrows a CHECK to explain in its header what was removed and
   why. This applies here too.
4. **Never a secret.** No API key, no connection string, no value copied from `.env` (C7).
