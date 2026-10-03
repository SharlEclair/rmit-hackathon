import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The **structural** half of the anonymity contract: `06-DATA-MODEL.md` A-ID-1, A-ID-2, A-ID-5 and
 * A-ID-6.
 *
 * The behavioural half lives where it can be exercised -- `anon-identity.test.ts` for the derivation,
 * `scripts/verify-discussion.ts` for the routes against a database. This file asserts the properties
 * that no runtime test can, because they are properties of *which module mentions what*:
 *
 *   - **A-ID-2**: "Exactly one module may read or write `anon_identities`: the anonymous identity
 *     service (`src/features/discussion/anon-identity.ts`). No other module may import it." A second
 *     reader is the leak, and it leaks through a join rather than through a field, so a response-shape
 *     test would not see it.
 *   - **A-ID-6**: "`analytics_events` and `guardrail_logs` may not reference `anon_identities` or `users`
 *     by foreign key, and may not store a value derived from an author's pseudonym." The analytics
 *     module is the one place a pseudonym legitimately exists, and it must be the **analytics** one.
 *   - **A-ID-5**: no tutor response type carries an author identifier. A type-level guarantee, so the
 *     assertion is over the type declarations themselves.
 *
 * These are string searches on purpose, in the tradition of `scripts/check-c8.mjs`: "a cleverer matcher
 * is a matcher someone can reason around". **Comments are stripped first**, which is the one refinement,
 * and it is what keeps the gate honest rather than noisy: a doc comment that *names* the identity table
 * to say "do not join it" is not a reader, and a gate that failed on it would push writers to describe
 * the constraint without quoting it -- which makes the code less clear, not safer. What the gate
 * protects is **executable code**: a SQL statement, a table helper or an import.
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_ROOT = join(APP_ROOT, 'src');

const ANON_SERVICE = 'anon-identity.ts';
/** The one file allowed to name the identity table in executable code. */
const ANON_TABLE = 'anon_identities';
/** The analytics service, which owns the *other* pseudonym and must never touch this one. */
const ANALYTICS_OWNER = join('lib', 'db', 'queries', 'analytics.ts');

