/**
 * Unit tests for argon2id hashing (`11` WP-03; `04` S9.1; C7).
 *
 * Pure: no database, no network, no provider key, no configuration. `password.ts` imports
 * `@node-rs/argon2` and nothing else, and the tests import it by relative path because the
 * repository's `vitest.config.ts` deliberately defines no path aliases.
 */

import { describe, expect, it } from 'vitest';

import {
  PASSWORD_HASH_OPTIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  verifyPassword,
} from '../../src/lib/auth/password';

const PASSWORD = 'demo1234';
const WRONG_PASSWORD = 'demo12345';

describe('hashPassword', () => {
  it('produces an argon2id encoded hash, pinned to the documented parameters', () => {
    // The parameters are asserted, not just the algorithm: a silent default change would weaken
    // every stored hash, and a test that only checked the prefix would not notice.
    return hashPassword(PASSWORD).then((hash) => {
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(hash).toContain(`m=${PASSWORD_HASH_OPTIONS.memoryCost}`);
      expect(hash).toContain(`t=${PASSWORD_HASH_OPTIONS.timeCost}`);
      expect(hash).toContain(`p=${PASSWORD_HASH_OPTIONS.parallelism}`);
    });
  });

  it('case 7b: the hash is not the password, and does not contain it', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).not.toBe(PASSWORD);
    expect(hash.includes(PASSWORD)).toBe(false);
    expect(hash.length).toBeGreaterThan(PASSWORD.length);
  });

  it('case 7c: two hashes of the same password differ (a fresh salt each time)', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);
    expect(first).not.toBe(second);
    // ...and both still verify, so the difference is the salt and not a broken hash.
    await expect(verifyPassword(first, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(second, PASSWORD)).resolves.toBe(true);
  });

  it('refuses to hash an empty password instead of producing a hash of nothing', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  it('hashes a password at the documented maximum length', async () => {
    const longest = 'x'.repeat(PASSWORD_MAX_LENGTH);
    const hash = await hashPassword(longest);
    await expect(verifyPassword(hash, longest)).resolves.toBe(true);
  });
});

describe('verifyPassword', () => {
  it('case 7a: returns true for the right password and false for a wrong one', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(hash, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(hash, WRONG_PASSWORD)).resolves.toBe(false);
  });

  it('is case- and whitespace-sensitive, so it does not accept a near miss', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(hash, PASSWORD.toUpperCase())).resolves.toBe(false);
    await expect(verifyPassword(hash, ` ${PASSWORD}`)).resolves.toBe(false);
    await expect(verifyPassword(hash, `${PASSWORD} `)).resolves.toBe(false);
  });

  it('case 7a (cont.): accepts the documented minimum-length password', async () => {
    const shortest = 'a'.repeat(PASSWORD_MIN_LENGTH);
    const hash = await hashPassword(shortest);
    await expect(verifyPassword(hash, shortest)).resolves.toBe(true);
    await expect(verifyPassword(hash, `${shortest}b`)).resolves.toBe(false);
  });

  it('refuse-by-default: an empty candidate never verifies', async () => {
    const hash = await hashPassword(PASSWORD);
    await expect(verifyPassword(hash, '')).resolves.toBe(false);
  });

  it('refuse-by-default: a malformed or truncated stored hash answers false and does not throw', async () => {
    const hash = await hashPassword(PASSWORD);
    const damaged = [
      '',
      'not-a-hash',
      '$argon2id$',
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA',
      hash.slice(0, hash.length - 4),
      hash.replace('$argon2id$', '$argon2i$'),
      `${hash}!`,
    ];
    for (const candidate of damaged) {
      await expect(verifyPassword(candidate, PASSWORD)).resolves.toBe(false);
    }
  });
});
