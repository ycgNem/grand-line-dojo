import { ALL_CARDS, OPPONENTS, ST30 } from '../src/data/db';
import { P, apply, counterOptions, countCards, createGame, legalActions, totalDon } from '../src/engine/game';
import type { Action, Answer, DeckList, FieldCard, Game, PlayerId } from '../src/engine/types';

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

// ---------------------------------------------------------------- scenario helpers (rule tests)

export const deck = (key: string): DeckList => OPPONENTS.find((o) => o.deck.key === key)!.deck;
export const A = (g: Game, answer: Answer): void => apply(g, { type: 'answer', answer });

/** A game past the mulligans. Player 0 pilots ST-30 unless told otherwise. */
export function start(opp: DeckList = ST30, mine: DeckList = ST30, first: PlayerId = 0): Game {
  const g = createGame({ decks: [mine, opp], seed: 42, first });
  A(g, { kind: 'mulligan', redraw: false });
  A(g, { kind: 'mulligan', redraw: false });
  return g;
}
export const endTurn = (g: Game): void => apply(g, { type: 'end' });
/** Skip ahead until it is `pid`'s n-th turn. */
export function toTurn(g: Game, pid: PlayerId, n: number): void {
  while (!(g.active === pid && P(g, pid).turns >= n)) endTurn(g);
}
/** Take a copy of `id` out of the deck, or conjure an extra one when the deck has none left. */
export function take(g: Game, pid: PlayerId, id: string): number {
  const p = P(g, pid);
  const i = p.deck.findIndex((u) => g.ids[u] === id);
  if (i >= 0) return p.deck.splice(i, 1)[0];
  let u = pid === 0 ? 900 : 1900;
  while (g.ids[u]) u++;
  g.ids[u] = id;
  return u;
}
/** Move a copy of `id` to the hand and return its uid. */
export function give(g: Game, pid: PlayerId, id: string): number {
  const u = take(g, pid, id);
  P(g, pid).hand.push(u);
  return u;
}
/** Put a copy of `id` straight onto the field (no On Play), as if played on an earlier turn. */
export function put(g: Game, pid: PlayerId, id: string, rested = false): FieldCard {
  const p = P(g, pid);
  const uid = take(g, pid, id);
  const fc: FieldCard = { uid, id, rested, don: 0, playedTurn: 0, mods: [], flags: [], used: [], frozen: false };
  p.chars.push(fc);
  return fc;
}
export function setDon(g: Game, pid: PlayerId, active: number, rested = 0): void {
  const p = P(g, pid);
  p.donActive = active;
  p.donRested = rested;
  p.donDeck = 10 - active - rested - p.leader.don - p.chars.reduce((n, c) => n + c.don, 0);
}
/** Decline every optional choice until nothing is pending. */
export function pass(g: Game): void {
  for (let i = 0; i < 20 && g.pending; i++) {
    const ch = g.pending;
    if (ch.kind === 'block') A(g, { kind: 'block', uid: null });
    else if (ch.kind === 'counter') A(g, { kind: 'counter', use: null });
    else if (ch.kind === 'trigger') A(g, { kind: 'trigger', activate: false });
    else if (ch.kind === 'select') A(g, { kind: 'select', uids: ch.options.slice(0, ch.min) });
    else if (ch.kind === 'confirm') A(g, { kind: 'confirm', yes: false });
    else if (ch.kind === 'option') A(g, { kind: 'option', index: 0 });
    else A(g, { kind: 'mulligan', redraw: false });
  }
}
export const options = (g: Game): number[] => (g.pending && g.pending.kind === 'select' ? g.pending.options : []);

/** Answer exactly one pending defensive choice with "no". */
export function pass1(g: Game): void {
  const ch = g.pending;
  if (ch?.kind === 'block') A(g, { kind: 'block', uid: null });
  else if (ch?.kind === 'counter') A(g, { kind: 'counter', use: null });
}

/** Answer every pending choice: say yes, prefer the listed uids, otherwise take the first legal picks. */
export function drive(g: Game, prefer: number[] = [], optionIndex: Record<string, number> = {}): void {
  for (let i = 0; i < 40 && g.pending; i++) {
    const ch = g.pending;
    if (ch.kind === 'confirm') A(g, { kind: 'confirm', yes: true });
    else if (ch.kind === 'select') {
      const want = ch.options.filter((u) => prefer.includes(u)).slice(0, ch.max);
      const fill = ch.options.filter((u) => !want.includes(u));
      while (want.length < Math.max(ch.min, Math.min(1, ch.max)) && fill.length) want.push(fill.shift()!);
      A(g, { kind: 'select', uids: want });
    } else if (ch.kind === 'option') A(g, { kind: 'option', index: optionIndex[ch.tag] ?? 0 });
    else if (ch.kind === 'block') A(g, { kind: 'block', uid: null });
    else if (ch.kind === 'counter') A(g, { kind: 'counter', use: null });
    else if (ch.kind === 'trigger') A(g, { kind: 'trigger', activate: false });
    else A(g, { kind: 'mulligan', redraw: false });
  }
}
