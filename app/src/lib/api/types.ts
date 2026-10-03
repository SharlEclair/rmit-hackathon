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

/**
 * `POST|GET /api/tutor/assignments/{assignmentId}/ingest` (`06` section 5.5.8).
 *
 * The polling shape for the Postgres-backed job row D60 makes the execution model. Phase 2 built the
 * row (migration `0011`, `06` section 7.7.1) and this response, closing handoff issue I-15 for the
 * response half; the row's stage enum is `S0`-`S7`.
 */
export interface IngestionStatusResponse {
  jobId: string;
  assignmentId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | null;
  /** `S0`-`S7` = 8 stages today. Sent rather than hard-coded in the client. */
  completedStages: number;
  totalStages: number;
  startedAt: string;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}

/**
 * `POST /api/student/uploads` and `GET /api/student/uploads/{uploadId}` (`06` section 5.5.10).
 *
 * **`storageKey`, the original filename and the extracted text are absent by contract.** They exist
 * on the row and must never appear here (I-7, `06` section 5.5.10).
 */
export interface StudentUploadResponse {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  byteSize: number;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'failed';
  guardrailScanStatus: 'pending' | 'clear' | 'blocked';
  guardrailReasonCode: string | null;
  createdAt: string;
}

/**
 * `POST /api/tutor/assignments/{assignmentId}/sources` (`06` section 5.4).
 *
 * `05-ISSUES.md` I-03 lists `AssignmentSourceResponse` among the response types `06` references and
 * never defines; this is its definition, written when the route that returns it was built.
 * `storageKey` is absent for the same reason as above (`06` section 6.9 rule 2).
 */
export interface AssignmentSourceResponse {
  id: string;
  kind: 'brief' | 'rubric' | 'ai_policy' | 'marking_guide' | 'supplementary';
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  pageCount: number | null;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'failed';
  extractionError: string | null;
  createdAt: string;
}
