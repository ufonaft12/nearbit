/**
 * Nearbit – query validation layer
 *
 * Run BEFORE every search request to prevent:
 *  - Junk / random characters wasting OpenAI + Supabase credits
 *  - URLs, injection attempts, and non-product strings
 *  - Excessively long or short inputs
 *
 * Each rule is a standalone function so new checks can be added over time
 * without touching the rest of the pipeline.
 */

export interface ValidationResult {
  ok:     boolean;
  reason?: string; // human-readable, shown in the UI
}

const PASS: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

// ── Individual rules ────────────────────────────────────────────────────────

/** At least 2 characters after trimming */
function ruleMinLength(q: string): ValidationResult {
  return q.length >= 2 ? PASS : fail('Query is too short.');
}

/** No more than 300 characters */
function ruleMaxLength(q: string): ValidationResult {
  return q.length <= 300 ? PASS : fail('Query is too long (max 300 characters).');
}

/** Must contain at least one letter (Hebrew, Cyrillic, Latin, Arabic) — not just numbers/symbols */
function ruleHasLetter(q: string): ValidationResult {
  // Unicode ranges: Latin, Hebrew, Cyrillic, Arabic
  return /[\p{L}]/u.test(q)
    ? PASS
    : fail('Please type at least one word — numbers and symbols alone cannot be searched.');
}

/** No URLs */
function ruleNoUrl(q: string): ValidationResult {
  return /https?:\/\/|www\./i.test(q)
    ? fail('URLs are not valid product searches.')
    : PASS;
}

/** No obvious code / injection patterns */
function ruleNoCode(q: string): ValidationResult {
  // SQL-ish patterns, script tags, template literals
  if (/<script|SELECT\s+\*|DROP\s+TABLE|--|\/\*|\*\//i.test(q)) {
    return fail('Input looks like code, not a product name.');
  }
  return PASS;
}

/**
 * Maximum 10 distinct lines / comma-separated items.
 * Prevents basket queries with hundreds of items that would overwhelm the API.
 */
function ruleMaxItems(q: string): ValidationResult {
  const items = q.split(/[\n,،]+/).map((s) => s.trim()).filter(Boolean);
  return items.length <= 10
    ? PASS
    : fail(`Please search for at most 10 products at a time (got ${items.length}).`);
}

/**
 * Each individual item must have at least one recognisable letter and
 * must not be longer than 80 characters.
 */
function ruleItemsLookLikeProducts(q: string): ValidationResult {
  const items = q.split(/[\n,،]+/).map((s) => s.trim()).filter(Boolean);
  for (const item of items) {
    if (item.length > 80) {
      return fail(`"${item.slice(0, 30)}…" is too long for a product name.`);
    }
    if (!/[\p{L}]/u.test(item)) {
      return fail(`"${item}" doesn't look like a product name — please use words.`);
    }
  }
  return PASS;
}

/**
 * Reject strings that are purely repeated characters / keyboard spam.
 * e.g. "aaaaaaaaa", "!!!!!!!", "asdfghjkl"
 */
function ruleNoKeyboardSpam(q: string): ValidationResult {
  // All characters the same
  if (/^(.)\1{4,}$/.test(q.trim())) {
    return fail('That doesn\'t look like a product name — try something like "חלב" or "milk".');
  }
  // Classic qwerty runs (5+ sequential keyboard chars)
  if (/qwerty|asdfgh|zxcvbn|йцукен|фывапр|ячсмит/i.test(q)) {
    return fail('That looks like keyboard spam rather than a product search.');
  }
  return PASS;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

const RULES = [
  ruleMinLength,
  ruleMaxLength,
  ruleHasLetter,
  ruleNoUrl,
  ruleNoCode,
  ruleMaxItems,
  ruleItemsLookLikeProducts,
  ruleNoKeyboardSpam,
];

/**
 * Validate a search query before it is sent to the API.
 *
 * @param raw - the raw string from the textarea / voice input
 * @returns ValidationResult — `{ ok: true }` or `{ ok: false, reason: string }`
 *
 * @example
 * const v = validateQuery('חלב, ביצים');
 * if (!v.ok) showError(v.reason);
 */
export function validateQuery(raw: string): ValidationResult {
  const q = raw.trim();
  for (const rule of RULES) {
    const result = rule(q);
    if (!result.ok) return result;
  }
  return PASS;
}
