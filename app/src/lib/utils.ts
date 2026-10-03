/**
 * `cn` -- the class-string joiner for the owned UI primitives.
 *
 * Constraint: no new dependency. `clsx` and `tailwind-merge` are not pinned in
 * `app/package.json`, so this is a plain join. It does NOT resolve conflicting Tailwind
 * classes: Tailwind decides conflicts by declaration order in the generated stylesheet,
 * not by the order of names in this string, so a caller must not pass two classes that
 * set the same property and expect the later one to win.
 *
 * `false`, `null`, `undefined` and the empty string are dropped, which is what makes the
 * conditional class strings inside the primitives readable.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
}
