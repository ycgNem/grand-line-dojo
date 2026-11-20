// The CPU player. Every decision comes with a plain-English reason, because the same brain powers
// the coach's "Hint" button: decide(g, you, 'hard') tells you what a strong player would do and why.

import {
  P,
  attackTargets,
  blockersFor,
  costOf,
  counterOptions,
  defOf,
  effectKey,
  findField,
  hasKw,
  isLeader,
  legalActions,
  mkCtx,
  opp,
  ownerOf,
  playCost,
  powerOf,
  totalDon,
  unitsOf,
  whyCantAttack,
  whyCantPlay,
} from './game';
import { D } from './registry';
import type { Action, Answer, CardDef, Choice, EffectDef, FieldCard, Game, PlayerId } from './types';

export type Level = 'easy' | 'normal' | 'hard';
export interface Decision {
  action: Action;
  reason: string;
}

const ans = (answer: Answer, reason: string): Decision => ({ action: { type: 'answer', answer }, reason });
const k = (n: number): string => `${n / 1000}k`;

// ---------------------------------------------------------------- valuing cards

/** How much a card on the field matters (used to pick removal targets and what to protect). */
export function unitValue(g: Game, fc: FieldCard): number {
  const d = D(fc.id);
  let v = d.cost + d.power / 2500 + fc.don * 0.3;
  if (hasKw(g, fc, 'Blocker')) v += 1;
  if (d.effects?.some((e) => e.timing !== 'onPlay' && e.timing !== 'trigger') || d.powerAura || d.replaceRemoval) v += 1;
  return v;
}

/** How much a card in hand is worth holding on to (low = good to trash or throw as a counter). */
export function handValue(g: Game, me: PlayerId, d: CardDef): number {
  const p = P(g, me);
  const donNext = Math.min(10, totalDon(p) + 2);
  if (d.category === 'Event') {
    const boost = d.effects?.find((e) => e.timing === 'counter')?.boost ?? 0;
    return 2.2 + boost / 4000;
  }
  if (d.category === 'Stage') return p.stage ? 0.5 : 2.5;
  let v = 1 + d.cost * 0.45 + (d.effects?.length ? 0.9 : 0) + (d.keywords?.length ? 0.6 : 0) + (d.powerAura ? 0.8 : 0);
  if (d.cost > donNext + 1) v -= 1.2; // too expensive to matter soon
  if (d.cost <= 2 && p.turns >= 4 && !d.effects?.length) v -= 0.6; // small vanilla bodies fade late
  return v;
}

const dName = (g: Game, uid: number): string => defOf(g, uid).name;

// ---------------------------------------------------------------- answering choices

function decideMulligan(g: Game, me: PlayerId): Decision {
  const hand = P(g, me).hand.map((u) => defOf(g, u));
  // An "early play" is a Character you can afford by turn 3, or a cheap [Main] Event such as a searcher.
  const isEarly = (d: CardDef): boolean => (d.category === 'Character' && d.cost <= 4) || (d.category === 'Event' && d.cost <= 2 && !!d.effects?.some((e) => e.timing === 'main'));
  const early = hand.filter(isEarly).length;
  const cheap = hand.filter((d) => isEarly(d) && d.cost <= 2).length;
  const heavy = hand.filter((d) => d.cost >= 5).length;
  if (early >= 2 && heavy <= 3) {
    return ans({ kind: 'mulligan', redraw: false }, `Keep: ${early} cards you can play in the first three turns${cheap ? `, including ${cheap} that cost${cheap > 1 ? '' : 's'} 2 or less` : ''}. A hand that does something on turns 1–3 is a keep.`);
  }
  if (heavy >= 4) return ans({ kind: 'mulligan', redraw: true }, `Mulligan: ${heavy} of 5 cards cost 5 or more, so you would do nothing for several turns.`);
  return ans({ kind: 'mulligan', redraw: true }, `Mulligan: only ${early} early play${early === 1 ? '' : 's'}. You want at least two things to do on turns 1–3.`);
}

