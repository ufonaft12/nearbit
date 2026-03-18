export function getPriceTrend(
  current: number | null,
  previous?: number | null,
): { type: 'up' | 'down' | 'same'; delta: number } | null {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.005) return { type: 'same', delta: 0 };
  if (delta < 0)               return { type: 'down', delta };
  return                              { type: 'up',   delta };
}
