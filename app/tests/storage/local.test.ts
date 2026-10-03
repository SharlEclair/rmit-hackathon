/**
 * Unit tests for `LocalStorageDriver` (`04` S8 row `local`; `11-BUILD-PLAN.md` WP-04 acceptance).
 *
 * **Filesystem only: no database, no network, no configuration, no provider key.** The driver's root
 * is a `mkdtemp` directory passed to the constructor, so `config.ts` is never loaded and no test
 * depends on `STORAGE_LOCAL_DIR` being set. Every directory is removed in `afterEach`, including
 * when a test fails half-way -- a leaked temp directory is the kind of thing that makes the next
 * run fail for a reason that has nothing to do with the code.
 *
 * The WP-04 acceptance criterion this file covers is "No uploaded file is served from a path a user
 * controls; the storage key is generated server-side (path traversal)": the traversal cases below
 * assert both the `INVALID_KEY` answer *and* that the root is untouched, because a rejection that
 * still created a directory would satisfy the first assertion alone.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageDriver } from '../../src/lib/storage/local';
import { StorageError, sourceStorageKey, uploadStorageKey } from '../../src/lib/storage/types';

const TEXT = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
const TEXT_TYPE = 'text/plain';

let root = '';
let driver: LocalStorageDriver;

beforeEach(async () => {
  // Real path, not a symlinked one: `mkdtemp` under `tmpdir()` can sit behind a link on macOS, and
  // the driver resolves its root, so comparing paths would otherwise compare unlike strings.
  root = await mkdtemp(join(tmpdir(), 'storage-local-'));
  driver = new LocalStorageDriver(root);
});

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true });
  root = '';
});

/** The absolute location a key is expected to occupy under the root. */
function locationOf(key: string): string {
  return resolve(root, ...key.split('/'));
}

/** A `StorageError`'s code, or the value's own type when it is not one -- never a silent `undefined`. */
function codeOf(error: unknown): string {
  return error instanceof StorageError ? error.code : `not-a-StorageError: ${String(error)}`;
}

describe('put', () => {
  it('writes the bytes to the key under the configured root', async () => {
    const key = 'assignments/abc/sources/def.txt';
    const object = await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    expect(object.key).toBe(key);
    expect(object.sizeBytes).toBe(TEXT.byteLength);
    expect(object.contentType).toBe(TEXT_TYPE);
    expect(await readFile(locationOf(key))).toEqual(Buffer.from(TEXT));
  });

  it('creates every missing parent directory', async () => {
    const key = 'students/user-1/uploads/upload-1.pdf';
    await driver.put({ key, bytes: TEXT, contentType: 'application/pdf' });

    expect(existsSync(locationOf('students/user-1/uploads'))).toBe(true);
    expect(existsSync(locationOf(key))).toBe(true);
  });

  it('returns the SHA-256 of the exact bytes stored', async () => {
    const object = await driver.put({ key: 'a/b.txt', bytes: TEXT, contentType: TEXT_TYPE });

    expect(object.contentHash).toBe(createHash('sha256').update(TEXT).digest('hex'));
    expect(object.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The hash describes what landed on disk, not just what was handed in.
    const onDisk = await readFile(locationOf('a/b.txt'));
    expect(createHash('sha256').update(onDisk).digest('hex')).toBe(object.contentHash);
  });

  it('returns an ISO 8601 createdAt', async () => {
    const object = await driver.put({ key: 'a/b.txt', bytes: TEXT, contentType: TEXT_TYPE });

    expect(object.createdAt).toBe(new Date(object.createdAt).toISOString());
  });

  it('stores an empty payload as a zero-byte object with the hash of no bytes', async () => {
    const object = await driver.put({ key: 'a/empty.txt', bytes: new Uint8Array(0), contentType: TEXT_TYPE });

    expect(object.sizeBytes).toBe(0);
    expect(object.contentHash).toBe(createHash('sha256').update(new Uint8Array(0)).digest('hex'));
    expect((await readFile(locationOf('a/empty.txt'))).byteLength).toBe(0);
  });

  it('replaces a previous object at the same key and reports the new hash', async () => {
    const key = 'a/overwrite.txt';
    const first = await driver.put({ key, bytes: new TextEncoder().encode('first'), contentType: TEXT_TYPE });
    const second = await driver.put({ key, bytes: new TextEncoder().encode('second'), contentType: TEXT_TYPE });

    expect(second.contentHash).not.toBe(first.contentHash);
    expect(await readFile(locationOf(key), 'utf8')).toBe('second');
    // The atomic write leaves no temporary file behind, so the directory holds exactly one object.
    expect(await readdir(locationOf('a'))).toEqual(['overwrite.txt']);
  });
});

describe('get', () => {
  it('round-trips the bytes and recomputes the hash of the bytes read', async () => {
    const key = 'a/round-trip.txt';
    const written = await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    const { bytes, object } = await driver.get(key);

    // Buffer is asserted through `Buffer.from`, because a Node `readFile` returns a Buffer subclass
    // and a byte-for-byte comparison is the point, not the concrete class the driver happened to use.
    expect(Buffer.from(bytes)).toEqual(Buffer.from(TEXT));
    expect(object.key).toBe(key);
    expect(object.sizeBytes).toBe(TEXT.byteLength);
    expect(object.contentHash).toBe(written.contentHash);
  });

  it('throws StorageError NOT_FOUND for a key that was never written', async () => {
    const error = await driver.get('assignments/missing/sources/none.txt').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StorageError);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });

  it('rejects a traversing key before it reads anything outside the root', async () => {
    const error = await driver.get('../escape').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StorageError);
    expect(codeOf(error)).toBe('INVALID_KEY');
  });
});