function decideSelect(g: Game, me: PlayerId, ch: Extract<Choice, { kind: 'select' }>): Decision {
  const hv = (u: number): number => handValue(g, me, defOf(g, u));
  const fv = (u: number): number => {
    const fc = findField(g, u);
    return fc ? unitValue(g, fc) : 0;
  };
  let order: number[] = [];
  let take = ch.max;
  let reason = '';
  const foes = ch.options.filter((u) => ownerOf(u) !== me);
  switch (ch.intent) {
    case 'ko':
    case 'bounce':
    case 'bottomDeck':
    case 'freeze':
    case 'debuff':
      order = [...foes].sort((a, b) => fv(b) - fv(a));
      reason = order.length ? `Target ${dName(g, order[0])} — the most valuable card this can hit.` : 'No enemy target worth choosing.';
      break;
    case 'rest': {
      // Resting a Blocker opens the way; resting a big Character makes it attackable.
      order = [...foes].sort((a, b) => fv(b) - fv(a));
      reason = order.length ? `Rest ${dName(g, order[0])}: a rested Character cannot block and can be attacked.` : 'Nothing to rest.';
      break;
    }
    case 'discard':
      order = [...ch.options].sort((a, b) => hv(a) - hv(b));
      take = ch.min;
      reason = order.length ? `Trash ${order.slice(0, take).map((u) => dName(g, u)).join(' and ')} — the card${take > 1 ? 's' : ''} you need least right now.` : '';
      break;
    case 'search':
    case 'recover':
    case 'play':
      order = [...ch.options].sort((a, b) => hv(b) - hv(a));
      take = Math.min(1, ch.max);
      reason = order.length ? `Take ${dName(g, order[0])} — the strongest option on offer.` : 'Nothing here matches, so nothing is added.';
      break;
    case 'buff':
    case 'giveDon': {
      const score = (u: number): number => {
        const fc = findField(g, u);
        if (!fc) return -1;
        if (g.battle && g.battle.target === u) return 100;
        const ready = !whyCantAttack(g, u);
        return (ready ? 10 : 0) + powerOf(g, fc) / 1000 + (isLeader(g, u) ? 0.5 : 0);
      };
      order = [...ch.options].sort((a, b) => score(b) - score(a));
      reason = order.length ? `Put it on ${dName(g, order[0])} — an attacker that can still swing this turn.` : '';
      break;
    }
    case 'untap':
      order = [...ch.options].sort((a, b) => fv(b) - fv(a));
      reason = order.length ? `Ready ${dName(g, order[0])} so it can attack again or block.` : '';
      break;
    case 'protect':
      order = [...ch.options];
      take = 1;
      reason = order.length ? `Yes — ${dName(g, order[0])} takes the hit so your 6000-power Character stays on the board.` : '';
      break;
    case 'overflow':
      order = [...ch.options].sort((a, b) => fv(a) - fv(b));
      take = ch.min;
      reason = order.length ? `Trash ${dName(g, order[0])}, your weakest Character, to make room.` : '';
      break;
    case 'toLife':
      order = [...ch.options].sort((a, b) => hv(a) - hv(b));
      take = Math.min(1, ch.max);
      reason = order.length ? `Bank ${dName(g, order[0])} as a Life card — an extra hit your opponent has to get through.` : '';
      break;
    case 'sacrifice':
      // Paying with (or losing) your own cards: give up the least valuable ones, and no more than required.
      order = [...ch.options].sort((a, b) => fv(a) - fv(b));
      take = ch.min;
      reason = order.length && take ? `Give up ${dName(g, order[0])} — the card you will miss least.` : 'Not worth giving up a card for.';
      break;
    case 'order': {
      // Life cards, top first. Your own [Trigger] cards go on top; the opponent's get buried.
      const trig = (u: number): number => (defOf(g, u).effects?.some((e) => e.timing === 'trigger') ? 1 : 0);
      const mine = ch.options.length > 0 && ownerOf(ch.options[0]) === me;
      order = [...ch.options].sort((a, b) => (mine ? trig(b) - trig(a) : trig(a) - trig(b)));
      take = ch.max;
      reason = mine ? 'Put your [Trigger] cards on top, so they fire when you take damage.' : 'Bury their [Trigger] cards at the bottom, where they fire last.';
      break;
    }
    case 'deckOrder':
      // Cards too expensive to matter soon go to the bottom.
      order = ch.options.filter((u) => defOf(g, u).cost > Math.min(10, totalDon(P(g, me)) + 3));
      take = order.length;
      reason = order.length ? 'Send the cards you cannot afford soon to the bottom.' : 'Keep them all on top.';
      break;
  }
  const picks = order.slice(0, Math.min(take, ch.max));
  for (const u of ch.options) {
    if (picks.length >= ch.min) break;
    if (!picks.includes(u)) picks.push(u);
  }
  return ans({ kind: 'select', uids: picks }, reason || 'Best available choice.');
}

function effectFor(key: string | undefined): EffectDef | null {
  if (!key) return null;
  const [id, i] = key.split('#');
  return D(id).effects?.[+i] ?? null;
}

/** Does this text spend one of your own Life cards, or deal damage to you? (Turning Life cards over is free.) */
const spendsLife = (t: string): boolean => /(?:trash|add) \d+ cards? from the (?:top|bottom|top or bottom) of your Life|you take \d+ damage/i.test(t);
const gainsLife = (t: string): boolean => /to the (?:top|bottom|top or bottom) of your Life/i.test(t);

