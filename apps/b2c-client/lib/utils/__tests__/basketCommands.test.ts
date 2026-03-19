import { describe, it, expect } from 'vitest';
import { parseBasketCommand } from '../basketCommands';

describe('parseBasketCommand', () => {
  // ── Null (regular search) ────────────────────────────────────────────────────
  it('returns null for a plain product search', () => {
    expect(parseBasketCommand('milk')).toBeNull();
    expect(parseBasketCommand('חלב')).toBeNull();
    expect(parseBasketCommand('молоко')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseBasketCommand('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseBasketCommand('   ')).toBeNull();
  });

  it('returns null for "add" with no product (bare keyword)', () => {
    expect(parseBasketCommand('add')).toBeNull();
    expect(parseBasketCommand('add ')).toBeNull();
  });

  it('returns null for "remove" with no product name', () => {
    expect(parseBasketCommand('remove')).toBeNull();
  });

  // ── Clear ────────────────────────────────────────────────────────────────────
  it('detects English "clear"', () => {
    expect(parseBasketCommand('clear')).toEqual({ type: 'clear' });
  });

  it('detects English "clear basket"', () => {
    expect(parseBasketCommand('clear basket')).toEqual({ type: 'clear' });
  });

  it('detects English "clear my list"', () => {
    expect(parseBasketCommand('clear my list')).toEqual({ type: 'clear' });
  });

  it('detects Hebrew clear command', () => {
    expect(parseBasketCommand('נקה')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('נקה סל')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('נקה את הסל')).toEqual({ type: 'clear' });
  });

  it('detects Russian clear command (imperative forms)', () => {
    // The regex matches "очисти" and "очист" — the "?" makes the "и" optional
    expect(parseBasketCommand('очисти')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('очисти список')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('очисти корзину')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('очисти мой список')).toEqual({ type: 'clear' });
  });

  it('is case-insensitive for clear', () => {
    expect(parseBasketCommand('CLEAR')).toEqual({ type: 'clear' });
    expect(parseBasketCommand('Clear Basket')).toEqual({ type: 'clear' });
  });

  // ── Add ──────────────────────────────────────────────────────────────────────
  it('detects English "add <product>"', () => {
    expect(parseBasketCommand('add milk')).toEqual({ type: 'add', query: 'milk' });
  });

  it('detects English "add <product> to basket"', () => {
    expect(parseBasketCommand('add eggs to basket')).toEqual({ type: 'add', query: 'eggs' });
  });

  it('detects English "add <product> to my list"', () => {
    expect(parseBasketCommand('add bread to my list')).toEqual({ type: 'add', query: 'bread' });
  });

  it('detects Hebrew "הוסף <product>"', () => {
    expect(parseBasketCommand('הוסף חלב')).toEqual({ type: 'add', query: 'חלב' });
  });

  it('detects Hebrew "הוסף <product> לסל"', () => {
    expect(parseBasketCommand('הוסף לחם לסל')).toEqual({ type: 'add', query: 'לחם' });
  });

  it('detects Russian "добавь <product>"', () => {
    expect(parseBasketCommand('добавь молоко')).toEqual({ type: 'add', query: 'молоко' });
  });

  it('detects Russian "добавь <product> в список"', () => {
    // The regex matches "добавь" (imperative), not "добавить" (infinitive)
    expect(parseBasketCommand('добавь хлеб в список')).toEqual({ type: 'add', query: 'хлеб' });
  });

  it('preserves multi-word product names in add command', () => {
    expect(parseBasketCommand('add whole wheat bread')).toEqual({ type: 'add', query: 'whole wheat bread' });
  });

  it('is case-insensitive for add', () => {
    expect(parseBasketCommand('ADD milk')).toEqual({ type: 'add', query: 'milk' });
    expect(parseBasketCommand('Add Eggs')).toEqual({ type: 'add', query: 'Eggs' });
  });

  // ── Remove ───────────────────────────────────────────────────────────────────
  it('detects English "remove <product>"', () => {
    expect(parseBasketCommand('remove milk')).toEqual({ type: 'remove', name: 'milk' });
  });

  it('detects English "remove <product> from basket"', () => {
    expect(parseBasketCommand('remove eggs from basket')).toEqual({ type: 'remove', name: 'eggs' });
  });

  it('detects English "remove <product> from my list"', () => {
    expect(parseBasketCommand('remove bread from my list')).toEqual({ type: 'remove', name: 'bread' });
  });

  it('detects Hebrew "הסר <product>"', () => {
    expect(parseBasketCommand('הסר חלב')).toEqual({ type: 'remove', name: 'חלב' });
  });

  it('detects Hebrew "הסר <product> מהסל"', () => {
    expect(parseBasketCommand('הסר לחם מהסל')).toEqual({ type: 'remove', name: 'לחם' });
  });

  it('detects Russian "удали <product>"', () => {
    expect(parseBasketCommand('удали молоко')).toEqual({ type: 'remove', name: 'молоко' });
  });

  it('detects Russian "удали <product> из списка"', () => {
    // The regex matches "удали" (imperative), not "удалить" (infinitive)
    expect(parseBasketCommand('удали хлеб из списка')).toEqual({ type: 'remove', name: 'хлеб' });
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseBasketCommand('  add milk  ')).toEqual({ type: 'add', query: 'milk' });
    expect(parseBasketCommand('  clear  ')).toEqual({ type: 'clear' });
  });
});
