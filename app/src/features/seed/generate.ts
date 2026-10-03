/**
 * The deterministic cohort activity generator (`11` WP-02).
 *
 * **The fixture is the oracle.** `docs/fixtures/cohort-seed.json` is read, validated, and turned
 * into the demo state; the per-student intervals, the per-milestone buckets and the per-milestone
 * question counts are the values the file records, not values re-derived from a distribution.
 * `docs/fixtures/README.md` section 5 states why: the generator's per-milestone distribution
 * parameters are not carried in the file, and "the seed values in the file are not recomputed by
 * the application at runtime".
 *
 * **The PRNG is the fixture's, not this module's.** `generation.prng` states the algorithm
 * (`xorshift32`), the seed constant (`1592594996` / `0x5eed1234`) and the step, and
 * `generation.drawOrder` states the order the draws are consumed in. `createXorshift32` and
 * `boxMuller` implement exactly that, and `replayQuestionDraws` walks exactly that order. The
 * uniform draw each contributing student receives is then used to choose which authored question
 * template that student asked -- so the *content selection* is driven by the fixture's own PRNG
 * stream rather than by `Math.random`, a second seed, or an index derived from something else.
 * `Math.random` appears nowhere in this package.
 *
 * **Validation is loud.** Every invariant below is checked before any row is written: the
 * synthetic-cohort count, the bucket sizes, the interval count per bucket, the interval bounds of
 * `08` section 4.2, the question total per milestone, the two-stage mean of `08` section 4.3, and
 * the C7 shape of every display name and address. A fixture that disagrees with its own recorded
 * aggregates aborts the seed instead of producing a demo whose labels and numbers do not match.
 */

// ---------------------------------------------------------------------------------------------
// The fixture's shape, as far as this module reads it
// ---------------------------------------------------------------------------------------------

export interface CohortSeedPrng {
  readonly algorithm: string;
  readonly seedConstant: number;
  readonly seedConstantHex: string;
  readonly unsigned32Bit: boolean;
  readonly step: string;
}

export interface CohortSeedNormalDeviate {
  readonly algorithm: string;
  readonly step: string;
}

export interface CohortSeedGeneration {
  readonly prng: CohortSeedPrng;
  readonly normalDeviate: CohortSeedNormalDeviate;
  readonly drawOrder: readonly string[];
}

export interface CohortSeedStudent {
  readonly index: number;
  readonly syntheticStudentId: string;
  readonly displayName: string;
  readonly email: string;
  readonly synthetic: boolean;
}

export interface CohortSeedActivity {
  readonly studentIndex: number;
  readonly studentId: string;
  readonly completedItemCount: number;
  readonly intervalsSeconds: readonly number[];
  readonly seededQuestionCount: number;
}

export interface CohortSeedMilestone {
  readonly key: string;
  readonly displayOrder: number;
  readonly title: string;
  readonly summary: string;
  readonly publicationStatus: string;
  readonly sourcePages: readonly number[];
  readonly checklistItemCount: number;
  readonly contributingCount: number;
  readonly belowKAnonymityFloor: boolean;
  readonly milestoneMeanElapsedSeconds: number;
  readonly seededQuestionCount: number;
  readonly seededQuestionRate: number;
  readonly primaryThemes: readonly string[];
  readonly activity: readonly CohortSeedActivity[];
}

export interface CohortSeedCohort {
  readonly syntheticStudentCount: number;
  readonly contributingStudentCount: number;
  readonly enrolledStudentCount: number;
  readonly kAnonymityFloor: number;
}

export interface CohortSeedCourse {
  readonly code: string;
  readonly title: string;
  readonly term: string;
}

export interface CohortSeedAssignment {
  readonly title: string;
  readonly dueAt: string;
  readonly status: string;
  readonly weightPercent: number;
  readonly wordCountRequirement: number;
}

export interface CohortSeed {
  readonly fixtureName: string;
  readonly fixtureVersion: number;
  readonly containsRealPersonalData: boolean;
  readonly generation: CohortSeedGeneration;
  readonly cohort: CohortSeedCohort;
  readonly course: CohortSeedCourse;
  readonly assignment: CohortSeedAssignment;
  readonly students: readonly CohortSeedStudent[];
  readonly milestones: readonly CohortSeedMilestone[];
}

