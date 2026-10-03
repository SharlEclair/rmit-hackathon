// Vitest configuration -- `04` S2.2 pins vitest 5.0.3; `12` S3.7 requires the suite to
// pass with NO network access. Nothing here may reach the network or read a provider key.
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The `@/*` alias from `tsconfig.json`, restated here because **Vitest does not read
    // `tsconfig.json` paths.** Without this, any test that loads a module importing `@/...`
    // fails to resolve -- and it fails transitively, so it is not obvious that the alias is
    // the cause. WP-03 hit this while writing `tests/auth/`, and worked around it by making
    // the modules under test import no project alias at all. That constraint is correct for
    // the crypto core anyway, but it must not be the only thing keeping the suite green.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A guardrail or auth test that silently runs nowhere is worse than a failing one.
    // Do not add `passWithNoTests`: an empty suite must fail loudly (`12` S3.7).
    passWithNoTests: false,
  },
});
