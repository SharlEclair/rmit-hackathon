-- 0001_baseline.sql
--
-- Baseline marker (11 WP-01: "empty-but-applied baseline so the migration runner is
-- exercised"). It exists so that `pnpm db:migrate` has at least one file to record and the
-- ledger, the ordering, the checksum guard and the idempotency claim are all provable
-- before any table exists.
--
-- The ledger table itself (`schema_migrations`) is created by the runner
-- (`src/lib/db/migrate.ts`), NOT here: a ledger row written by a migration that the ledger
-- has not yet recorded is circular.
--
-- No schema object is created in this file. Do not add one: a baseline that is edited later
-- is a checksum mismatch on every machine that already applied it (06 section 6.7).
--
-- The first real migration is 0002_core.sql (WP-02).

select 1 as baseline;
