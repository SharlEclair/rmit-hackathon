/**
 * Unit tests for the session token (`11` WP-03; D79; `04` S9.1).
 *
 * Pure: no database, no network, no provider key, no configuration. `session.ts` imports
 * `node:crypto` and `./_shared` and nothing else, and the tests import it by relative path
 * because the repository's `vitest.config.ts` deliberately defines no path aliases.
 *
 * Every required case from the work packet is asserted explicitly and is named after the case it
 * covers.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_LIFETIME_MS,
  SESSION_MAX_LIFETIME_MS,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  signSessionToken,
  verifySessionToken,
  type SessionTokenPayload,
} from '../../src/lib/auth/session';
import { SESSION_COOKIE_NAME } from '../../src/lib/auth/_shared';

const SECRET = 'test-secret-value-not-used-anywhere-else';
const OTHER_SECRET = 'a-different-test-secret';

/** A fixed instant, so every assertion is deterministic and nothing waits on a real clock. */
const NOW = Date.UTC(2026, 9, 3, 5, 12, 0, 0);
const USER_ID = '11111111-2222-4333-8444-555555555555';

function payload(overrides: Partial<SessionTokenPayload> = {}): SessionTokenPayload {
  return {
    v: 1,
    sub: USER_ID,
    role: 'student',
    iat: NOW,
    exp: NOW + SESSION_LIFETIME_MS,
    ...overrides,
  };
}

/** Rebuild a token with one segment replaced, which is how every tamper case is expressed. */
function replaceSegment(token: string, index: 0 | 1 | 2, value: string): string {
  const parts = token.split('.');
  parts[index] = value;
  return parts.join('.');
}

/**
 * Sign an arbitrary JSON shape with the correct key, bypassing `signSessionToken`'s own
 * validation. This is the only way to present the verifier with a well-signed but ill-formed
 * payload, which is exactly what case 5d must cover.
 */