/**
 * Block and line comments removed, so a prose mention is not read as a use.
 *
 * The same helper `tests/components/design-law.test.ts` uses for the same reason: a gate that cannot
 * tell a comment from code forces the comment to be written badly.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
      continue;
    }
    if (full.endsWith('.ts') || full.endsWith('.tsx')) found.push(full);
  }
  return found;
}

const files = walk(SRC_ROOT);
const sourceOf = (file: string): string => readFileSync(file, 'utf8');

describe('A-ID-2: exactly one module reads or writes anon_identities', () => {
  it('names the table in exactly one runtime file, and it is the anonymous identity service', () => {
    // Two files may mention the name without being a reader, and both are type-level:
    // `lib/db/schema.ts` declares the Drizzle table (`export const anonIdentities = pgTable(...)`, a
    // declaration with no query) and `lib/db/migrations/**` is the schema of record. Everything else
    // is a candidate reader, and there is exactly one.
    const namers = files
      .filter((file) => stripComments(sourceOf(file)).includes(ANON_TABLE))
      .map((file) => relative(APP_ROOT, file).replaceAll('\\', '/'))
      .filter((path) => path !== 'src/lib/db/schema.ts' && !path.startsWith('src/lib/db/migrations/'));

    expect(namers).toEqual(['src/features/discussion/anon-identity.ts']);
    expect(sourceOf(join(SRC_ROOT, 'features', 'discussion', ANON_SERVICE))).toContain(
      'export async function identityFor',
    );
  });

  it('the Drizzle declaration is a declaration and not a query', () => {
    // The exemption above is only sound while the schema file contains no query against the table. A
    // `select ... from anonIdentities` there would make the schema a reader, which is the leak.
    const schema = stripComments(sourceOf(join(SRC_ROOT, 'lib', 'db', 'schema.ts')));
    const declaration = /export const anonIdentities = pgTable\(/.exec(schema);
    expect(declaration).not.toBeNull();
    expect(/\.from\(\s*anonIdentities\s*\)/.test(schema)).toBe(false);
    expect(/select\([\s\S]{0,200}?anonIdentities/.test(schema)).toBe(false);
  });

  it('is imported by nothing except the routes this feature owns', () => {
    // A-ID-2's second half. The allowance is narrow on purpose: `features/discussion/**` (the feature
    // itself) and `app/{api,student,tutor}/**` (the routes and pages that call it). A **query-layer**
    // module importing it is the failure this catches, because a query layer is shared by every caller
    // and would put the join back.
    const importers = files.filter((file) => {
      const path = relative(APP_ROOT, file).replaceAll('\\', '/');
      if (path.startsWith('src/features/discussion/')) return false;
      if (!path.startsWith('src/app/')) return false;
      return /from\s+['"][^'"]*anon-identity['"]/.test(sourceOf(file));
    });
    for (const importer of importers) {
      const path = relative(APP_ROOT, importer).replaceAll('\\', '/');
      expect(
        path.startsWith('src/app/api/student/') ||
          path.startsWith('src/app/api/tutor/') ||
          path.startsWith('src/app/student/') ||
          path.startsWith('src/app/tutor/'),
      ).toBe(true);
    }
  });
});

describe('A-ID-6: the analytics and guardrail modules never touch an author identity', () => {
  it('the analytics service does not name anon_identities', () => {
    const analytics = stripComments(sourceOf(join(SRC_ROOT, ANALYTICS_OWNER)));
    expect(analytics).not.toContain(ANON_TABLE);
    // It owns the domain-separated pseudonym, and the two must never be conflated (fact 4). Comment
    // stripping is what makes this assertion about the literal rather than about a doc mention.
    expect(analytics).toContain('aa:ana:v1|');
    expect(analytics).not.toContain('aa:anon:v1|');
  });

  it('no migrated table in the identity-free class carries an author column', () => {
    // A-ID-6 as a schema property: the columns that must not exist on `analytics_events`,
    // `milestone_metrics`, `assignment_metrics` or `guardrail_logs`. The migration files are the
    // schema of record, so the assertion is over them rather than over a live database (this suite
    // runs with none).
    const migrations = join(SRC_ROOT, 'lib', 'db', 'migrations');
    const identityFree = ['analytics_events', 'milestone_metrics', 'assignment_metrics', 'guardrail_logs'];
    const forbidden = [
      'student_id',
      'user_id',
      'anon_identity_id',
      'author_user_id',
      'display_name',
      'email',
      'request_text',
      'response_text',
      'message_body',
      'extracted_text',
      'ip_address',
      'user_agent',
      'session_token',
      'cookie',
      'filename',
      'original_filename',
    ];

    const migrationSource = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrations, name), 'utf8'))
      .join('\n');

    for (const table of identityFree) {
      const start = migrationSource.indexOf(`create table ${table} (`);
      expect(start, `${table} should exist in a migration`).toBeGreaterThan(-1);
      // The table definition runs to the statement's terminating `);` at column 0.
      const end = migrationSource.indexOf('\n);', start);
      const body = migrationSource.slice(start, end === -1 ? undefined : end);
      for (const column of forbidden) {
        // A word-boundary match, so `student_id` does not fire on `subject_ref` and `user_id` does not
        // fire on `user_idempotency`.
        expect(
          new RegExp(`\\b${column}\\b`).test(body),
          `${table} must not declare ${column} (A-ID-6, 06 section 4.7.3)`,
        ).toBe(false);
      }
    }
  });
});

describe('A-ID-5: no tutor response type carries an author identifier', () => {
  it('the tutor-facing discussion and query types expose only a label and a flag', () => {
    const types = sourceOf(join(SRC_ROOT, 'lib', 'api', 'types.ts'));

    // The author object of `06` section 5.5.13. Its whole field set is the contract, so a new field is
    // the failure and this pins the two that may exist.
    const authorBlock = /export interface DiscussionAuthor[\s\S]*?\n}/.exec(types);
    expect(authorBlock).not.toBeNull();
    const body = authorBlock?.[0] ?? '';
    expect(body).toContain('isAnonymised');
    expect(body).toContain('displayLabel');
    for (const forbidden of ['studentId', 'studentName', 'email', 'userId', 'anonIdentityId', 'subjectRef']) {
      expect(body).not.toContain(forbidden);
    }
  });
});
