import type { CardDef, Step } from './types';

/** Every card definition known to the simulator, by card number. */
export const CARDS: Record<string, CardDef> = {};
/** Step lists for every effect ("ST30-006#0") and system routine ("sys#damage"). */
export const STEPS: Record<string, Step[]> = {};

export function D(id: string): CardDef {
  const d = CARDS[id];
  if (!d) throw new Error(`Unknown card id: ${id}`);
  return d;
}
