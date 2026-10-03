/**
 * The `mock` provider -- a first-class offline mode, not a test stub (`04` section 5.8).
 *
 * Requirements it must meet, and how:
 *
 * | `04` section 5.8 | How |
 * |---|---|
 * | 1. Offline and deterministic | No network. The response depends only on the request; usage figures are derived from request/response lengths and `latencyMs` is 0, so the same input is byte-identical across processes |
 * | 2. Same interface | Implements `LlmProvider` exactly; nothing above it can tell the difference |
 * | 3. Fixture-driven | An exact-response registry keyed by `mockResponseKey(request)` is consulted first; committed per-prompt-version templates second; **an unknown key is a refusal, never an invented success** (see below) |
 * | 4. Whole loop walkable | The templates synthesise a grounded proposal from the chunks the request carried, so an upload of any document works offline (`fixtures/analyst-demo.ts`) |
 * | 5. Golden-set capable | `registerMockResponse(mockResponseKey(request), value)` lets a test force an exact response -- including a valid `guardrail_decision` for any verdict, which is what Phase 3's golden set needs. The guardrail's own schema stays in `src/lib/guardrail/` and is not defined here |
 * | 6. Identity of last resort | Selected by `LLM_PROVIDER=mock` alone; no code change |
 *
 * **The refusal path.** A request the mock has no fixture and no template for returns
 * `json: null` with `finishReason: 'content_filter'`. It does not return an empty-but-well-formed
 * object: a well-formed object would be indistinguishable from a model answer, would pass a
 * shallow check, and would be persisted as an AI artifact. Returning null means the caller's
 * schema validation refuses it (D16), which is exactly the behaviour a missing fixture should
 * produce. `04` section 5.7 already classifies `content_filter` as refusal-equivalent.
 */

import { createHash } from 'node:crypto';

import { parseGroundingChunks, type ParsedGroundingChunk } from './prompt';
import {
  MILESTONES_TEMPLATE_ID,
  MOCK_TEMPLATES,
  buildAttachmentExtraction,
  buildMilestonesPass,
} from './fixtures/analyst-demo';
import {
  LlmError,
  type LlmCapabilities,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ModelValidationResult,
} from './types';

/** The mock's claim about itself. A mock can answer any modality by construction. */
export const MOCK_CAPABILITIES: LlmCapabilities = {
  jsonOutput: true,
  toolCalls: false,
  vision: true,
  audio: true,
  video: true,
};

/** Model ids the mock accepts as configured (`04` section 5.4 step 7). */
export const MOCK_KNOWN_MODEL_IDS = [
  'mock',
  'gemini-3.8-flash',
  'deepseek-flash',
  'deepseek-v4-pro',
] as const;

export type MockResponseOverrides = Partial<
  Pick<LlmResponse, 'json' | 'text' | 'finishReason' | 'usage' | 'toolCalls'>
>;

const registry = new Map<string, MockResponseOverrides>();

/**
 * A stable key for a request: SHA-256 over the capability, the prompt version, and a canonical
 * rendering of everything that can change the answer.
 *
 * Canonical means sorted object keys and no whitespace, so two structurally-equal requests from
 * different call sites produce the same key. `sessionId` and `timeoutMs` are excluded on purpose:
 * they are budget and transport settings, and including them would let the same prompt produce two
 * different fixtures.
 */
