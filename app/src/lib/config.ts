/**
 * The application configuration module.
 *
 * **This is the only module under `app/` that reads `process.env`** (WP-01). Every other
 * module imports a typed value from here. A second `process.env` reader anywhere is a
 * defect: it is how a secret reaches a log, a response, or the client bundle (C7), and
 * how `.env.example`'s contract silently drifts.
 *
 * Rules this module enforces (`04` S5.4, S11; `12` S2):
 * - Validation is at boot, never at the first student message. A bad provider config must
 *   fail where a developer sees it, not in front of a judge.
 * - A failure reports the **variable name only**. No value is ever written to a message,
 *   a log line, or an error object (C7).
 * - Two problem severities, because two different requirements are in play:
 *   `fatal`   -- an invalid or missing value the app cannot run with (unknown provider id,
 *                an empty provider key, a thinking level the model rejects, a
 *                placeholder secret). Loading the config throws `ConfigError`.
 *   `degraded` -- a value the app can run without but must not pretend is healthy: an
 *                absent `DATABASE_URL`. WP-01 requires `/api/health` to report
 *                `db: "down"` **without crashing the process** when `DATABASE_URL` is
 *                unset, so absence is surfaced through `HealthResponse.ok`, not an abort.
 *                Decision: D77. `04` S11's "a missing required variable aborts with exit
 *                code 78" continues to govern every other required variable, and
 *                `pnpm start`'s migration-head check still aborts.
 *
 * `CANVAS_*` is deliberately absent. Canvas integration is excluded by decision (D45, D59),
 * not deferred, so `app/` must never read those variables and must run with them unset.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Provider ids the adapter resolves (`04` S2, D61). `gemini` is the default. */
export type LlmProviderId = 'gemini' | 'deepseek' | 'mock';

/** Thinking levels `gemini-3.8-flash` accepts. There is no `minimal` (D62). */
export type ThinkingLevel = 'low' | 'medium' | 'high';

/** Storage driver ids (`04` S8, D41). */
export type StorageDriverId = 'local' | 's3';

export type NodeEnvironment = 'development' | 'production' | 'test';

/**
 * Thinking-level keys, named for their env vars rather than for `AiCapability`.
 *
 * Deliberately NOT keyed by capability: the `AiCapability` union is frozen in Phase 2
 * (`04-INTERFACES.md`) and `src/lib/llm/` owns that mapping. Coupling this module to it
 * would make Phase 2's freeze a Phase 1 change. There is no `insight_engine` level
 * because the Insight Engine makes no model call (D67).
 */
export type LlmThinkingKey = 'guardrail' | 'assistant' | 'analyst' | 'moderator' | 'extraction';

export type LlmThinkingLevels = Readonly<Record<LlmThinkingKey, ThinkingLevel>>;

export interface S3Config {
  readonly endpoint: string | null;
  readonly region: string | null;
  readonly bucket: string | null;
  readonly accessKeyId: string | null;
  readonly secretAccessKey: string | null;
}

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  /** `null` means unset. Handlers must treat that as an unhealthy database, not a crash. */
  readonly databaseUrl: string | null;
  readonly authSecret: string | null;
  readonly anonIdSecret: string | null;
  readonly llmProvider: LlmProviderId;
  readonly llmModelReasoning: string | null;
  readonly llmModelMultimodal: string | null;
  /** `null` when the provider is not `gemini`, which is when the levels are not consulted. */
  readonly llmThinking: LlmThinkingLevels | null;
  readonly geminiApiKey: string | null;
  readonly deepseekApiKey: string | null;
  readonly llmBaseUrl: string | null;
  readonly llmMaxCallsPerSession: number;
  readonly storageDriver: StorageDriverId;
  readonly storageLocalDir: string;
  readonly s3: S3Config;
  readonly uploadMaxBytes: number;
  readonly appBaseUrl: string;
}

export type ConfigProblemSeverity = 'fatal' | 'degraded';

export interface ConfigProblem {
  /** The env var name. Never a value. */
  readonly variable: string;
  readonly severity: ConfigProblemSeverity;
  /** Why it is a problem. Must not embed the value it complains about (C7). */
  readonly message: string;
}

export interface ConfigReadResult {
  readonly config: AppConfig;
  readonly problems: readonly ConfigProblem[];
}

/** Exit code `EX_CONFIG` (`04` S5.4). */
export const EXIT_CONFIG = 78;

/** The literal sentinel shipped in `.env.example`. A deployed value equal to it is a leak waiting to happen. */
const PLACEHOLDER_SECRET = 'replace-me-with-32-bytes-of-randomness';

const PROVIDERS: readonly LlmProviderId[] = ['gemini', 'deepseek', 'mock'];
const THINKING_LEVELS: readonly ThinkingLevel[] = ['low', 'medium', 'high'];
const STORAGE_DRIVERS: readonly StorageDriverId[] = ['local', 's3'];
const NODE_ENVS: readonly NodeEnvironment[] = ['development', 'production', 'test'];

