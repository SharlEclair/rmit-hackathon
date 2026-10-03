#!/usr/bin/env node
/**
 * `pnpm db:seed` -- the demo seeder (`11` WP-02).
 *
 * What it writes, in one course and one assignment: the tutor and the student cohort, the three
 * committed fixture documents extracted and chunked into `assignment_sources` + `source_chunks`,
 * one published `assignment_structures` version with its Requirement Map, rubric sections, five
 * milestones, checklist, AI Usage Policy rules, FAQ entries and one ambiguity finding, and then the
 * deterministic cohort activity from `docs/fixtures/cohort-seed.json` as `student_assignments`,
 * `student_checklist_progress`, `queries`, `query_messages` and `analytics_events`.
 *
 * Three properties this script exists to hold:
 *
 * 1. **Idempotent.** Every row is inserted with `on conflict do nothing` under a primary key
 *    derived from the row's own stable coordinates, so a second run inserts nothing at all --
 *    not merely nothing new. Every counter below prints what this run actually wrote.
 * 2. **Deterministic.** Every value comes from the committed fixtures: the cohort numbers from
 *    `cohort-seed.json`, the document text from the extractor, the content from
 *    `demo-assignment.ts`. The only values that depend on the run's clock are the argon2 salts in
 *    `users.password_hash`, and the seeder never rewrites a user row, so a re-run leaves them
 *    untouched.
 * 3. **Not a production tool.** It refuses to run with `NODE_ENV=production` (`12` section 3.6),
 *    because it writes accounts with a published password.
 *
 * **Where the SQL is.** None. `src/lib/db/queries/**` is the only place SQL lives (`11` WP-02);
 * this script extracts documents, derives ids, and calls repository functions inside
 * transactions. `analytics_events` rows are written by the repository function that performs the
 * state change they describe, in the same transaction (trap T7).
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { hashPassword } from '../src/lib/auth/password';
import { closeDb, getSql } from '../src/lib/db/client';
import { EXIT_CONFIG, exitIfConfigInvalid, type AppConfig } from '../src/lib/config';
import * as assignmentRepo from '../src/lib/db/queries/assignments';
import type { SourceKind } from '../src/lib/db/queries/assignments';
import * as courseRepo from '../src/lib/db/queries/courses';
import type { Executor } from '../src/lib/db/queries/courses';
import * as queryRepo from '../src/lib/db/queries/questions';
import * as structureRepo from '../src/lib/db/queries/structure';
import type { PublicationStamp } from '../src/lib/db/queries/structure';
import * as studentRepo from '../src/lib/db/queries/students';
import {
  AMBIGUITY_FINDING,
  ARTIFACT_APPROVED_AT,
  CHECKLIST_ITEMS,
  DEMO_ASSIGNMENT,
  DEMO_COURSE,
  DEMO_PASSWORD,
  DEMO_STUDENT,
  DEMO_TUTOR,
  FIXTURE_SOURCES,
  FAQ_ENTRIES,
  MILESTONES,
  POLICY_RULES,
  PROMPT_VERSIONS,
  QUESTION_POOLS,
  REQUIREMENTS,
  RUBRIC_SECTIONS,
  TUTOR_REPLY_POOL,
  TUTOR_REPLY_QUERY_STRIDE,
  buildProvenance,
  type FixtureSourceDefinition,
} from '../src/features/seed/demo-assignment';
import { buildCohortPlan, parseCohortSeed, type CohortPlan } from '../src/features/seed/generate';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * The synthetic cohort seeded here is one smaller than `docs/fixtures/cohort-seed.json`'s 37 rows.
 *
 * WP-02's acceptance query is `select count(*) from users where role='student'` = **37**, and
 * `docs/fixtures/README.md` section 5, `docs/02-SCOPE.md` section 5 and trap T8 all describe 37
 * *synthetic* students. Those two statements cannot both hold while `student@demo.rmit` is also a
 * student: 37 synthetic rows plus the interactive account is 38. The acceptance query is the
 * contract, so the interactive demo account is one of the 37 and 36 synthetic rows are seeded.
 * Nothing in the fixture's recorded activity refers to index 37 (the buckets cover indices 1-20),
 * so no fixture-derived value changes. This is reported as a documentation conflict rather than
 * resolved silently.
 */
const INTERACTIVE_STUDENT_COUNT = 1;

/**
 * Fixed activity layout. Every offset is a constant, so the same cohort occupies the same relative
 * timeline on every machine, and every instant falls between the assignment's publish time and the
 * present so the default `W_ALL` analytics window (`08` section 9) contains the seeded events.
 */
const ACTIVITY_BASE_ISO = '2026-09-28T01:00:00.000Z';
const STUDENT_STRIDE_MS = 37 * 60 * 1000;
const MILESTONE_STRIDE_MS = 6 * 60 * 60 * 1000;
const QUESTION_OFFSET_MS = 30 * 60 * 1000;
const QUESTION_STRIDE_MS = 7 * 60 * 1000;
const TUTOR_REPLY_DELAY_MS = 2 * 60 * 60 * 1000;
const REOPEN_DELAY_MS = 6 * 60 * 60 * 1000;

/** The one seeded re-open (D48): student 5, the third item of M3, after that item was completed. */
const REOPEN_STUDENT_INDEX = 5;
const REOPEN_MILESTONE_KEY = 'M3';
const REOPEN_ITEM_INDEX = 2;

/** The largest chunk this seeder will emit from one paragraph block, as a safety valve. */
const MAX_CHUNK_CHARS = 2000;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/**
 * A deterministic primary key derived from the row's own coordinates.
 *
 * Every table in this schema stores a `uuid` primary key, and most of them have no natural unique
 * key at all (`queries`, `query_messages`, `analytics_events`, `ambiguity_findings`). Deriving the
 * key from a stable string is what lets the seeder address the same row on a second run and let
 * `on conflict do nothing` make that run a no-op, instead of depending on a natural key some table
 * does not have. The bytes are SHA-256 of a namespaced string and are shaped into a version-4
 * UUID; nothing here is a secret and nothing is derived from `ANON_ID_SECRET` (C7).
 */
