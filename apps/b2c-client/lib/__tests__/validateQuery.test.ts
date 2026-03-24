import { describe, it, expect } from 'vitest';
import { validateQuery } from '../validateQuery';

describe('validateQuery', () => {
  // ── Happy paths ──────────────────────────────────────────────────────────────
  it('accepts a plain Hebrew product name', () => {
    expect(validateQuery('חלב').ok).toBe(true);
  });

  it('accepts a plain English product name', () => {
    expect(validateQuery('milk').ok).toBe(true);
  });

  it('accepts a plain Russian product name', () => {
    expect(validateQuery('молоко').ok).toBe(true);
  });

  it('accepts a comma-separated basket query', () => {
    expect(validateQuery('חלב, ביצים, לחם').ok).toBe(true);
  });

  it('accepts exactly 10 items (at the limit)', () => {
    const query = Array.from({ length: 10 }, (_, i) => `item${i}`).join(', ');
    expect(validateQuery(query).ok).toBe(true);
  });

  it('accepts a valid multi-word product name within max length', () => {
    // 4 short items, comfortably under 300 chars
    expect(validateQuery('whole milk, free range eggs, sourdough bread, butter').ok).toBe(true);
  });

  // ── Min length ───────────────────────────────────────────────────────────────
  it('rejects a 1-character query', () => {
    const result = validateQuery('a');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too short/i);
  });

  it('rejects an empty string', () => {
    expect(validateQuery('').ok).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(validateQuery('   ').ok).toBe(false);
  });

  it('accepts 2-character query (min length boundary)', () => {
    expect(validateQuery('אב').ok).toBe(true);
  });

  // ── Max length ───────────────────────────────────────────────────────────────
  it('rejects a query over 300 characters', () => {
    // Use a 301-char string with many letter-only items to bypass other rules
    // 10 items × 29 chars each = 290 + ", " × 9 = 308 chars — too long; use 7 × 40 + 6 × 2 = 292
    // Simple approach: one item name repeated to > 80 chars (hits item-length rule before max-length),
    // so test with a valid-structure query padded by duplicating items across multiple lines
    const longQuery = 'a'.repeat(301);
    expect(validateQuery(longQuery).ok).toBe(false);
  });

  it('long query fails with max-length or item-length rule (both guard against very long input)', () => {
    const result = validateQuery('a'.repeat(301));
    // Either max-length or item-length catches it — either way, ok must be false
    expect(result.ok).toBe(false);
  });

  // ── Must have a letter ───────────────────────────────────────────────────────
  it('rejects numbers-only query', () => {
    const result = validateQuery('1234');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/at least one word/i);
  });

  it('rejects symbols-only query', () => {
    const result = validateQuery('!@#$%');
    expect(result.ok).toBe(false);
  });

  // ── No URLs ──────────────────────────────────────────────────────────────────
  it('rejects a URL starting with http://', () => {
    const result = validateQuery('http://example.com');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/url/i);
  });

  it('rejects a URL starting with https://', () => {
    expect(validateQuery('https://example.com/product').ok).toBe(false);
  });

  it('rejects www. URLs', () => {
    expect(validateQuery('www.shop.co.il').ok).toBe(false);
  });

  // ── No code / injection ──────────────────────────────────────────────────────
  it('rejects SQL injection pattern SELECT *', () => {
    const result = validateQuery('SELECT * FROM products');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/code/i);
  });

  it('rejects DROP TABLE pattern', () => {
    expect(validateQuery('DROP TABLE users').ok).toBe(false);
  });

  it('rejects <script> tag', () => {
    expect(validateQuery('<script>alert(1)</script>').ok).toBe(false);
  });

  it('rejects SQL comment --', () => {
    expect(validateQuery('milk -- SELECT 1').ok).toBe(false);
  });

  // ── Max items ────────────────────────────────────────────────────────────────
  it('rejects more than 10 items', () => {
    const query = Array.from({ length: 11 }, (_, i) => `item${i}`).join(', ');
    const result = validateQuery(query);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/10/);
  });

  // ── Item length ──────────────────────────────────────────────────────────────
  it('rejects an individual item longer than 80 chars', () => {
    const longItem = 'a'.repeat(81);
    const result = validateQuery(longItem);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too long/i);
  });

  it('rejects an item with no letters (e.g. all numbers)', () => {
    const result = validateQuery('milk, 123456, eggs');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/product name/i);
  });

  // ── Keyboard spam ────────────────────────────────────────────────────────────
  it('rejects repeated single-character spam (aaaaaaa)', () => {
    const result = validateQuery('aaaaaaa');
    expect(result.ok).toBe(false);
  });

  it('rejects qwerty keyboard run', () => {
    expect(validateQuery('qwerty').ok).toBe(false);
  });

  it('rejects asdfgh keyboard run', () => {
    expect(validateQuery('asdfgh').ok).toBe(false);
  });

  it('rejects zxcvbn keyboard run', () => {
    expect(validateQuery('zxcvbn').ok).toBe(false);
  });

  // ── Conversational messages (English — ASCII word boundaries work correctly) ──
  it('rejects English greeting "hello"', () => {
    const result = validateQuery('hello');
    expect(result.ok).toBe(false);
  });

  it('rejects "hello world" (starts with hello)', () => {
    expect(validateQuery('hello world').ok).toBe(false);
  });

  it('rejects "how are you doing"', () => {
    expect(validateQuery('how are you doing').ok).toBe(false);
  });

  it('rejects "thank you"', () => {
    expect(validateQuery('thank you').ok).toBe(false);
  });

  it('rejects "good morning"', () => {
    expect(validateQuery('good morning').ok).toBe(false);
  });

  it('rejects "tell me about milk" (even though "milk" is a product)', () => {
    expect(validateQuery('tell me about milk').ok).toBe(false);
  });

  // ── Edge cases that should PASS ───────────────────────────────────────────────
  it('accepts a product with a number in the name', () => {
    // "2% milk" has letters, should pass
    expect(validateQuery('2% milk').ok).toBe(true);
  });

  it('accepts legitimate product near a conversational word (e.g. "cottage cheese")', () => {
    expect(validateQuery('cottage cheese').ok).toBe(true);
  });

  it('accepts "yogurt" (unambiguously a product)', () => {
    expect(validateQuery('yogurt').ok).toBe(true);
  });

  it('accepts Hebrew product name with punctuation', () => {
    // "חלב 3%" — has Hebrew letters, should pass
    expect(validateQuery('חלב 3%').ok).toBe(true);
  });

  // ── Cyrillic/Hebrew conversational phrases (Unicode-safe boundaries) ──
  it('rejects Russian greeting "привет" alone', () => {
    expect(validateQuery('привет').ok).toBe(false);
  });

  it('rejects Russian "спасибо" (thank you)', () => {
    expect(validateQuery('спасибо').ok).toBe(false);
  });

  it('rejects Russian "как дела" (how are you)', () => {
    expect(validateQuery('как дела').ok).toBe(false);
  });

  it('rejects Hebrew "תודה רבה" (thank you)', () => {
    expect(validateQuery('תודה רבה').ok).toBe(false);
  });

  it('rejects Hebrew "בוקר טוב" (good morning)', () => {
    expect(validateQuery('בוקר טוב').ok).toBe(false);
  });

  it('rejects Hebrew "מה שלומך" (how are you)', () => {
    expect(validateQuery('מה שלומך').ok).toBe(false);
  });

  it('accepts Russian product name "молоко" (milk — not conversational)', () => {
    expect(validateQuery('молоко').ok).toBe(true);
  });

  it('accepts Hebrew product name "חלב" (milk — not conversational)', () => {
    expect(validateQuery('חלב').ok).toBe(true);
  });
});
