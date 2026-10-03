/**
 * Unit tests for the S3 driver and the driver factory (`04` S8 and its driver table).
 *
 * **No network, by construction.** Nothing here calls `put`, `get` or `delete` on the S3 driver: the
 * three operations that would open a socket are exactly the three that are not exercised. What is
 * asserted is what can be asserted offline -- the factory's selection, the presigned URL's shape and
 * arithmetic, the expiry clamp, determinism under an injected clock, and the key rules. The live
 * endpoint is the MVP's documented gap (`s3.ts`'s header says so); a test that guessed at it would
 * only move the guess here.
 *
 * **The clock is a seam, not a patched global.** `S3StorageDriver` accepts `S3DriverOptions.now`, so
 * a signature assertion is about the signing arithmetic rather than about the machine's clock. No
 * `vi.setSystemTime`, no module mocking.
 *
 * **No assertion echoes a credential.** The fixture secrets below are literals that name themselves
 * as fixtures, and a failure message must not become the place a value leaks (C7).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetConfigCache, type AppConfig } from '../../src/lib/config';
import { createStorageDriver, getStorageDriver, resetStorageDriver } from '../../src/lib/storage/index';
import { S3StorageDriver } from '../../src/lib/storage/s3';
import { StorageError, type StorageDriver } from '../../src/lib/storage/types';

/** The same instant the session tests pin, so a failure is comparable across the suite. */
const FIXED_CLOCK = new Date(Date.UTC(2026, 9, 3, 5, 12, 0, 0));
const FIXED_AMZ_DATE = '20261003T051200Z';

const ENDPOINT = 'https://s3.example.invalid';
const BUCKET = 'assignment-sources';
const KEY = 'assignments/abc/sources/def.pdf';

/**
 * A complete `AppConfig` literal with the S3 fields filled in.
 *
 * Complete rather than partial because `AppConfig` is the frozen Phase 2 shape: a test that cast a
 * partial literal into it would stop compiling the day the interface grew a required field, which is
 * the opposite of what a fixture is for. The secrets are obviously fixtures (`.invalid` host, named
 * test credentials) so that a value from a real `.env` can never be mistaken for one of them.
 */
function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    databaseUrl: null,
    authSecret: null,
    anonIdSecret: null,
    llmProvider: 'mock',
    llmModelReasoning: 'test-model',
    llmModelMultimodal: null,
    llmThinking: null,
    geminiApiKey: null,
    deepseekApiKey: null,
    llmBaseUrl: null,
    llmMaxCallsPerSession: 12,
    storageDriver: 's3',
    storageLocalDir: './.storage-test',
    s3: {
      endpoint: ENDPOINT,
      region: 'test-region-1',
      bucket: BUCKET,
      accessKeyId: 'TESTACCESSKEYID000000',
      secretAccessKey: 'test-secret-access-key-not-a-real-credential',
    },
    uploadMaxBytes: 26_214_400,
    appBaseUrl: 'http://localhost:3000',
    ...overrides,
  };
}

/** A driver on the fixed clock. */
function fixedDriver(config: AppConfig = baseConfig()): S3StorageDriver {
  return new S3StorageDriver(config, { now: () => new Date(FIXED_CLOCK.getTime()) });
}

/** The thrown value, or the value itself when nothing threw -- never a silent `undefined`. */
function codeOf(error: unknown): string {
  return error instanceof StorageError ? error.code : `not-a-StorageError: ${String(error)}`;
}

async function catchOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

/** The throw from a synchronous call expected to fail, or `null` when it did not. */
function throwOf(call: () => unknown): unknown {
  try {
    call();
    return null;
  } catch (error) {
    return error;
  }
}

describe('createStorageDriver', () => {
  it('selects the local driver for STORAGE_DRIVER=local', () => {
    const driver = createStorageDriver(baseConfig({ storageDriver: 'local' }));

    expect(driver.id).toBe('local');
  });

  it('selects the s3 driver for STORAGE_DRIVER=s3', () => {
    const driver = createStorageDriver(baseConfig({ storageDriver: 's3' }));

    expect(driver.id).toBe('s3');
  });

  it('refuses to build the s3 driver when a required S3 value is missing', () => {
    const incomplete = baseConfig({
      s3: {
        endpoint: ENDPOINT,
        region: 'test-region-1',
        bucket: BUCKET,
        accessKeyId: null,
        secretAccessKey: 'test-secret-access-key-not-a-real-credential',
      },
    });

    // Construction is synchronous, so the failure has to be observed synchronously: wrapping it in
    // a resolved promise would turn "the constructor rejects this config" into "a later assertion".
    expect(codeOf(throwOf(() => createStorageDriver(incomplete)))).toBe('DRIVER_UNAVAILABLE');
  });

  it('returns a driver whose four methods are functions', () => {
    const driver: StorageDriver = createStorageDriver(baseConfig({ storageDriver: 'local' }));

    for (const method of [driver.put, driver.get, driver.signedUrl, driver.delete]) {
      expect(typeof method).toBe('function');
    }
  });
});

