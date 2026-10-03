import { NextResponse } from 'next/server';

import type { HealthResponse } from '@/lib/api/types';
import { getConfigRead, readCommitSha } from '@/lib/config';
import { probeDatabase } from '@/lib/db/client';

// The `postgres` driver needs Node, not the edge runtime.
export const runtime = 'nodejs';

// A health check that can be cached is not a health check.
export const dynamic = 'force-dynamic';

/**
 * `GET /api/health` (`06` S5.4: public; "liveness and provider-configuration presence,
 * never values"). WP-01 fixes the body as `{ ok, db, llmProvider, commit }` (D76).
 *
 * Never throws and never aborts on a missing `DATABASE_URL`: a degraded database is
 * reported as `db: "down"` with `ok: false` so the process stays up long enough to be
 * diagnosed (D77). No secret, key, hash or connection string may appear in the body (C7);
 * `llmProvider` is the id, not the credential.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const { config, problems } = getConfigRead();
  const db = await probeDatabase(config.databaseUrl);
  const body: HealthResponse = {
    // Any problem at all -- fatal or degraded -- means the deployment is not healthy.
    ok: problems.length === 0 && db === 'up',
    db,
    llmProvider: config.llmProvider,
    commit: readCommitSha(),
  };
  return NextResponse.json(body, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}
