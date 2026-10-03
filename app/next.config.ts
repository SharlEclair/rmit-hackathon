import type { NextConfig } from 'next';

// One deployable: the UI and the JSON API are the same Next.js app (D36, `04` S2).
// Nothing is configured here yet that a later phase cannot add; keep this file
// free of feature flags, because a flag that can disable the guardrail is a defect
// (`04` S9.2, "None of them may be reordered, skipped, or made optional by a
// feature flag").
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The health route and every future route handler read secrets from the server-only
  // config module (`src/lib/config.ts`, C7). No env value is inlined into the client
  // bundle from this file.
  poweredByHeader: false,
};

export default nextConfig;
