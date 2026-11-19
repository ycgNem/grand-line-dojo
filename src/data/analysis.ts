// Numbers and plain-English notes derived from card data: deck statistics for the Deck Lab and
// automatic "what is this card for?" notes for every card in the library.

import { CARDS } from '../engine/registry';
import type { CardDef, DeckList } from '../engine/types';

const LEAD = String.raw`(?:^|\n)(?:\[(?:Rush|Blocker|Double Attack|Banish|Unblockable|Rush: Character)\]\s*)*`;
const KW_RE = new Map<string, RegExp>();
/**
 * True when the card itself HAS the keyword (printed at the start of a line), as opposed to merely
 * mentioning it — "Rest up to 1 of your opponent's [Blocker] Characters" is not a Blocker.
 */
export function kw(d: CardDef, name: string): boolean {
  let re = KW_RE.get(name);
  if (!re) {
    re = new RegExp(`${LEAD}\\[${name}\\]`);
    KW_RE.set(name, re);
  }
  return re.test(d.text);
}
export const hasTrigger = (d: CardDef): boolean => kw(d, 'Trigger');
export const isBlocker = (d: CardDef): boolean => kw(d, 'Blocker');
export const isRush = (d: CardDef): boolean => kw(d, 'Rush');

/** The power a plain Character of a given cost is expected to have. */
export function expectedPower(cost: number): number {
  if (cost <= 0) return 1000;
  if (cost >= 9) return 10000 + (cost - 9) * 1000 + (cost >= 10 ? 1000 : 0);
  return [0, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000][cost];
}

export interface DeckStats {
  total: number;
  characters: number;
  events: number;
  stages: number;
  /** Cards by cost; index 10 collects 10+. */
  curve: number[];
  avgCost: number;
  counter0: number;
  counter1k: number;
  counter2k: number;
  counterEvents: number;
  /** Average counter power per card (Characters' printed counter only). */
  counterPerCard: number;
  blockers: number;
  rush: number;
  triggers: number;
  searchers: number;
  removal: number;
  draw: number;
  cheapPlays: number;
  unsimulated: number;
}

export function deckStats(d: DeckList): DeckStats {
  const s: DeckStats = {
    total: 0, characters: 0, events: 0, stages: 0, curve: new Array<number>(11).fill(0), avgCost: 0,
    counter0: 0, counter1k: 0, counter2k: 0, counterEvents: 0, counterPerCard: 0,
    blockers: 0, rush: 0, triggers: 0, searchers: 0, removal: 0, draw: 0, cheapPlays: 0, unsimulated: 0,
  };
  let cost = 0;
  let counter = 0;
  for (const [id, n] of d.cards) {
    const c = CARDS[id];
    if (!c) continue;
    s.total += n;
    cost += c.cost * n;
    s.curve[Math.min(10, c.cost)] += n;
    if (c.category === 'Character') {
      s.characters += n;
      counter += c.counter * n;
      if (c.counter >= 2000) s.counter2k += n;
      else if (c.counter >= 1000) s.counter1k += n;
      else s.counter0 += n;
      if (c.cost <= 2) s.cheapPlays += n;
    } else if (c.category === 'Event') {
      s.events += n;
      if (/\[Counter\]/.test(c.text)) s.counterEvents += n;
      else s.counter0 += n;
    } else if (c.category === 'Stage') {
      s.stages += n;
      s.counter0 += n;
    }
    if (isBlocker(c)) s.blockers += n;
    if (isRush(c)) s.rush += n;
    if (hasTrigger(c)) s.triggers += n;
    if (/Look at \d+ cards? from the top of your deck/.test(c.text)) s.searchers += n;
    if (/K\.O\.|Return up to|at the bottom of the owner's deck/.test(c.text) && /opponent's/.test(c.text)) s.removal += n;
    if (/Draw \d+ cards?/i.test(c.text)) s.draw += n;
    if (c.sim === 'none') s.unsimulated += n;
  }
  s.avgCost = s.total ? cost / s.total : 0;
  s.counterPerCard = s.total ? counter / s.total : 0;
  return s;
}