/** The interval bounds of `08` section 4.2 and `cohort-seed.json`'s `intervalRule`. */
export const MIN_INTERVAL_SECONDS = 180;
export const MAX_INTERVAL_SECONDS = 8 * 3600;

/** The k-anonymity floor is a constant, never configuration (`08` section 3.1, D32). */
export const K_ANONYMITY_FLOOR = 5;

/** The uniform draw is `value / 2^32`, exactly as `cohort-seed.json` documents it. */
const UINT32_SPACE = 4294967296;

/** The gauss transform's divisor, exactly as `docs/fixtures/README.md` documents it. */
const GAUSS_DIVISOR = 4294967297;

function fail(message: string): never {
  throw new Error(`COHORT_SEED_INVALID: ${message}`);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  return value;
}

function asNumber(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where} must be a number`);
  return value;
}

function asInteger(value: unknown, where: string): number {
  const parsed = asNumber(value, where);
  if (!Number.isInteger(parsed)) fail(`${where} must be an integer`);
  return parsed;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') fail(`${where} must be a non-empty string`);
  return value;
}

function asBoolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') fail(`${where} must be a boolean`);
  return value;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

// ---------------------------------------------------------------------------------------------
// The PRNG stated by the fixture
// ---------------------------------------------------------------------------------------------

/**
 * `xorshift32`, with the step `cohort-seed.json` records:
 * `h ^= h << 13; h ^= h >>> 17; h ^= h << 5;` on unsigned 32-bit values.
 *
 * The algorithm name and the seed constant are read from the fixture and checked before this is
 * called, so a fixture that changed either would abort rather than silently generate a different
 * cohort from a different generator.
 */
export function createXorshift32(seedConstant: number): () => number {
  let state = seedConstant >>> 0;
  if (state === 0) fail('the seed constant is 0, which xorshift32 cannot leave');
  return (): number => {
    state = (state ^ ((state << 13) >>> 0)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ ((state << 5) >>> 0)) >>> 0;
    return state >>> 0;
  };
}

/** `draw / 2^32`, the uniform value the fixture's draw order describes. */
export function nextUniform(next: () => number): number {
  return next() / UINT32_SPACE;
}

/** Box-Muller with the exact constants of `docs/fixtures/README.md` section 5. Consumes two draws. */
export function boxMuller(next: () => number): number {
  const u = (next() + 1) / GAUSS_DIVISOR;
  const v = (next() + 1) / GAUSS_DIVISOR;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function drawKey(milestoneKey: string, studentIndex: number): string {
  return `${milestoneKey}|${studentIndex}`;
}

/**
 * Replay `generation.drawOrder` and return the uniform draw each contributing student received.
 *
 * The order is exactly the documented one: milestone by `displayOrder`, student by `index`, then
 * `checklistItemCount` standard-normal draws (two PRNG draws each), then one uniform draw. The
 * walk consumes the same draws in the same order on every machine, so the map it returns is
 * reproducible -- which is the property `generation.drawOrder` exists to state.
 */
export function replayQuestionDraws(seed: CohortSeed): Map<string, number> {
  const next = createXorshift32(seed.generation.prng.seedConstant);
  const draws = new Map<string, number>();
  for (const milestone of orderedMilestones(seed)) {
    for (const entry of milestone.activity) {
      for (let index = 0; index < milestone.checklistItemCount; index += 1) {
        boxMuller(next);
      }
      draws.set(drawKey(milestone.key, entry.studentIndex), nextUniform(next));
    }
  }
  return draws;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function parsePrng(value: unknown): CohortSeedPrng {
  const record = asRecord(value, 'generation.prng');
  const algorithm = asString(record.algorithm, 'generation.prng.algorithm');
  const seedConstant = asInteger(record.seedConstant, 'generation.prng.seedConstant');
  const seedConstantHex = asString(record.seedConstantHex, 'generation.prng.seedConstantHex');
  const unsigned32Bit = asBoolean(record.unsigned32Bit, 'generation.prng.unsigned32Bit');
  const step = asString(record.step, 'generation.prng.step');
  if (algorithm !== 'xorshift32') {
    fail(`generation.prng.algorithm is "${algorithm}"; this generator implements xorshift32 only`);
  }
  if (seedConstant !== 0x5eed1234 || seedConstantHex.toLowerCase() !== '0x5eed1234') {
    fail(
      `generation.prng.seedConstant is ${seedConstant} (${seedConstantHex}); the committed fixture ` +
        'states 1592594996 (0x5eed1234)',
    );
  }
  if (!unsigned32Bit) fail('generation.prng.unsigned32Bit must be true for xorshift32');
  return { algorithm, seedConstant, seedConstantHex, unsigned32Bit, step };
}

function parseStudent(value: unknown, where: string, demoDomain: string): CohortSeedStudent {
  const record = asRecord(value, where);
  const index = asInteger(record.index, `${where}.index`);
  const syntheticStudentId = asString(record.syntheticStudentId, `${where}.syntheticStudentId`);
  const displayName = asString(record.displayName, `${where}.displayName`);
  const email = asString(record.email, `${where}.email`);
  const synthetic = asBoolean(record.synthetic, `${where}.synthetic`);
  if (!/^Demo Student \d\d$/.test(displayName)) {
    fail(`${where}.displayName "${displayName}" is not the synthetic "Demo Student NN" form (C7)`);
  }
  const at = email.lastIndexOf('@');
  const domain = at < 0 ? '' : email.slice(at + 1);
  if (
    at < 0 ||
    email !== email.toLowerCase() ||
    (domain !== demoDomain && !domain.endsWith(`.${demoDomain}`))
  ) {
    fail(
      `${where}.email "${email}" is not a lower-case address on ${demoDomain} or a subdomain of ` +
        'it (C7: no real address may appear in a fixture)',
    );
  }
  if (!syntheticStudentId.startsWith('synthetic-')) {
    fail(`${where}.syntheticStudentId "${syntheticStudentId}" is not a synthetic identifier (C7)`);
  }
  return { index, syntheticStudentId, displayName, email, synthetic };
}

function parseActivity(value: unknown, where: string): CohortSeedActivity {
  const record = asRecord(value, where);
  const studentIndex = asInteger(record.studentIndex, `${where}.studentIndex`);
  const studentId = asString(record.studentId, `${where}.studentId`);
  const completedItemCount = asInteger(record.completedItemCount, `${where}.completedItemCount`);
  const intervalsSeconds = asArray(record.intervalsSeconds, `${where}.intervalsSeconds`).map(
    (interval, position) => asInteger(interval, `${where}.intervalsSeconds[${position}]`),
  );
  const seededQuestionCount = asInteger(record.seededQuestionCount, `${where}.seededQuestionCount`);
  if (seededQuestionCount !== 0 && seededQuestionCount !== 1) {
    fail(`${where}.seededQuestionCount is ${seededQuestionCount}; a single draw decides 0 or 1`);
  }
  return { studentIndex, studentId, completedItemCount, intervalsSeconds, seededQuestionCount };
}

function parseMilestone(value: unknown, where: string): CohortSeedMilestone {
  const record = asRecord(value, where);
  const activity = asArray(record.activity, `${where}.activity`).map((entry, position) =>
    parseActivity(entry, `${where}.activity[${position}]`),
  );
  return {
    key: asString(record.key, `${where}.key`),
    displayOrder: asInteger(record.displayOrder, `${where}.displayOrder`),
    title: asString(record.title, `${where}.title`),
    summary: asString(record.summary, `${where}.summary`),
    publicationStatus: asString(record.publicationStatus, `${where}.publicationStatus`),
    sourcePages: asArray(record.sourcePages, `${where}.sourcePages`).map((page, position) =>
      asInteger(page, `${where}.sourcePages[${position}]`),
    ),
    checklistItemCount: asInteger(record.checklistItemCount, `${where}.checklistItemCount`),
    contributingCount: asInteger(record.contributingCount, `${where}.contributingCount`),
    belowKAnonymityFloor: asBoolean(
      record.belowKAnonymityFloor,
      `${where}.belowKAnonymityFloor`,
    ),
    milestoneMeanElapsedSeconds: asNumber(
      record.milestoneMeanElapsedSeconds,
      `${where}.milestoneMeanElapsedSeconds`,
    ),
    seededQuestionCount: asInteger(record.seededQuestionCount, `${where}.seededQuestionCount`),
    seededQuestionRate: asNumber(record.seededQuestionRate, `${where}.seededQuestionRate`),
    primaryThemes: asArray(record.primaryThemes, `${where}.primaryThemes`).map((theme, position) =>
      asString(theme, `${where}.primaryThemes[${position}]`),
    ),
    activity,
  };
}

/**
 * Parse and fully validate the cohort fixture.
 *
 * Everything checked here is a property the fixture asserts about itself, so a failure means the
 * committed file and the committed seeder disagree and no demo state should be written at all.
 */
export function parseCohortSeed(value: unknown): CohortSeed {
  const record = asRecord(value, 'cohort-seed.json');
  const generationRecord = asRecord(record.generation, 'generation');
  const prng = parsePrng(generationRecord.prng);
  const normalDeviateRecord = asRecord(generationRecord.normalDeviate, 'generation.normalDeviate');
  const generation: CohortSeedGeneration = {
    prng,
    normalDeviate: {
      algorithm: asString(normalDeviateRecord.algorithm, 'generation.normalDeviate.algorithm'),
      step: asString(normalDeviateRecord.step, 'generation.normalDeviate.step'),
    },
    drawOrder: asArray(generationRecord.drawOrder, 'generation.drawOrder').map((line, position) =>
      asString(line, `generation.drawOrder[${position}]`),
    ),
  };
  if (generation.normalDeviate.algorithm !== 'Box-Muller') {
    fail(`generation.normalDeviate.algorithm is "${generation.normalDeviate.algorithm}"`);
  }

  const cohortRecord = asRecord(record.cohort, 'cohort');
  const cohort: CohortSeedCohort = {
    syntheticStudentCount: asInteger(
      cohortRecord.syntheticStudentCount,
      'cohort.syntheticStudentCount',
    ),
    contributingStudentCount: asInteger(
      cohortRecord.contributingStudentCount,
      'cohort.contributingStudentCount',
    ),
    enrolledStudentCount: asInteger(cohortRecord.enrolledStudentCount, 'cohort.enrolledStudentCount'),
    kAnonymityFloor: asInteger(cohortRecord.kAnonymityFloor, 'cohort.kAnonymityFloor'),
  };
  if (cohort.kAnonymityFloor !== K_ANONYMITY_FLOOR) {
    fail(`cohort.kAnonymityFloor is ${cohort.kAnonymityFloor}; ` +
      `08 section 3.1 fixes it at ${K_ANONYMITY_FLOOR} and it is not configuration`);
  }

  const courseRecord = asRecord(record.course, 'course');
  const course: CohortSeedCourse = {
    code: asString(courseRecord.code, 'course.code'),
    title: asString(courseRecord.title, 'course.title'),
    term: asString(courseRecord.term, 'course.term'),
  };

  const assignmentRecord = asRecord(record.assignment, 'assignment');
  const assignment: CohortSeedAssignment = {
    title: asString(assignmentRecord.title, 'assignment.title'),
    dueAt: asString(assignmentRecord.dueAt, 'assignment.dueAt'),
    status: asString(assignmentRecord.status, 'assignment.status'),
    weightPercent: asInteger(assignmentRecord.weightPercent, 'assignment.weightPercent'),
    wordCountRequirement: asInteger(
      assignmentRecord.wordCountRequirement,
      'assignment.wordCountRequirement',
    ),
  };

  const demoDomain = asString(record.demoDomain, 'demoDomain');
  const students = asArray(record.students, 'students').map((student, position) =>
    parseStudent(student, `students[${position}]`, demoDomain),
  );
  if (students.length !== cohort.syntheticStudentCount) {
    fail(
      `students has ${students.length} entries but cohort.syntheticStudentCount is ` +
        `${cohort.syntheticStudentCount}`,
    );
  }
  students.forEach((student, position) => {
    if (student.index !== position + 1) {
      fail(`students[${position}].index is ${student.index}; the draw order fixes the order by index`);
    }
  });

  const milestones = asArray(record.milestones, 'milestones').map((milestone, position) =>
    parseMilestone(milestone, `milestones[${position}]`),
  );
  if (milestones.length === 0) fail('milestones is empty');
  const approved = milestones.filter((milestone) => milestone.publicationStatus === 'APPROVED');
  if (approved.length < 4) {
    fail(`only ${approved.length} milestones are APPROVED; the fixture asserts at least 4 (trap T8)`);
  }

  const seed: CohortSeed = {
    fixtureName: asString(record.fixtureName, 'fixtureName'),
    fixtureVersion: asInteger(record.fixtureVersion, 'fixtureVersion'),
    containsRealPersonalData: asBoolean(
      record.containsRealPersonalData,
      'containsRealPersonalData',
    ),
    generation,
    cohort,
    course,
    assignment,
    students,
    milestones,
  };
  if (seed.containsRealPersonalData) fail('containsRealPersonalData must be false (C7)');
  validateAgainstRecordedAggregates(seed);
  return seed;
}

/** Milestones in the order `generation.drawOrder` names: by `displayOrder`. */
export function orderedMilestones(seed: CohortSeed): readonly CohortSeedMilestone[] {
  return [...seed.milestones].sort((left, right) => left.displayOrder - right.displayOrder);
}

/**
 * Check the fixture against the aggregates it records for itself.
 *
 * The two-stage mean is the point of this function: `elapsedMetricRule` states that
 * `milestoneMeanElapsedSeconds` is the mean over contributing students of that student's own mean
 * interval, and trap **T1** exists because a mean over intervals looks almost identical and is
 * wrong. Recomputing it here from the recorded interval lists is what proves the file carries the
 * two-stage figure and not the flat one.
 */
function validateAgainstRecordedAggregates(seed: CohortSeed): void {
  const seenKeys = new Set<string>();
  for (const milestone of orderedMilestones(seed)) {
    const where = `milestones[${milestone.key}]`;
    if (seenKeys.has(milestone.key)) fail(`${where} appears twice`);
    seenKeys.add(milestone.key);
    if (milestone.activity.length !== milestone.contributingCount) {
      fail(
        `${where}.activity has ${milestone.activity.length} entries but contributingCount is ` +
          `${milestone.contributingCount}`,
      );
    }
    if (milestone.belowKAnonymityFloor !== (milestone.contributingCount < K_ANONYMITY_FLOOR)) {
      fail(`${where}.belowKAnonymityFloor disagrees with contributingCount (D32)`);
    }

    let questions = 0;
    const perStudentMeans: number[] = [];
    milestone.activity.forEach((entry, position) => {
      const entryWhere = `${where}.activity[${position}]`;
      if (entry.studentIndex !== position + 1) {
        fail(
          `${entryWhere}.studentIndex is ${entry.studentIndex}; drawOrder names the first ` +
            '`contributingCount` students by index',
        );
      }
      if (entry.intervalsSeconds.length !== milestone.checklistItemCount) {
        fail(
          `${entryWhere} has ${entry.intervalsSeconds.length} intervals but checklistItemCount ` +
            `is ${milestone.checklistItemCount}`,
        );
      }
      if (entry.completedItemCount !== entry.intervalsSeconds.length) {
        fail(
          `${entryWhere}.completedItemCount is ${entry.completedItemCount} but ` +
            `${entry.intervalsSeconds.length} intervals are recorded`,
        );
      }
      for (const interval of entry.intervalsSeconds) {
        if (interval < MIN_INTERVAL_SECONDS || interval > MAX_INTERVAL_SECONDS) {
          fail(
            `${entryWhere} records ${interval}s, outside the ${MIN_INTERVAL_SECONDS}..` +
              `${MAX_INTERVAL_SECONDS}s bounds of 08 section 4.2`,
          );
        }
      }
      questions += entry.seededQuestionCount;
      perStudentMeans.push(mean(entry.intervalsSeconds));
    });

    if (questions !== milestone.seededQuestionCount) {
      fail(
        `${where}.seededQuestionCount is ${milestone.seededQuestionCount} but the activity rows ` +
          `sum to ${questions}`,
      );
    }
    const recomputed = mean(perStudentMeans);
    if (Math.abs(recomputed - milestone.milestoneMeanElapsedSeconds) > 1e-6) {
      fail(
        `${where}.milestoneMeanElapsedSeconds is ${milestone.milestoneMeanElapsedSeconds} but the ` +
          `two-stage mean of the recorded intervals is ${recomputed} (trap T1)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The plan the seeder consumes