function decideConfirm(g: Game, me: PlayerId, ch: Extract<Choice, { kind: 'confirm' }>): Decision {
  const e = effectFor(ch.effectKey);
  const f = g.frames[g.frames.length - 1];
  if (e?.ai && f) {
    const yes = e.ai(g, f.ctx) > 0;
    return ans({ kind: 'confirm', yes }, yes ? 'Worth paying for here.' : 'Not worth the cost right now.');
  }
  if (e?.cost?.trashHand && P(g, me).hand.length <= e.cost.trashHand) return ans({ kind: 'confirm', yes: false }, 'It would cost your last card — keep it.');
  if (e?.cost?.donMinus && e.cost.donMinus >= 4 && totalDon(P(g, me)) < 8) return ans({ kind: 'confirm', yes: false }, 'Too much DON!! to give up this early.');
  if (e?.cost?.lifeToHand && P(g, me).life.length <= 1) return ans({ kind: 'confirm', yes: false }, 'Too dangerous to give up Life this low.');
  // Costs compiled from card text, and "you may …" steps in the middle of an effect.
  const price = e ? (e.cost?.extra ?? []).map((x) => x.text).join('; ') : ch.prompt;
  if (spendsLife(price) && P(g, me).life.length <= 1 && !gainsLife(e?.text ?? '')) return ans({ kind: 'confirm', yes: false }, 'Too dangerous to give up Life this low.');
  return ans({ kind: 'confirm', yes: true }, 'The effect is worth more than its cost.');
}

function decideOption(g: Game, me: PlayerId, ch: Extract<Choice, { kind: 'option' }>): Decision {
  const hasTrigger = ch.reveal !== undefined && !!defOf(g, ch.reveal).effects?.some((e) => e.timing === 'trigger');
  switch (ch.tag) {
    case 'lifePlaceMine':
      return ans({ kind: 'option', index: hasTrigger ? 0 : 1 }, hasTrigger ? 'It has a [Trigger] — keep it on top so it fires when you take damage.' : 'No [Trigger]; dig for a better top card.');
    case 'lifePlaceTheirs':
      return ans({ kind: 'option', index: hasTrigger ? 1 : 0 }, hasTrigger ? 'Bury their [Trigger] so it never fires.' : 'A harmless card — leave it on top.');
    case 'linlin':
      return ans({ kind: 'option', index: P(g, me).life.length >= 3 ? 0 : 1 }, P(g, me).life.length >= 3 ? 'You can afford to lose a Life; do not let them heal.' : 'Your Life is too low to give one up.');
    case 'lifeSpot':
      return ans({ kind: 'option', index: 1 }, 'The bottom of the Life pile: it is the last card anyone gets back.');
    case 'guessCost': {
      // The best blind guess: the most common cost among the cards the opponent has not shown yet.
      const o = P(g, opp(me));
      const seen = new Map<number, number>();
      for (const u of [...o.deck, ...o.hand, ...o.life.map((l) => l.uid)]) {
        const c = Math.min(ch.labels.length - 1, defOf(g, u).cost);
        seen.set(c, (seen.get(c) ?? 0) + 1);
      }
      let best = 0;
      for (const [c, n] of seen) if (n > (seen.get(best) ?? 0)) best = c;
      return ans({ kind: 'option', index: best }, `Guess ${best}: the most common cost among the cards your opponent has not shown yet.`);
    }
    case 'chooseOne':
    case 'chooseOneTheirs': {
      const o = P(g, opp(me));
      const theirs = ch.tag === 'chooseOneTheirs';
      // Labels are written from the effect owner's side; when the opponent's effect makes YOU choose, take the mildest.
      const victim = theirs ? P(g, me) : o;
      const score = (label: string): number => {
        const l = label.toLowerCase();
        const targets = victim.chars.length > 0;
        if (/k\.o\./.test(l)) return targets ? 5 : 0.2;
        if (/to the owner's hand|bottom of the owner's deck|life cards? face-up/.test(l)) return targets ? 4 : 0.2;
        if (/trash(?:es)? \d+ cards? from (?:their|your) hand/.test(l)) return victim.hand.length ? 3 : 0.2;
        if (/draw|add up to \d+ don!!/.test(l)) return 3;
        if (/rest |[-−]\d+ (?:cost|power)/.test(l)) return targets ? 2 : 0.2;
        return 1;
      };
      const scores = ch.labels.map(score);
      const want = theirs ? Math.min(...scores) : Math.max(...scores);
      const index = scores.indexOf(want);
      return ans({ kind: 'option', index }, theirs ? `"${ch.labels[index]}" hurts you least.` : `"${ch.labels[index]}" does the most here.`);
    }
    default:
      return ans({ kind: 'option', index: 0 }, 'Default choice.');
  }
}

