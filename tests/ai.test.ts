import { describe, expect, it } from 'vitest';
import { OPPONENTS, ST30 } from '../src/data/db';
import { decide, type Level } from '../src/engine/ai';
import { apply, createGame, whoActs } from '../src/engine/game';
import type { DeckList, Game, PlayerId } from '../src/engine/types';
import { checkInvariants, randomDeck, rng } from './helpers';

function playOut(a: DeckList, b: DeckList, seed: number, levels: [Level, Level]): Game {
  const g = createGame({ decks: [a, b], seed });
  const r = rng(seed * 7 + 1);
  for (let n = 0; n < 3000 && g.winner === null; n++) {
    const who = whoActs(g);
    if (who === null) throw new Error('nobody to act but game not over');
    const d = decide(g, who, levels[who], r);
    try {
      apply(g, d.action);
    } catch (err) {
      throw new Error(`${a.name} vs ${b.name} seed ${seed}: AI(${levels[who]}) chose illegal ${JSON.stringify(d.action)}: ${(err as Error).message}\n${g.log.slice(-5).map((l) => l.msg).join(' | ')}`);
    }
    const bad = checkInvariants(g);
    if (bad) throw new Error(`${a.name} vs ${b.name} seed ${seed}: ${bad}`);
  }
  return g;
}

describe('CPU player', () => {
  const decks = [ST30, ...OPPONENTS.map((o) => o.deck)];

  it('plays every matchup legally to a finish at every level', () => {
    const wins: Record<string, number> = {};
    const games: Record<string, number> = {};
    let turns = 0;
    let count = 0;
    for (let i = 0; i < decks.length; i++) {
      for (let j = 0; j < decks.length; j++) {
        for (let s = 0; s < 4; s++) {
          const g = playOut(decks[i], decks[j], 100 + i * 50 + j * 7 + s, ['hard', 'hard']);
          expect(g.winner, `${decks[i].name} vs ${decks[j].name}`).not.toBeNull();
          const w = g.winner as PlayerId;
          wins[(w === 0 ? decks[i] : decks[j]).key] = (wins[(w === 0 ? decks[i] : decks[j]).key] ?? 0) + 1;
          games[decks[i].key] = (games[decks[i].key] ?? 0) + 1;
          games[decks[j].key] = (games[decks[j].key] ?? 0) + 1;
          turns += g.turn;
          count++;
        }
      }
    }
    console.log('hard-vs-hard win rates:', Object.keys(games).map((k) => `${k} ${Math.round(((wins[k] ?? 0) / games[k]) * 100)}%`).join(', '), `| avg game length ${(turns / count).toFixed(1)} turns`);
    for (const lv of ['easy', 'normal'] as Level[]) for (let s = 0; s < 6; s++) expect(playOut(ST30, decks[1 + (s % 6)], 900 + s, [lv, lv]).winner).not.toBeNull();
  });

  it('hard beats easy most of the time (mirror match)', () => {
    let hard = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      const hardSeat: PlayerId = s % 2 === 0 ? 0 : 1;
      const g = playOut(ST30, ST30, 3000 + s, hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard']);
      if (g.winner === hardSeat) hard++;
    }
    console.log(`hard beat easy in ${hard}/${N} ST-30 mirror games`);
    expect(hard).toBeGreaterThan(N * 0.6);
  });

  it('can pilot random decks of auto-compiled cards', () => {
    const N = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.AI_N ?? 60);
    for (let s = 0; s < N; s++) expect(playOut(randomDeck(500 + s), randomDeck(700 + s), 40 + s, ['hard', 'normal']).winner).not.toBeNull();
  });
});