describe('delete', () => {
  it('removes the object', async () => {
    const key = 'a/to-delete.txt';
    await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    await driver.delete(key);

    expect(existsSync(locationOf(key))).toBe(false);
    expect(codeOf(await driver.get(key).catch((thrown: unknown) => thrown))).toBe('NOT_FOUND');
  });

  it('is idempotent: deleting twice, or deleting a key that never existed, is not an error', async () => {
    const key = 'a/twice.txt';
    await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    await expect(driver.delete(key)).resolves.toBeUndefined();
    await expect(driver.delete(key)).resolves.toBeUndefined();
    await expect(driver.delete('a/never-existed.txt')).resolves.toBeUndefined();
  });
});

describe('signedUrl', () => {
  it('throws SIGNED_URL_UNSUPPORTED rather than inventing a URL or a route', async () => {
    // Handoff I-06: no route in the 64-route vocabulary (`06` S5.4) serves source bytes, and
    // 03-INVARIANTS T12 makes that vocabulary the only valid path set. So there is no URL this
    // driver could honestly return, and this assertion is what keeps one from being invented.
    const error = await driver.signedUrl('a/b.txt', 300).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StorageError);
    expect(codeOf(error)).toBe('SIGNED_URL_UNSUPPORTED');
  });
});

describe('key safety (WP-04 acceptance: path traversal)', () => {
  /** Every key the traversal rule must refuse, named after the rule it breaks. */
  const INVALID_KEYS: ReadonlyArray<readonly [string, string]> = [
    ['empty key', ''],
    ['parent traversal', '../escape'],
    ['absolute key', '/abs'],
    ['traversal after a real segment', 'a/../../b'],
    ['inner traversal', 'a/../b'],
    ['backslash separator', 'a\\b'],
    ['NUL byte', 'a\u0000b'],
    ['space', 'a b/c.txt'],
    ['double slash', 'a//b'],
    ['dot segment', './a'],
    ['trailing slash', 'a/'],
    ['percent-encoded traversal', 'a/%2e%2e/b'],
    ['colon', 'a:b/c.txt'],
    ['asterisk', 'a/*.txt'],
    ['question mark', 'a/b?.txt'],
    ['key over 512 characters', `a/${'x'.repeat(520)}`],
    ['segment over 128 characters', `a/${'x'.repeat(129)}.txt`],
  ];

  it.each(INVALID_KEYS)('put refuses %s with INVALID_KEY and writes nothing', async (_label, key) => {
    const error = await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StorageError);
    expect(codeOf(error)).toBe('INVALID_KEY');
    // The root itself must be untouched: a rejection that still created a directory would pass the
    // assertion above and fail this one.
    expect(await readdir(root)).toEqual([]);
  });

  it.each(INVALID_KEYS)('get refuses %s with INVALID_KEY', async (_label, key) => {
    expect(codeOf(await driver.get(key).catch((thrown: unknown) => thrown))).toBe('INVALID_KEY');
  });

  it('stays inside the root for a name that merely contains dots', async () => {
    // `.../b` is not a traversal: `...` is an ordinary directory name. Refusing it would be a rule
    // the documented validator does not state, so the assertion here is containment, not rejection.
    const key = '.../b.txt';
    await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    expect(existsSync(locationOf(key))).toBe(true);
    expect(locationOf(key).startsWith(root)).toBe(true);
  });

  it('refuses a traversal attempt through delete', async () => {
    expect(codeOf(await driver.delete('../escape').catch((thrown: unknown) => thrown))).toBe('INVALID_KEY');
  });

  it('throws SIGNED_URL_UNSUPPORTED whatever the key, because it cannot serve anything', async () => {
    // The order is deliberate and asserted: an unsupported operation reports that it is unsupported
    // rather than reporting something about one of its arguments. If this driver ever gains a route
    // (I-06 resolved in `06` S5.4), the key check has to come first -- and this test will fail,
    // which is the prompt to revisit both this driver and the issue.
    expect(codeOf(await driver.signedUrl('../escape', 300).catch((thrown: unknown) => thrown))).toBe(
      'SIGNED_URL_UNSUPPORTED',
    );
    expect(codeOf(await driver.signedUrl('a/b.txt', 300).catch((thrown: unknown) => thrown))).toBe(
      'SIGNED_URL_UNSUPPORTED',
    );
  });

  it('never describes the rejected key in the error message (C7; 06 S5.7)', async () => {
    const error = await driver.put({ key: '../escape', bytes: TEXT, contentType: TEXT_TYPE }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).message).not.toContain('escape');
  });
});