function decideTrigger(g: Game, me: PlayerId, ch: Extract<Choice, { kind: 'trigger' }>): Decision {
  const d = defOf(g, ch.uid);
  const e = d.effects!.find((x) => x.timing === 'trigger')!;
  const tags = e.tags ?? [];
  const needsFoe = tags.length > 0 && tags.every((t) => ['ko', 'bounce', 'rest', 'debuff'].includes(t));
  if (needsFoe && P(g, opp(me)).chars.length === 0) {
    return ans({ kind: 'trigger', activate: false }, `No enemy Character to hit, so add ${d.name} to your hand instead — a card in hand beats a wasted [Trigger].`);
  }
  return ans({ kind: 'trigger', activate: true }, `Activate it: a [Trigger] is a free effect (the card is trashed afterwards instead of going to your hand).`);
}

// ---------------------------------------------------------------- defending

export interface Threat {
  attacker: FieldCard;
  target: FieldCard;
  atk: number;
  def: number;
  /** Extra power the target needs for the attack to fail. */
  need: number;
  onLeader: boolean;
  damage: number;
  lethal: boolean;
  banish: boolean;
}

export function currentThreat(g: Game): Threat | null {
  const b = g.battle;
  if (!b) return null;
  const attacker = findField(g, b.attacker);
  const target = findField(g, b.target);
  if (!attacker || !target) return null;
  const me = ownerOf(b.target);
  const atk = powerOf(g, attacker);
  const def = powerOf(g, target);
  const onLeader = isLeader(g, b.target);
  const damage = hasKw(g, attacker, 'Double Attack') ? 2 : 1;
  // Lethal only when the Leader already has 0 Life: a [Double Attack] at 1 Life takes that card but does not win.
  return { attacker, target, atk, def, need: Math.max(0, atk - def + 1000), onLeader, damage, lethal: onLeader && P(g, me).life.length === 0, banish: hasKw(g, attacker, 'Banish') };
}

/** Is this attack worth stopping, and how much counter power is it worth spending? */
export function defencePolicy(g: Game, me: PlayerId, level: Level): { defend: boolean; budget: number; why: string } {
  const t = currentThreat(g);
  if (!t || t.need === 0) return { defend: false, budget: 0, why: 'The attack already fails — no defence needed.' };
  const life = P(g, me).life.length;
  if (t.onLeader) {
    if (t.lethal) return { defend: true, budget: Infinity, why: `This attack is LETHAL (you have ${life} Life). Stop it with everything you have or you lose.` };
    if (level === 'easy') return { defend: false, budget: 0, why: 'Take the hit.' };
    const after = Math.max(0, life - t.damage);
    if (t.banish) return { defend: t.need <= 2000, budget: 2000, why: `[Banish] trashes the Life card instead of giving it to you, so this hit is pure loss — worth up to ${k(2000)} of counter.` };
    if (t.damage === 2 && life >= 2) return { defend: t.need <= 3000, budget: 3000, why: `[Double Attack] takes 2 Life at once — worth up to ${k(3000)} of counter.` };
    if (after >= 3) return { defend: false, budget: 0, why: `Take it. At ${life} Life a hit is not dangerous, and the Life card goes to your hand — you gain a card and keep your counters for later.` };
    if (after === 2) return { defend: t.need <= 1000, budget: 1000, why: `At ${life} Life, only defend if it is cheap (${k(1000)}). Otherwise take the card.` };
    if (after === 1) return { defend: t.need <= 2000, budget: 2000, why: `Dropping to 1 Life puts you in lethal range — worth up to ${k(2000)} of counter.` };
    return { defend: t.need <= 4000, budget: 4000, why: `This would take your LAST Life card. After that every attack is lethal — worth up to ${k(4000)} of counter.` };
  }
  const v = unitValue(g, t.target);
  const budget = v >= 7 ? 2000 : v >= 4.5 ? 1000 : 0;
  if (level === 'easy') return { defend: false, budget: 0, why: 'Let it go.' };
  return {
    defend: budget > 0 && t.need <= budget,
    budget,
    why: budget > 0 ? `${D(t.target.id).name} is worth protecting, but only cheaply (up to ${k(budget)}).` : `${D(t.target.id).name} is not worth spending counter cards on.`,
  };
}

/** Cheapest set of hand cards that adds at least `need` power this battle. */
export function bestCounterSet(g: Game, me: PlayerId, need: number): number[] | null {
  const opts = counterOptions(g, me)
    .map((u) => {
      const d = defOf(g, u);
      const e = d.effects?.find((x) => x.timing === 'counter');
      const boost = d.category === 'Character' ? d.counter : (e?.boost ?? 0);
      return { u, boost, don: d.category === 'Event' ? d.cost : 0, price: handValue(g, me, d) - (d.category === 'Character' ? d.counter / 2500 : 0) };
    })
    .filter((o) => o.boost > 0)
    .slice(0, 12);
  let best: number[] | null = null;
  let bestPrice = Infinity;
  const donAvail = P(g, me).donActive;
  for (let mask = 1; mask < 1 << opts.length; mask++) {
    let sum = 0;
    let price = 0;
    let don = 0;
    const set: number[] = [];
    for (let i = 0; i < opts.length; i++) {
      if (!(mask & (1 << i))) continue;
      sum += opts[i].boost;
      price += opts[i].price;
      don += opts[i].don;
      set.push(opts[i].u);
    }
    if (sum < need || don > donAvail) continue;
    price += (sum - need) / 4000 + set.length * 0.05; // small penalty for overkill and for extra cards
    if (price < bestPrice) {
      bestPrice = price;
      best = set;
    }
  }
  return best;
}

