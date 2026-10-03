/**
 * Student attachment intake: the path that stops an upload becoming a route around C1 (C6, D10, O11).
 *
 * The shipped modalities are **PNG/JPEG, PDF and plain text**. Audio and video are refused **at the
 * picker** with rule `UP5`, before storage and before any extraction, so they never produce a
 * `student_uploads` row, a storage key or an adapter call. That ordering is the whole point: the
 * refusal comes from the modality, not from a content judgement, so enabling audio later cannot
 * silently ship a more permissive path (`04` section 12).
 *
 * Extraction runs here, at upload, as capability `attachment_extraction` (D68, trap T6):
 *
 * | Modality | Extraction | Model calls |
 * |---|---|---|
 * | `text/plain` | the bytes are the text | 0 |
 * | `application/pdf` | the PDF text layer, locally | 0 |
 * | `image/png`, `image/jpeg` | vision transcription through the adapter | 1, its own budget scope |
 *
 * **The scan is deliberately left `pending`.** `guardrail_scan_status` starts at `pending`, and
 * `06` section 5.5.9 stream rule 5 refuses any upload whose scan is not `clear`. The guardrail is
 * Phase 3's (WP-08); Phase 2 does not write `clear`, because a scan status of `clear` that no policy
 * engine produced would be exactly the permissive-by-default failure `AGENTS.md` section 6 forbids.
 * The seam is `scan`: when Phase 3 supplies one, the status becomes `clear` or `blocked` with a
 * reason code and the attachment path completes.
 *
 * Nothing in this module logs or returns `extracted_text`, a storage key or the original filename.
 */

import { randomUUID } from 'node:crypto';

import type { AppConfig } from '@/lib/config';
import { extractDocument } from '@/lib/extract';
import type { LlmCallLog, LlmProvider } from '@/lib/llm/types';
import { uploadStorageKey, type StorageDriver } from '@/lib/storage';
import { withTransaction } from '@/lib/db/transaction';
import {
  findStudentUpload,
  insertStudentUpload,
  updateUploadExtraction,
  updateUploadScan,
  type StudentUploadState,
  type UploadKind,
} from '@/lib/db/queries/uploads';

import { extractAttachment } from '@/features/ingest/analyst';
import { resolveMultimodalModelId } from '@/features/ingest/pipeline';

/** Modalities the picker offers (O11), mapped to the `student_uploads.kind` value. */
const ACCEPTED: Readonly<Record<string, { kind: UploadKind; extension: string }>> = {
  'image/png': { kind: 'image', extension: 'png' },
  'image/jpeg': { kind: 'image', extension: 'jpg' },
  'application/pdf': { kind: 'pdf', extension: 'pdf' },
  'text/plain': { kind: 'text', extension: 'txt' },
};

/**
 * Modalities the picker refuses with `UP5` (`04` section 7 stage S1, `04` section 12).
 *
 * Listed explicitly rather than "anything not in ACCEPTED", because the two refusals are different
 * facts and the product states them differently: audio and video are *unavailable*, and any other
 * type is *not accepted here*. A single "unsupported" error for both would tell a student that audio
 * might work if they converted it.
 */
const REFUSED_AT_PICKER: Readonly<Record<string, true>> = {
  'audio/mpeg': true,
  'audio/mp3': true,
  'audio/wav': true,
  'audio/x-wav': true,
  'video/mp4': true,
  'video/quicktime': true,
};

export interface AttachmentRefusal {
  readonly code: 'UNSUPPORTED_FORMAT' | 'PAYLOAD_TOO_LARGE';
  /** `UP5` for audio and video; absent for any other refusal. */
  readonly rule?: 'UP5';
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface AttachInput {
  readonly studentId: string;
  readonly assignmentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly config: AppConfig;
  readonly storage: StorageDriver;
  readonly client: LlmProvider;
  /**
   * The guardrail scan, supplied by Phase 3. Absent means the scan stays `pending` and the upload
   * cannot be attached -- refuse by default, never `clear` by omission.
   */
  readonly scan?: (input: {
    readonly text: string;
    readonly kind: UploadKind;
  }) => Promise<{ readonly status: 'clear' | 'blocked'; readonly reasonCode: string | null }>;
  readonly onCall?: (log: LlmCallLog) => void;
}

export type AttachResult =
  | { readonly ok: true; readonly upload: StudentUploadState }
  | { readonly ok: false; readonly refusal: AttachmentRefusal };

/**
 * Validate, store and extract one upload.
 *
 * Order: size, then modality, then storage, then the row, then extraction. Nothing is written before
 * the modality is accepted, and nothing is extracted before the bytes are stored -- so a refusal
 * leaves no orphan object and a failed extraction leaves a row a student can see the state of.
 */
export async function attachStudentUpload(input: AttachInput): Promise<AttachResult> {
  const mimeType = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (input.bytes.byteLength > input.config.uploadMaxBytes) {
    return {
      ok: false,
      refusal: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'That file is larger than the upload limit.',
        details: { maxBytes: input.config.uploadMaxBytes },
      },
    };
  }

