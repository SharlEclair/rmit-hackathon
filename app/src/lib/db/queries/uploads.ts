/**
 * Student uploads: `student_uploads` (`06` section 7.3.6; migration `0005`).
 *
 * Class: identity-bearing, student-facing only. Every read filters by `student_id`, never by a
 * client-supplied student id (`06` section 5.2 rule 4): no endpoint accepts a student id, so a
 * caller cannot ask for somebody else's upload by naming it.
 *
 * `extracted_text` is written here and read by the guardrail path. It is never returned by an API,
 * never logged, and never selected by a tutor-facing query (`06` section 7.3.6, I-6).
 */

import type { Executor } from './courses';

/** `student_uploads.kind`, the shipped O11 modalities. Audio and video are refused at the picker. */
export type UploadKind = 'image' | 'pdf' | 'text';

export type UploadExtractionStatus = 'pending' | 'extracting' | 'extracted' | 'failed';
export type UploadScanStatus = 'pending' | 'clear' | 'blocked';

export interface NewStudentUpload {
  readonly id: string;
  readonly studentId: string;
  readonly assignmentId: string;
  readonly kind: UploadKind;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly byteSize: number;
}

export interface StudentUploadState {
  readonly id: string;
  readonly studentId: string;
  readonly assignmentId: string;
  readonly kind: UploadKind;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly extractionStatus: UploadExtractionStatus;
  readonly guardrailScanStatus: UploadScanStatus;
  readonly guardrailReasonCode: string | null;
  readonly createdAt: string;
}

export async function insertStudentUpload(ex: Executor, upload: NewStudentUpload): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into student_uploads (
      id, student_id, assignment_id, kind, original_filename, storage_key, mime_type, byte_size
    )
    values (
      ${upload.id}::uuid,
      ${upload.studentId}::uuid,
      ${upload.assignmentId}::uuid,
      ${upload.kind},
      ${upload.originalFilename},
      ${upload.storageKey},
      ${upload.mimeType},
      ${upload.byteSize}
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/** One upload, scoped to its owner. A row that is not the caller's is indistinguishable from absent. */
export async function findStudentUpload(
  ex: Executor,
  uploadId: string,
  studentId: string,
): Promise<StudentUploadState | null> {
  const rows = await ex<
    {
      id: string;
      student_id: string;
      assignment_id: string;
      kind: string;
      mime_type: string;
      byte_size: string | number;
      extraction_status: string;
      guardrail_scan_status: string;
      guardrail_reason_code: string | null;
      created_at: Date | string;
    }[]
  >`
    select id, student_id, assignment_id, kind, mime_type, byte_size,
           extraction_status, guardrail_scan_status, guardrail_reason_code, created_at
      from student_uploads
     where id = ${uploadId}::uuid and student_id = ${studentId}::uuid and deleted_at is null
     limit 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    assignmentId: row.assignment_id,
    kind: row.kind as UploadKind,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    extractionStatus: row.extraction_status as UploadExtractionStatus,
    guardrailScanStatus: row.guardrail_scan_status as UploadScanStatus,
    guardrailReasonCode: row.guardrail_reason_code,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** Record the extraction outcome. `extractedText` is student content and is never selected for a response. */
export async function updateUploadExtraction(
  ex: Executor,
  input: {
    readonly uploadId: string;
    readonly status: UploadExtractionStatus;
    readonly extractedText: string | null;
    readonly extractionModelId: string | null;
  },
): Promise<void> {
  await ex`
    update student_uploads
       set extraction_status = ${input.status},
           extracted_text = ${input.extractedText},
           extraction_model_id = ${input.extractionModelId}
     where id = ${input.uploadId}::uuid
  `;
}

/**
 * Record the guardrail scan outcome.
 *
 * The default for every upload is `pending`, and a `blocked` scan requires a reason code
 * (`06` section 7.3.6). Phase 2 does not set `clear`: the scan is the guardrail's, and Phase 3 owns
 * it. Until a scanner decides, the upload cannot be attached to an assistant turn, which is what
 * `06` section 5.5.9 stream rule 5 enforces and what C6 requires (refuse by default).
 */
export async function updateUploadScan(
  ex: Executor,
  input: {
    readonly uploadId: string;
    readonly status: UploadScanStatus;
    readonly reasonCode: string | null;
  },
): Promise<void> {
  await ex`
    update student_uploads
       set guardrail_scan_status = ${input.status},
           guardrail_reason_code = ${input.reasonCode}
     where id = ${input.uploadId}::uuid
  `;
}

/**
 * The extracted text of an upload, for the guardrail to read.
 *
 * Separate from `findStudentUpload` on purpose: the response shape and the scan input are different
 * audiences, and a single function returning both is how `extracted_text` ends up in a payload
 * (`06` section 5.5.10: "The response never contains ... the extracted text").
 */
export async function readUploadExtractedText(
  ex: Executor,
  uploadId: string,
  studentId: string,
): Promise<string | null> {
  const rows = await ex<{ extracted_text: string | null }[]>`
    select extracted_text
      from student_uploads
     where id = ${uploadId}::uuid and student_id = ${studentId}::uuid and deleted_at is null
     limit 1
  `;
  return rows[0]?.extracted_text ?? null;
}