function signByHand(shape: unknown): string {
  const payloadSegment = Buffer.from(JSON.stringify(shape), 'utf8').toString('base64url');
  const signingInput = `1.${payloadSegment}`;
  const signature = createHmac('sha256', SECRET).update(signingInput, 'utf8').digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('signSessionToken', () => {
  it('produces a three-segment base64url token', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    expect(token.split('.')).toHaveLength(3);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('is deterministic for the same payload, secret and clock', () => {
    expect(signSessionToken(payload(), SECRET, NOW)).toBe(signSessionToken(payload(), SECRET, NOW));
  });

  it('signs a different token when the secret differs', () => {
    expect(signSessionToken(payload(), SECRET, NOW)).not.toBe(signSessionToken(payload(), OTHER_SECRET, NOW));
  });

  it('refuses to sign with an empty secret rather than minting a forgeable token', () => {
    expect(() => signSessionToken(payload(), '', NOW)).toThrow();
  });

  it('refuses to sign an already-expired token', () => {
    expect(() => signSessionToken(payload({ exp: NOW }), SECRET, NOW)).toThrow();
  });

  it('refuses to sign a token with no subject', () => {
    expect(() => signSessionToken(payload({ sub: '' }), SECRET, NOW)).toThrow();
  });

  it('refuses to sign a role or version outside the permitted set', () => {
    expect(() => signSessionToken(payload({ role: 'admin' as never }), SECRET, NOW)).toThrow();
    expect(() => signSessionToken(payload({ v: 2 as never }), SECRET, NOW)).toThrow();
  });

  it('refuses to sign a lifetime beyond the documented maximum', () => {
    expect(() =>
      signSessionToken(payload({ exp: NOW + SESSION_MAX_LIFETIME_MS + 1 }), SECRET, NOW),
    ).toThrow();
  });
});

describe('verifySessionToken', () => {
  it('case 1: accepts a correctly signed, unexpired token', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const verified = verifySessionToken(token, SECRET, NOW);

    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(USER_ID);
    expect(verified?.role).toBe('student');
    expect(verified?.v).toBe(1);
    expect(verified?.iat).toBe(NOW);
    expect(verified?.exp).toBe(NOW + SESSION_LIFETIME_MS);
  });

  it('case 2a: rejects a token whose signature was altered', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const signature = token.split('.')[2] ?? '';
    // Flip the first character to another valid base64url character of the same length, so the
    // rejection is the constant-time comparison and not a length check.
    const flipped = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(verifySessionToken(replaceSegment(token, 2, flipped), SECRET, NOW)).toBeNull();
  });

  it('case 2b: rejects a signature that is a valid HMAC of the wrong payload part', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const other = signSessionToken(payload({ role: 'tutor' }), SECRET, NOW);
    const crossed = `${token.split('.')[0]}.${token.split('.')[1]}.${other.split('.')[2] ?? ''}`;
    expect(verifySessionToken(crossed, SECRET, NOW)).toBeNull();
  });

  it('case 2c: rejects a token whose payload was edited without re-signing', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, sub: USER_ID, role: 'tutor', iat: NOW, exp: NOW + SESSION_LIFETIME_MS }),
      'utf8',
    ).toString('base64url');
    expect(verifySessionToken(replaceSegment(token, 1, forgedPayload), SECRET, NOW)).toBeNull();
  });

  it('case 2d: rejects a truncated token', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    expect(verifySessionToken(token.slice(0, token.length - 8), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(replaceSegment(token, 2, ''), SECRET, NOW)).toBeNull();
  });

  it('case 2e: rejects a signature of the wrong length or encoding', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const signature = token.split('.')[2] ?? '';
    expect(signature).toHaveLength(43); // 32-byte HMAC digest, base64url, unpadded
    for (const candidate of [
      '',
      'AAAA',
      signature.slice(0, 42),
      `${signature}A`,
      `${signature}=`,
      '*'.repeat(signature.length),
    ]) {
      expect(verifySessionToken(replaceSegment(token, 2, candidate), SECRET, NOW)).toBeNull();
    }
  });

  it('case 3: rejects a token signed with a different secret', () => {
    const token = signSessionToken(payload(), OTHER_SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
    // ...and the reverse direction, so the assertion is not an artefact of ordering.
    const genuine = signSessionToken(payload(), SECRET, NOW);
    expect(verifySessionToken(genuine, OTHER_SECRET, NOW)).toBeNull();
  });

  it('case 4a: rejects a token whose expiry has passed', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    const justAfterExpiry = NOW + SESSION_LIFETIME_MS + 1;
    expect(verifySessionToken(token, SECRET, NOW + SESSION_LIFETIME_MS - 1)).not.toBeNull();
    expect(verifySessionToken(token, SECRET, justAfterExpiry)).toBeNull();
  });

  it('case 4b: treats the expiry instant itself as expired', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW + SESSION_LIFETIME_MS)).toBeNull();
  });

  it('case 4c: rejects an over-long claimed lifetime even when it verifies', () => {
    // Signed by hand, because `signSessionToken` now refuses this payload itself -- that refusal
    // is asserted separately under `signSessionToken`. The verifier must independently reject it,
    // because a token can arrive from any earlier release of the signer.
    const token = signByHand({
      v: 1,
      sub: USER_ID,
      role: 'student',
      iat: NOW,
      exp: NOW + SESSION_MAX_LIFETIME_MS + 1,
    });
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
    // The boundary itself is still accepted, so the check is a bound and not an off-by-one ban.
    const atLimit = signSessionToken(payload({ exp: NOW + SESSION_MAX_LIFETIME_MS }), SECRET, NOW);
    expect(verifySessionToken(atLimit, SECRET, NOW)).not.toBeNull();
  });

  it('case 5a: rejects an empty secret and refuses by default', () => {
    const token = signSessionToken(payload(), SECRET, NOW);
    expect(verifySessionToken(token, '', NOW)).toBeNull();
  });

  it('case 5b: rejects a structurally malformed token without throwing', () => {
    const malformed: unknown[] = [
      '',
      '   ',
      'not-a-token',
      'only.two', // missing third part
      'a.b.c.d', // too many parts
      '....',
      '!!!.@@@.###', // not base64url
      '1.bm90LWpzb24.c2ln', // valid shape, payload is not JSON
      '2.bm90LWpzb24.c2ln', // unsupported version
      '1..c2ln', // empty payload segment
      '1.e30.c2ln', // empty JSON object: no sub, no role, no exp
      Buffer.from('1.payload.sig').toString('base64'), // a whole token base64-encoded
      'a'.repeat(5000), // over the length cap
    ];
    for (const candidate of malformed) {
      expect(() => verifySessionToken(candidate, SECRET, NOW)).not.toThrow();
      expect(verifySessionToken(candidate, SECRET, NOW)).toBeNull();
    }
  });

  it('case 5c: rejects a non-string token, including undefined and null', () => {
    for (const candidate of [undefined, null, 0, 1, true, false, {}, [], Buffer.from('x.y.z')]) {
      expect(() => verifySessionToken(candidate, SECRET, NOW)).not.toThrow();
      expect(verifySessionToken(candidate, SECRET, NOW)).toBeNull();
    }
  });

  it('case 5d: rejects a payload whose fields are the wrong type', () => {
    // These payloads are signed by hand rather than through `signSessionToken`, because that
    // function refuses to sign a malformed or expired payload at all -- which is itself the
    // point. A token can only reach `verifySessionToken` in these shapes if it was produced by
    // some *other* signer, so the verifier has to reject it on its own.
    const wrongShapes: unknown[] = [
      { v: 1, sub: 42, role: 'student', iat: NOW, exp: NOW + 1000 },
      { v: 1, sub: USER_ID, role: 'admin', iat: NOW, exp: NOW + 1000 },
      { v: 1, sub: USER_ID, role: 'student', iat: 'now', exp: NOW + 1000 },
      { v: 1, sub: USER_ID, role: 'student', iat: NOW, exp: 'later' },
      { v: 1, sub: USER_ID, role: 'student', iat: NOW, exp: NOW - 1000 }, // exp before iat
      { v: 1, sub: USER_ID, role: 'student', iat: NOW, exp: NOW }, // zero-length window
      { v: 1, sub: USER_ID, role: 'student', iat: NOW }, // missing exp
      { v: 1, sub: '', role: 'student', iat: NOW, exp: NOW + 1000 }, // empty subject
      { v: 1, sub: USER_ID, role: 'student', iat: 0, exp: NOW + 1000 }, // iat is not a valid instant
      { v: 1, sub: 'x'.repeat(100), role: 'student', iat: NOW, exp: NOW + 1000 }, // subject too long
      { sub: USER_ID, role: 'student', iat: NOW, exp: NOW + 1000 }, // version absent
      [1, USER_ID, 'student'], // not an object at all
    ];
    for (const shape of wrongShapes) {
      const token = signByHand(shape);
      expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
    }
  });

  it('case 6: round-trips the role for both permitted values', () => {
    for (const role of ['student', 'tutor'] as const) {
      const token = signSessionToken(payload({ role }), SECRET, NOW);
      expect(verifySessionToken(token, SECRET, NOW)?.role).toBe(role);
    }
  });
});

