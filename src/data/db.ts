// Builds the card registry: every card in the game, from the database file, with behaviour
// attached from (1) a hand-written script, or (2) the text compiler, or (3) nothing (vanilla).

import { compileCard, type RawCard } from '../engine/compile';
import { registerCards } from '../engine/game';
import { CARDS } from '../engine/registry';
import type { Attribute, CardDef, Category, Color, DeckList } from '../engine/types';
import rawCards from './cards.json';
import { SCRIPTS } from './scripts';
import starterLists from './starters.json';

function build(r: RawCard): CardDef {
  const compiled = compileCard(r);
  const script = SCRIPTS[r.id];
  const base: CardDef = {
    id: r.id,
    name: r.name,
    category: r.category as Category,
    colors: r.colors as Color[],
    cost: r.cost,
    life: r.life || undefined,
    power: r.power,
    counter: r.counter,
    attribute: r.attribute as Attribute[],
    types: r.types,
    text: r.text,
    set: r.id.split('-')[0],
    sim: 'none',
    keywords: compiled.keywords,
    aliases: compiled.aliases.length ? compiled.aliases : undefined,
  };
  if (script) return { ...base, ...script, keywords: script.keywords ?? compiled.keywords, sim: 'scripted' };
  if (!r.text.trim()) return { ...base, sim: 'vanilla' };
  if (!compiled.ok) return base;
  return {
    ...base,
    sim: 'auto',
    effects: compiled.effects,
    powerAura: compiled.powerAura,
    dynKeyword: compiled.dynKeyword,
    costAura: compiled.costAura,
    cantBeKoByEffect: compiled.cantBeKoByEffect,
    cantAttack: compiled.cantAttack,
    anyCopies: compiled.anyCopies,
  };
}

export const ALL_CARDS: CardDef[] = (rawCards as RawCard[]).map(build);
registerCards(ALL_CARDS);

export const card = (id: string): CardDef => CARDS[id];
export const playable = (d: CardDef): boolean => d.sim !== 'none';

// ---------------------------------------------------------------- decks

const STARTERS = starterLists as unknown as Record<string, [string, number][]>;

function fromStarter(code: string, key: string, name: string): DeckList | null {
  const list = STARTERS[code];
  if (!list) return null;
  const leader = list.find(([id]) => CARDS[id]?.category === 'Leader');
  if (!leader) return null;
  return { key, name, leader: leader[0], cards: list.filter(([id]) => id !== leader[0]) };
}

const must = (d: DeckList | null): DeckList => {
  if (!d) throw new Error('Missing starter deck data — run `node scripts/fetch-cards.ts`.');
  return d;
};

/** Your deck: Starter Deck EX "Luffy & Ace" [ST-30], exactly as it comes in the box. */
export const ST30: DeckList = must(fromStarter('ST30', 'st30', 'ST-30 Luffy & Ace'));

export interface OpponentDeck {
  deck: DeckList;
  color: Color;
  style: string;
  blurb: string;
  /** What this matchup teaches. */
  lesson: string;
  /** True when copy counts are the real boxed list; false when rebuilt from the card pool. */
  exactList: boolean;
}

const pool = (key: string, name: string, leader: string, cards: [string, number][]): DeckList => ({ key, name, leader, cards });