function seedUuid(namespace: string): string {
  const digest = createHash('sha256').update(`aa:seed:v1|${namespace}`, 'utf8').digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  const sixth = bytes[6] ?? 0;
  const eighth = bytes[8] ?? 0;
  bytes[6] = (sixth & 0x0f) | 0x40;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A whitespace-insensitive pattern for an authored anchor.
 *
 * The extractor returns one text item per printed line, so a sentence that the document wraps
 * across two lines is two items with a line break between them. Matching word-by-word and allowing
 * any whitespace between words finds it, and the stored value is the *matched* span -- with the
 * line break the document actually contains -- rather than the single-spaced string written here.
 */
function anchorPattern(anchor: string): RegExp {
  const words = anchor.trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(words.join('\\s+'));
}

/** Markdown emphasis markers removed and runs of whitespace collapsed, for clause matching only. */
function flattenMarkdown(value: string): string {
  return value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function characterCount(value: string): number {
  return [...value].length;
}

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

interface ExtractedChunk {
  readonly text: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
}

interface PreparedSource {
  readonly kind: SourceKind;
  readonly definition: FixtureSourceDefinition;
  readonly bytes: Buffer;
  readonly contentHash: string;
  /** Server-generated from the stored bytes, never from `originalFilename` (`06` section 6.9). */
  readonly storageKey: string;
  readonly pageCount: number | null;
  readonly chunks: readonly ExtractedChunk[];
}

interface ExtractedPdf {
  readonly pageCount: number;
  readonly pages: readonly string[];
}

/**
 * Extract a PDF's text layer with the pinned extractor (`pdfjs-dist@6.3.289`).
 *
 * The same extractor WP-04 ingests with, so the fixture is exercised for real rather than being
 * described. `getDocument` is given the bytes rather than a path so the result does not depend on
 * the working directory or on URL escaping.
 */
async function extractPdf(bytes: Buffer): Promise<ExtractedPdf> {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ('str' in item ? item.str : '')).join('\n'),
      );
    }
    return { pageCount: document.numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Split one page's extracted items into chunks, one chunk per document section.
 *
 * A section runs from a heading to the item before the next heading, and the chunk text is those
 * items joined by the line break the extractor implied between them. That keeps two things true at
 * once: the text is a **contiguous, verbatim** span of the page (nothing is re-ordered, re-flowed
 * or re-worded, which is what R2 and C2 require of T1 material), and a chunk carries the heading
 * that governs it. In the rubric that matters: the criterion heading and the pass/distinction
 * standards it introduces are separate printed blocks, and a chunk that held only one of them would
 * cite a criterion without its standards, or a weight without its criterion.
 *
 * The section label is carried across pages, because `demo-brief.pdf` continues its required-section
 * list on the next page: the heading is the document's own, found earlier in the same document, and
 * the clause is applied rather than guessed from the continuation's wording.
 */
function pdfPageChunks(
  pageText: string,
  pageNumber: number,
  carryLabel: string | null,
): { readonly chunks: ExtractedChunk[]; readonly label: string | null } {
  const items = pageText.split('\n');
  const first = items.findIndex((item) => item.trim() !== '');
  if (first < 0) return { chunks: [], label: carryLabel };

  const boundaries: number[] = [first];
  for (let index = first + 1; index < items.length; index += 1) {
    if (isHeadingItem(items[index] ?? '')) boundaries.push(index);
  }
  boundaries.push(items.length);

  const chunks: ExtractedChunk[] = [];
  let label = carryLabel;
  for (let section = 0; section + 1 < boundaries.length; section += 1) {
    const start = boundaries[section] ?? first;
    let end = boundaries[section + 1] ?? items.length;
    while (end > start && (items[end - 1] ?? '').trim() === '') end -= 1;
    if (end <= start) continue;
    const heading = items[start] ?? '';
    if (isHeadingItem(heading)) label = heading.trim();
    for (const run of splitByBudget(items.slice(start, end), MAX_CHUNK_CHARS)) {
      const text = run.join('\n');
      if (text.trim() === '') continue;
      chunks.push({ text, pageFrom: pageNumber, pageTo: pageNumber, sectionLabel: label });
    }
  }
  return { chunks, label };
}

/** A short item that opens a numbered section or a rubric criterion is the document's own label. */
function isHeadingItem(item: string): boolean {
  const trimmed = item.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  return /^(\d+\.\s+\S|Criterion \d+ --)/.test(trimmed);
}

/** Split a block into runs no longer than `maxChars`, never splitting an item. */
function splitByBudget(items: readonly string[], maxChars: number): string[][] {
  const runs: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const item of items) {
    if (current.length > 0 && length + item.length + 1 > maxChars) {
      runs.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += item.length + 1;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Split a Markdown document into paragraph blocks.
 *
 * Horizontal rules and empty runs are dropped; every other block is emitted verbatim, and a heading
 * becomes the `section_label` of the blocks that follow it. A Markdown source has no pages, so its
 * chunks carry `page_from`/`page_to` of `null` rather than a fabricated page number.
 */
function markdownChunks(text: string): ExtractedChunk[] {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  const chunks: ExtractedChunk[] = [];
  let sectionLabel: string | null = null;
  for (const raw of blocks) {
    const block = raw.replace(/\r?\n+$/, '').trim();
    if (block === '') continue;
    if (/^-{3,}$/.test(block)) continue;
    if (/^#{1,6}\s/.test(block)) {
      sectionLabel = block.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();
      chunks.push({ text: block, pageFrom: null, pageTo: null, sectionLabel });
      continue;
    }
    for (const run of splitByBudget(block.split('\n'), MAX_CHUNK_CHARS)) {
      const runText = run.join('\n');
      if (runText.trim() === '') continue;
      chunks.push({ text: runText, pageFrom: null, pageTo: null, sectionLabel });
    }
  }
  return chunks;
}

/** Read, extract, hash and key every committed fixture document. */
async function prepareSources(repoRoot: string): Promise<PreparedSource[]> {
  const prepared: PreparedSource[] = [];
  for (const definition of FIXTURE_SOURCES) {
    const absolute = join(repoRoot, ...definition.relativePath.split('/'));
    if (!existsSync(absolute)) {
      throw new Error(`the committed fixture ${definition.relativePath} is missing`);
    }
    const bytes = await readFile(absolute);
    let chunks: ExtractedChunk[];
    let pageCount: number | null;
    if (definition.mimeType === 'application/pdf') {
      const extracted = await extractPdf(bytes);
      pageCount = extracted.pageCount;
      const pageChunks: ExtractedChunk[] = [];
      let label: string | null = null;
      for (let position = 0; position < extracted.pages.length; position += 1) {
        const pageText = extracted.pages[position];
        if (pageText === undefined) continue;
        const section = pdfPageChunks(pageText, position + 1, label);
        label = section.label;
        pageChunks.push(...section.chunks);
      }
      chunks = pageChunks;
      if (definition.expectedPageCount !== null && pageCount !== definition.expectedPageCount) {
        throw new Error(
          `${definition.relativePath} extracted ${pageCount} pages; the fixture states ` +
            `${definition.expectedPageCount}`,
        );
      }
    } else {
      pageCount = null;
      chunks = markdownChunks(bytes.toString('utf8'));
    }
    if (chunks.length === 0) {
      throw new Error(`${definition.relativePath} produced no text chunks`);
    }
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    prepared.push({
      kind: definition.kind,
      definition,
      bytes,
      contentHash,
      // Content-addressed, and therefore stable across runs without being derived from the
      // filename. A second run addresses the same storage object.
      storageKey: `sources/${definition.kind}/${contentHash}`,
      pageCount,
      chunks,
    });
  }
  return prepared;
}

interface LocatedChunk {
  readonly source: PreparedSource;
  readonly index: number;
  readonly text: string;
  readonly chunkId: string;
}

/**
 * Find the chunk that contains an anchor, and return the document's own span for it.
 *
 * A missing anchor aborts the seed. An authored phrase that is not in the source document is
 * exactly the defect I-2 and R2 exist to catch, and writing a `verbatim_text` that the cited chunk
 * does not contain would put a paraphrase in front of a student as the requirement (C2).
 */
function locateAnchor(
  sources: readonly PreparedSource[],
  kind: SourceKind,
  anchor: string,
  sourceIdOf: (source: PreparedSource) => string,
): LocatedChunk {
  const pattern = anchorPattern(anchor);
  for (const source of sources) {
    if (source.kind !== kind) continue;
    for (let index = 0; index < source.chunks.length; index += 1) {
      const chunk = source.chunks[index];
      if (chunk === undefined) continue;
      const match = pattern.exec(chunk.text);
      if (match !== null && match[0] !== '') {
        return {
          source,
          index,
          text: match[0],
          chunkId: seedUuid(`chunk|${sourceIdOf(source)}|${index}`),
        };
      }
    }
  }
  throw new Error(
    `no chunk of the ${kind} source contains the anchor "${anchor}"; the fixture content and the ` +
      'committed document disagree',
  );
}

/** The full chunk a Markdown clause lives in, flattened the same way the anchor check flattens it. */
function locateClause(
  sources: readonly PreparedSource[],
  kind: SourceKind,
  clauseAnchor: string,
  sourceIdOf: (source: PreparedSource) => string,
): { readonly located: LocatedChunk; readonly text: string } {
  const wanted = flattenMarkdown(clauseAnchor);
  for (const source of sources) {
    if (source.kind !== kind) continue;
    for (let index = 0; index < source.chunks.length; index += 1) {
      const chunk = source.chunks[index];
      if (chunk === undefined) continue;
      const flat = flattenMarkdown(chunk.text);
      if (flat.includes(wanted)) {
        return {
          located: {
            source,
            index,
            text: chunk.text,
            chunkId: seedUuid(`chunk|${sourceIdOf(source)}|${index}`),
          },
          text: flat,
        };
      }
    }
  }
  throw new Error(
    `no chunk of the ${kind} source contains the clause "${clauseAnchor}"; the policy rules in ` +
      'demo-assignment.ts and the committed policy document disagree',
  );
}

/**
 * The verbatim criterion block for a rubric section.
 *
 * The rubric is a two-column table, and the extractor emits the criterion heading as one block and
 * the pass/distinction cells as the next. Which of the two holds the standards differs by page:
 * criteria 1-4 are separated from their heading by a blank line, criterion 5 is not. The block that
 * actually contains the standards is therefore chosen by looking for the standards, not by
 * assuming an offset -- and a heading whose block holds neither is a loud failure rather than a
 * silently short criterion.
 */
function locateRubricBlock(
  sources: readonly PreparedSource[],
  heading: string,
  sourceIdOf: (source: PreparedSource) => string,
): LocatedChunk {
  const located = locateAnchor(sources, 'rubric', heading, sourceIdOf);
  const chunkIdAt = (index: number): string =>
    seedUuid(`chunk|${sourceIdOf(located.source)}|${index}`);
  const own = located.source.chunks[located.index];
  if (own !== undefined && own.text.includes('Pass standard')) {
    return { ...located, text: own.text, chunkId: chunkIdAt(located.index) };
  }
  const nextIndex = located.index + 1;
  const next = located.source.chunks[nextIndex];
  if (next === undefined || !next.text.trimStart().startsWith('Pass standard')) {
    throw new Error(
      `the rubric block for "${heading}" holds no pass standard; the extractor's block layout ` +
        'has changed and the criterion text would be wrong',
    );
  }
  return {
    source: located.source,
    index: nextIndex,
    text: next.text,
    chunkId: chunkIdAt(nextIndex),
  };
}

// ---------------------------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------------------------

interface Counter {
  inserted: number;
  skipped: number;
}

class Report {
  private readonly counters = new Map<string, Counter>();

  record(label: string, inserted: boolean): void {
    const counter = this.counters.get(label) ?? { inserted: 0, skipped: 0 };
    if (inserted) counter.inserted += 1;
    else counter.skipped += 1;
    this.counters.set(label, counter);
  }

  print(): void {
    process.stdout.write('seed summary (inserted / already present)\n');
    let inserted = 0;
    let skipped = 0;
    for (const [label, counter] of this.counters) {
      inserted += counter.inserted;
      skipped += counter.skipped;
      process.stdout.write(
        `  ${label.padEnd(30)} ${String(counter.inserted).padStart(4)} / ${String(counter.skipped).padStart(4)}\n`,
      );
    }
    process.stdout.write(`  ${'TOTAL'.padEnd(30)} ${String(inserted).padStart(4)} / ${String(skipped).padStart(4)}\n`);
  }
}

function findRepoRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'docs', 'fixtures', 'cohort-seed.json'))) return candidate;
  }
  throw new Error(
    `could not locate docs/fixtures/cohort-seed.json from ${process.cwd()}; run the seed from ` +
      'app/ or from the repository root',
  );
}