describe('the S8 key builders', () => {
  it('builds the documented assignments/... key', () => {
    expect(sourceStorageKey('assignment-1', 'source-1', 'pdf')).toBe(
      'assignments/assignment-1/sources/source-1.pdf',
    );
  });

  it('builds the documented students/... key and normalises the extension', () => {
    expect(uploadStorageKey('user-1', 'upload-1', '.PDF')).toBe('students/user-1/uploads/upload-1.pdf');
  });

  it('produces keys the driver accepts and writes to the documented location', async () => {
    const key = uploadStorageKey('user-1', 'upload-1', 'txt');
    await driver.put({ key, bytes: TEXT, contentType: TEXT_TYPE });

    expect(existsSync(locationOf(key))).toBe(true);
  });

  it('refuses an identifier or extension that cannot be a single safe path segment', () => {
    for (const call of [
      (): string => sourceStorageKey('../etc', 'source-1', 'pdf'),
      (): string => sourceStorageKey('assignment-1', 'a/b', 'pdf'),
      (): string => uploadStorageKey('user-1', 'upload-1', 'p/d'),
      (): string => uploadStorageKey('user-1', 'upload-1', ''),
    ]) {
      expect(codeOf(catchOf(call))).toBe('INVALID_KEY');
    }
  });
});

/** Run a builder that is expected to throw, returning the throw rather than propagating it. */
function catchOf(call: () => string): unknown {
  try {
    call();
    return null;
  } catch (error) {
    return error;
  }
}