export interface Advice {
  level: 'good' | 'warn' | 'info';
  msg: string;
}

/** Deck-building rules of thumb checked against a list. These are guidelines, not rules. */
export function deckAdvice(d: DeckList): Advice[] {
  const s = deckStats(d);
  const out: Advice[] = [];
  if (s.total === 0) return [{ level: 'info', msg: 'Add cards to see advice here.' }];
  const scale = 50 / s.total;
  const n = (x: number): number => Math.round(x * scale);
  const twoK = n(s.counter2k);
  if (twoK >= 8) out.push({ level: 'good', msg: `${s.counter2k} cards with a 2000 counter. That is a solid defensive base (most competitive decks run 8–12).` });
  else out.push({ level: 'warn', msg: `Only ${s.counter2k} cards with a 2000 counter. Competitive decks usually run 8–12; with fewer, each defended attack costs you more cards.` });
  const noCounter = n(s.counter0);
  if (noCounter > 16) out.push({ level: 'warn', msg: `${s.counter0} cards have no counter value at all. Above ~14–16, your hand often cannot defend when you need it to.` });
  else out.push({ level: 'good', msg: `${s.counter0} cards without a counter value — a healthy number.` });
  if (n(s.cheapPlays) < 8) out.push({ level: 'warn', msg: `Only ${s.cheapPlays} Characters cost 2 or less. With few early plays you will often do nothing on turns 1–2.` });
  else out.push({ level: 'good', msg: `${s.cheapPlays} Characters cost 2 or less, so your first turns should be active.` });
  const top = s.curve.slice(7).reduce((a, b) => a + b, 0);
  if (n(top) > 10) out.push({ level: 'warn', msg: `${top} cards cost 7 or more. Expensive cards are dead weight until late; 4–8 finishers is typical.` });
  if (n(s.blockers) < 4) out.push({ level: 'info', msg: `${s.blockers} [Blocker]s. Blockers protect your Life without spending cards from hand — 4–8 is common outside pure aggro decks.` });
  else out.push({ level: 'good', msg: `${s.blockers} [Blocker]s to protect your Life.` });
  if (n(s.searchers) < 4) out.push({ level: 'info', msg: `${s.searchers} cards that search your deck. Searchers make a deck consistent: they find your key cards and thin out your draws.` });
  else out.push({ level: 'good', msg: `${s.searchers} searchers keep your draws consistent.` });
  if (n(s.events) > 14) out.push({ level: 'warn', msg: `${s.events} Events. Events do not stay on the board and usually cannot counter for free — most decks run 6–12.` });
  if (s.avgCost > 3.6) out.push({ level: 'warn', msg: `Average cost ${s.avgCost.toFixed(2)} is high. Expect slow starts; consider more 1–3 cost cards.` });
  else if (s.avgCost < 2.2) out.push({ level: 'info', msg: `Average cost ${s.avgCost.toFixed(2)} is very low. You will empty your hand fast — make sure the deck can draw cards.` });
  else out.push({ level: 'good', msg: `Average cost ${s.avgCost.toFixed(2)} — a balanced curve.` });
  if (s.unsimulated) out.push({ level: 'info', msg: `${s.unsimulated} cards have effects the simulator cannot run, so this list cannot be test-played here (it may still be a perfectly legal deck).` });
  return out;
}

// ---------------------------------------------------------------- per-card notes

