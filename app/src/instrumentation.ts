/**
 * Process startup (`04` section 5.4): validate the provider configuration **once, before any request
 * is served**, and fail where a developer sees it rather than in front of a judge.
 *
 * The failure this prevents is specific. An unknown model id or a bad thinking level returns HTTP 400
 * from the provider. If that is discovered on the first student message, the failure is attributed to
 * the assistant rather than to configuration -- and `04` section 12 lists exactly that as the failure
 * the architecture is designed around.
 *
 * **The reading applied here, recorded rather than assumed.** `04` section 5.4 says an invalid
 * provider configuration aborts the process with exit code 78. Taken literally for *every* problem,
 * an unconfigured checkout (no `.env`, so `AUTH_SECRET` is a placeholder and fatal) could no longer
 * start a dev server at all, and `/api/health` -- whose whole purpose is to report a degraded
 * environment without dying (D77) -- would never be reachable. So:
 *
 * | Situation | Behaviour |
 * |---|---|
 * | Config is valid and the provider is a network provider | probe once; on failure, print a secret-free line and exit 78 |
 * | Config is valid and `LLM_PROVIDER=mock` | no probe at all (`04` section 5.4 step 7) |
 * | Config has fatal problems (an unconfigured checkout) | report the variable **names** and continue; every route that needs the provider still throws `ConfigError` at the point of use |
 *
 * The invariant that matters is preserved in all three rows: **no request is ever answered by an
 * unvalidated model.** The middle and last rows do not answer anything -- the mock needs no network
 * and the unconfigured case cannot reach a provider at all.
 *
 * `process.exit` is deliberate and is the only one in `app/`: a wrapper that swallowed this code
 * would be a defect, which is why the check is not inside a route handler.
 */

export async function register(): Promise<void> {
  // `instrumentation.ts` is also evaluated for the edge runtime (the middleware). The database
  // driver, argon2 and the provider adapters are Node-only, so this does nothing there.
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;

  // Imported dynamically: a static import would pull the Postgres driver and the config module into
  // the edge bundle, which is a build error rather than a runtime one.
  const { readConfig, fatalProblems } = await import('@/lib/config');
  const { validateProviderConfiguration } = await import('@/lib/llm');
  const { EXIT_CONFIG } = await import('@/lib/config');

  const result = readConfig();
  const fatal = fatalProblems(result.problems);
  if (fatal.length > 0) {
    // Variable names only, never values (C7). The process continues so `/api/health` can explain
    // the state and so a route that needs the provider fails where it is used.
    process.stderr.write(
      `config: ${fatal.map((problem) => problem.variable).join(', ')} not usable; the server will report unhealthy\n`,
    );
    return;
  }

  try {
    const validation = await validateProviderConfiguration(result.config);
    if (validation.ok) {
      process.stdout.write(
        `llm: ${validation.provider} ${validation.modelId} validated in ${String(validation.latencyMs)}ms\n`,
      );
      return;
    }
    // A safe sentence: `validateConfiguration` reports one bounded message field and never the key.
    process.stderr.write(
      `llm: provider configuration is not usable (${validation.errorCode ?? 'CONFIG_INVALID'}): ${validation.reason ?? 'no reason reported'}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'the provider could not be validated';
    process.stderr.write(`llm: provider configuration is not usable: ${message}\n`);
  }

  process.exit(EXIT_CONFIG);
}
