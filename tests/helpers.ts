import { ALL_CARDS } from '../src/data/db';
import { P, apply, counterOptions, countCards, legalActions, totalDon } from '../src/engine/game';
import type { Action, DeckList, Game, PlayerId } from '../src/engine/types';

export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly random legal move, for fuzzing. */
export function randomMove(g: Game, r: () => number, actionsThisTurn: number): Action {
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const ch = g.pending;
  if (ch) {
    switch (ch.kind) {
      case 'mulligan':
        return { type: 'answer', answer: { kind: 'mulligan', redraw: r() < 0.3 } };
      case 'select': {
        const n = ch.min + Math.floor(r() * (ch.max - ch.min + 1));
        const pool = [...ch.options];
        const uids: number[] = [];
        while (uids.length < n) uids.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
        return { type: 'answer', answer: { kind: 'select', uids } };
      }
      case 'confirm':
        return { type: 'answer', answer: { kind: 'confirm', yes: r() < 0.7 } };
      case 'option':
        return { type: 'answer', answer: { kind: 'option', index: Math.floor(r() * ch.labels.length) } };
      case 'block':
        return { type: 'answer', answer: { kind: 'block', uid: r() < 0.5 ? pick(ch.options) : null } };
      case 'counter': {
        const opts = counterOptions(g, ch.player);
        return { type: 'answer', answer: { kind: 'counter', use: r() < 0.4 && opts.length ? pick(opts) : null } };
      }
      case 'trigger':
        return { type: 'answer', answer: { kind: 'trigger', activate: r() < 0.8 } };
    }
  }
  const acts = legalActions(g);
  if (actionsThisTurn > 30 || r() < 0.08) return { type: 'end' };
  const useful = acts.filter((a) => a.type !== 'end');
  return useful.length ? pick(useful) : { type: 'end' };
}

export function checkInvariants(g: Game): string | null {
  for (const pid of [0, 1] as PlayerId[]) {
    const p = P(g, pid);
    if (countCards(g, pid) !== 51) return `player ${pid} has ${countCards(g, pid)} cards (expected 51)`;
    if (p.donDeck + totalDon(p) !== 10) return `player ${pid} has ${p.donDeck + totalDon(p)} DON!! (expected 10)`;
    if (p.donDeck < 0 || p.donActive < 0 || p.donRested < 0) return `player ${pid} has negative DON!!`;
    if (p.chars.length > 5) return `player ${pid} has ${p.chars.length} Characters`;
    if ([p.leader, ...p.chars].some((c) => c.don < 0)) return `player ${pid} has negative attached DON!!`;
  }
  return null;
}

/** Plays one full random game. Returns the number of actions taken. */
export function fuzzGame(g: Game, seed: number, maxActions = 4000): number {
  const r = rng(seed);
  let n = 0;
  let turn = g.turn;
  let inTurn = 0;
  while (g.winner === null && n < maxActions) {
    if (g.turn !== turn) {
      turn = g.turn;
      inTurn = 0;
    }
    const a = randomMove(g, r, inTurn++);
    try {
      apply(g, a);
    } catch (err) {
      throw new Error(`seed ${seed}, action ${n} ${JSON.stringify(a)} failed: ${(err as Error).message}\nlast log: ${g.log.slice(-6).map((l) => l.msg).join(' | ')}`);
    }
    const bad = checkInvariants(g);
    if (bad) throw new Error(`seed ${seed}, after ${JSON.stringify(a)}: ${bad}\nlast log: ${g.log.slice(-6).map((l) => l.msg).join(' | ')}`);
    n++;
  }
  return n;
}

/** A random legal-ish 50-card deck of simulated cards in the given leader's colours. */
export function randomDeck(seed: number): DeckList {
  const r = rng(seed);
  const leaders = ALL_CARDS.filter((c) => c.category === 'Leader' && c.sim !== 'none');
  const leader = leaders[Math.floor(r() * leaders.length)];
  const pool = ALL_CARDS.filter((c) => c.category !== 'Leader' && c.sim !== 'none' && c.colors.some((col) => leader.colors.includes(col)));
  const cards: [string, number][] = [];
  const used = new Set<string>();
  let total = 0;
  while (total < 50) {
    const c = pool[Math.floor(r() * pool.length)];
    if (used.has(c.id)) continue;
    used.add(c.id);
    const k = Math.min(1 + Math.floor(r() * 4), 50 - total);
    cards.push([c.id, k]);
    total += k;
  }
  return { key: `rand${seed}`, name: `Random ${leader.name}`, leader: leader.id, cards };
}
