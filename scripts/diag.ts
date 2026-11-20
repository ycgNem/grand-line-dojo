// Finds CPU-vs-CPU games on random decks that do not finish, and shows what the CPU kept doing.
// `npx vite-node scripts/diag.ts [games]`

import { decide } from '../src/engine/ai';
import { apply, createGame, whoActs } from '../src/engine/game';
import { D } from '../src/engine/registry';
import { randomDeck, rng } from '../tests/helpers';

const N = Number((globalThis as unknown as { process: { argv: string[] } }).process.argv[2] ?? 300);
let stuck = 0;
for (let s = 0; s < N; s++) {
  const g = createGame({ decks: [randomDeck(500 + s), randomDeck(700 + s)], seed: 40 + s });
  const r = rng((40 + s) * 7 + 1);
  const recent: string[] = [];
  let n = 0;
  for (; n < 3000 && g.winner === null; n++) {
    const who = whoActs(g);
    if (who === null) break;
    const d = decide(g, who, who === 0 ? 'hard' : 'normal', r);
    const a = d.action;
    const what = a.type === 'activate' ? `activate ${D(g.ids[a.uid]).id} #${a.idx}` : a.type === 'play' ? `play ${D(g.ids[a.uid]).id}` : a.type === 'answer' ? `answer ${JSON.stringify(a.answer)}` : a.type;
    recent.push(`T${g.turn} P${who} ${what}`);
    if (recent.length > 14) recent.shift();
    apply(g, a);
  }
  if (g.winner === null) {
    stuck++;
    console.log(`\n=== seed ${s}: no winner after ${n} actions (turn ${g.turn}) ===`);
    console.log(recent.join('\n'));
    console.log(g.log.slice(-8).map((l) => `  log: ${l.msg}`).join('\n'));
    if (stuck >= 4) break;
  }
}
console.log(`\n${stuck} stuck game(s) in ${N}`);