// ---------------------------------------------------------------------------------------------

export interface PlannedContributor {
  readonly studentIndex: number;
  readonly syntheticStudentId: string;
  /** Verbatim from the fixture; these become the student's per-item elapsed seconds. */
  readonly intervalsSeconds: readonly number[];
  readonly seededQuestionCount: number;
  /** 0-based position within the milestone bucket, fixed by index. */
  readonly bucketOrdinal: number;
  /** 0-based position of this student's seeded question within the milestone, or `null`. */
  readonly questionOrdinal: number | null;
  /** The fixture PRNG's uniform draw for this (milestone, student). */
  readonly questionDraw: number;
}

export interface PlannedMilestone {
  readonly key: string;
  readonly displayOrder: number;
  readonly title: string;
  readonly summary: string;
  /**
   * The fixture's own lifecycle value for this milestone.
   *
   * It is carried through rather than dropped because it is the state publish succeeds: `06`
   * section 3.2 transition 7 moves `APPROVED` to `PUBLISHED`, and the seeder checks the fixture
   * records one of those two before it publishes the milestone (decision D81, handoff I-21).
   */
  readonly publicationStatus: string;
  readonly checklistItemCount: number;
  readonly contributors: readonly PlannedContributor[];
}

export interface CohortPlan {
  readonly fixtureName: string;
  readonly fixtureVersion: number;
  readonly students: readonly CohortSeedStudent[];
  readonly milestones: readonly PlannedMilestone[];
  readonly enrolledStudentCount: number;
  readonly contributingStudentCount: number;
  readonly course: CohortSeedCourse;
  readonly assignment: CohortSeedAssignment;
}

