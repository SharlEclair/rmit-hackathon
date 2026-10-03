/**
 * The `s3` storage driver: SigV4 over `fetch`, with no vendor SDK.
 *
 * **Owner:** `04-TECH-ARCHITECTURE.md` S8, row `s3`: "Requires `S3_ENDPOINT`, `S3_REGION`,
 * `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`." Settings come from `AppConfig['s3']`
 * only -- `config.ts` is the single reader of `process.env` (WP-01), so this file never touches the
 * environment and never logs a credential (C7).
 *
 * **NOT EXERCISED AGAINST A LIVE ENDPOINT IN THE MVP.** This is stated rather than implied, because
 * the alternative is a reader assuming the signing path has been proven. `STORAGE_DRIVER=local` is
 * the default (`config.ts`), `11-BUILD-PLAN.md` builds the demo on the local driver, and no test in
 * `tests/storage/s3.test.ts` opens a socket. What *is* proven is the presigning arithmetic: the URL
 * shape, the `X-Amz-*` set, the expiry clamp and determinism under a fixed clock. What is **not**
 * proven is that a real S3-compatible service accepts the signature, that path-style addressing is
 * enabled on the bucket, or that a PUT body survives a real transport. Treat the first use against a
 * live endpoint as the integration test it is.
 *
 * **Why no SDK.** `04` S5.9 forbids a vendor SDK outside `src/lib/llm/` for LLM providers, and
 * `package.json` is frozen for this work packet; `node:crypto` plus `fetch` covers the four
 * operations S8 needs. The cost is that this file owns the signing details, so they are written out
 * rather than hidden: the canonical request is assembled explicitly so a mismatch with the AWS
 * specification is readable rather than emergent.
 *
 * **Path style.** Every request is `endpoint/bucket/key`. `04` S8 gives `S3_ENDPOINT` as a plain
 * endpoint, which is what MinIO, R2 and LocalStack expect, and which keeps the bucket out of the
 * `Host` header and therefore out of the signature's `Host` component.
 *
 * **Client-side derivation, stated plainly.** There is no metadata store (see `types.ts`), so
 * `contentType` is mapped from the key's extension and `createdAt` comes from this driver's clock.
 * Both are honest for the object this driver just wrote; neither is read back from the service.
 * `contentType` on a `put` result is the caller's declared type, which is the value that was sent.
 */

import { createHash, createHmac } from 'node:crypto';

import type { AppConfig } from '@/lib/config';

import {
  StorageError,
  assertValidKey,
  requireS3Config,
  type RequiredS3Config,
  type StorageDriver,
  type StorageObject,
} from './types';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const HASH_ALGORITHM = 'sha256';
const SERVICE = 's3';
const TERMINATOR = 'aws4_request';

/** `04` S8's `contentHash` is SHA-256, and SigV4 needs the payload hash anyway. */
const EMPTY_PAYLOAD_HASH = sha256Hex(new Uint8Array(0));

/** The SigV4 ceiling. A presigned URL longer than seven days is refused by every AWS service. */
const MAX_EXPIRES_SECONDS = 604_800;
const MIN_EXPIRES_SECONDS = 1;

/**
 * Extensions this driver can name. The allowlist is `06` S7.2.2's tutor set plus O11's student set,
 * so a key this driver produces is one the data model admits.
 *
 * An unknown extension maps to `application/octet-stream` rather than throwing: the authoritative
 * format check is `assignment_sources.mime_type` / `student_uploads.mime_type`'s CHECK constraint
 * (`06` S7.2.2, S7.3.6), and a second, weaker format gate here would refuse a format the database
 * accepts while looking like an authority on the question.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
};

/** A bare `type/subtype`, so a newline can never be smuggled into a signed header value. */
const CONTENT_TYPE_SHAPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;

function sha256Hex(bytes: Uint8Array): string {
  return createHash(HASH_ALGORITHM).update(bytes).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac(HASH_ALGORITHM, key).update(value, 'utf8').digest();
}

/**
 * RFC 3986 percent-encoding, which is what SigV4 canonicalisation requires.
 *
 * `encodeURIComponent` leaves `!`, `'`, `(`, `)`, `*` and `~` alone; AWS's canonical form encodes
 * the first five (it leaves `-`, `_`, `.` and `~`). Both encoders leave `/`, which is why the
 * canonical URI encodes segment by segment rather than as one string.
 */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The canonical URI: the encoded path of already-validated segments, each encoded separately. */
function canonicalUri(bucket: string, segments: readonly string[]): string {
  const encoded = segments.map((segment) => uriEncode(segment));
  return `/${uriEncode(bucket)}/${encoded.join('/')}`;
}