describe('session cookie', () => {
  interface RecordedCookie {
    name: string;
    value: string;
    path: string;
    httpOnly: boolean;
    sameSite: string;
    secure: boolean;
    maxAge: number;
  }

  /**
   * A stand-in for `NextResponse`: the only member `setSessionCookie` touches is
   * `cookies.set(options)`, and this records what it was handed.
   */
  function recorder(): {
    cookies: { set: (cookie: RecordedCookie) => void };
    readonly last: RecordedCookie | null;
  } {
    let last: RecordedCookie | null = null;
    return {
      cookies: {
        set: (cookie: RecordedCookie) => {
          last = cookie;
        },
      },
      get last() {
        return last;
      },
    };
  }

  it('sets httpOnly, SameSite=Lax, Path=/ and the token lifetime as Max-Age', () => {
    const target = recorder();
    setSessionCookie(target, 'token-value', { secure: false });
    const cookie = target.last;
    expect(cookie).not.toBeNull();
    expect(cookie?.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
  });

  it('is Secure only when the caller says the environment is production', () => {
    const local = recorder();
    setSessionCookie(local, 'token-value', { secure: false });
    expect(local.last?.secure).toBe(false);

    const deployed = recorder();
    setSessionCookie(deployed, 'token-value', { secure: true });
    expect(deployed.last?.secure).toBe(true);
  });

  it('clears the cookie by emptying it with Max-Age 0', () => {
    const target = recorder();
    clearSessionCookie(target, { secure: true });
    expect(target.last?.value).toBe('');
    expect(target.last?.maxAge).toBe(0);
    expect(target.last?.httpOnly).toBe(true);
  });

  it('reads the cookie from a request, and answers null when it is absent or empty', () => {
    const withCookie = { cookies: { get: () => ({ value: 'token-value' }) } };
    expect(readSessionCookie(withCookie)).toBe('token-value');

    const empty = { cookies: { get: () => ({ value: '' }) } };
    expect(readSessionCookie(empty)).toBeNull();

    const absent = { cookies: { get: () => undefined } };
    expect(readSessionCookie(absent)).toBeNull();
  });
});
