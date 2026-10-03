/**
 * The object-storage interface, and the key rules every driver must honour.
 *
 * **Owner:** `04-TECH-ARCHITECTURE.md` S8 ("Storage"). The `StorageObject` and `StorageDriver`
 * declarations below are copied from that section's TypeScript block and must not drift from it;
 * S8 is the contract, this file is its transcription.
 *
 * **Two constraints this module exists to keep in one place.**
 *
 * 1. *The key is generated server-side* (`11-BUILD-PLAN.md` WP-04 acceptance: "No uploaded file is
 *    served from a path a user controls; the storage key is generated server-side (path
 *    traversal)"). `assertValidKey` is the single validation every driver calls, so a driver added
 *    later cannot be safe by accident. It rejects rather than sanitises: a key that had to be
 *    rewritten to be safe is a key the caller did not intend, and quietly serving the rewritten
 *    path is how a traversal attempt turns into a success.
 * 2. *The key convention lives here* (`04` S8): `assignments/<assignmentId>/sources/<sourceId>.<ext>`
 *    and `students/<userId>/uploads/<uploadId>.<ext>`. `sourceStorageKey`/`uploadStorageKey` are
 *    the only builders, so the convention cannot be restated differently in two call sites.
 *
 * **What is deliberately absent.** No metadata store. `04` S8 defines `StorageObject` as a value a
 * driver *returns*, not a record a driver *persists*, and the durable home of a source or upload is
 * `assignment_sources.storage_key` / `student_uploads.storage_key` in Postgres (`06` S7.2.2,
 * S7.3.6). So the S3 driver derives `createdAt` from its clock and `contentType` from the key
 * extension rather than pretending to read a record it never wrote. See `s3.ts`'s header.
 *
 * **Never log a key.** `06` S5.7 lists `storage_key` among the values that are never returned by an
 * API, and S7.3.6 repeats it for uploads (I-7). That is why nothing in `src/lib/storage/` writes to
 * stdout, including on the error paths: an error message naming the key would be a log line naming
 * the key.
 */

import type { AppConfig } from '@/lib/config';

/**
 * Every way a storage operation may fail, as a code a caller can branch on.
 *
 * The list is closed (`storage-errors` in `04` S8's vocabulary): a driver that invents a fifth code
 * is a defect, because callers switch exhaustively over these.
 */
export type StorageErrorCode =
  /** No object exists at this key. The only "absent" answer; a driver must not report absence as success. */
  | 'NOT_FOUND'
  /** The key failed `assertValidKey`. Nothing was read, written or signed. */
  | 'INVALID_KEY'
  /** This driver cannot produce a time-limited URL. See the I-06 note on `LocalStorageDriver`. */
  | 'SIGNED_URL_UNSUPPORTED'
  /** The driver cannot be constructed at all: its configuration is incomplete. */
  | 'DRIVER_UNAVAILABLE';

/** A storage failure carrying a branchable `code`. Never carries a key (I-7, C7). */
export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'StorageError';
    this.code = code;
  }
}

/** The stored-object descriptor (`04` S8, verbatim). */
export interface StorageObject {
  key: string;
  sizeBytes: number;
  contentType: string;
  contentHash: string; // SHA-256, lower-case hex, 64 characters
  createdAt: string; // ISO 8601
}

/** The driver contract (`04` S8, verbatim). */
export interface StorageDriver {
  readonly id: 'local' | 's3';
  put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<StorageObject>;
  get(key: string): Promise<{ bytes: Uint8Array; object: StorageObject }>;
  /** Time-limited URL for the PDF viewer. Never a public bucket URL. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Key rules
// ---------------------------------------------------------------------------------------------

/** A path segment longer than this many characters is refused rather than truncated. */
export const MAX_KEY_SEGMENT_LENGTH = 128;

/** The whole key. `06` S7.2.2/S7.3.6 store `storage_key` as `text`, but a key has no reason to be long. */
export const MAX_KEY_LENGTH = 512;

/**
 * The permitted character set. It is narrower than a POSIX filename on purpose: on Windows both
 * `:` and a trailing dot/space are meaningful, `?` and `#` alter a URL, and none of them appear in
 * a UUID or a file extension, so the character set costs nothing and removes a whole class of
 * "it depends on the filesystem" reasoning.
 */
const KEY_CHARACTERS = /^[A-Za-z0-9._/-]+$/;

/** The id/extension grammar used by the two key builders: a UUID, or any filesystem-safe token. */
const KEY_TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a storage key, throwing `StorageError('INVALID_KEY')` on the first rule it breaks.
 *
 * Rejects, in order: an empty key; a key over `MAX_KEY_LENGTH`; a leading `/` (which would make the
 * key absolute and discard the driver's root); a backslash (a path separator on Windows, where a
 * POSIX-minded check would let `a\..\b` through); a NUL byte; any segment of `.` or `..` (the
 * traversal itself, and its harmless-looking twin, which would make two keys name one object); any
 * empty segment (`a//b`, which a filesystem silently collapses); a segment over
 * `MAX_KEY_SEGMENT_LENGTH`; and any character outside `[A-Za-z0-9._/-]` (which also covers the space
 * in the acceptance test's key list).
 *
 * Returns the segments so a caller can build a path from already-validated parts without splitting
 * the key again and risking a different split.
 */
export function assertValidKey(key: string): string[] {
  if (key === '') {
    throw new StorageError('INVALID_KEY', 'the key is empty');
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new StorageError('INVALID_KEY', `the key is longer than ${MAX_KEY_LENGTH} characters`);
  }
  if (key.startsWith('/')) {
    throw new StorageError('INVALID_KEY', 'the key is absolute; a key is always root-relative');
  }
  if (key.includes('\\')) {
    throw new StorageError('INVALID_KEY', 'the key contains a backslash');
  }
  if (key.includes('\u0000')) {
    throw new StorageError('INVALID_KEY', 'the key contains a NUL byte');
  }
  const segments = key.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new StorageError('INVALID_KEY', 'the key contains a ".." segment');
    }
    // `.` resolves to the directory itself, so `./a` and `a` are two keys for one object. A key is
    // generated server-side from a uuid, so a dot segment is never intended; refusing it keeps the
    // key-to-path mapping one-to-one.
    if (segment === '.') {
      throw new StorageError('INVALID_KEY', 'the key contains a "." segment');
    }
    if (segment === '') {
      throw new StorageError('INVALID_KEY', 'the key contains an empty segment');
    }
    if (segment.length > MAX_KEY_SEGMENT_LENGTH) {
      throw new StorageError('INVALID_KEY', `a key segment is longer than ${MAX_KEY_SEGMENT_LENGTH} characters`);
    }
  }
  if (!KEY_CHARACTERS.test(key)) {
    throw new StorageError('INVALID_KEY', 'the key contains a character outside [A-Za-z0-9._/-]');
  }
  return segments;
}

