/**
 * Shared API response contracts.
 *
 * `04` S5.1 requires typed request/response contracts shared with the client. This file
 * is the home for the response types `06-DATA-MODEL.md` S5.4 references: Phase 0 found
 * about ten of them referenced but never defined (handoff I-03), and the rule recorded
 * there is to define each one when the route that returns it is built. `/api/health` is
 * the first such route, so `HealthResponse` is defined here (decision **D76**).
 *
 * Nothing in this file may contain a secret (C7). A response type that has a field for a
 * key, a hash, or a raw session token is a defect, not a convenience.
 */

/**
 * `GET /api/health` -> 200. Liveness and provider-configuration *presence*, never values
 * (`06` S5.4). Public route: it must not reveal whether a key is valid, only whether the
 * app is up and how it is configured.
 *
 * - `ok`          -- true only when there are no config problems **and** the database answers.
 * - `db`          -- `down` also covers "`DATABASE_URL` is not set"; the process stays alive (D77).
 * - `llmProvider` -- the resolved provider id, never the key (`gemini` | `deepseek` | `mock`).
 * - `commit`      -- short SHA, or `unknown`.
 */
export interface HealthResponse {
  ok: boolean;
  db: 'up' | 'down';
  llmProvider: string;
  commit: string;
}
