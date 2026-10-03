/**
 * Storage driver selection: one pure factory, one memoised accessor.
 *
 * **Owner:** `04-TECH-ARCHITECTURE.md` S8 and its driver table: `STORAGE_DRIVER=local` (the default)
 * selects the local driver rooted at `STORAGE_LOCAL_DIR`; `STORAGE_DRIVER=s3` selects the S3 driver
 * and requires the five `S3_*` variables. This module is the only place that mapping is decided.
 *
 * **Why the two are separate.** `createStorageDriver(config)` takes its configuration as an
 * argument, so a test can construct either driver with no environment at all; `getStorageDriver()`
 * is the application entry point and reads the validated config via `getConfig()`, which is the
 * memoised `config.ts` read and throws `ConfigError` when anything required is missing. Keeping the
 * pure function free of `getConfig()` is what makes the driver choice testable (`AGENTS.md` S4.2:
 * "Mock behind the adapter, not in the UI") -- the seam is the argument, not a global.
 *
 * **Why this module also re-exports the interface.** Callers import `StorageDriver` and `StorageError`
 * from `@/lib/storage`, so the shape of the driver layer is one import, not three. `types.ts` remains
 * the definition; this file adds no second copy of anything.
 *
 * **Why the memo is not a singleton at module load.** A module-load `getConfig()` would abort the
 * process during `next build`'s page-data collection, where no runtime environment exists. The read
 * happens on first use, like `getConfig()` itself.
 */

import { getConfig, type AppConfig } from '@/lib/config';

import { LocalStorageDriver } from './local';
import { S3StorageDriver } from './s3';
import { StorageError, type StorageDriver } from './types';

export {
  StorageError,
  assertValidKey,
  sourceStorageKey,
  uploadStorageKey,
  MAX_KEY_LENGTH,
  MAX_KEY_SEGMENT_LENGTH,
} from './types';
export type {
  RequiredS3Config,
  StorageDriver,
  StorageErrorCode,
  StorageObject,
} from './types';
export type { S3DriverOptions } from './s3';

/**
 * Build the driver the configuration selects. Pure: it reads nothing outside its argument and
 * caches nothing, so calling it twice returns two independent drivers.
 *
 * An unrecognised `storageDriver` is impossible through the type system *and* through `config.ts`,
 * which validates `STORAGE_DRIVER` against the same two-value union. It is still handled, because
 * the alternative to an explicit throw is a function that falls off its switch and returns
 * `undefined` to a caller expecting a driver.
 */
export function createStorageDriver(config: AppConfig): StorageDriver {
  switch (config.storageDriver) {
    case 'local':
      return new LocalStorageDriver(config.storageLocalDir);
    case 's3':
      return new S3StorageDriver(config);
    default:
      throw new StorageError('DRIVER_UNAVAILABLE', 'the configured storage driver is not known');
  }
}

let cached: StorageDriver | null = null;

/**
 * The process-wide driver, built from the validated config on first use.
 *
 * Memoised so a request does not re-resolve the root path or rebuild a credential scope per call.
 * The driver holds no connection, so caching it is cheap and holds no socket open.
 */
export function getStorageDriver(): StorageDriver {
  cached ??= createStorageDriver(getConfig());
  return cached;
}

/** Test seam, mirroring `resetConfigCache()` in `config.ts`: drop the memoised driver. */
export function resetStorageDriver(): void {
  cached = null;
}