// ---------------------------------------------------------------------------------------------
// The S8 key convention
// ---------------------------------------------------------------------------------------------

/**
 * Normalise a file extension into the `<ext>` the convention expects: lower-case, without the dot.
 *
 * A caller that passes a user-supplied extension (the S3 driver's MIME remark in `06` S7.2.2 makes
 * that tempting) is refused rather than trimmed, because a silently repaired extension is a key the
 * caller did not ask for.
 */
function normaliseExtension(extension: string): string {
  const withoutDot = extension.startsWith('.') ? extension.slice(1) : extension;
  const lower = withoutDot.toLowerCase();
  if (lower === '' || lower.length > 16 || !KEY_TOKEN.test(lower)) {
    throw new StorageError('INVALID_KEY', 'the extension must be 1-16 characters of [a-z0-9_-]');
  }
  return lower;
}

/** Reject an identifier that cannot be a single path segment before it reaches a key. */
function assertIdentifier(value: string, label: string): void {
  if (value.length === 0 || value.length > 64 || !KEY_TOKEN.test(value)) {
    throw new StorageError('INVALID_KEY', `the ${label} is not a single [A-Za-z0-9_-] segment`);
  }
}

/**
 * `assignments/<assignmentId>/sources/<assignmentSourceId>.<ext>` (`04` S8).
 *
 * The `assignmentSourceId` is the row's own uuid, never a name taken from the uploaded file: S8
 * says "Keys are never derived from a file name supplied by a user", and this is the signature that
 * makes that structural rather than a rule someone has to remember.
 */
export function sourceStorageKey(assignmentId: string, assignmentSourceId: string, extension: string): string {
  assertIdentifier(assignmentId, 'assignmentId');
  assertIdentifier(assignmentSourceId, 'assignmentSourceId');
  const key = `assignments/${assignmentId}/sources/${assignmentSourceId}.${normaliseExtension(extension)}`;
  assertValidKey(key);
  return key;
}

/**
 * `students/<userId>/uploads/<uploadId>.<ext>` (`04` S8).
 *
 * Only the shipped student modalities reach this builder -- PNG/JPEG, PDF and plain text (O11);
 * audio and video are refused at the picker and so never produce a key. The refusal itself is the
 * upload route's job (`06` S5.4), not this function's; nothing here inspects the extension against
 * a format allowlist, because the allowlist is `student_uploads.mime_type`'s CHECK constraint.
 */
export function uploadStorageKey(userId: string, uploadId: string, extension: string): string {
  assertIdentifier(userId, 'userId');
  assertIdentifier(uploadId, 'uploadId');
  const key = `students/${userId}/uploads/${uploadId}.${normaliseExtension(extension)}`;
  assertValidKey(key);
  return key;
}

/**
 * The S3 settings every S3 request needs, with the nullable fields narrowed.
 *
 * `AppConfig['s3']` marks each field `string | null` because it is read from an unset-friendly
 * environment (`config.ts`); when `STORAGE_DRIVER=s3` all five are fatal-if-missing, but this type
 * is also reachable with a hand-built config, so the narrowing is re-checked at construction.
 */
export interface RequiredS3Config {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Narrow `config.s3` to a usable credential set, or throw `DRIVER_UNAVAILABLE`.
 *
 * The thrown message names the missing **variable**, never the value: `config.ts` already reports
 * problems by variable name only, and C7 is the reason (`04` S8: "no key, credential, cookie file
 * or `.env` value is ever logged").
 */
export function requireS3Config(config: AppConfig): RequiredS3Config {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config.s3;
  const missing: string[] = [];
  if (endpoint === null) missing.push('S3_ENDPOINT');
  if (region === null) missing.push('S3_REGION');
  if (bucket === null) missing.push('S3_BUCKET');
  if (accessKeyId === null) missing.push('S3_ACCESS_KEY_ID');
  if (secretAccessKey === null) missing.push('S3_SECRET_ACCESS_KEY');
  if (
    endpoint === null ||
    region === null ||
    bucket === null ||
    accessKeyId === null ||
    secretAccessKey === null
  ) {
    throw new StorageError('DRIVER_UNAVAILABLE', `the s3 driver is missing ${missing.join(', ')}`);
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}
