/**
 * The provider adapter's entry point: `resolveProvider()`, the budget-checked client, and startup
 * validation (`04` sections 5.1, 5.4, 5.6).
 *
 * Everything above this module depends on `LlmProvider` and never on a vendor type (C8, D39). This
 * file is the only place that decides which provider is in play.
 *
 * The client wrapper exists so that three cross-cutting rules cannot be forgotten at a call site:
 *
 * 1. **The budget is consumed before the call** (`04` section 5.6). A provider that is called
 *    without passing through here is a bug, which is why `getLlmClient()` is the only exported way
 *    to obtain one.
 * 2. **Every call produces a `LlmCallLog`** -- decision fields only, never a request or response
 *    body (`04` section 10.1, C7). A caller that wants to persist one passes `onCall`.
 * 3. **The mock is not special-cased** (`04` section 5.8 rule 2): it is wrapped by exactly the same
 *    client as the network providers, including the budget check.
 */

import { getConfig, type AppConfig } from '@/lib/config';

import { createPostgresBudgetStore, maxCallsFromConfig, scopeKeyFor, scopeKindForCapability, budgetExceeded, type BudgetStore } from './budget';
import { createDeepseekProvider } from './deepseek';
import { createGeminiProvider } from './gemini';
import { createMockProvider } from './mock';
import {
  LlmError,
  type LlmCallLog,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  type LlmResponse,
  type ModelValidationResult,
} from './types';

export * from './types';

/**
 * Build the provider named by the configuration.
 *
 * Pure: it reads the `AppConfig` it is given and never `process.env` (`config.ts` is the only
 * module allowed to do that). `config.ts` has already validated that the provider's key is present
 * and that the thinking levels are legal, so a missing key here is a programming error rather than
 * user input to report.
 */
export function resolveProvider(config: AppConfig): LlmProvider {
  switch (config.llmProvider) {
    case 'gemini':
      if (config.geminiApiKey === null) {
        throw new LlmError('CONFIG_INVALID', 'GEMINI_API_KEY is not set', false);
      }
      return createGeminiProvider({
        apiKey: config.geminiApiKey,
        baseUrl: config.llmBaseUrl,
        thinkingLevels: config.llmThinking,
      });
    case 'deepseek':
      if (config.deepseekApiKey === null) {
        throw new LlmError('CONFIG_INVALID', 'DEEPSEEK_API_KEY is not set', false);
      }
      return createDeepseekProvider({
        apiKey: config.deepseekApiKey,
        baseUrl: config.llmBaseUrl,
        thinkingLevels: config.llmThinking,
      });
    case 'mock':
      return createMockProvider();
  }
}

export interface LlmClientOptions {
  readonly provider: LlmProvider;
  readonly config: AppConfig;
  /** Defaults to the Postgres store. Tests inject a fake so the suite needs no database. */
  readonly budget?: BudgetStore;
  readonly onCall?: (log: LlmCallLog) => void;
  readonly now?: () => Date;
}

/**
 * Wrap a provider with budget enforcement and call logging.
 *
 * Returns an `LlmProvider`, not a bespoke client type, so nothing above it can come to depend on
 * the wrapper's existence.
 */
export function createLlmClient(options: LlmClientOptions): LlmProvider {
  const budget = options.budget ?? createPostgresBudgetStore();
  const now = options.now ?? ((): Date => new Date());
  const maxCalls = maxCallsFromConfig(options.config);

  return {
    id: options.provider.id,
    capabilities: options.provider.capabilities,

    validateConfiguration(): Promise<ModelValidationResult> {
      return options.provider.validateConfiguration();
    },

    async complete(request: LlmRequest): Promise<LlmResponse> {
      const startedAt = now().toISOString();
      const scopeKey = scopeKeyFor(request.capability, request.sessionId);

      // Before the call, never after (04 section 5.6).
      const consumed = await budget.consume({
        scopeKey,
        scopeKind: scopeKindForCapability(request.capability),
        maxCalls,
      });
      if (!consumed.allowed) {
        const error = budgetExceeded();
        options.onCall?.({
          capability: request.capability,
          provider: options.provider.id,
          modelId: request.modelId,
          systemPrefixId: request.systemPrefixId,
          sessionId: request.sessionId,
          startedAt,
          latencyMs: 0,
          usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
          ok: false,
          errorCode: error.code,
          providerRequestId: null,
        });
        throw error;
      }

      try {
        const response = await options.provider.complete(request);
        options.onCall?.({
          capability: request.capability,
          provider: response.provider,
          modelId: response.modelId === '' ? request.modelId : response.modelId,
          systemPrefixId: request.systemPrefixId,
          sessionId: request.sessionId,
          startedAt,
          latencyMs: response.latencyMs,
          usage: response.usage,
          ok: true,
          errorCode: null,
          providerRequestId: response.providerRequestId,
        });
        return response;
      } catch (error) {
        const code = error instanceof LlmError ? error.code : 'PROVIDER_UNAVAILABLE';
        options.onCall?.({
          capability: request.capability,
          provider: options.provider.id,
          modelId: request.modelId,
          systemPrefixId: request.systemPrefixId,
          sessionId: request.sessionId,
          startedAt,
          latencyMs: elapsedMs(startedAt, now()),
          usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
          ok: false,
          errorCode: code,
          providerRequestId: null,
        });
        throw error;
      }
    },
  };
}

/** Recover the scope kind from the prefixed key built by `scopeKeyFor`. */
function elapsedMs(startedAt: string, ended: Date): number {
  const started = Date.parse(startedAt);
  return Number.isFinite(started) ? Math.max(0, ended.getTime() - started) : 0;
}

/**
 * Startup validation (`04` section 5.4): build the provider and run its one minimal probe.
 *
 * Called once per process by `src/instrumentation.ts`. It does not throw: the caller decides,
 * because the difference between "the provider is unreachable" and "the environment is not
 * configured at all" matters for a local checkout.
 */
export async function validateProviderConfiguration(
  config: AppConfig,
): Promise<ModelValidationResult> {
  const provider = resolveProvider(config);
  return provider.validateConfiguration();
}

let cached: LlmProvider | null = null;
let cachedProviderId: LlmProviderId | null = null;

/**
 * The process-wide client, built from the validated config.
 *
 * Memoised per provider id: a provider is cheap to construct but the configuration behind it is
 * read once, and re-reading it per request would be a second `process.env` reader in spirit even if
 * it went through `config.ts`.
 */
export function getLlmClient(): LlmProvider {
  const config = getConfig();
  if (cached === null || cachedProviderId !== config.llmProvider) {
    cached = createLlmClient({ provider: resolveProvider(config), config });
    cachedProviderId = config.llmProvider;
  }
  return cached;
}

/** Test seam: drop the memoised client (mirrors `resetConfigCache`). */
export function resetLlmClient(): void {
  cached = null;
  cachedProviderId = null;
}