/**
 * The lifecycle stamp for a structure artifact.
 *
 * Every artifact this seeder writes is `PUBLISHED`. That is what gate rule G1 (`06` section 3.4)
 * requires of anything a student reads, and decision **D81** / handoff **I-21** make the seeded
 * demo structure fully published rather than half-published under an already-`published`
 * assignment. Publishing does not skip approval: `06` section 3.2 transition 7 requires a prior
 * `APPROVED` state, and `approved_by_user_id`/`approved_at` are still written, so the row records
 * that a tutor sanctioned it. `ck_*_approval`, `ck_*_approved_at` and `ck_*_published_at` tie each
 * stamp column to the status, so a caller cannot produce a status its stamp columns contradict.
 */
function publishedStamp(approverUserId: string, publishedAt: string): PublicationStamp {
  return {
    publicationStatus: 'PUBLISHED',
    approvedByUserId: approverUserId,
    approvedAt: ARTIFACT_APPROVED_AT,
    publishedAt,
  };
}

async function main(): Promise<void> {
  const config: AppConfig = exitIfConfigInvalid();

  if (config.nodeEnv === 'production') {
    throw new Error(
      'refusing to seed: NODE_ENV=production (12 section 3.6). The seed creates demo accounts ' +
        'with a published password.',
    );
  }
  if (config.databaseUrl === null) {
    process.stderr.write('CONFIG_INVALID: DATABASE_URL\n');
    process.exit(EXIT_CONFIG);
  }
  const anonIdSecret = config.anonIdSecret;
  if (anonIdSecret === null) {
    process.stderr.write('CONFIG_INVALID: ANON_ID_SECRET\n');
    process.exit(EXIT_CONFIG);
  }
  const modelId = config.llmModelReasoning;
  if (modelId === null) {
    process.stderr.write('CONFIG_INVALID: LLM_MODEL_REASONING\n');
    process.exit(EXIT_CONFIG);
  }

  const report = new Report();
  const repoRoot = findRepoRoot();

  // -- the fixtures ---------------------------------------------------------------------------
  const cohortSeed = parseCohortSeed(
    JSON.parse(await readFile(join(repoRoot, 'docs', 'fixtures', 'cohort-seed.json'), 'utf8')),
  );
  const plan: CohortPlan = buildCohortPlan(cohortSeed);
  assertContentMatchesCohortFixture(plan);

  const sources = await prepareSources(repoRoot);
  const sourceIdOf = (source: PreparedSource): string =>
    seedUuid(`source|${source.kind}|${source.contentHash}`);

  const storageDir = resolve(process.cwd(), config.storageLocalDir);
  for (const source of sources) {
    const destination = join(storageDir, ...source.storageKey.split('/'));
    if (existsSync(destination)) continue;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source.bytes);
  }

  // -- ids ------------------------------------------------------------------------------------
  const tutorId = seedUuid(`user|${DEMO_TUTOR.email}`);
  const courseId = seedUuid(`course|${DEMO_COURSE.code}`);
  const assignmentId = seedUuid(`assignment|${DEMO_COURSE.code}|${DEMO_ASSIGNMENT.title}`);
  const structureId = seedUuid(`structure|${assignmentId}|v1`);
  const milestoneId = (key: string): string => seedUuid(`milestone|${structureId}|${key}`);
  const requirementNodeId = (key: string): string => seedUuid(`requirement|${structureId}|${key}`);
  const rubricSectionId = (key: string): string => seedUuid(`rubric|${structureId}|${key}`);
  const checklistItemId = (milestoneKey: string, displayOrder: number): string =>
    seedUuid(`checklist|${milestoneId(milestoneKey)}|${displayOrder}`);

  const interactiveStudentId = seedUuid(`user|${DEMO_STUDENT.email}`);
  const syntheticCount = plan.enrolledStudentCount - INTERACTIVE_STUDENT_COUNT;
  if (plan.students.length < syntheticCount) {
    throw new Error(
      `cohort-seed.json carries ${plan.students.length} synthetic students but the enrolled ` +
        `count requires ${syntheticCount}`,
    );
  }
  const syntheticStudents = plan.students.slice(0, syntheticCount);
  const studentIdByIndex = new Map<number, string>();
  for (const student of syntheticStudents) {
    studentIdByIndex.set(student.index, seedUuid(`user|${student.email}`));
  }
  if (studentIdByIndex.size !== syntheticCount) {
    throw new Error('cohort-seed.json carries duplicate student indices');
  }

  const sql = getSql(config.databaseUrl);

  // -- identity, course and enrolments ---------------------------------------------------------
  await sql.begin(async (tx) => {
    await upsertUser(tx, {
      id: tutorId,
      email: DEMO_TUTOR.email,
      displayName: DEMO_TUTOR.displayName,
      role: 'tutor',
      report,
    });
    await upsertUser(tx, {
      id: interactiveStudentId,
      email: DEMO_STUDENT.email,
      displayName: DEMO_STUDENT.displayName,
      role: 'student',
      report,
    });
    for (const student of syntheticStudents) {
      await upsertUser(tx, {
        id: seedUuid(`user|${student.email}`),
        email: student.email,
        displayName: student.displayName,
        role: 'student',
        report,
      });
    }

    report.record(
      'courses',
      await courseRepo.insertCourseIfAbsent(tx, {
        id: courseId,
        code: DEMO_COURSE.code,
        title: DEMO_COURSE.title,
        term: DEMO_COURSE.term,
        createdByUserId: tutorId,
      }),
    );
    report.record(
      'enrollments',
      await courseRepo.insertEnrollmentIfAbsent(tx, {
        id: seedUuid(`enrollment|${courseId}|${tutorId}`),
        courseId,
        userId: tutorId,
        roleInCourse: 'tutor',
        // The single tutor owns the demo course (`06` section 3.5, O4).
        isOwner: true,
      }),
    );
    for (const userId of [interactiveStudentId, ...studentIdByIndex.values()]) {
      report.record(
        'enrollments',
        await courseRepo.insertEnrollmentIfAbsent(tx, {
          id: seedUuid(`enrollment|${courseId}|${userId}`),
          courseId,
          userId,
          // Every enrolment's role matches that user's `role` (`06` section 7.1.3).
          roleInCourse: 'student',
          isOwner: false,
        }),
      );
    }
  });

  // -- assignment, sources, chunks, structure and its artifacts ---------------------------------
  const stamp = publishedStamp(tutorId, DEMO_ASSIGNMENT.publishedAt);
  await sql.begin(async (tx) => {
    report.record(
      'assignments',
      await assignmentRepo.insertAssignmentIfAbsent(tx, {
        id: assignmentId,
        courseId,
        title: DEMO_ASSIGNMENT.title,
        status: 'published',
        dueAt: DEMO_ASSIGNMENT.dueAt,
        createdByUserId: tutorId,
        publishedAt: DEMO_ASSIGNMENT.publishedAt,
      }),
    );

    for (const source of sources) {
      const sourceId = sourceIdOf(source);
      report.record(
        'assignment_sources',
        await assignmentRepo.insertSourceIfAbsent(tx, {
          id: sourceId,
          assignmentId,
          uploadedByUserId: tutorId,
          kind: source.kind,
          originalFilename: source.definition.originalFilename,
          storageKey: source.storageKey,
          mimeType: source.definition.mimeType,
          byteSize: source.bytes.byteLength,
          pageCount: source.pageCount,
          contentHash: source.contentHash,
        }),
      );
      for (let index = 0; index < source.chunks.length; index += 1) {
        const chunk = source.chunks[index];
        if (chunk === undefined) continue;
        report.record(
          'source_chunks',
          await assignmentRepo.insertSourceChunkIfAbsent(tx, {
            id: seedUuid(`chunk|${sourceId}|${index}`),
            assignmentId,
            sourceId,
            chunkIndex: index,
            text: chunk.text,
            pageFrom: chunk.pageFrom,
            pageTo: chunk.pageTo,
            sectionLabel: chunk.sectionLabel,
            charCount: characterCount(chunk.text),
          }),
        );
      }
    }

    const allChunkIds = sources.flatMap((source) =>
      source.chunks.map((_chunk, index) => seedUuid(`chunk|${sourceIdOf(source)}|${index}`)),
    );
    report.record(
      'assignment_structures',
      await structureRepo.insertStructureIfAbsent(tx, {
        id: structureId,
        assignmentId,
        version: 1,
        isCurrent: true,
        origin: 'ai',
        provenance: buildProvenance(modelId, PROMPT_VERSIONS.structure, allChunkIds),
        groundingChunkIds: allChunkIds,
        stamp,
      }),
    );
    // `assignments.current_structure_id` cannot be set before the structure exists (trap T18).
    await assignmentRepo.linkCurrentStructure(tx, assignmentId, structureId);

    // Requirement nodes, parents before children so the self-FK is always satisfiable.
    const requirementChunks = new Map<string, LocatedChunk>();
    const orderedRequirements = [...REQUIREMENTS].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    );
    for (const requirement of orderedRequirements) {
      const located = locateAnchor(sources, requirement.sourceKind, requirement.anchor, sourceIdOf);
      requirementChunks.set(requirement.key, located);
      report.record(
        'requirement_nodes',
        await structureRepo.insertRequirementNodeIfAbsent(tx, {
          id: requirementNodeId(requirement.key),
          assignmentId,
          structureId,
          parentRequirementNodeId:
            requirement.parentKey === null ? null : requirementNodeId(requirement.parentKey),
          title: requirement.title,
          verbatimText: located.text,
          sourceChunkId: located.chunkId,
          sourcePage: located.source.chunks[located.index]?.pageFrom ?? null,
          sourceSectionLabel: located.source.chunks[located.index]?.sectionLabel ?? null,
          mapSummary: requirement.mapSummary,
          displayOrder: requirement.displayOrder,
          origin: 'ai',
          provenance: buildProvenance(modelId, PROMPT_VERSIONS.requirements, [located.chunkId]),
          groundingChunkIds: [located.chunkId],
          stamp,
        }),
      );
    }

    // Rubric sections. The stored criteria text is the whole criterion block the extractor
    // returned, so the official wording is what a student is shown (C2).
    const rubricChunkIds = new Map<string, readonly string[]>();
    const weightTotal = RUBRIC_SECTIONS.reduce((total, section) => total + section.weightPercent, 0);
    if (weightTotal !== 100) {
      throw new Error(`the rubric weights sum to ${weightTotal}; the fixture states 100`);
    }
    for (const section of RUBRIC_SECTIONS) {
      const located = locateRubricBlock(sources, section.blockAnchor, sourceIdOf);
      const chunk = located.source.chunks[located.index];
      if (chunk === undefined) throw new Error(`missing rubric chunk for ${section.key}`);
      if (!chunk.text.includes(String(section.weightPercent))) {
        throw new Error(
          `the rubric block for ${section.key} does not carry its weight ` +
            `${section.weightPercent}; 06 section 7.2.6 requires the number in the cited chunk`,
        );
      }
      rubricChunkIds.set(section.key, [located.chunkId]);
      report.record(
        'rubric_sections',
        await structureRepo.insertRubricSectionIfAbsent(tx, {
          id: rubricSectionId(section.key),
          assignmentId,
          structureId,
          sourceChunkId: located.chunkId,
          sectionLabel: section.sectionLabel,
          criteriaText: located.text,
          weightPercent: section.weightPercent,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          mapInterpretation: section.mapInterpretation,
          displayOrder: section.displayOrder,
          origin: 'ai',
          provenance: buildProvenance(modelId, PROMPT_VERSIONS.rubric, [located.chunkId]),
          groundingChunkIds: [located.chunkId],
          stamp,
        }),
      );
    }

    // Milestones. Grounded on the chunks of the requirements they are linked to, carrying the
    // fixture's own approval state, and published (D81, I-21) so gate G1 lets a student read them.
    const milestoneGrounding = new Map<string, readonly string[]>();
    for (const milestone of MILESTONES) {
      const grounding = [
        ...new Set(
          milestone.requirementKeys.flatMap(
            (key) => requirementChunks.get(key)?.chunkId ?? [],
          ),
        ),
      ];
      milestoneGrounding.set(milestone.key, grounding);
      const planned = plan.milestones.find((candidate) => candidate.key === milestone.key);
      if (planned === undefined) throw new Error(`no planned bucket for milestone ${milestone.key}`);
      // The fixture records the milestone's APPROVED state; publishing is the next transition
      // (`06` section 3.2 transition 7), and decision **D81** / handoff **I-21** make the seeded
      // demo structure fully PUBLISHED. Both are needed: transition 7 requires a prior APPROVED
      // state, and gate G1 (`06` section 3.4) makes PUBLISHED the only student-visible status, so
      // an APPROVED milestone under a `published` assignment would be a milestone a student cannot
      // see above checklist items they can.
      if (planned.publicationStatus !== 'APPROVED' && planned.publicationStatus !== 'PUBLISHED') {
        throw new Error(
          `cohort-seed.json records publicationStatus "${planned.publicationStatus}" for ` +
            `${milestone.key}; only an APPROVED (publishable) or PUBLISHED milestone is supported`,
        );
      }
      report.record(
        'milestones',
        await structureRepo.insertMilestoneIfAbsent(tx, {
          id: milestoneId(milestone.key),
          assignmentId,
          structureId,
          title: milestone.title,
          summary: milestone.summary,
          displayOrder: milestone.displayOrder,
          origin: 'ai',
          provenance: buildProvenance(modelId, PROMPT_VERSIONS.milestones, grounding),
          groundingChunkIds: grounding,
          stamp: publishedStamp(tutorId, DEMO_ASSIGNMENT.publishedAt),
        }),
      );
    }

    for (const item of CHECKLIST_ITEMS) {
      const grounding = milestoneGrounding.get(item.milestoneKey) ?? [];
      report.record(
        'checklist_items',
        await structureRepo.insertChecklistItemIfAbsent(tx, {
          id: checklistItemId(item.milestoneKey, item.displayOrder),
          assignmentId,
          structureId,
          milestoneId: milestoneId(item.milestoneKey),
          title: item.title,
          planningLevel: item.planningLevel,
          description: item.description,
          displayOrder: item.displayOrder,
          origin: 'ai',
          provenance: buildProvenance(modelId, PROMPT_VERSIONS.checklist, grounding),
          groundingChunkIds: grounding,
          stamp,
        }),
      );
    }

    // AI Usage Policy rules. The rule text is the policy document's own clause paragraph, located
    // by the clause label, so no clause is transcribed by hand and none is paraphrased.
    for (const rule of POLICY_RULES) {
      const clause = locateClause(sources, 'ai_policy', rule.clauseAnchor, sourceIdOf);
      if (clause.text.length > 600) {
        throw new Error(
          `ai_policy_rules.rule_text for ${rule.ruleCode} is ${clause.text.length} characters; ` +
            'ck_ai_policy_rules_rule_text_length caps it at 600',
        );
      }
      report.record(
        'ai_policy_rules',
        await structureRepo.insertAiPolicyRuleIfAbsent(tx, {
          id: seedUuid(`policy|${structureId}|${rule.ruleCode}`),
          assignmentId,
          structureId,
          ruleCode: rule.ruleCode,
          ruleText: clause.text,
          effect: rule.effect,
          appliesTo: rule.appliesTo,
          sourceChunkId: clause.located.chunkId,
          displayOrder: rule.displayOrder,
          origin: 'ai',
          provenance: buildProvenance(modelId, PROMPT_VERSIONS.policy, [clause.located.chunkId]),
          groundingChunkIds: [clause.located.chunkId],
          stamp,
        }),
      );
    }

    // FAQ entries. Published, so the tutor is both approver and publisher.
    for (let index = 0; index < FAQ_ENTRIES.length; index += 1) {
      const entry = FAQ_ENTRIES[index];
      if (entry === undefined) continue;
      const grounding = [
        ...new Set(
          entry.groundingRequirementKeys.flatMap(
            (key) => requirementChunks.get(key)?.chunkId ?? [],
          ),
        ),
      ];
      if (grounding.length === 0) {
        throw new Error(`FAQ entry "${entry.question}" has no grounding chunk`);
      }
      const id = seedUuid(`faq|${assignmentId}|${index + 1}`);
      const isAi = entry.sourceKind === 'ai_candidate';
      report.record(
        'faq_entries',
        await queryRepo.insertFaqEntryIfAbsent(tx, {
          id,
          assignmentId,
          milestoneId: milestoneId(entry.milestoneKey),
          question: entry.question,
          answer: entry.answer,
          sourceKind: entry.sourceKind,
          sourceQueryId: null,
          sourceQueryMessageId: null,
          publishedByUserId: tutorId,
          displayOrder: index + 1,
          publicationStatus: 'PUBLISHED',
          origin: isAi ? 'ai' : 'tutor',
          provenance: isAi ? buildProvenance(modelId, PROMPT_VERSIONS.faq, grounding) : null,
          groundingChunkIds: grounding,
          approvedByUserId: tutorId,
          approvedAt: ARTIFACT_APPROVED_AT,
          publishedAt: DEMO_ASSIGNMENT.publishedAt,
        }),
      );
    }

    // The one ambiguity finding. It records where and what, and carries no clarification (D23, C2).
    const ambiguity = locateAnchor(
      sources,
      AMBIGUITY_FINDING.sourceKind,
      AMBIGUITY_FINDING.excerptAnchor,
      sourceIdOf,
    );
    report.record(
      'ambiguity_findings',
      await structureRepo.insertAmbiguityFindingIfAbsent(tx, {
        id: seedUuid(`ambiguity|${assignmentId}|${AMBIGUITY_FINDING.title}`),
        assignmentId,
        structureId,
        sourceId: sourceIdOf(ambiguity.source),
        kind: AMBIGUITY_FINDING.kind,
        severity: AMBIGUITY_FINDING.severity,
        title: AMBIGUITY_FINDING.title,
        description: AMBIGUITY_FINDING.description,
        locatedPage: AMBIGUITY_FINDING.locatedPage,
        locatedSectionLabel: AMBIGUITY_FINDING.locatedSectionLabel,
        excerptA: ambiguity.text,
        excerptB: null,
        sourceChunkIds: [ambiguity.chunkId],
        status: 'open',
        origin: 'ai',
        provenance: buildProvenance(modelId, PROMPT_VERSIONS.ambiguity, [ambiguity.chunkId]),
      }),
    );

    // The requirement graph: requirement -> rubric, and milestone -> requirement. Every milestone
    // needs at least one requirement link or it is the publish blocker
    // MILESTONE_WITHOUT_REQUIREMENT (`06` section 7.2.8, D71).
    for (const requirement of REQUIREMENTS) {
      for (const rubricKey of requirement.rubricKeys) {
        report.record(
          'requirement_rubric_links',
          await structureRepo.insertRequirementRubricLinkIfAbsent(tx, {
            id: seedUuid(`rrl|${requirementNodeId(requirement.key)}|${rubricSectionId(rubricKey)}`),
            assignmentId,
            requirementNodeId: requirementNodeId(requirement.key),
            rubricSectionId: rubricSectionId(rubricKey),
            createdByUserId: null,
          }),
        );
      }
    }
    for (const milestone of MILESTONES) {
      if (milestone.requirementKeys.length === 0) {
        throw new Error(`milestone ${milestone.key} has no requirement link`);
      }
      for (const requirementKey of milestone.requirementKeys) {
        report.record(
          'milestone_requirement_links',
          await structureRepo.insertMilestoneRequirementLinkIfAbsent(tx, {
            id: seedUuid(`mrl|${milestoneId(milestone.key)}|${requirementNodeId(requirementKey)}`),
            assignmentId,
            requirementNodeId: requirementNodeId(requirementKey),
            milestoneId: milestoneId(milestone.key),
            createdByUserId: null,
          }),
        );
      }
    }
  });

  // -- cohort activity -------------------------------------------------------------------------
  const totalItemCount = CHECKLIST_ITEMS.length;
  const activityBase = Date.parse(ACTIVITY_BASE_ISO);

  // The interactive student's rollup exists so the workspace has a row to read; the runtime
  // creates it on first open, so it carries no timestamps and no completion here.
  await sql.begin(async (tx) => {
    report.record(
      'student_assignments',
      await studentRepo.insertStudentAssignmentIfAbsent(tx, {
        id: seedUuid(`student-assignment|${assignmentId}|${interactiveStudentId}`),
        assignmentId,
        studentId: interactiveStudentId,
        firstOpenedAt: null,
        lastActivityAt: null,
        completedItemCount: 0,
        totalItemCount,
        resolutionRate: 0,
      }),
    );
  });

  const contributingIndices = [
    ...new Set(plan.milestones.flatMap((m) => m.contributors.map((entry) => entry.studentIndex))),
  ].sort((left, right) => left - right);

  for (const studentIndex of contributingIndices) {
    const studentUserId = studentIdByIndex.get(studentIndex);
    if (studentUserId === undefined) {
      throw new Error(
        `cohort bucket activity refers to student index ${studentIndex}, which is not one of the ` +
          `${syntheticStudents.length} seeded synthetic students`,
      );
    }
    const studentAssignmentId = seedUuid(`student-assignment|${assignmentId}|${studentUserId}`);

    // The student's timeline, computed before the transaction so the rollup counts and the
    // progress rows come from one source.
    const intervals: {
      milestoneKey: string;
      milestoneId: string;
      checklistItemId: string;
      startedAt: Date;
      completedAt: Date;
      reopenAt: Date | null;
    }[] = [];
    for (const milestone of plan.milestones) {
      const contributor = milestone.contributors.find(
        (entry) => entry.studentIndex === studentIndex,
      );
      if (contributor === undefined) continue;
      let cursor =
        activityBase +
        (studentIndex - 1) * STUDENT_STRIDE_MS +
        (milestone.displayOrder - 1) * MILESTONE_STRIDE_MS;
      for (let item = 0; item < contributor.intervalsSeconds.length; item += 1) {
        const seconds = contributor.intervalsSeconds[item];
        if (seconds === undefined) continue;
        const startedAt = new Date(cursor);
        const completedAt = new Date(cursor + seconds * 1000);
        cursor = completedAt.getTime();
        const isReopen =
          studentIndex === REOPEN_STUDENT_INDEX &&
          milestone.key === REOPEN_MILESTONE_KEY &&
          item === REOPEN_ITEM_INDEX;
        intervals.push({
          milestoneKey: milestone.key,
          milestoneId: milestoneId(milestone.key),
          checklistItemId: checklistItemId(milestone.key, item + 1),
          startedAt,
          completedAt,
          reopenAt: isReopen ? new Date(completedAt.getTime() + REOPEN_DELAY_MS) : null,
        });
      }
    }
    if (intervals.length === 0) continue;

    const reopened = intervals.filter((interval) => interval.reopenAt !== null);
    if (studentIndex === REOPEN_STUDENT_INDEX && reopened.length !== 1) {
      throw new Error(
        `the seeded re-open for student ${REOPEN_STUDENT_INDEX} in ${REOPEN_MILESTONE_KEY} was ` +
          'not produced; cohort-seed.json no longer has an item at that position',
      );
    }

    const firstOpenedAt = new Date(
      Math.min(...intervals.map((interval) => interval.startedAt.getTime())),
    );
    const lastActivityAt = new Date(
      Math.max(...intervals.map((interval) => interval.completedAt.getTime())),
    );

    await sql.begin(async (tx) => {
      report.record(
        'student_assignments',
        await studentRepo.insertStudentAssignmentIfAbsent(tx, {
          id: studentAssignmentId,
          assignmentId,
          studentId: studentUserId,
          firstOpenedAt,
          lastActivityAt,
          completedItemCount: intervals.length,
          totalItemCount,
          resolutionRate: Number((intervals.length / totalItemCount).toFixed(4)),
        }),
      );

      for (const interval of intervals) {
        const started = await studentRepo.startChecklistItem(tx, {
          id: seedUuid(`progress|${studentAssignmentId}|${interval.checklistItemId}`),
          studentAssignmentId,
          studentId: studentUserId,
          assignmentId,
          milestoneId: interval.milestoneId,
          checklistItemId: interval.checklistItemId,
          anonIdSecret,
          startedAt: interval.startedAt,
        });
        report.record('student_checklist_progress', started);
        if (!started) continue;

        await studentRepo.completeChecklistItem(tx, {
          studentAssignmentId,
          studentId: studentUserId,
          assignmentId,
          milestoneId: interval.milestoneId,
          checklistItemId: interval.checklistItemId,
          anonIdSecret,
          completedAt: interval.completedAt,
        });
        // D48: the re-open increments the counter and adds no elapsed time; `completed_at` and
        // `elapsed_seconds` are not in the UPDATE at all.
        if (interval.reopenAt !== null) {
          await studentRepo.reopenChecklistItem(tx, {
            studentAssignmentId,
            studentId: studentUserId,
            assignmentId,
            milestoneId: interval.milestoneId,
            checklistItemId: interval.checklistItemId,
            anonIdSecret,
            reopenedAt: interval.reopenAt,
            expectedReopenCount: 0,
          });
        }
      }

      // Private Query threads: one per seeded question, which is what makes the per-milestone
      // question counts equal the fixture's `seededQuestionCount` (D49).
      for (const milestone of plan.milestones) {
        const contributor = milestone.contributors.find(
          (entry) => entry.studentIndex === studentIndex,
        );
        if (contributor === undefined || contributor.seededQuestionCount !== 1) continue;
        const pool = QUESTION_POOLS[milestone.key];
        if (pool === undefined || pool.length === 0) {
          throw new Error(`no question templates are defined for milestone ${milestone.key}`);
        }
        // The template is chosen by the fixture's own PRNG draw (`generation.drawOrder`), so the
        // selection is reproducible and comes from the fixture's stream rather than from
        // Math.random or from a second seed.
        const templateIndex = Math.min(
          pool.length - 1,
          Math.floor(contributor.questionDraw * pool.length),
        );
        const template = pool[templateIndex];
        if (template === undefined) throw new Error('question template lookup failed');

        const milestoneStart =
          activityBase +
          (studentIndex - 1) * STUDENT_STRIDE_MS +
          (milestone.displayOrder - 1) * MILESTONE_STRIDE_MS;
        const createdAt = new Date(
          milestoneStart +
            QUESTION_OFFSET_MS +
            (contributor.questionOrdinal ?? 0) * QUESTION_STRIDE_MS,
        );
        const queryId = seedUuid(`query|${milestoneId(milestone.key)}|${studentUserId}`);
        const definition = MILESTONES.find((candidate) => candidate.key === milestone.key);
        if (definition === undefined) {
          throw new Error(`milestone ${milestone.key} has no content definition`);
        }
        const firstRequirementKey = definition.requirementKeys[0];
        report.record(
          'queries',
          await queryRepo.createQuery(tx, {
            id: queryId,
            assignmentId,
            studentId: studentUserId,
            milestoneId: milestoneId(milestone.key),
            requirementNodeId:
              firstRequirementKey === undefined
                ? null
                : requirementNodeId(firstRequirementKey),
            subject: template.subject,
            createdAt,
            anonIdSecret,
          }),
        );

        const studentMessageId = seedUuid(`query-message|${queryId}|student`);
        report.record(
          'query_messages',
          await queryRepo.appendQueryMessage(tx, {
            id: studentMessageId,
            queryId,
            assignmentId,
            authorRole: 'student',
            authorUserId: studentUserId,
            body: template.body,
            createdAt,
            statusAfter: 'open',
          }),
        );

        // A tutor reply on every stride-th question, so the thread table is exercised and the
        // analytics rule keeps counting the thread once, not once per message.
        if ((contributor.questionOrdinal ?? 0) % TUTOR_REPLY_QUERY_STRIDE === 0) {
          const replyBody =
            TUTOR_REPLY_POOL[
              (milestone.displayOrder + (contributor.questionOrdinal ?? 0)) %
                TUTOR_REPLY_POOL.length
            ];
          if (replyBody === undefined) throw new Error('tutor reply pool lookup failed');
          report.record(
            'query_messages',
            await queryRepo.appendQueryMessage(tx, {
              id: seedUuid(`query-message|${queryId}|tutor`),
              queryId,
              assignmentId,
              authorRole: 'tutor',
              authorUserId: tutorId,
              body: replyBody,
              createdAt: new Date(createdAt.getTime() + TUTOR_REPLY_DELAY_MS),
              statusAfter: 'answered',
            }),
          );
        }
      }
    });
  }

  report.print();
  const publishable = plan.milestones.filter(
    (milestone) =>
      milestone.publicationStatus === 'APPROVED' || milestone.publicationStatus === 'PUBLISHED',
  ).length;
  process.stdout.write(
    `seed: milestones written PUBLISHED = ${plan.milestones.length} of ${plan.milestones.length}; ` +
      `cohort-seed.json records APPROVED for ${publishable}, which publish succeeds (D81, I-21). ` +
      "docs/11 WP-02's gate now counts APPROVED-or-PUBLISHED >= 4 and PUBLISHED = 5.\n",
  );
  process.stdout.write(
    `seed: ${syntheticStudents.length} synthetic students plus the interactive demo account ` +
      `(cohort-seed.json carries ${plan.students.length} synthetic rows; see the note on ` +
      'INTERACTIVE_STUDENT_COUNT).\n',
  );
  process.stdout.write(`seed: storage written under ${storageDir}\n`);
}

