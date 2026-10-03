// Vitest configuration -- `04` S2.2 pins vitest 5.0.3; `12` S3.7 requires the suite to
// pass with NO network access. Nothing here may reach the network or read a provider key.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A guardrail or auth test that silently runs nowhere is worse than a failing one.
    // Do not add `passWithNoTests`: an empty suite must fail loudly (`12` S3.7).
    passWithNoTests: false,
  },
});
