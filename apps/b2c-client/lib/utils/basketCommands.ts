export type BasketCommand =
  | { type: 'add';    query: string }
  | { type: 'clear'               }
  | { type: 'remove'; name:  string };

/**
 * Detect natural-language basket management commands in Hebrew, Russian, and English.
 * Returns null when the input is a plain product search, not a command.
 */
export function parseBasketCommand(input: string): BasketCommand | null {
  const s = input.trim();

  // Clear: "clear [my] basket/list", "נקה [את ה]סל", "очисти/очистить [мой] список"
  if (/^(?:clear(?:\s+(?:my\s+)?(?:basket|list))?|נקה(?:\s+(?:את\s+ה)?סל)?|очист(?:и|ить)(?:\s+(?:мой\s+)?(?:список|корзину))?)$/i.test(s)) {
    return { type: 'clear' };
  }

  // Add: "add X [to my basket/list]", "הוסף X [לסל]", "добавь/добавить X [в список]"
  const addMatch = s.match(
    /^(?:add|הוסף|добав(?:ь|ить))\s+(.+?)(?:\s+(?:to\s+(?:my\s+)?(?:basket|list)|לסל|в\s+(?:список|корзину)))?$/i,
  );
  if (addMatch?.[1]) return { type: 'add', query: addMatch[1].trim() };

  // Remove: "remove X [from basket]", "הסר X [מהסל]", "удали/удалить X [из списка]"
  const removeMatch = s.match(
    /^(?:remove|הסר|удал(?:и|ить))\s+(.+?)(?:\s+(?:from\s+(?:my\s+)?(?:basket|list)|מהסל|из\s+(?:списка|корзины)))?$/i,
  );
  if (removeMatch?.[1]) return { type: 'remove', name: removeMatch[1].trim() };

  return null;
}