/**
 * Build the plan: the fixture's recorded activity, annotated with the PRNG's own draw per student.
 *
 * The draws come from one replay of the documented order, not from one PRNG per call, so the
 * stream the generator consumed and the stream this module consumes are the same sequence.
 */
export function buildCohortPlan(seed: CohortSeed): CohortPlan {
  const draws = replayQuestionDraws(seed);
  const milestones = orderedMilestones(seed).map((milestone) => {
    let questionOrdinal = 0;
    const contributors = milestone.activity.map((entry, bucketOrdinal) => {
      const draw = draws.get(drawKey(milestone.key, entry.studentIndex));
      if (draw === undefined) {
        fail(`no PRNG draw was recorded for ${milestone.key} student ${entry.studentIndex}`);
      }
      const ordinal = entry.seededQuestionCount === 1 ? questionOrdinal : null;
      if (entry.seededQuestionCount === 1) questionOrdinal += 1;
      return {
        studentIndex: entry.studentIndex,
        syntheticStudentId: entry.studentId,
        intervalsSeconds: entry.intervalsSeconds,
        seededQuestionCount: entry.seededQuestionCount,
        bucketOrdinal,
        questionOrdinal: ordinal,
        questionDraw: draw,
      };
    });
    return {
      key: milestone.key,
      displayOrder: milestone.displayOrder,
      title: milestone.title,
      summary: milestone.summary,
      publicationStatus: milestone.publicationStatus,
      checklistItemCount: milestone.checklistItemCount,
      contributors,
    };
  });

  const contributingStudentCount = new Set(
    milestones.flatMap((milestone) => milestone.contributors.map((entry) => entry.studentIndex)),
  ).size;
  if (contributingStudentCount !== seed.cohort.contributingStudentCount) {
    fail(
      `the buckets cover ${contributingStudentCount} distinct students but ` +
        `cohort.contributingStudentCount is ${seed.cohort.contributingStudentCount}`,
    );
  }

  return {
    fixtureName: seed.fixtureName,
    fixtureVersion: seed.fixtureVersion,
    students: seed.students,
    milestones,
    enrolledStudentCount: seed.cohort.enrolledStudentCount,
    contributingStudentCount,
    course: seed.course,
    assignment: seed.assignment,
  };
}
