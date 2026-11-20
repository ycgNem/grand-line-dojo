// Prints how the simulator understands given cards: `npx vite-node scripts/show.ts OP01-016 ST30-007`
// Shows the printed text, whether the card is playable in matches, and each compiled effect's timing and cost.

import { card } from '../src/data/db';
import { costText } from '../src/engine/game';

const args = (globalThis as unknown as { process: { argv: string[] } }).process.argv.slice(2);

for (const id of args) {
  const d = card(id);
  if (!d) {
    console.log(`--- ${id}: not in the database`);
    continue;
  }
  console.log(`--- ${d.id} ${d.name} [${d.category}] cost ${d.cost} power ${d.power} counter ${d.counter ?? 0} | ${d.colors.join('/')} | ${d.types.join(', ')} | sim: ${d.sim}`);
  console.log(d.text);
  if (d.keywords?.length) console.log(`  keywords: ${d.keywords.join(', ')}`);
  (d.effects ?? []).forEach((e, i) => {
    const bits = [
      `#${i} ${e.timing}`,
      e.opt ? 'once per turn' : '',
      e.don ? `DON!! x${e.don}` : '',
      e.cost ? `cost: ${costText(e.cost)}` : '',
    ].filter(Boolean);
    console.log(`  effect ${bits.join(' · ')}`);
  });
  const extras = ['powerAura', 'dynKeyword', 'costAura', 'flagAura', 'handCost', 'handAura', 'auraFoe', 'cantAttack', 'cantBeKoByEffect'].filter((k) => (d as unknown as Record<string, unknown>)[k]);
  if (d.replaces?.length) extras.push(`replaces x${d.replaces.length}`);
  if (extras.length) console.log(`  continuous: ${extras.join(', ')}`);
}
