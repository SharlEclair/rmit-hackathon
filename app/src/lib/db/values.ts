/**
 * Column-value normalisation for the query layer.
 *
 * **Why this module exists.** The `postgres` driver's type parsing is not something this application
 * can rely on being identical in every environment. Phase 2 discovered it twice and worked around it
 * locally: `listSources` calls `Number(row.byte_size)` because a `bigint` can arrive as a string, and
 * `ingestions.ts` carries a private `isoOrNull(Date | string)` because a `timestamptz` can arrive as
 * **either** a `Date` or a string. Phase 4 hit the second one as a `500`
 * (`row.created_at.toISOString is not a function`) on the review bundle's first live request.
 *
 * The honest reading is that the driver's parsers are not a contract this code may assume, so a column
 * of a known type is normalised at the boundary rather than trusted. These helpers are deliberately
 * strict about *type* and silent about *value*: a value that is neither a `Date` nor a string is a bug
 * in the query, and the error names the kind of column rather than the row's contents, because a log
 * line or an error message must never carry a row value (C7, `06` section 7.6.5).
 */

/**
 * A timestamp column as an ISO 8601 string, in UTC (the schema stores `timestamptz`).
 *
 * Returns `null` for `null`. Accepts a `Date` or a string the `Date` constructor can parse; anything
 * else throws, because a silently coerced timestamp would be a wrong value in an audit row rather
 * than a visible failure.
 */
export function isoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError('a timestamp column held a string that is not a date');
    }
    return parsed.toISOString();
  }
  throw new TypeError('expected a timestamp column');
}

/** A timestamp column that is `not null`, as an ISO 8601 string. */
export function isoTimestampRequired(value: Date | string): string {
  const iso = isoTimestamp(value);
  if (iso === null) throw new TypeError('expected a non-null timestamp column');
  return iso;
}

/** A `numeric` or `bigint` column as a number, or `null`. */
export function nullableNumber(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new TypeError('a numeric column held a string that is not a number');
  }
  return parsed;
}

/** A `numeric`, `integer` or `bigint` column as a number. */
export function requiredNumber(value: string | number): number {
  const parsed = nullableNumber(value);
  if (parsed === null) throw new TypeError('expected a non-null numeric column');
  return parsed;
}
