/**
 * Password hashing (`04` S9.1, WP-03).
 *
 * Invariants this module exists to hold:
 * - **C7.** No password, no hash and no part of one is ever logged, returned, or embedded in
 *   an error. `verifyPassword` answers a boolean and never a reason, so a caller cannot
 *   accidentally log why a comparison failed.
 * - **argon2id**, memory-hard (`04` S9.1: "argon2id preferred"). The parameters below are the
 *   `@node-rs/argon2` defaults and are pinned explicitly rather than inherited, so a minor
 *   upgrade cannot silently weaken every stored hash.
 *
 * **No project imports.** This module must be loadable by a unit test under the repository's
 * `vitest.config.ts`, which defines no path aliases, so it imports nothing from `@/`. The
 * consequence is that it also cannot read configuration: hashing parameters are fixed here
 * rather than plumbed through `config.ts`, which adds no variable and keeps the stored hash
 * format independent of the environment that produced it.
 */

import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

/**
 * argon2id / v19 / m=19456 KiB (19 MiB) / t=2 / p=1. See the module comment before changing.
 *
 * The two numeric literals are `Algorithm.Argon2id` (2) and `Version.V0x13` (1) from
 * `@node-rs/argon2`'s own declaration file. They are written as literals rather than imported
 * because that package declares both as **ambient const enums**, which this project's
 * `isolatedModules: true` forbids reading. The test asserts the encoded hash carries
 * `$argon2id$v=19`, so a wrong literal fails loudly rather than silently downgrading the
 * algorithm.
 */
export const PASSWORD_HASH_OPTIONS = {
  algorithm: 2,
  version: 1,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** The shortest password the sign-in screen will accept. Length is not logged, only compared. */
export const PASSWORD_MIN_LENGTH = 8;

/** The longest password accepted, so a hash is never computed over an unbounded body. */
export const PASSWORD_MAX_LENGTH = 256;

/**
 * Hash a plaintext password for `users.password_hash`.
 *
 * The returned string contains the algorithm, the parameters and a fresh random salt. Two
 * calls with the same password return two different strings; that is the salt working, not a
 * bug, and the test asserts it.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error('refusing to hash an empty password');
  }
  return argon2Hash(password, PASSWORD_HASH_OPTIONS);
}

/**
 * Verify a candidate password against a stored hash.
 *
 * **Refuse-by-default:** a malformed or truncated stored hash, an empty candidate, or any
 * driver error answers `false`. There is no code path here that turns an error into a pass,
 * and the reason is never returned or logged (C7).
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (passwordHash === '' || password === '') return false;
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}