  if (REFUSED_AT_PICKER[mimeType] === true) {
    return {
      ok: false,
      refusal: {
        code: 'UNSUPPORTED_FORMAT',
        rule: 'UP5',
        message: 'Audio and video are not available. Attach an image, a PDF or a text file.',
        details: { allowedFormats: Object.keys(ACCEPTED), rule: 'UP5' },
      },
    };
  }

  const accepted = ACCEPTED[mimeType];
  if (accepted === undefined) {
    return {
      ok: false,
      refusal: {
        code: 'UNSUPPORTED_FORMAT',
        message: 'That file type is not accepted here.',
        details: { allowedFormats: Object.keys(ACCEPTED) },
      },
    };
  }

  const uploadId = randomUUID();
  // The key is generated server-side from ids, never from the uploaded filename: a user-controlled
  // path segment is a path-traversal defect (`11` WP-04 acceptance).
  const key = uploadStorageKey(input.studentId, uploadId, accepted.extension);
  await input.storage.put({ key, bytes: input.bytes, contentType: mimeType });

  const created = await withTransaction((tx) =>
    insertStudentUpload(tx, {
      id: uploadId,
      studentId: input.studentId,
      assignmentId: input.assignmentId,
      kind: accepted.kind,
      originalFilename: input.filename.slice(0, 255),
      storageKey: key,
      mimeType,
      byteSize: input.bytes.byteLength,
    }),
  );
  if (!created) {
    return {
      ok: false,
      refusal: { code: 'UNSUPPORTED_FORMAT', message: 'That upload could not be recorded.' },
    };
  }

  const extracted = await extractUploadText(input, accepted.kind, mimeType);
  await withTransaction(async (tx) => {
    await updateUploadExtraction(tx, {
      uploadId,
      status: extracted.status,
      extractedText: extracted.text,
      extractionModelId: extracted.modelId,
    });
    if (input.scan !== undefined && extracted.text !== null) {
      const decision = await input.scan({ text: extracted.text, kind: accepted.kind });
      await updateUploadScan(tx, {
        uploadId,
        status: decision.status,
        reasonCode: decision.status === 'blocked' ? (decision.reasonCode ?? 'SCAN_BLOCKED') : null,
      });
    }
  });

  const state = await withTransaction((tx) => findStudentUpload(tx, uploadId, input.studentId));
  if (state === null) {
    return { ok: false, refusal: { code: 'UNSUPPORTED_FORMAT', message: 'That upload could not be recorded.' } };
  }
  return { ok: true, upload: state };
}

interface ExtractionOutcome {
  readonly status: 'extracted' | 'failed';
  readonly text: string | null;
  readonly modelId: string | null;
}

/**
 * `attachment_extraction` for one upload (D68).
 *
 * The text modality makes no call at all: D68 says "one call per upload (zero when the content is
 * already text)". A PDF uses the local text layer for the same reason -- the model cannot read a
 * document better than the document's own text layer, and a call that adds nothing is a cost and a
 * new failure mode.
 */
async function extractUploadText(
  input: AttachInput,
  kind: UploadKind,
  mimeType: string,
): Promise<ExtractionOutcome> {
  if (kind === 'text') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes).replace(/\ufeff/g, '');
    return { status: text.trim() === '' ? 'failed' : 'extracted', text, modelId: null };
  }

  if (kind === 'pdf') {
    try {
      // `Uint8Array.from` copies: `pdfjs` detaches the buffer it is given (trap T22).
      const result = await extractDocument({ bytes: Uint8Array.from(input.bytes), mimeType });
      if (!result.hasTextLayer) {
        return { status: 'failed', text: null, modelId: null };
      }
      return { status: 'extracted', text: result.text, modelId: null };
    } catch {
      return { status: 'failed', text: null, modelId: null };
    }
  }

  const extracted = await extractAttachment({
    client: input.client,
    modelId: resolveMultimodalModelId(input.config),
    systemPrefixId: 'attachment_extraction-v1',
    mimeType,
    dataBase64: Buffer.from(input.bytes).toString('base64'),
    partType: 'image',
    // Its own budget scope, never the assistant session counter (D68).
    scopeKey: input.studentId,
    onCall: input.onCall,
  });
  if (extracted === null || extracted.text.trim() === '') {
    return { status: 'failed', text: null, modelId: resolveMultimodalModelId(input.config) };
  }
  return { status: 'extracted', text: extracted.text, modelId: resolveMultimodalModelId(input.config) };
}