/** One-word-ish jobs a card does in a deck. */
export function roles(d: CardDef): string[] {
  const r: string[] = [];
  const t = d.text;
  if (d.category === 'Leader') return ['Leader'];
  if (isBlocker(d)) r.push('Blocker');
  if (isRush(d)) r.push('Rush attacker');
  if (kw(d, 'Double Attack')) r.push('Double Attack');
  if (kw(d, 'Banish')) r.push('Banish');
  if (/Look at \d+ cards? from the top of your deck/.test(t)) r.push('Searcher');
  if (/Draw \d+ cards?/i.test(t)) r.push('Card draw');
  if (/K\.O\. (up to )?\d+ of your opponent's/.test(t)) r.push('Removal (K.O.)');
  if (/Return up to \d+ (of your opponent's )?Characters?.*to the owner's hand/.test(t)) r.push('Removal (bounce)');
  if (/at the bottom of the owner's deck/.test(t)) r.push('Removal (deck bottom)');
  if (/Rest up to \d+ of your opponent's/.test(t)) r.push('Rest / tempo');
  if (/-\d+ power/.test(t)) r.push('Power reduction');
  if (/-\d+ cost/.test(t)) r.push('Cost reduction');
  if (/Add up to \d+ DON!! cards? from your DON!! deck/.test(t)) r.push('DON!! ramp');
  if (/DON!! -\d/.test(t)) r.push('DON!! spender');
  if (/Play up to \d+ .*(from your (hand|trash|deck))/.test(t)) r.push('Plays other cards');
  if (/to the top of your Life|from the top of your Life|Life cards?/.test(t)) r.push('Life manipulation');
  if (d.category === 'Event' && /\[Counter\]/.test(t)) r.push('Counter Event');
  if (hasTrigger(d)) r.push('Trigger');
  if (d.category === 'Character' && !t.trim()) r.push('Vanilla body');
  if (d.category === 'Character' && d.cost >= 7) r.push('Finisher');
  if (d.category === 'Stage') r.push('Stage');
  if (!r.length) r.push(d.category === 'Event' ? 'Utility Event' : 'Utility');
  return r;
}

/** Automatic coaching notes for any card in the game. */
export function insights(d: CardDef): string[] {
  const out: string[] = [];
  const t = d.text;
  if (d.category === 'Leader') {
    out.push(`Leader with ${d.life ?? 5} Life and ${d.power} power. ${d.colors.length > 1 ? `Being ${d.colors.join('/')} lets the deck use cards of either colour, usually in exchange for 4 Life instead of 5.` : `A ${d.colors[0]} deck: every card in it must be ${d.colors[0]} (multi-colour cards that include ${d.colors[0]} are fine).`}`);
    if ((d.life ?? 5) <= 4) out.push('Only 4 Life: you start closer to defeat, so blockers and counter cards matter more than usual.');
    if (d.power >= 6000) out.push('6000 power is above the usual 5000: early attackers need extra DON!! just to touch this Leader.');
    if (/\[Activate: Main\]/.test(t)) out.push('It has an [Activate: Main] ability — remember to use it every turn it is worth using; forgetting Leader abilities is the most common beginner leak.');
    if (/\[DON!! x\d\]/.test(t)) out.push('Its effect needs DON!! attached to the Leader. That DON!! also adds power, so attacking with the Leader is part of the plan.');
    return out;
  }
  if (d.category === 'Character') {
    const exp = expectedPower(d.cost);
    if (!t.trim()) out.push(`A "vanilla" Character (no effect). Vanillas trade abilities for raw stats${d.counter >= 2000 ? ' and a 2000 counter' : ''}.`);
    if (d.power > exp) out.push(`${d.power} power for ${d.cost} cost is above the usual rate (${exp}). Check the text for the drawback.`);
    else if (d.power < exp && d.cost > 0) out.push(`${d.power} power for ${d.cost} cost is below the usual rate (${exp}) — you are paying for its effect${d.counter >= 2000 ? ' and its 2000 counter' : ''}.`);
    if (d.counter >= 2000) out.push('2000 counter: one of the best defensive cards to hold. Late in the game it is often worth more in your hand than on the board.');
    else if (d.counter === 1000) out.push('1000 counter: a standard defensive value. Two of these stop most un-boosted attacks.');
    else out.push('No counter value: this card cannot defend from your hand, so it wants to be played, not held.');
    if (isBlocker(d)) out.push('[Blocker]: rest it to take an attack aimed at something else. Keep it active on the opponent’s turn — a Blocker that attacked cannot block.');
    if (isRush(d)) out.push('[Rush]: attacks the turn it is played, so the opponent cannot plan their defence around it. Great for surprise lethal.');
    if (kw(d, 'Double Attack')) out.push('[Double Attack]: takes 2 Life when it hits the Leader. Opponents will spend heavily to stop it — which is also a win for you.');
    if (kw(d, 'Banish')) out.push('[Banish]: the Life card it hits is trashed, not added to hand. No free card and no [Trigger] for the opponent.');
    if (/\[On Play\]/.test(t)) out.push('[On Play]: the effect happens once, when it enters the field. Bouncing it back to hand lets you reuse it.');
    if (/\[When Attacking\]/.test(t)) out.push('[When Attacking]: triggers every time it attacks, before the opponent blocks or counters.');
    if (/\[On K\.O\.\]/.test(t)) out.push('[On K.O.]: triggers when it is K.O.’d — by battle or by an effect — but NOT when it is returned to hand, trashed, or sent to the deck.');
    if (/\[Activate: Main\]/.test(t)) out.push('[Activate: Main]: an ability you choose to use in your Main Phase. Check for [Once Per Turn] and whether it must rest itself.');
    if (/\[DON!! x(\d)\]/.test(t)) out.push(`[DON!! x${/\[DON!! x(\d)\]/.exec(t)![1]}]: only works while that many DON!! are attached. Attached DON!! return to your cost area at the start of your next turn, so on defence the effect is usually off.`);
  }
  if (d.category === 'Event') {
    if (/\[Counter\]/.test(t)) out.push('[Counter] Event: played from hand during the opponent’s attack, and it costs DON!!. You must leave DON!! active at the end of your turn to use it — which the opponent can see.');
    if (/\[Main\]/.test(t)) out.push('[Main] Event: played in your own Main Phase like a Character, then trashed.');
    out.push('Events have no counter value of their own and do not stay on the board. Count them carefully when building.');
  }
  if (d.category === 'Stage') out.push('Stage: stays on the field. You may only have one; playing a second trashes the first. Stages cannot be attacked.');
  if (hasTrigger(d)) out.push('[Trigger]: if this is revealed from your Life when you take damage, you may use the Trigger effect for free instead of adding the card to your hand.');
  if (/Look at (\d+) cards? from the top of your deck/.test(t)) out.push('Deck search: makes your deck more consistent. Play searchers early — the sooner you find your key card, the more turns it works for you.');
  if (/DON!! -(\d)/.test(t)) out.push('DON!! −N: returns DON!! from your field to the DON!! deck as a cost. You get it back 2 per turn, so this sets your tempo back — the effect has to be worth it.');
  if (/You may have any number of this card/.test(t)) out.push('Exception to the 4-copy limit: you may run any number of this card.');
  if (d.cost >= 7 && d.category === 'Character') out.push('Expensive: it will sit in your hand for several turns. Run few copies, or ways to find it when you need it.');
  return out;
}

export const SIM_LABEL: Record<CardDef['sim'], string> = {
  scripted: 'Fully simulated (hand-checked)',
  auto: 'Simulated (auto-read from card text)',
  vanilla: 'Simulated (no effect text)',
  none: 'Reference only',
};

export const SIM_NOTE: Record<CardDef['sim'], string> = {
  scripted: 'This card’s behaviour was written and tested by hand against its printed text.',
  auto: 'The simulator read this card’s text automatically and understood every sentence. It should play correctly, but unusual interactions were not hand-checked.',
  vanilla: 'No effect text, so it plays exactly as printed.',
  none: 'You can read and study this card here and use it in Deck Lab lists, but its effect is too complex for the simulator to run, so it cannot be used in matches.',
};
