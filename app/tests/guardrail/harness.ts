/**
 * The golden-set harness (`05-AI-GUARDRAILS.md` sections 11.1-11.4).
 *
 * **One fixture set, so that a verdict difference is a guardrail difference.** Every case below is
 * run against `golden/policy.approved.json`, `golden/sources.json` and `golden/session.json`, which
 * is what section 11.1 requires and what makes a failure point at the guardrail rather than at the
 * data.
 *
 * **The ports are spies, and they are asserted.** `05` section 11.3's assertions are about *calls*:
 * zero classifier calls for a `DET` case, exactly one extraction call for a `DET+EXTRACT` case, zero
 * adapter calls of any kind for a `DET` refusal. A test that only compared verdicts would pass with
 * the classifier consulted on every turn, which is the failure mode the layer semantics of section
 * 11.4 exist to catch.
 *
 * **The extractor reads the real file.** It verifies the attachment's sha256 against
 * `docs/fixtures/attachments/manifest.json` and returns the recorded classification. That is what
 * makes G36/G38/G50/G51 execute rather than skip, and it is also the honest boundary: the recorded
 * code is not a live vision model's verdict, which `docs/handoff/05-ISSUES.md` I-30 states.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide, type DecideInput, type DecideResult, type UploadExtractorPort } from '@/lib/guardrail';
import type { GuardrailClassifierPort } from '@/lib/guardrail/classifier';
import type { PolicyRuleRow } from '@/lib/guardrail/policy-source';
import type {
  AiUsagePolicyView,
  DeclaredUpload,
  SessionState,
  SourceChunk,
} from '@/lib/guardrail/types';

export const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
export const ATTACHMENT_DIR = resolve(GOLDEN_DIR, '..', '..', '..', '..', 'docs', 'fixtures', 'attachments');

export interface GoldenCase {
  id: string;
  input: string;
  attachment?: string;
  expectedVerdict: string;
  expectedRules: string[];
  layer: 'DET' | 'DET+EXTRACT' | 'MODEL' | 'PICKER';
  expectedClassification?: string;
  why: string;
}

interface ManifestAttachment {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  classification: string;
  confidence: number;
  text: string | null;
}

export interface FixtureManifest {
  attachments: ManifestAttachment[];
}

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(...segments), 'utf8')) as T;
}

export const policyView = (): AiUsagePolicyView =>
  readJson<AiUsagePolicyView>(GOLDEN_DIR, 'policy.approved.json');

export const demoSources = (): SourceChunk[] =>
  readJson<{ chunks: SourceChunk[] }>(GOLDEN_DIR, 'sources.json').chunks;

export const fixtureSession = (): SessionState => readJson<SessionState>(GOLDEN_DIR, 'session.json');

export const goldenCases = (): GoldenCase[] => readJson<GoldenCase[]>(GOLDEN_DIR, 'cases.json');

export const demoPolicyRows = (): PolicyRuleRow[] =>
  readJson<{ rows: PolicyRuleRow[] }>(GOLDEN_DIR, 'policy.demo-rows.json').rows;

export const modelOutputs = (): {
  outputs: Record<string, unknown>;
  invalidOutputs: Record<string, unknown>;
  downgradeOutput: unknown;
} => readJson(GOLDEN_DIR, 'model-outputs.json');

export const postCheckAnswers = (): {
  answers: Array<{
    tripId: string;
    citedRule: string;
    citedChunkIds: string[];
    answer: string;
    studentTurn?: string;
    id?: string;
  }>;
  cleanAnswer: { answer: string };
} => readJson(GOLDEN_DIR, 'post-check-answers.json');

export const manifest = (): FixtureManifest => readJson<FixtureManifest>(ATTACHMENT_DIR, 'manifest.json');

/** A declared upload for a fixture attachment, with its real byte length from the manifest. */
export function attachmentUpload(fileName: string): DeclaredUpload {
  const entry = manifest().attachments.find((candidate) => candidate.fileName === fileName);
  if (!entry) throw new Error(`attachment fixture not in the manifest: ${fileName}`);
  return {
    uploadId: `upload_${entry.fileName.replace(/\W/g, '_')}`,
    fileName: entry.fileName,
    declaredMimeType: entry.mimeType,
    byteLength: entry.byteLength,
    path: join(ATTACHMENT_DIR, entry.fileName),
  };
}