function decideBlock(g: Game, me: PlayerId, ch: Extract<Choice, { kind: 'block' }>, level: Level): Decision {
  const t = currentThreat(g);
  if (!t || t.need === 0) return ans({ kind: 'block', uid: null }, 'The attack already fails — no need to block.');
  const pol = defencePolicy(g, me, level);
  const blockers = ch.options.map((u) => findField(g, u)!).sort((a, b) => unitValue(g, a) - unitValue(g, b));
  const survivors = blockers.filter((b) => powerOf(g, b) > t.atk);
  const life = P(g, me).life.length;
  if (t.lethal) {
    const b = survivors[0] ?? blockers[0];
    return ans({ kind: 'block', uid: b.uid }, `Block with ${D(b.id).name}: this attack is lethal, and a block costs no cards from hand.${survivors.length ? ' It even survives.' : ''}`);
  }
  if (survivors.length && (!t.onLeader || life <= 3 || t.damage === 2 || t.banish)) {
    const b = survivors[0];
    return ans({ kind: 'block', uid: b.uid }, `Block with ${D(b.id).name} (${k(powerOf(g, b))}): it beats the ${k(t.atk)} attack and survives — a free block.`);
  }
  if (t.onLeader && life <= 1 && level !== 'easy') {
    const b = blockers[0];
    return ans({ kind: 'block', uid: b.uid }, `Chump-block with ${D(b.id).name}: you are on your last Life, so trading a Character for the hit is worth it.`);
  }
  if (!t.onLeader && level !== 'easy') {
    const b = blockers.find((x) => unitValue(g, x) + 2 < unitValue(g, t.target));
    if (b) return ans({ kind: 'block', uid: b.uid }, `Block with ${D(b.id).name} to save the far more valuable ${D(t.target.id).name}.`);
  }
  return ans({ kind: 'block', uid: null }, `No block. ${pol.why}`);
}

function decideCounter(g: Game, me: PlayerId, level: Level): Decision {
  const t = currentThreat(g);
  if (!t || t.need === 0) return ans({ kind: 'counter', use: null }, 'The attack no longer gets through — stop countering.');
  // Counter events that do something other than add power (e.g. bounce the attacker).
  for (const u of counterOptions(g, me)) {
    const d = defOf(g, u);
    const i = d.effects?.findIndex((e) => e.timing === 'counter') ?? -1;
    const e = i >= 0 ? d.effects![i] : null;
    if (e && !e.boost && e.ai && level !== 'easy' && e.ai(g, mkCtx(me, u, d.id)) > 0 && (t.lethal || defencePolicy(g, me, level).budget > 0)) {
      return ans({ kind: 'counter', use: u }, `Play ${d.name}: removing the attacker ends the battle outright.`);
    }
  }
  const pol = defencePolicy(g, me, level);
  if (!pol.defend) return ans({ kind: 'counter', use: null }, pol.why);
  const set = bestCounterSet(g, me, t.need);
  if (!set) {
    return ans({ kind: 'counter', use: null }, t.lethal ? `You need +${k(t.need)} and cannot reach it. There is nothing left to do.` : `You need +${k(t.need)} and cannot reach it — do not waste cards on a partial counter.`);
  }
  const d = defOf(g, set[0]);
  const how = d.category === 'Character' ? `trash ${d.name} for +${k(d.counter)}` : `play ${d.name}`;
  return ans({ kind: 'counter', use: set[0] }, `${pol.why} You need +${k(t.need)}: ${how}${set.length > 1 ? ` (then ${set.length - 1} more)` : ''}.`);
}

// ---------------------------------------------------------------- main phase