/** A canonical query string: encoded pairs sorted by encoded key (SigV4, "CanonicalQueryString"). */
function canonicalQueryString(parameters: ReadonlyArray<readonly [string, string]>): string {
  return parameters
    .map(([name, value]) => [uriEncode(name), uriEncode(value)] as const)
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

/** `YYYYMMDDTHHMMSSZ` -- ISO 8601 with the punctuation SigV4 strips. */
function amzDate(clock: Date): string {
  return clock.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/** The scope every key in this driver is derived within. */
function credentialScope(date: string, region: string): string {
  return `${date}/${region}/${SERVICE}/${TERMINATOR}`;
}

/** `kSigning`, derived from the secret. The secret is a parameter, never a field read from a log. */
function signingKey(secretAccessKey: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), SERVICE), TERMINATOR);
}

function sign(signing: Buffer, stringToSign: string): string {
  return createHmac(HASH_ALGORITHM, signing).update(stringToSign, 'utf8').digest('hex');
}

/** The key's extension, lower-case, or `''` when the key has none. */
function extensionOf(key: string): string {
  const lastSegment = key.slice(key.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  if (dot < 0) return '';
  return lastSegment.slice(dot + 1).toLowerCase();
}

/**
 * Clock seam. Injecting the clock keeps a signature test deterministic without patching a global,
 * which is the difference between a test that asserts the signing arithmetic and a test that asserts
 * whatever the machine's clock happened to be.
 */
export interface S3DriverOptions {
  readonly now?: () => Date;
}

/** Everything a signed ordinary request needs, produced by one call so the parts cannot disagree. */
interface SignedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly authorization: string;
}

/** Accept a content type only if it can be a header value, so a newline cannot split a request. */
function assertContentType(contentType: string): string {
  if (!CONTENT_TYPE_SHAPE.test(contentType)) {
    throw new StorageError('INVALID_KEY', 'the content type is not a bare media type');
  }
  return contentType;
}

/** Clamp a requested lifetime into the range SigV4 permits, refusing a non-integer outright. */
function clampExpires(expiresInSeconds: number): number {
  if (!Number.isSafeInteger(expiresInSeconds)) {
    throw new StorageError('INVALID_KEY', 'the expiry must be a whole number of seconds');
  }
  return Math.min(MAX_EXPIRES_SECONDS, Math.max(MIN_EXPIRES_SECONDS, expiresInSeconds));
}

export class S3StorageDriver implements StorageDriver {
  readonly id = 's3' as const;

  private readonly settings: RequiredS3Config;
  private readonly now: () => Date;

  constructor(config: AppConfig, options: S3DriverOptions = {}) {
    this.settings = requireS3Config(config);
    this.now = options.now ?? ((): Date => new Date());
  }

  /** `endpoint/bucket/seg1/seg2` as a `URL`. Path style: the bucket is the first path segment. */
  private objectUrl(segments: readonly string[]): URL {
    // `canonicalUri` already begins with '/', and canonicalising the path once -- rather than letting
    // `URL` normalise a hand-built string -- is what keeps the signature and the request path
    // identical for a key containing a character that needs encoding.
    const base = this.settings.endpoint.replace(/\/+$/, '');
    return new URL(`${base}${canonicalUri(this.settings.bucket, segments)}`);
  }

  /**
   * Sign an ordinary request for one object at one instant.
   *
   * The headers are built once here and used for both the signature and the transmission, so the two
   * cannot disagree; a header added at the `fetch` call site would be an unsigned header and a
   * request the service rejects. `payloadHash` is passed in because a GET or DELETE signs the empty
   * payload (there is no body) while a PUT signs the bytes it will send.
   */
  private signRequest(params: {
    readonly method: 'GET' | 'PUT' | 'DELETE';
    readonly key: string;
    readonly payloadHash: string;
    readonly contentType: string | null;
    readonly clock: Date;
  }): SignedRequest {
    const segments = assertValidKey(params.key);
    const url = this.objectUrl(segments);
    const stamp = amzDate(params.clock);
    const date = stamp.slice(0, 8);
    const scope = credentialScope(date, this.settings.region);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': params.payloadHash,
      'x-amz-date': stamp,
    };
    if (params.contentType !== null) headers['content-type'] = params.contentType;

    // SigV4 signs lower-case header names, sorted, joined by ';'; the same list appears in the
    // canonical request, so the two are derived from one array.
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${(headers[name] ?? '').trim()}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');

    const canonicalRequest = [
      params.method,
      canonicalUri(this.settings.bucket, segments),
      '', // no query string on an ordinary request
      canonicalHeaders,
      signedHeaders,
      params.payloadHash,
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      stamp,
      scope,
      sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join('\n');

    const computed = sign(
      signingKey(this.settings.secretAccessKey, date, this.settings.region),
      stringToSign,
    );
    const authorization =
      `${ALGORITHM} Credential=${this.settings.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${computed}`;

    return { url: url.toString(), headers, authorization };
  }