describe('getStorageDriver', () => {
  beforeEach(() => {
    // Both memos must be dropped: the config memo would otherwise hand back the previous
    // environment's values, and the driver memo the previous driver.
    resetStorageDriver();
    resetConfigCache();
    vi.unstubAllEnvs();
  });

  it('reads the validated config and memoises the driver it built', () => {
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-value-not-a-real-secret');
    vi.stubEnv('ANON_ID_SECRET', 'test-anon-id-secret-value-not-a-real-secret');
    vi.stubEnv('LLM_MODEL_REASONING', 'test-model');
    vi.stubEnv('LLM_PROVIDER', 'mock');
    vi.stubEnv('STORAGE_DRIVER', 'local');
    vi.stubEnv('STORAGE_LOCAL_DIR', './.storage-test');

    const first = getStorageDriver();
    const second = getStorageDriver();

    expect(first.id).toBe('local');
    expect(second).toBe(first);
  });

  it('propagates ConfigError rather than inventing a driver when the environment is incomplete', () => {
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('LLM_MODEL_REASONING', '');

    // `config.ts` owns that throw (WP-01); this asserts that the driver layer does not swallow it
    // and quietly fall back to a default driver.
    expect(() => getStorageDriver()).toThrow();
  });
});

describe('signedUrl', () => {
  it('returns a presigned GET URL with the X-Amz query parameters and no public bucket URL', async () => {
    const url = new URL(await fixedDriver().signedUrl(KEY, 300));

    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('s3.example.invalid');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Date')).toBe(FIXED_AMZ_DATE);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/test-region-1/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is path-style against the endpoint, and encodes the key segments', async () => {
    const url = new URL(await fixedDriver().signedUrl(KEY, 300));

    // Path style is the whole reason the bucket is a path segment here, so it is asserted as one.
    expect(url.pathname).toBe(`/${BUCKET}/${KEY}`);
  });

  it.each([
    [0, '1'],
    [-1, '1'],
    [604_801, '604800'],
    [Number.MAX_SAFE_INTEGER, '604800'],
  ])('clamps a requested expiry of %i seconds to %s', async (requested, expected) => {
    const url = new URL(await fixedDriver().signedUrl(KEY, requested));

    expect(url.searchParams.get('X-Amz-Expires')).toBe(expected);
  });

  it('accepts the one-week maximum unchanged', async () => {
    const url = new URL(await fixedDriver().signedUrl(KEY, 604_800));

    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800');
  });

  it('refuses an expiry that is not a whole number of seconds', async () => {
    for (const requested of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeOf(await catchOf(fixedDriver().signedUrl(KEY, requested)))).toBe('INVALID_KEY');
    }
  });

  it('is deterministic for a fixed clock and differs when the clock moves', async () => {
    const first = await fixedDriver().signedUrl(KEY, 300);
    const second = await fixedDriver().signedUrl(KEY, 300);
    expect(first).toBe(second);

    const later = new S3StorageDriver(baseConfig(), {
      now: () => new Date(FIXED_CLOCK.getTime() + 1000),
    });
    const moved = await later.signedUrl(KEY, 300);
    expect(moved).not.toBe(first);
    // The difference is the timestamp, not a nonce: the same clock always gives the same URL.
    expect(new URL(moved).searchParams.get('X-Amz-Date')).toBe('20261003T051201Z');
  });

  it('signs a different URL for a different key', async () => {
    const driver = fixedDriver();
    const first = await driver.signedUrl(KEY, 300);
    const second = await driver.signedUrl('assignments/abc/sources/other.pdf', 300);

    expect(second).not.toBe(first);
  });
});

describe('key safety (WP-04 acceptance: path traversal)', () => {
  /** A subset of the local driver's list, enough to prove the two drivers share one validator. */
  const INVALID_KEYS: ReadonlyArray<readonly [string, string]> = [
    ['empty key', ''],
    ['parent traversal', '../escape'],
    ['absolute key', '/abs'],
    ['traversal after a real segment', 'a/../../b'],
    ['backslash separator', 'a\\b'],
    ['NUL byte', 'a\u0000b'],
    ['space', 'a b/c.txt'],
    ['double slash', 'a//b'],
    ['segment over 128 characters', `a/${'x'.repeat(129)}.txt`],
    ['key over 512 characters', `a/${'x'.repeat(520)}`],
  ];

  it.each(INVALID_KEYS)('rejects %s in every operation, without touching the network', async (_label, key) => {
    const driver = fixedDriver();
    // A spy that records calls and delegates to the real `fetch`; the assertion is that it was never
    // called, so a rejected key cannot be mistaken for a network failure.
    const watching = vi.spyOn(globalThis, 'fetch');
    try {
      expect(codeOf(await catchOf(driver.signedUrl(key, 300)))).toBe('INVALID_KEY');
      expect(codeOf(await catchOf(driver.get(key)))).toBe('INVALID_KEY');
      expect(codeOf(await catchOf(driver.delete(key)))).toBe('INVALID_KEY');
      expect(
        codeOf(await catchOf(driver.put({ key, bytes: new Uint8Array(1), contentType: 'text/plain' }))),
      ).toBe('INVALID_KEY');
      expect(watching).not.toHaveBeenCalled();
    } finally {
      watching.mockRestore();
    }
  });
});