/**
 * Insert the demo password for a user that does not exist yet.
 *
 * The existence check comes first so a re-run does not spend 38 argon2 hashes producing values it
 * will not store, and so the salted hash a user already has is never replaced. The hash is produced
 * by `src/lib/auth/password.ts` and is never printed, logged or returned (C7).
 */
async function upsertUser(
  tx: Executor,
  user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: 'student' | 'tutor';
    readonly report: Report;
  },
): Promise<void> {
  const existing = await courseRepo.findUserIdByEmail(tx, user.email);
  if (existing !== null) {
    user.report.record('users', false);
    return;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  user.report.record(
    'users',
    await courseRepo.insertUserIfAbsent(tx, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash,
      role: user.role,
    }),
  );
}

/**
 * Check `demo-assignment.ts`'s content against the cohort fixture before writing anything.
 *
 * The milestone labels, the requirement count per bucket and the milestone order are stated in both
 * files. They must agree: the analytics labels are the fixture's, and a Map whose milestone names
 * drifted from the analytics table would be two names for one thing.
 */
function assertContentMatchesCohortFixture(plan: CohortPlan): void {
  if (MILESTONES.length !== plan.milestones.length) {
    throw new Error(
      `demo-assignment.ts defines ${MILESTONES.length} milestones but cohort-seed.json has ` +
        `${plan.milestones.length}`,
    );
  }
  for (const milestone of plan.milestones) {
    const definition = MILESTONES.find((candidate) => candidate.key === milestone.key);
    if (definition === undefined) {
      throw new Error(`cohort-seed.json has milestone ${milestone.key} with no content definition`);
    }
    if (definition.title !== milestone.title) {
      throw new Error(
        `milestone ${milestone.key} title differs: demo-assignment.ts "${definition.title}" vs ` +
          `cohort-seed.json "${milestone.title}"`,
      );
    }
    if (definition.summary !== milestone.summary) {
      throw new Error(`milestone ${milestone.key} summary differs from cohort-seed.json`);
    }
    const items = CHECKLIST_ITEMS.filter((item) => item.milestoneKey === milestone.key);
    if (items.length !== milestone.checklistItemCount) {
      throw new Error(
        `milestone ${milestone.key} has ${items.length} checklist items defined but ` +
          `cohort-seed.json records checklistItemCount ${milestone.checklistItemCount}`,
      );
    }
    for (let position = 0; position < items.length; position += 1) {
      if (items[position]?.displayOrder !== position + 1) {
        throw new Error(`milestone ${milestone.key} checklist item order is not 1..${items.length}`);
      }
    }
  }
  for (const requirement of REQUIREMENTS) {
    if (requirement.parentKey !== null && !REQUIREMENTS.some((r) => r.key === requirement.parentKey)) {
      throw new Error(`requirement ${requirement.key} names a parent that does not exist`);
    }
  }
  for (const milestone of MILESTONES) {
    for (const key of milestone.requirementKeys) {
      if (!REQUIREMENTS.some((requirement) => requirement.key === key)) {
        throw new Error(`milestone ${milestone.key} links to unknown requirement ${key}`);
      }
    }
  }
  for (const requirement of REQUIREMENTS) {
    for (const key of requirement.rubricKeys) {
      if (!RUBRIC_SECTIONS.some((section) => section.key === key)) {
        throw new Error(`requirement ${requirement.key} links to unknown rubric section ${key}`);
      }
    }
  }
  for (const item of CHECKLIST_ITEMS) {
    if (!MILESTONES.some((milestone) => milestone.key === item.milestoneKey)) {
      throw new Error(`checklist item "${item.title}" names unknown milestone ${item.milestoneKey}`);
    }
  }
  for (const entry of FAQ_ENTRIES) {
    if (!MILESTONES.some((milestone) => milestone.key === entry.milestoneKey)) {
      throw new Error(`FAQ entry "${entry.question}" names unknown milestone ${entry.milestoneKey}`);
    }
  }
  for (const key of Object.keys(QUESTION_POOLS)) {
    if (!plan.milestones.some((milestone) => milestone.key === key)) {
      throw new Error(`a question pool is defined for unknown milestone ${key}`);
    }
  }
}

main()
  .then(() => closeDb())
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    await closeDb();
    process.exit(1);
  });
