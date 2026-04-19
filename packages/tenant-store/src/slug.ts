/**
 * Slug validation — shared between file-store (paths) and api (route params)
 * so the check lives in one place and both sides agree.
 *
 * Rules:
 *   - non-empty
 *   - only ASCII letters, digits, underscore, dash
 *   - length ≤ 100 (arbitrary sanity cap)
 *
 * These are the same rules the generate CLI uses when deriving slugs from
 * source origin. Anything outside this set is rejected at every entry
 * point so an attacker can't smuggle `../` or `/foo` through a slug param.
 */

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_PATTERN.test(s);
}

/** Throws with a caller-friendly message when slug fails validation. */
export function assertValidSlug(s: unknown, context = "slug"): asserts s is string {
  if (!isValidSlug(s)) {
    throw new InvalidSlugError(context, s);
  }
}

export class InvalidSlugError extends Error {
  constructor(public readonly context: string, public readonly value: unknown) {
    super(`invalid ${context}: expected [A-Za-z0-9_-]{1,100}, got ${JSON.stringify(value)}`);
    this.name = "InvalidSlugError";
  }
}
