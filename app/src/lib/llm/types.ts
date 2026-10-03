/**
 * The provider adapter's contract.
 *
 * **This file is FROZEN at Phase 2** (`docs/handoff/04-INTERFACES.md` section 1; `18` section 5:
 * Phase 2 must hand off "`src/lib/llm/types.ts` and `schema.ts` frozen"). The declarations below
 * are reproduced from `docs/04-TECH-ARCHITECTURE.md` section 5.2, which is normative: a change here
 * is an interface change and follows the rule in `docs/handoff/04-INTERFACES.md` -- raise it in
 * `05-ISSUES.md`, record why in `02-DECISIONS.md`, then update that file in the same commit.
 *
 * Why the contract is this shape (`04` section 5.1): provider choice is a configuration decision
 * (D39, D61), so nothing above this interface may depend on a vendor type. Everything the adapter
 * handles once instead of per call site -- model ids, retries, timeouts, thinking level, budget
 * accounting, prompt-cache-friendly ordering -- is a field on `LlmRequest` or a member of
 * `LlmProvider`, so those behaviours are testable through one seam.
 *
 * `AiCapability` carries six members. `attachment_extraction` is the sixth (D68, trap T6): it is
 * classification-controlled, runs at upload rather than inside an assistant turn, has its own
 * thinking level (`LLM_THINKING_EXTRACTION`) and its own budget counter, and its output is never
 * used to ground another student's answer. The `insight_engine` member exists as a named internal
 * capability even though it makes no model call at all (D67), which is why there is no
 * `LLM_THINKING_INSIGHT` variable.
 */

/** Provider ids the adapter resolves (`04` section 5.2). `gemini` is the default (D61). */
export type LlmProviderId = 'deepseek' | 'gemini' | 'mock';

/**
 * Which job a call is doing. One member per call site, not one per prompt.
 *
 * Ordering rule the members exist to make expressible (`04` section 4, property 1): every
 * capability except `attachment_extraction` runs only after the guardrail's L0-L3 decision.
 */
export type AiCapability =
  | 'assignment_analyst'
  | 'policy_guard'
  | 'student_assistant'
  | 'discussion_moderator'
  | 'insight_engine'
  | 'attachment_extraction';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmTextPart {
  type: 'text';
  text: string;
}
export interface LlmImagePart {
  type: 'image';
  mimeType: string;
  dataBase64: string;
}
export interface LlmAudioPart {
  type: 'audio';
  mimeType: string;
  dataBase64: string;
}
export interface LlmVideoPart {
  type: 'video';
  mimeType: string;
  dataBase64: string;
}
export interface LlmDocumentPart {
  type: 'document';
  mimeType: string;
  dataBase64: string;
  name: string;
}
export type LlmContentPart =
  | LlmTextPart
  | LlmImagePart
  | LlmAudioPart
  | LlmVideoPart
  | LlmDocumentPart;

export interface LlmMessage {
  role: LlmRole;
  content: LlmContentPart[];
}

export interface JsonSchema {
  [key: string]: unknown;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmResponseFormat {
  type: 'json_schema';
  /** Stable schema name, e.g. `guardrail_decision`. Part of the provider-side cache key too. */
  name: string;
  schema: JsonSchema;
  strict: true;
}

export interface LlmRequest {
  capability: AiCapability;
  /** Resolved from env at startup and validated there. Never a literal at a call site. */
  modelId: string;
  /** Stable id of the unchanging prompt prefix. Part of the cache key and the audit log. */
  systemPrefixId: string;
  /** Static prefix first, variable content last. See `04` section 5.5. */
  messages: LlmMessage[];
  responseFormat: LlmResponseFormat | { type: 'text' };
  tools?: LlmToolDefinition[];
  /** 0 for every classifying capability. */
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  /**
   * Budget accounting unit. One assistant session, one ingestion run, one moderation batch, one
   * attachment-extraction scope -- the last counted separately (`04` section 9.2 step 12, D68).
   */
  sessionId: string;
}

export interface LlmToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface LlmUsage {
  inputTokens: number;
  /** Cache hits; must be reported by the provider or 0. Never estimated. */
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  provider: LlmProviderId;
  modelId: string;
  /** Parsed JSON when `responseFormat` is `json_schema`; otherwise null. Untrusted until validated. */
  json: unknown | null;
  text: string | null;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  latencyMs: number;
  providerRequestId: string | null;
}

export interface LlmCapabilities {
  jsonOutput: boolean;
  toolCalls: boolean;
  vision: boolean;
  audio: boolean;
  video: boolean;
}

export interface ModelValidationResult {
  ok: boolean;
  provider: LlmProviderId;
  modelId: string;
  /** ISO 8601. */
  checkedAt: string;
  errorCode?: LlmErrorCode;
  reason?: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly capabilities: LlmCapabilities;
  /** Startup only. Must be called once per process before any request is served. See `04` 5.4. */
  validateConfiguration(): Promise<ModelValidationResult>;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export type LlmErrorCode =
  | 'CONFIG_INVALID'
  | 'MODEL_UNKNOWN'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCHEMA_INVALID'
  | 'BUDGET_EXCEEDED'
  | 'CONTENT_FILTERED';

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;

  constructor(code: LlmErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * One model call, as the audit row a caller may persist.
 *
 * `04` section 10.1 is the contract for what may be logged, and it is a list of **exclusions**:
 * no student text, no upload bytes, no extracted upload text, no file names, no email addresses,
 * no keys, no cookies. This type therefore carries only the decision fields -- who called, which
 * prompt version, which model, what it cost, how long it took -- and no request or response body.
 * It is additive to `04` section 5.2 (named by `11` WP-04's file list) and not part of the vendor
 * boundary.
 */
export interface LlmCallLog {
  capability: AiCapability;
  provider: LlmProviderId;
  modelId: string;
  systemPrefixId: string;
  /** The budget unit this call was counted against (`LlmRequest.sessionId`). */
  sessionId: string;
  /** Iso 8601. */
  startedAt: string;
  latencyMs: number;
  usage: LlmUsage;
  ok: boolean;
  errorCode: LlmErrorCode | null;
  providerRequestId: string | null;
}