export interface ExtractorSpy {
  port: UploadExtractorPort;
  /** File names in call order. Asserted to be exactly one for a `DET+EXTRACT` case. */
  calls: string[];
}

/**
 * The fixture extractor: reads the real bytes, verifies the sha256, returns the recorded code.
 * A missing, corrupted or substituted file fails the test rather than silently changing a verdict.
 */
export function createExtractorSpy(): ExtractorSpy {
  const calls: string[] = [];
  const fixture = manifest();
  const port: UploadExtractorPort = {
    capability: 'attachment_extraction',
    async extract(file) {
      calls.push(file.fileName);
      const entry = fixture.attachments.find((candidate) => candidate.fileName === file.fileName);
      if (!entry) throw new Error(`no manifest entry for ${file.fileName}`);
      const bytes = readFileSync(file.path);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== entry.sha256) {
        throw new Error(
          `attachment fixture ${file.fileName} does not match its manifest hash (trap T20 class failure)`,
        );
      }
      if (entry.classification === 'UP5') {
        throw new Error(`${file.fileName} is a picker refusal and must never reach extraction`);
      }
      return {
        classification: entry.classification as 'UP1' | 'UP2' | 'UP3' | 'UP4',
        confidence: entry.confidence,
        ...(entry.text ? { text: entry.text } : {}),
      };
    },
  };
  return { port, calls };
}

export interface ClassifierSpy {
  port: GuardrailClassifierPort;
  calls: string[];
}

/**
 * A classifier spy. With `output === undefined` it throws, which models the provider being
 * unreachable -- the state every `DET` refusal must survive (`05` section 11.4).
 */
export function createClassifierSpy(output?: unknown, options: { throwOnCall?: boolean } = {}): ClassifierSpy {
  const calls: string[] = [];
  const port: GuardrailClassifierPort = {
    capability: 'policy_guard',
    modelId: 'mock-guardrail-v1',
    promptVersion: 'guardrail-v1',
    async classify(input) {
      calls.push(input.turnText);
      if (options.throwOnCall) throw new Error('provider unreachable');
      if (output === undefined) throw new Error('no pinned classifier output for this case');
      return output;
    },
  };
  return { port, calls };
}

export interface RunOutcome {
  result: DecideResult;
  extractor: ExtractorSpy;
  classifier: ClassifierSpy;
}

/** Run one golden case exactly as section 11.2 describes its `Layer`. */
export async function runCase(testCase: GoldenCase): Promise<RunOutcome> {
  const extractor = createExtractorSpy();
  const pinned = modelOutputs().outputs[testCase.id];
  const classifier = createClassifierSpy(pinned);

  const uploads = testCase.attachment ? [attachmentUpload(testCase.attachment)] : [];

  const input: DecideInput = {
    turnText: testCase.input,
    assignmentId: 'asg_demo_1042',
    assistantSessionId: 'ses_golden',
    subjectRef: '9c1f0b2e5a774ab0c3d8e6f1a2b4c5d6',
    policy: { kind: 'view', view: policyView() },
    sources: demoSources(),
    session: fixtureSession(),
    uploads,
    retrievedChunkIds: demoSources().map((chunk) => chunk.chunkId),
  };

  const result = await decide(input, { extractor: extractor.port, classifier: classifier.port });
  return { result, extractor, classifier };
}

/** A context for unit tests that need the same fixtures but their own turn. */
export function baseInput(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    turnText: '',
    assignmentId: 'asg_demo_1042',
    assistantSessionId: 'ses_unit',
    subjectRef: '0'.repeat(32),
    policy: { kind: 'view', view: policyView() },
    sources: demoSources(),
    session: fixtureSession(),
    ...overrides,
  };
}