export function mockResponseKey(request: LlmRequest): string {
  const canonical = canonicalise({
    capability: request.capability,
    systemPrefixId: request.systemPrefixId,
    messages: request.messages,
    responseFormat: request.responseFormat,
    temperature: request.temperature,
    modelId: request.modelId,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Register an exact response for an exact request. Used by tests and by the Phase 3 golden set. */
export function registerMockResponse(key: string, response: MockResponseOverrides): void {
  registry.set(key, response);
}

/** Drop every registered override. Tests call this in `afterEach` so one test cannot leak into another. */
export function resetMockResponses(): void {
  registry.clear();
}

export interface MockDeps {
  readonly now?: () => Date;
}

export function createMockProvider(deps: MockDeps = {}): LlmProvider {
  const now = deps.now ?? ((): Date => new Date());

  return {
    id: 'mock',
    capabilities: MOCK_CAPABILITIES,

    async validateConfiguration(): Promise<ModelValidationResult> {
      // `04` section 5.4 step 7: the network probe is skipped entirely. One code path for the demo
      // and the tests is the reason the mock exists.
      return {
        ok: true,
        provider: 'mock',
        modelId: 'mock',
        checkedAt: now().toISOString(),
        latencyMs: 0,
      };
    },

    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (request.capability === 'insight_engine') {
        // D67, stated in the mock too: a capability that makes no model call must fail loudly on
        // every provider, or a later phase learns the wrong rule from the offline path.
        throw new LlmError(
          'CONFIG_INVALID',
          'the insight engine makes no model call (D67); this request is a programming error',
          false,
        );
      }

      const key = mockResponseKey(request);
      const override = registry.get(key);
      if (override !== undefined) {
        return responseFor(request, override, key);
      }

      const chunks = parseGroundingChunks(userText(request));
      const template = templateFor(request, chunks);
      if (template === null) {
        // Refusal, not an invented success. See the file header.
        return {
          provider: 'mock',
          modelId: request.modelId,
          json: null,
          text: null,
          toolCalls: [],
          usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
          finishReason: 'content_filter',
          latencyMs: 0,
          providerRequestId: `mock-unknown-${key.slice(0, 12)}`,
        };
      }
      return responseFor(request, { json: template, finishReason: 'stop' }, key);
    },
  };
}

/**
 * The template for this request, or null when there is none.
 *
 * Keyed by `systemPrefixId` (so a prompt version that has no fixture refuses rather than answering
 * a prompt it was never written for) and by capability for `attachment_extraction`, which has no
 * grounding chunks.
 */
function templateFor(
  request: LlmRequest,
  chunks: readonly ParsedGroundingChunk[],
): unknown | null {
  if (request.capability === 'attachment_extraction') {
    const attachment = firstAttachment(request);
    return buildAttachmentExtraction(
      attachment === null
        ? { partType: 'text', mimeType: 'text/plain', byteLength: 0 }
        : attachment,
    );
  }
  if (request.systemPrefixId === MILESTONES_TEMPLATE_ID) {
    return buildMilestonesPass(chunks, countRequirements(userText(request)));
  }
  const template = MOCK_TEMPLATES[request.systemPrefixId];
  if (template === undefined) return null;
  return template(chunks);
}

interface AttachmentSummary {
  readonly partType: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

function firstAttachment(request: LlmRequest): AttachmentSummary | null {
  for (const message of request.messages) {
    for (const part of message.content) {
      if (part.type === 'text') continue;
      return {
        partType: part.type,
        mimeType: part.mimeType,
        byteLength: part.dataBase64.length,
      };
    }
  }
  return null;
}

/**
 * How many requirements the pipeline rendered ahead of a milestones pass.
 *
 * The pipeline writes them as `R0.`, `R1.`, ... lines (see `src/features/ingest/analyst.ts`), so
 * the count is recoverable from the request without a second input. A count of 0 leaves every
 * milestone's `requirementRefs` empty, which the pipeline reports as the
 * `MILESTONE_WITHOUT_REQUIREMENT` blocker rather than silently inventing a link.
 */
function countRequirements(text: string): number {
  let highest = -1;
  for (const match of text.matchAll(/(?:^|\n)R(\d+)\.\s/g)) {
    const index = Number(match[1]);
    if (Number.isSafeInteger(index) && index > highest) highest = index;
  }
  return highest + 1;
}

function userText(request: LlmRequest): string {
  return request.messages
    .filter((message) => message.role !== 'system')
    .flatMap((message) => message.content)
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
}

/** Assemble a response. Usage is derived from the payload, so it is stable across runs. */
function responseFor(
  request: LlmRequest,
  override: MockResponseOverrides,
  key: string,
): LlmResponse {
  const json = override.json ?? null;
  const text = override.text ?? (json === null ? null : JSON.stringify(json));
  return {
    provider: 'mock',
    modelId: request.modelId,
    json,
    text,
    toolCalls: override.toolCalls ?? [],
    usage: override.usage ?? {
      inputTokens: approximateTokens(userText(request).length),
      cachedInputTokens: 0,
      outputTokens: approximateTokens(text === null ? 0 : text.length),
    },
    finishReason: override.finishReason ?? (json === null ? 'content_filter' : 'stop'),
    // A mock has no latency beyond the work it just did. Reporting a plausible-looking number would
    // put invented data in the audit log and in every latency comparison.
    latencyMs: 0,
    providerRequestId: `mock-${key.slice(0, 12)}`,
  };
}

/** A rough 4-chars-per-token estimate, labelled as an estimate and used only by the mock. */
function approximateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

/** Stable JSON: sorted keys, no whitespace. Two equal shapes always hash the same. */
function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalise(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(record[key])}`).join(',')}}`;
}