  async put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<StorageObject> {
    const { key, bytes } = input;
    const contentType = assertContentType(input.contentType);
    const payloadHash = sha256Hex(bytes);
    const clock = this.now();
    const signed = this.signRequest({ method: 'PUT', key, payloadHash, contentType, clock });

    const response = await this.send(signed.url, {
      method: 'PUT',
      headers: { ...signed.headers, authorization: signed.authorization },
      // `Uint8Array` is a valid request body at runtime and is accepted by `RequestInit` in
      // `lib.dom`, but `@types/node`'s `BodyInit` unions the DOM and undici shapes and lists
      // `ArrayBufferView` only in the first, so the cast is a declaration of what the runtime
      // already does rather than a narrowing of it.
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new StorageError('DRIVER_UNAVAILABLE', `the storage endpoint answered ${response.status}`);
    }

    return {
      key,
      sizeBytes: bytes.byteLength,
      contentType,
      contentHash: payloadHash,
      createdAt: clock.toISOString(),
    };
  }

  async get(key: string): Promise<{ bytes: Uint8Array; object: StorageObject }> {
    const clock = this.now();
    const signed = this.signRequest({
      method: 'GET',
      key,
      payloadHash: EMPTY_PAYLOAD_HASH,
      contentType: null,
      clock,
    });
    const response = await this.send(signed.url, {
      method: 'GET',
      headers: { ...signed.headers, authorization: signed.authorization },
    });
    if (response.status === 404) {
      throw new StorageError('NOT_FOUND', 'no object exists at this key');
    }
    if (!response.ok) {
      throw new StorageError('DRIVER_UNAVAILABLE', `the storage endpoint answered ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      object: {
        key,
        sizeBytes: bytes.byteLength,
        contentType: CONTENT_TYPES[extensionOf(key)] ?? 'application/octet-stream',
        // Recomputed from the bytes actually received, so it is comparable with the `put` hash
        // rather than a promise about what the service stored.
        contentHash: sha256Hex(bytes),
        createdAt: clock.toISOString(),
      },
    };
  }

  async delete(key: string): Promise<void> {
    const clock = this.now();
    const signed = this.signRequest({
      method: 'DELETE',
      key,
      payloadHash: EMPTY_PAYLOAD_HASH,
      contentType: null,
      clock,
    });
    const response = await this.send(signed.url, {
      method: 'DELETE',
      headers: { ...signed.headers, authorization: signed.authorization },
    });
    // S3 answers 204 for a deleted object and 404 for one that was already absent; both are the
    // idempotent success `04` S8's `delete(key): Promise<void>` describes.
    if (response.status === 404) return;
    if (!response.ok) {
      throw new StorageError('DRIVER_UNAVAILABLE', `the storage endpoint answered ${response.status}`);
    }
  }

  /**
   * A presigned GET: SigV4 query-string signing (`04` S8: "Time-limited URL for the PDF viewer.
   * Never a public bucket URL.").
   *
   * The signature lives in the query string, so anyone holding the URL can read that one object
   * until `X-Amz-Expires` elapses; the object is never made public and the URL carries no credential
   * beyond the access key id that is already visible in every signed request. Two calls in the same
   * second produce the same URL, because everything signed is derived from the clock and the request;
   * there is no nonce.
   */
  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expires = clampExpires(expiresInSeconds);
    const segments = assertValidKey(key);
    const clock = this.now();
    const stamp = amzDate(clock);
    const date = stamp.slice(0, 8);
    const scope = credentialScope(date, this.settings.region);
    const url = this.objectUrl(segments);
    const host = url.host;

    const parameters: ReadonlyArray<readonly [string, string]> = [
      ['X-Amz-Algorithm', ALGORITHM],
      ['X-Amz-Credential', `${this.settings.accessKeyId}/${scope}`],
      ['X-Amz-Date', stamp],
      ['X-Amz-Expires', String(expires)],
      ['X-Amz-SignedHeaders', 'host'],
    ];
    const query = canonicalQueryString(parameters);

    const canonicalRequest = [
      'GET',
      canonicalUri(this.settings.bucket, segments),
      query,
      `host:${host}\n`,
      'host',
      // A presigned URL signs the empty payload: the client sends no body.
      EMPTY_PAYLOAD_HASH,
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      stamp,
      scope,
      sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join('\n');

    const computed = sign(
      signingKey(this.settings.secretAccessKey, date, this.settings.region),
      stringToSign,
    );
    // The signed URL names the key, so it is returned and never logged (C7; `06` S5.7).
    return `${url.toString()}?${query}&X-Amz-Signature=${computed}`;
  }

  /**
   * One place where the transport is called, so every failure mode is the same one.
   *
   * A thrown `fetch` -- DNS failure, refused connection, TLS rejection -- becomes
   * `DRIVER_UNAVAILABLE`. The original error is not attached: its message can quote a URL, and a URL
   * contains the key (C7).
   */
  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch {
      throw new StorageError('DRIVER_UNAVAILABLE', 'the storage endpoint could not be reached');
    }
  }
}
