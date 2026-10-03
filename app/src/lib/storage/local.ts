/**
 * The `local` storage driver: files under `STORAGE_LOCAL_DIR`, on this machine's filesystem.
 *
 * **Owner:** `04-TECH-ARCHITECTURE.md` S8, row `local`: "Root is `STORAGE_LOCAL_DIR`. Files are
 * written outside the web root and served only through a route handler that re-checks
 * authorisation."
 *
 * **Every constraint this file honours, and where it comes from.**
 *
 * - *Outside the web root.* The root arrives as a parameter (`LocalStorageDriver` takes the
 *   directory, `index.ts` supplies `config.storageLocalDir`) and this module never derives one from
 *   `process.cwd()` or `public/`. `STORAGE_LOCAL_DIR` defaults to `./.storage`, which resolves
 *   against the server's working directory and is not a Next.js static directory; nothing here
 *   serves a byte, so no file under the root is reachable over HTTP by accident.
 * - *The key is generated server-side* (`11` WP-04). `assertValidKey` runs before a path is built,
 *   and the resolved path is then re-checked against the resolved root -- the belt-and-braces
 *   assertion WP-04 asks for, kept even though the character-set rule already makes `..`
 *   unreachable, because the two checks protect against different mistakes.
 * - *Atomic writes.* A half-written file that ingestion then reads is worse than a failed upload,
 *   so `put` writes to a temporary name in the destination directory and `rename`s it. Only after
 *   the rename succeeds does `put` resolve; a failure removes the temporary file.
 * - *Nothing is logged.* Not a key, not a byte count, not a path (C7; `06` S5.7 lists `storage_key`
 *   among the values that never reach a log line). That is why `put` and `delete` do not report
 *   their intermediate state anywhere.
 *
 * **`signedUrl` throws, and that is the finished behaviour, not a stub.** `docs/handoff/05-ISSUES.md`
 * I-06 records that no route in the 64-route vocabulary (`06-DATA-MODEL.md` S5.4) serves source
 * document bytes, and `docs/handoff/03-INVARIANTS.md` trap T12 makes that vocabulary the only valid
 * path set. There is therefore no URL this driver could return that would resolve: inventing one
 * would be inventing a route, which T12 forbids and `06` S5.4's own D51 note ("A new URL is added
 * here first") leaves to the data model. `SIGNED_URL_UNSUPPORTED` is the honest answer until I-06 is
 * resolved in `06` S5.4. Do not replace it with a path.
 *
 * **What this driver does not persist.** The `StorageObject` `put` returns describes the bytes that
 * were just written; it is not stored alongside them. The durable record is
 * `assignment_sources.storage_key` / `student_uploads.storage_key` (`06` S7.2.2, S7.3.6), so `get`
 * recomputes `contentHash` from the bytes it read, and `createdAt` on a `get` is the time of that
 * read. The `contentHash` on a `put` is the SHA-256 of the exact bytes handed to the filesystem, and
 * on a `get` the SHA-256 of the exact bytes read back -- which is what makes the two comparable.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import {
  StorageError,
  assertValidKey,
  type StorageDriver,
  type StorageObject,
} from './types';

/** SHA-256, lower-case hex (`04` S8's `contentHash`). */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Map a filesystem failure onto the driver's code vocabulary.
 *
 * `ENOENT` is the only failure that means "absent". Everything else -- a permission denial, a full
 * disk, a filename the platform refuses -- is reported as unavailable rather than as a missing
 * object, because answering `NOT_FOUND` for a file that exists but cannot be read would let a caller
 * treat an infrastructure fault as a legitimate empty result.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

export class LocalStorageDriver implements StorageDriver {
  readonly id = 'local' as const;

  /** Absolute, resolved once. Every path this driver touches is built from it. */
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /**
   * The absolute path for a key that has already passed `assertValidKey`.
   *
   * The containment check is the second of the two guards WP-04 asks for: the character-set rule
   * rejects `..` outright, and this asserts that the arithmetic came out inside the root anyway, so
   * a future edit to the validator cannot silently turn into an escape.
   */
  private resolveKey(key: string): string {
    const segments = assertValidKey(key);
    const absolute = resolve(this.root, ...segments);
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new StorageError('INVALID_KEY', 'the key resolves outside the storage root');
    }
    return absolute;
  }

  private objectFor(key: string, bytes: Uint8Array, contentType: string): StorageObject {
    return {
      key,
      sizeBytes: bytes.byteLength,
      contentType,
      contentHash: sha256Hex(bytes),
      createdAt: new Date().toISOString(),
    };
  }

  async put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<StorageObject> {
    const { key, bytes, contentType } = input;
    const absolute = this.resolveKey(key);
    await mkdir(dirname(absolute), { recursive: true });

    // The temporary name carries the destination's own extension so the atomic replace is a rename
    // within one directory, which is the only rename a filesystem is required to make atomic.
    const temporary = `${absolute}.${String(process.pid)}.${Date.now()}.tmp`;
    await writeFile(temporary, bytes);
    try {
      await rename(temporary, absolute);
    } catch (error) {
      // A failed rename must not leave a stray file masquerading as an unpublished object.
      await rm(temporary, { force: true });
      throw error;
    }

    return this.objectFor(key, bytes, contentType);
  }

  async get(key: string): Promise<{ bytes: Uint8Array; object: StorageObject }> {
    const absolute = this.resolveKey(key);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(absolute);
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageError('NOT_FOUND', 'no object exists at this key');
      }
      throw new StorageError('DRIVER_UNAVAILABLE', 'the stored object could not be read');
    }
    // Content type is not persisted by this driver (see the header), so it is answered honestly
    // rather than guessed from the extension: the caller that stored the object is the only party
    // that knows it, and `06` S7.2.2 keeps it in `assignment_sources.mime_type`.
    return { bytes, object: this.objectFor(key, bytes, 'application/octet-stream') };
  }

  /**
   * Remove an object. Idempotent (`04` S8 gives `delete` no failure code for absence): a tutor may
   * retry a removal, and the second attempt must not read as an error.
   */
  async delete(key: string): Promise<void> {
    const absolute = this.resolveKey(key);
    try {
      await unlink(absolute);
    } catch (error) {
      if (isNotFound(error)) return;
      throw new StorageError('DRIVER_UNAVAILABLE', 'the stored object could not be removed');
    }
  }

  /**
   * Unsupported: see the header. I-06 -- no route in the 64-route vocabulary (`06` S5.4) serves
   * source-document bytes -- and T12 -- that vocabulary is the only valid path set -- together mean
   * there is no URL to return and no route to invent. Both parameters are part of the `StorageDriver`
   * contract and are unused because the call cannot proceed at all, so they are underscore-prefixed
   * rather than removed.
   */
  async signedUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new StorageError(
      'SIGNED_URL_UNSUPPORTED',
      'the local driver has no route that serves bytes (handoff I-06; 03-INVARIANTS T12)',
    );
  }
}
