// Coverage report for the effect compiler: how many cards the engine can play, and which pieces of
// card text it still does not understand (most common first).
//   npx vite-node scripts/coverage.ts [report-file]
import { readFileSync, writeFileSync } from 'node:fs';
import { compileCard, trace, type RawCard } from '../src/engine/compile';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8')) as RawCard[];
const norm = (s: string): string =>
  s
    .replace(/\[([^\]]+)\]/g, (m, t: string) => (/^(Rush|Blocker|Double Attack|Banish|Unblockable|Rush: Character|On Play|When Attacking|On K\.O\.|On Block|Activate: Main|Main|Counter|Trigger|End of Your Turn|On Your Opponent's Attack|Once Per Turn|Your Turn|Opponent's Turn|DON!! x\d+)$/.test(t) ? m : '[X]'))
    .replace(/\{[^}]+\}/g, '{T}')
    .replace(/<[^>]+>/g, '<A>')
    .replace(/"[^"]+"/g, '"S"')
    .replace(/\d+/g, 'N');

let ok = 0;
let withText = 0;
const fragments = new Map<string, { n: number; ex: string; cards: Set<string> }>();
const lines = new Map<string, { n: number; ex: string }>();
/** Cards that fail because of exactly one fragment — fixing that fragment makes the card playable. */
const sole = new Map<string, number>();
trace.on = true;
for (const c of cards) {
  if (!c.text.trim()) continue;
  withText++;
  trace.misses = [];
  const r = compileCard(c);
  if (r.ok) {
    ok++;
    continue;
  }
  const mine = [...new Set(trace.misses.map(norm))];
  for (const k of mine) {
    const e = fragments.get(k);
    if (e) {
      e.n++;
      e.cards.add(c.id);
    } else fragments.set(k, { n: 1, ex: c.id, cards: new Set([c.id]) });
  }
  if (mine.length === 1) sole.set(mine[0], (sole.get(mine[0]) ?? 0) + 1);
  for (const u of r.unparsed) {
    const k = norm(u);
    const e = lines.get(k);
    if (e) e.n++;
    else lines.set(k, { n: 1, ex: c.id });
  }
}
const vanilla = cards.length - withText;
const out: string[] = [];
out.push(`cards ${cards.length}  no-text ${vanilla}  compiled ${ok}/${withText}  playable ${(((ok + vanilla) / cards.length) * 100).toFixed(1)}%`);
out.push('');
out.push(`FRAGMENTS (${fragments.size} distinct)   count / sole-blocker / example`);
for (const [k, e] of [...fragments].sort((a, b) => (sole.get(b[0]) ?? 0) - (sole.get(a[0]) ?? 0) || b[1].n - a[1].n)) out.push(`${e.n}\t${sole.get(k) ?? 0}\t${e.ex}\t${k}`);
out.push('');
out.push(`LINES (${lines.size} distinct)`);
for (const [k, e] of [...lines].sort((a, b) => b[1].n - a[1].n)) out.push(`${e.n}\t${e.ex}\t${k}`);
const file = process.argv[2];
if (file) writeFileSync(file, out.join('\n'));
console.log(out[0]);
console.log(out.slice(2, 62).join('\n'));