function activateScore(g: Game, me: PlayerId, fc: FieldCard, e: EffectDef): number {
  const p = P(g, me);
  const o = P(g, opp(me));
  if (e.ai) return e.ai(g, mkCtx(me, fc.uid, fc.id));
  const tags = e.tags ?? [];
  const canAttack = p.turns > 1 && unitsOf(g, me).some((u) => !whyCantAttack(g, u.uid));
  let s = 0;
  if (tags.includes('ramp')) s = 3;
  else if (tags.includes('search') || tags.includes('draw')) s = 2;
  else if (tags.includes('ko') || tags.includes('bounce')) s = o.chars.some((c) => unitValue(g, c) >= 4) ? 2.5 : -1;
  else if (tags.includes('rest')) s = canAttack && o.chars.some((c) => !c.rested) ? 1.5 : -1;
  else if (tags.includes('debuff')) s = o.chars.length ? 1 : -1;
  else if (tags.includes('don')) s = p.donRested > 0 && canAttack ? 1.5 : -1;
  else if (tags.includes('buff') || tags.includes('untap')) s = canAttack ? 1 : -1;
  else s = 0.5;
  if (e.cost?.donMinus) s -= e.cost.donMinus * 0.5 + (totalDon(p) < 8 ? 1 : 0);
  if (e.cost?.trashHand && p.hand.length <= 2) s -= 1.5;
  if (e.cost?.lifeToHand && p.life.length <= 2) s -= 2;
  if (e.cost?.restSelf && hasKw(g, fc, 'Blocker') && p.life.length <= 2) s -= 1;
  return s;
}

/** Does paying for this effect use something up, so that it cannot be repeated without end? */
const consumes = (e: EffectDef): boolean => !!e.cost && !!(e.cost.don || e.cost.restSelf || e.cost.trashHand || e.cost.donMinus || e.cost.lifeToHand);

const PRE_TAGS = ['ramp', 'search', 'draw', 'ko', 'bounce', 'debuff', 'life', 'play', 'recover', 'filter'];

function playScore(g: Game, me: PlayerId, uid: number): number {
  const p = P(g, me);
  const o = P(g, opp(me));
  const d = defOf(g, uid);
  let s = d.aiPlay ? d.aiPlay(g, me) : 0;
  const tags = d.effects?.flatMap((e) => (e.timing === 'onPlay' || e.timing === 'main' ? (e.tags ?? []) : [])) ?? [];
  if (d.category === 'Character') {
    s += d.cost + d.power / 5000;
    if (d.keywords?.includes('Blocker')) s += p.life.length <= 2 ? 1.5 : 0.5;
    if (d.keywords?.includes('Rush') || tags.includes('rush')) s += p.turns > 1 ? 0.8 : 0;
    if ((tags.includes('ko') || tags.includes('bounce')) && o.chars.length) s += 1;
    if (tags.includes('search') || tags.includes('draw')) s += 0.8;
    if (p.chars.length >= 5) {
      const weakest = Math.min(...p.chars.map((c) => unitValue(g, c)));
      if (d.cost + 1 < weakest + 2) return -1;
    }
    return s;
  }
  if (d.category === 'Stage') return p.stage ? -1 : s + 2.5 + d.cost * 0.3;
  // [Main] Events
  if (tags.some((t) => ['ko', 'bounce'].includes(t))) return o.chars.some((c) => unitValue(g, c) >= 4) ? s + 3 + d.cost * 0.3 : -1;
  if (tags.includes('rest')) return o.chars.some((c) => !c.rested) && p.turns > 1 ? s + 1.5 : -1;
  if (tags.includes('ramp')) return s + 3;
  if (tags.includes('search') || tags.includes('draw')) return s + 1.2;
  if (tags.includes('debuff')) return o.chars.length ? s + 1 : -1;
  if (tags.includes('evasion')) return s + 1;
  return s + 0.8;
}

interface AttackPlan {
  allIn: boolean;
  /** Units that will attack the enemy Leader. */
  face: FieldCard[];
  leaderPower: number;
  note: string;
}

function planAttacks(g: Game, me: PlayerId, level: Level, freeDon: number): AttackPlan {
  const p = P(g, me);
  const o = P(g, opp(me));
  const leaderPower = powerOf(g, o.leader);
  const ready = unitsOf(g, me).filter((u) => !whyCantAttack(g, u.uid) && attackTargets(g, u.uid).includes(o.leader.uid));
  const reach = (list: FieldCard[]): FieldCard[] => {
    // Attackers that can match the Leader's power, cheapest DON!! top-ups first.
    let don = freeDon;
    const out: FieldCard[] = [];
    for (const u of [...list].sort((a, b) => powerOf(g, b) - powerOf(g, a))) {
      const need = Math.max(0, Math.ceil((leaderPower - powerOf(g, u)) / 1000));
      if (need <= don) {
        don -= need;
        out.push(u);
      }
    }
    return out;
  };
  const oppBlockers = o.chars.filter((c) => !c.rested && hasKw(g, c, 'Blocker')).length;
  const all = reach(ready);
  const hitsNeeded = o.life.length + 1;
  const spare = all.length - oppBlockers - hitsNeeded;
  // They must stop (spare + 1) attacks with counters; assume roughly 1200 power per card in hand.
  const allIn = level === 'hard' && spare >= 0 && o.hand.length * 1200 < (spare + 1) * 2000;
  const nearLethal = o.life.length === 0 && all.length > oppBlockers;
  if (allIn || nearLethal) {
    return { allIn: true, face: all, leaderPower, note: `You can threaten lethal: ${all.length} attacks against ${o.life.length} Life${oppBlockers ? ` and ${oppBlockers} Blocker${oppBlockers > 1 ? 's' : ''}` : ''}. Send everything at the Leader.` };
  }
  // Otherwise keep Blockers home when Life is low.
  const hold = p.life.length <= 2 && level !== 'easy';
  const face = reach(ready.filter((u) => !(hold && hasKw(g, u, 'Blocker'))));
  return { allIn: false, face, leaderPower, note: '' };
}

