import { vi } from 'vitest';

import type { NewModerationFlag } from '@/lib/db/queries/discussions';

/**
 * A recording stub for the one database write `moderatePost` makes.
 *
 * **Why the write is stubbed at the query layer rather than given a fake executor.** `moderatePost` takes
 * an `Executor`, which is Postgres's `TransactionSql` -- a tagged-template function with no interface this
 * suite could implement convincingly. Faking one would mean asserting against a stub of a stub. Mocking
 * the single exported writer is precise, and it makes the assertion the *argument the service passed*,
 * which is what `05` section 9.4's provenance rules are about (`ai_model_id`, `ai_prompt_version`, the
 * severity word, and the null reporter).
 *
 * `pnpm test` must pass with no database (`12` section 3.7), so this is also the mechanism that keeps the
 * suite honest about that.
 */
export const moderationFlagWrites: NewModerationFlag[] = [];

export function resetModerationFlagWrites(): void {
  moderationFlagWrites.length = 0;
}

vi.mock('@/lib/db/queries/discussions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/queries/discussions')>();
  return {
    ...actual,
    insertModerationFlag: (ex: unknown, flag: NewModerationFlag): Promise<boolean> => {
      void ex;
      moderationFlagWrites.push(flag);
      return Promise.resolve(true);
    },
  };
});