const THINKING_ENV_VARS: Readonly<Record<LlmThinkingKey, string>> = {
  guardrail: 'LLM_THINKING_GUARDRAIL',
  assistant: 'LLM_THINKING_ASSISTANT',
  analyst: 'LLM_THINKING_ANALYST',
  moderator: 'LLM_THINKING_MODERATOR',
  extraction: 'LLM_THINKING_EXTRACTION',
};

interface Reader {
  readonly raw: (name: string) => string;
  readonly optional: (name: string) => string | null;
  readonly fatal: (variable: string, message: string) => void;
  readonly degraded: (variable: string, message: string) => void;
}

function createReader(env: NodeJS.ProcessEnv, problems: ConfigProblem[]): Reader {
  const raw = (name: string): string => (env[name] ?? '').trim();
  return {
    raw,
    optional: (name: string): string | null => {
      const value = raw(name);
      return value === '' ? null : value;
    },
    fatal: (variable: string, message: string): void => {
      problems.push({ variable, severity: 'fatal', message });
    },
    degraded: (variable: string, message: string): void => {
      problems.push({ variable, severity: 'degraded', message });
    },
  };
}

function readEnum<T extends string>(
  reader: Reader,
  variable: string,
  allowed: readonly T[],
  fallback: T,
  required: boolean,
): T {
  const value = reader.raw(variable);
  if (value === '') {
    if (required) {
      reader.fatal(variable, `is required and must be one of: ${allowed.join(', ')}`);
    }
    return fallback;
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    reader.fatal(variable, `must be one of: ${allowed.join(', ')}`);
    return fallback;
  }
  return match;
}

function readInteger(reader: Reader, variable: string, fallback: number, minimum: number): number {
  const value = reader.raw(variable);
  if (value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    reader.fatal(variable, `must be an integer >= ${minimum}`);
    return fallback;
  }
  return parsed;
}

function readSecret(reader: Reader, variable: string, required: boolean): string | null {
  const value = reader.optional(variable);
  if (value === null) {
    if (required) reader.fatal(variable, 'is required and must not be empty');
    return null;
  }
  if (value === PLACEHOLDER_SECRET) {
    reader.fatal(
      variable,
      'still holds the placeholder from .env.example; generate a real value (openssl rand -base64 32)',
    );
  }
  return value;
}

/**
 * Read and validate the environment. **Never throws and never exits**: callers decide
 * whether a problem is fatal for them. `/api/health` must be able to report a degraded
 * database instead of dying, and the tests must be able to construct a config from an
 * object literal.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ConfigReadResult {
  const problems: ConfigProblem[] = [];
  const reader = createReader(env, problems);

  const nodeEnv = readEnum(reader, 'NODE_ENV', NODE_ENVS, 'development', false);

  const databaseUrl = reader.optional('DATABASE_URL');
  if (databaseUrl === null) {
    reader.degraded('DATABASE_URL', 'is not set; the app starts but reports db "down"');
  }

  const authSecret = readSecret(reader, 'AUTH_SECRET', true);
  const anonIdSecret = readSecret(reader, 'ANON_ID_SECRET', true);

  const llmProvider = readEnum(reader, 'LLM_PROVIDER', PROVIDERS, 'gemini', true);
  const llmModelReasoning = reader.optional('LLM_MODEL_REASONING');
  if (llmModelReasoning === null) {
    reader.fatal(
      'LLM_MODEL_REASONING',
      'is required; there is no default model id, because an invented id fails at call time (04 S5.3)',
    );
  }
  const llmModelMultimodal = reader.optional('LLM_MODEL_MULTIMODAL');

  const geminiApiKey = reader.optional('GEMINI_API_KEY');
  if (llmProvider === 'gemini' && geminiApiKey === null) {
    reader.fatal('GEMINI_API_KEY', 'is required when LLM_PROVIDER=gemini');
  }
  const deepseekApiKey = reader.optional('DEEPSEEK_API_KEY');
  if (llmProvider === 'deepseek' && deepseekApiKey === null) {
    reader.fatal('DEEPSEEK_API_KEY', 'is required when LLM_PROVIDER=deepseek');
  }

  // Thinking levels are only consulted for `gemini` (04 S11 "Required when
  // LLM_PROVIDER=gemini"). `mock` must remain usable with no key and no level.
  let llmThinking: LlmThinkingLevels | null = null;
  if (llmProvider === 'gemini') {
    llmThinking = {
      guardrail: readEnum(reader, THINKING_ENV_VARS.guardrail, THINKING_LEVELS, 'low', true),
      assistant: readEnum(reader, THINKING_ENV_VARS.assistant, THINKING_LEVELS, 'medium', true),
      analyst: readEnum(reader, THINKING_ENV_VARS.analyst, THINKING_LEVELS, 'high', true),
      moderator: readEnum(reader, THINKING_ENV_VARS.moderator, THINKING_LEVELS, 'low', true),
      extraction: readEnum(reader, THINKING_ENV_VARS.extraction, THINKING_LEVELS, 'low', true),
    };
  }

  const storageDriver = readEnum(reader, 'STORAGE_DRIVER', STORAGE_DRIVERS, 'local', false);
  const s3: S3Config = {
    endpoint: reader.optional('S3_ENDPOINT'),
    region: reader.optional('S3_REGION'),
    bucket: reader.optional('S3_BUCKET'),
    accessKeyId: reader.optional('S3_ACCESS_KEY_ID'),
    secretAccessKey: reader.optional('S3_SECRET_ACCESS_KEY'),
  };
  if (storageDriver === 's3') {
    for (const [variable, value] of [
      ['S3_ENDPOINT', s3.endpoint],
      ['S3_REGION', s3.region],
      ['S3_BUCKET', s3.bucket],
      ['S3_ACCESS_KEY_ID', s3.accessKeyId],
      ['S3_SECRET_ACCESS_KEY', s3.secretAccessKey],
    ] as const) {
      if (value === null) reader.fatal(variable, 'is required when STORAGE_DRIVER=s3');
    }
  }

  const config: AppConfig = {
    nodeEnv,
    databaseUrl,
    authSecret,
    anonIdSecret,
    llmProvider,
    llmModelReasoning,
    llmModelMultimodal,
    llmThinking,
    geminiApiKey,
    deepseekApiKey,
    llmBaseUrl: reader.optional('LLM_BASE_URL'),
    llmMaxCallsPerSession: readInteger(reader, 'LLM_MAX_CALLS_PER_SESSION', 12, 1),
    storageDriver,
    storageLocalDir: reader.optional('STORAGE_LOCAL_DIR') ?? './.storage',
    s3,
    uploadMaxBytes: readInteger(reader, 'UPLOAD_MAX_BYTES', 26_214_400, 1),
    appBaseUrl: reader.optional('APP_BASE_URL') ?? 'http://localhost:3000',
  };

  return { config, problems };
}

/**
 * Thrown when the environment cannot be used. Carries variable **names** only.
 */