function decideMain(g: Game, me: PlayerId, level: Level, rnd: () => number): Decision {
  const p = P(g, me);
  const o = P(g, opp(me));
  const acts = legalActions(g);
  const sloppy = level === 'easy' ? 0.25 : level === 'normal' ? 0.08 : 0;

  // 1. Effects that set up the turn (ramp, search, removal) come first.
  const activations = acts
    .filter((a): a is Extract<Action, { type: 'activate' }> => a.type === 'activate')
    .map((a) => {
      const fc = findField(g, a.uid)!;
      const e = D(fc.id).effects![a.idx];
      return { a, fc, e, s: activateScore(g, me, fc, e), pre: (e.tags ?? []).some((t) => PRE_TAGS.includes(t)) };
    })
    .filter((x) => x.s > 0)
    // An effect with no real price could be activated forever: once a turn is enough.
    .filter((x) => x.e.opt || consumes(x.e) || !x.fc.used.includes(effectKey(x.fc.id, x.a.idx)))
    .sort((x, y) => y.s - x.s);
  const pre = activations.find((x) => x.pre);
  if (pre) return { action: pre.a, reason: `Use ${D(pre.fc.id).name}'s effect first — it sets up the rest of your turn. (${pre.e.text})` };

  // 2. Spend DON!! on cards. Biggest useful play first, then fill the gaps.
  if (rnd() >= sloppy) {
    const plays = p.hand
      .filter((u) => !whyCantPlay(g, u))
      .map((u) => ({ u, s: playScore(g, me, u) }))
      .filter((x) => x.s > 0.5)
      .sort((x, y) => y.s - x.s);
    if (plays.length) {
      const d = defOf(g, plays[0].u);
      const cost = playCost(g, me, plays[0].u);
      const left = p.donActive - cost;
      const why =
        d.category === 'Character'
          ? `Play ${d.name} (cost ${cost}): the best use of your ${p.donActive} DON!!${left > 0 ? `, leaving ${left} for more plays or to power up attacks` : ' — you spend them all, which is what you want most turns'}.`
          : d.category === 'Stage'
            ? `Play the Stage ${d.name}: it stays in play and gives value every turn.`
            : `Play ${d.name} now: its effect has a good target.`;
      return { action: { type: 'play', uid: plays[0].u }, reason: why };
    }
  }

  // 3. Effects that power up attackers (give DON!!, buffs) once plays are done.
  const post = activations.find((x) => !x.pre);
  if (post) return { action: post.a, reason: `Use ${D(post.fc.id).name}'s effect before attacking. (${post.e.text})` };

  if (p.turns <= 1) return { action: { type: 'end' }, reason: 'Nobody can attack on their first turn, so end the turn. (DON!! you did not spend is simply not used.)' };

  // 4. Attacks.
  const reserveCard = level === 'hard' && p.life.length <= 3 ? p.hand.find((u) => {
          const d = defOf(g, u);
          return d.category === 'Event' && !!d.effects?.some((e) => e.timing === 'counter' && (e.boost ?? 0) >= 3000) && playCost(g, me, u) <= 2;
        })
      : undefined;
  const reserve = reserveCard !== undefined ? Math.min(playCost(g, me, reserveCard), p.donActive) : 0;
  let freeDon = p.donActive - reserve;
  const plan = planAttacks(g, me, level, freeDon);
  const ready = unitsOf(g, me).filter((u) => !whyCantAttack(g, u.uid));

  // 4a. Kill valuable rested Characters when it is cheap to do so.
  if (!plan.allIn && level !== 'easy') {
    const targets = o.chars.filter((c) => c.rested && (unitValue(g, c) >= 4.5 || hasKw(g, c, 'Blocker'))).sort((a, b) => unitValue(g, b) - unitValue(g, a));
    for (const t of targets) {
      const tp = powerOf(g, t);
      const options = ready
        .filter((u) => attackTargets(g, u.uid).includes(t.uid))
        .map((u) => ({ u, need: Math.max(0, Math.ceil((tp - powerOf(g, u)) / 1000)) }))
        .filter((x) => x.need <= Math.min(freeDon, 2))
        .sort((x, y) => x.need - y.need || powerOf(g, x.u) - powerOf(g, y.u));
      // Prefer a Character over the Leader for trades when both work equally well.
      const pick = options.find((x) => !isLeader(g, x.u.uid) && x.need === options[0].need) ?? options[0];
      if (!pick) continue;
      if (pick.need > 0) {
        return { action: { type: 'don', target: pick.u.uid, n: pick.need }, reason: `Give ${pick.need} DON!! to ${D(pick.u.id).name} so it reaches ${k(powerOf(g, pick.u) + pick.need * 1000)} — enough to K.O. the rested ${D(t.id).name} (${k(tp)}).` };
      }
      return { action: { type: 'attack', attacker: pick.u.uid, target: t.uid }, reason: `Attack the rested ${D(t.id).name} (${k(tp)}) with ${D(pick.u.id).name} (${k(powerOf(g, pick.u))}). Removing a strong Character is worth more than 1 damage, and rested Characters are the only ones you can attack.` };
    }
  }

  // 4b. Everything else goes at the Leader. First hand out DON!!, then swing weakest-first.
  const face = plan.face;
  if (face.length) {
    if (freeDon > 0) {
      // Top up anyone below the Leader's power, then level up the weakest attacker.
      const below = face.filter((u) => powerOf(g, u) < plan.leaderPower).sort((a, b) => powerOf(g, b) - powerOf(g, a))[0];
      if (below) {
        const n = Math.ceil((plan.leaderPower - powerOf(g, below)) / 1000);
        return { action: { type: 'don', target: below.uid, n }, reason: `Give ${n} DON!! to ${D(below.id).name}: an attack needs power equal to or higher than the target, and their Leader has ${k(plan.leaderPower)}.` };
      }
      const weakest = level === 'easy' ? p.leader : [...face].sort((a, b) => powerOf(g, a) - powerOf(g, b))[0];
      if (face.includes(weakest)) {
        freeDon--;
        const now = powerOf(g, weakest) + 1000;
        return {
          action: { type: 'don', target: weakest.uid, n: 1 },
          reason: `Give 1 DON!! to ${D(weakest.id).name} (→ ${k(now)}). Every +1000 on an attack forces your opponent to find +1000 more counter; a ${k(now)} swing into a ${k(plan.leaderPower)} Leader costs them ${k(now - plan.leaderPower + 1000)} to stop.${reserve ? ` (Keeping ${reserve} DON!! back for ${dName(g, reserveCard!)}.)` : ''}`,
        };
      }
    }
    const order = [...face].sort((a, b) => {
      const fx = (u: FieldCard): number => (D(u.id).effects?.some((e) => e.timing === 'whenAttacking') ? 0 : 1);
      return fx(a) - fx(b) || powerOf(g, a) - powerOf(g, b);
    });
    const a = level === 'easy' && rnd() < 0.3 ? face[Math.floor(rnd() * face.length)] : order[0];
    const ap = powerOf(g, a);
    const need = ap - plan.leaderPower + 1000;
    const tail = face.length > 1 ? ' Weaker attacks go first so your opponent has to decide on counters before your biggest swing.' : '';
    return {
      action: { type: 'attack', attacker: a.uid, target: o.leader.uid },
      reason: plan.note ? `${plan.note} Attack with ${D(a.id).name} (${k(ap)}).` : `Attack their Leader with ${D(a.id).name} (${k(ap)} vs ${k(plan.leaderPower)}): they need +${k(need)} in counters to stop it.${tail}`,
    };
  }

  const idle = ready.filter((u) => !hasKw(g, u, 'Blocker'));
  const why = idle.length
    ? `End the turn: your remaining attackers cannot reach their Leader's ${k(plan.leaderPower)} power, and a failed attack only leaves your Character rested and exposed.`
    : ready.length
      ? 'End the turn. Your Blockers stay active to defend — at low Life that matters more than one more attack.'
      : 'Nothing left to do — end the turn.';
  return { action: { type: 'end' }, reason: why };
}

// ---------------------------------------------------------------- entry point

export function decide(g: Game, me: PlayerId, level: Level = 'hard', rnd: () => number = Math.random): Decision {
  const ch = g.pending;
  if (ch) {
    if (ch.player !== me) throw new Error('It is not this player’s decision.');
    switch (ch.kind) {
      case 'mulligan':
        return decideMulligan(g, me);
      case 'select':
        return decideSelect(g, me, ch);
      case 'confirm':
        return decideConfirm(g, me, ch);
      case 'option':
        return decideOption(g, me, ch);
      case 'block':
        return decideBlock(g, me, ch, level);
      case 'counter':
        return decideCounter(g, me, level);
      case 'trigger':
        return decideTrigger(g, me, ch);
    }
  }
  return decideMain(g, me, level, rnd);
}

export { blockersFor, costOf, effectKey };
