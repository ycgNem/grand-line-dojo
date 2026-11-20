import { describe, expect, it } from 'vitest';
import { OPPONENTS, ST30 } from '../src/data/db';
import { createGame } from '../src/engine/game';
import { fuzzGame, randomDeck } from './helpers';

describe('engine fuzzing (random legal play never breaks the rules)', () => {
  const decks = [ST30, ...OPPONENTS.map((o) => o.deck)];
  it('ST-30 vs every CPU deck, and every deck vs itself', () => {
    let games = 0;
    let finished = 0;
    for (let i = 0; i < decks.length; i++) {
      for (let s = 0; s < 12; s++) {
        const g = createGame({ decks: [ST30, decks[i]], seed: 1000 + i * 100 + s });
        fuzzGame(g, 77 + i * 31 + s);
        games++;
        if (g.winner !== null) finished++;
        const g2 = createGame({ decks: [decks[i], decks[(i + s) % decks.length]], seed: 5000 + i * 100 + s });
        fuzzGame(g2, 991 + i * 17 + s);
        games++;
        if (g2.winner !== null) finished++;
      }
    }
    console.log(`fuzz: ${finished}/${games} games reached a winner`);
    expect(finished).toBe(games);
  });

  it('random decks built from every simulated card', () => {
    let finished = 0;
    const N = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FUZZ_N ?? 150);
    for (let s = 0; s < N; s++) {
      const g = createGame({ decks: [randomDeck(s * 2 + 1), randomDeck(s * 2 + 2)], seed: 9000 + s });
      fuzzGame(g, 4242 + s);
      if (g.winner !== null) finished++;
    }
    console.log(`random-deck fuzz: ${finished}/${N} games reached a winner`);
    expect(finished).toBe(N);
  });
});