export class ConfigError extends Error {
  readonly problems: readonly ConfigProblem[];

  constructor(problems: readonly ConfigProblem[]) {
    super(`CONFIG_INVALID: ${problems.map((problem) => problem.variable).join(', ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

let cached: ConfigReadResult | null = null;

/** The cached read, including non-fatal problems. Used by `/api/health`. */
export function getConfigRead(): ConfigReadResult {
  cached ??= readConfig();
  return cached;
}

/** Fatal problems only, in the order they were found. */
export function fatalProblems(problems: readonly ConfigProblem[]): readonly ConfigProblem[] {
  return problems.filter((problem) => problem.severity === 'fatal');
}

/**
 * The validated config, or a throw. Call this at the start of anything that must not run
 * misconfigured (a migration, a seed, a route that shells out to a provider).
 */
export function getConfig(): AppConfig {
  const result = getConfigRead();
  const fatal = fatalProblems(result.problems);
  if (fatal.length > 0) throw new ConfigError(fatal);
  return result.config;
}

/**
 * CLI/startup variant: prints the offending variable **names** to stderr and exits 78.
 * Use only from a process entry point, never from a request handler.
 */
export function exitIfConfigInvalid(): AppConfig {
  try {
    return getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(EXIT_CONFIG);
    }
    throw error;
  }
}

/** Test seam: drop the memoised read. */
export function resetConfigCache(): void {
  cached = null;
}

let commitSha: string | null = null;

/**
 * The short commit SHA reported by `/api/health`.
 *
 * Read from `.git` directly rather than from `git` on `$PATH` (which is not guaranteed in
 * a deployed image) and rather than from an env var -- WP-01 requires that every variable
 * name in the app matches `.env.example` exactly, so no `GIT_COMMIT` variable is added.
 * `unknown` is a valid, honest answer.
 */
export function readCommitSha(): string {
  if (commitSha !== null) return commitSha;
  commitSha = 'unknown';
  let directory = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const gitPath = join(directory, '.git');
    if (existsSync(gitPath)) {
      commitSha = readGitHead(gitPath) ?? 'unknown';
      break;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return commitSha;
}

function readGitHead(gitPath: string): string | null {
  try {
    const head = readFileSync(join(gitPath, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 7);
    const ref = head.slice(5).trim();
    const refFile = join(gitPath, ...ref.split('/'));
    if (existsSync(refFile)) return readFileSync(refFile, 'utf8').trim().slice(0, 7);
    const packed = join(gitPath, 'packed-refs');
    if (existsSync(packed)) {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        if (line.endsWith(` ${ref}`)) return line.slice(0, 7);
      }
    }
    return null;
  } catch {
    return null;
  }
}