export const OPPONENTS: OpponentDeck[] = [
  {
    deck: must(fromStarter('ST01', 'st01', 'ST-01 Straw Hat Crew')),
    color: 'Red',
    style: 'Aggro',
    blurb: 'Luffy leads cheap, hard-hitting Straw Hats that pile extra DON!! onto attackers.',
    lesson: 'Counter maths under pressure. Red wins by swinging big every turn — learn when to take a hit and when to defend.',
    exactList: true,
  },
  {
    deck: must(fromStarter('ST02', 'st02', 'ST-02 Worst Generation')),
    color: 'Green',
    style: 'Tempo',
    blurb: 'Kid rests your Characters and readies his own, so he attacks twice while you attack once.',
    lesson: 'Rested Characters are targets. Green punishes attacking carelessly — learn to protect your board.',
    exactList: true,
  },
  {
    deck: must(fromStarter('ST03', 'st03', 'ST-03 The Seven Warlords of the Sea')),
    color: 'Blue',
    style: 'Control',
    blurb: 'Crocodile bounces your Characters back to your hand and fixes his own draws.',
    lesson: 'Tempo loss. Blue makes you pay for the same card twice — learn to play around bounce effects.',
    exactList: true,
  },
  {
    deck: must(fromStarter('ST04', 'st04', 'ST-04 Animal Kingdom Pirates')),
    color: 'Purple',
    style: 'Ramp',
    blurb: 'Kaido accelerates DON!! and then drops huge bodies with K.O. effects.',
    lesson: 'Racing a ramp deck. Purple is weak early and brutal late — learn to apply pressure before it stabilises.',
    exactList: true,
  },
  {
    deck: pool('st06', 'ST-06 Absolute Justice', 'ST06-001', [
      ['ST06-002', 4], ['ST06-003', 4], ['ST06-004', 2], ['ST06-005', 2], ['ST06-006', 4], ['ST06-007', 4], ['ST06-008', 4], ['ST06-009', 4],
      ['ST06-010', 4], ['ST06-011', 4], ['ST06-012', 2], ['ST06-013', 2], ['ST06-014', 2], ['ST06-015', 4], ['ST06-016', 2], ['ST06-017', 2],
    ]),
    color: 'Black',
    style: 'Removal',
    blurb: 'Sakazuki shrinks the cost of your Characters and then K.O.s them outright.',
    lesson: 'Card-effect removal. Black ignores power entirely — learn why your Little Oars Jr. and Buggy protection matters.',
    exactList: false,
  },
  {
    deck: pool('st07', 'ST-07 Big Mom Pirates', 'ST07-001', [
      ['ST07-002', 4], ['ST07-003', 2], ['ST07-004', 2], ['ST07-005', 4], ['ST07-006', 4], ['ST07-007', 4], ['ST07-008', 4], ['ST07-009', 2],
      ['ST07-010', 2], ['ST07-011', 2], ['ST07-012', 4], ['ST07-013', 2], ['ST07-014', 4], ['ST07-015', 2], ['ST07-016', 4], ['ST07-017', 4],
    ]),
    color: 'Yellow',
    style: 'Life tricks',
    blurb: 'Big Mom manipulates Life cards, loads up on [Trigger] effects, and hits with Double Attack and Banish.',
    lesson: 'Triggers and Life as a resource. Yellow punishes attacking blindly into Life — learn to respect [Trigger].',
    exactList: false,
  },
];

export const deckSize = (d: DeckList): number => d.cards.reduce((n, [, k]) => n + k, 0);

/** Every boxed starter list we have real copy counts for (used by the Deck Lab as importable templates). */
export function starterTemplates(): DeckList[] {
  const out: DeckList[] = [];
  for (const code of Object.keys(STARTERS).sort()) {
    const d = fromStarter(code, code.toLowerCase(), `${code.replace(/^ST/, 'ST-')} starter deck`);
    if (d) out.push(d);
  }
  return out;
}

export interface DeckProblem {
  level: 'error' | 'warn';
  msg: string;
}

/** Official deck-construction rules, plus "can the simulator play this?" checks. */
export function validateDeck(d: DeckList): DeckProblem[] {
  const out: DeckProblem[] = [];
  const leader = CARDS[d.leader];
  if (!leader || leader.category !== 'Leader') return [{ level: 'error', msg: 'Choose a Leader.' }];
  const n = deckSize(d);
  if (n !== 50) out.push({ level: 'error', msg: `A deck is exactly 50 cards (plus the Leader). This one has ${n}.` });
  for (const [id, k] of d.cards) {
    const c = CARDS[id];
    if (!c) {
      out.push({ level: 'error', msg: `${id} is not in this card database (it may have been renumbered). Remove it from the list.` });
      continue;
    }
    if (c.category === 'Leader') out.push({ level: 'error', msg: `${c.name} is a Leader and cannot go in the deck.` });
    if (k > 4 && !c.anyCopies) out.push({ level: 'error', msg: `Maximum 4 copies of one card number — ${c.name} (${id}) has ${k}.` });
    if (!c.colors.some((col) => leader.colors.includes(col))) out.push({ level: 'error', msg: `${c.name} is ${c.colors.join('/')} — it does not share a colour with your ${leader.colors.join('/')} Leader.` });
    if (c.sim === 'none') out.push({ level: 'warn', msg: `${c.name} (${id}) has an effect the simulator cannot run yet, so this deck cannot be test-played.` });
  }
  if (leader.sim === 'none') out.push({ level: 'warn', msg: `The Leader ${leader.name} has an effect the simulator cannot run yet, so this deck cannot be test-played.` });
  return out;
}

export const canSimulate = (d: DeckList): boolean => validateDeck(d).length === 0;
