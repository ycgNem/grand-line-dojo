// Everything the app remembers between visits, kept in the browser's localStorage.

import type { Level } from '../engine/ai';
import type { DeckList, PlayerStats } from '../engine/types';

export type CoachMode = 'full' | 'hints' | 'off';

export interface MatchRec {
  date: number;
  opp: string;
  deck: string;
  level: Level;
  coach: CoachMode;
  won: boolean;
  turns: number;
  myTurns: number;
  stats: PlayerStats;
}

export interface DrillRec {
  right: number;
  total: number;
  streak: number;
  best: number;
}

export interface Save {
  version: 1;
  lessons: Record<string, { done: boolean; best: number }>;
  drills: Record<string, DrillRec>;
  matches: MatchRec[];
  decks: DeckList[];
  /** `lab` is the key of the deck last worked on in Deck Lab, so it reopens there. */
  settings: { level: Level; coach: CoachMode; speed: number; first: 'random' | 'me' | 'cpu'; opp: string; deck: string; lab: string };
}

const KEY = 'grand-line-dojo/v1';

const fresh = (): Save => ({
  version: 1,
  lessons: {},
  drills: {},
  matches: [],
  decks: [],
  settings: { level: 'easy', coach: 'full', speed: 700, first: 'random', opp: 'st01', deck: 'st30', lab: '' },
});

let cache: Save | null = null;

export function load(): Save {
  if (cache) return cache;
  let s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Save>;
      if (parsed && parsed.version === 1) s = { ...s, ...parsed, settings: { ...s.settings, ...parsed.settings } };
    }
  } catch {
    // Storage unavailable or corrupted: start fresh, keep working in memory.
  }
  cache = s;
  return s;
}

export function save(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private mode / quota: progress simply will not persist.
  }
}

export function update(fn: (s: Save) => void): void {
  fn(load());
  save();
}

export function resetAll(): void {
  cache = fresh();
  save();
}

export function recordMatch(m: MatchRec): void {
  update((s) => {
    s.matches.push(m);
    if (s.matches.length > 300) s.matches.splice(0, s.matches.length - 300);
  });
}

export function recordDrill(kind: string, right: boolean): DrillRec {
  const s = load();
  const d = (s.drills[kind] ??= { right: 0, total: 0, streak: 0, best: 0 });
  d.total++;
  if (right) {
    d.right++;
    d.streak++;
    d.best = Math.max(d.best, d.streak);
  } else d.streak = 0;
  save();
  return d;
}

export function saveDeck(d: DeckList): void {
  update((s) => {
    const i = s.decks.findIndex((x) => x.key === d.key);
    const copy: DeckList = { key: d.key, name: d.name, leader: d.leader, cards: d.cards.map(([id, n]) => [id, n]) };
    if (i >= 0) s.decks[i] = copy;
    else s.decks.push(copy);
    s.settings.lab = d.key;
  });
}

export function deleteDeck(key: string): void {
  update((s) => {
    s.decks = s.decks.filter((d) => d.key !== key);
  });
}

export const wins = (opp: string, level?: Level, pred: (m: MatchRec) => boolean = () => true): number =>
  load().matches.filter((m) => m.opp === opp && m.won && (!level || m.level === level) && pred(m)).length;
