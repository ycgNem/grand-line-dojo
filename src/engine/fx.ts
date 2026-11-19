// Building blocks for card effects. Each helper returns one or more Steps that the engine
// runs in order; a Step that needs a decision returns a Choice and the next Step reads the answer.

import {
  P,
  addFlag,
  addMod,
  costOf,
  defOf,
  draw,
  findField,
  hasKw,
  leaveField,
  log,
  nameOf,
  opp,
  own,
  ownerOf,
  placeStage,
  playCharacter,
  powerOf,
  removeByEffect,
  shuffle,
  sv,
  trashFromHand,
  vb,
  type RemoveMode,
} from './game';
import { D } from './registry';
import type { CardDef, Choice, Ctx, FieldCard, Flag, Game, Intent, PlayerId, Step, Until } from './types';

export type FieldFilter = (g: Game, t: FieldCard, c: Ctx) => boolean;
export type CardFilter = (d: CardDef) => boolean;

export const ask = (c: Ctx, prompt: string, options: number[], min: number, max: number, intent: Intent, shown?: number[], player: PlayerId = c.player): Choice => ({
  kind: 'select',
  player,
  prompt,
  options,
  shown,
  min: Math.min(min, options.length),
  max: Math.min(max, options.length),
  intent,
  source: c.cardId,
});

// ---- choosing targets

export const pickOpp =
  (max: number, prompt: string, intent: Intent, f?: FieldFilter): Step =>
  (g, c) => {
    c.sel = [];
    const o = P(g, opp(c.player))
      .chars.filter((t) => !f || f(g, t, c))
      .map((t) => t.uid);
    if (o.length) return ask(c, prompt, o, 0, max, intent);
  };

/** Opponent's Leader or Characters. */
export const pickOppUnit =
  (max: number, prompt: string, intent: Intent, f?: FieldFilter): Step =>
  (g, c) => {
    c.sel = [];
    const op = P(g, opp(c.player));
    const o = [op.leader, ...op.chars].filter((t) => !f || f(g, t, c)).map((t) => t.uid);
    if (o.length) return ask(c, prompt, o, 0, max, intent);
  };

/** Characters on either side ("Return up to 1 Character ... to the owner's hand"). */
export const pickAnyChar =
  (max: number, prompt: string, intent: Intent, f?: FieldFilter): Step =>
  (g, c) => {
    c.sel = [];
    const o = [...P(g, opp(c.player)).chars, ...P(g, c.player).chars].filter((t) => !f || f(g, t, c)).map((t) => t.uid);
    if (o.length) return ask(c, prompt, o, 0, max, intent);
  };

export const pickOwn =
  (max: number, prompt: string, intent: Intent, o: { leader?: boolean; chars?: boolean; f?: FieldFilter } = {}): Step =>
  (g, c) => {
    c.sel = [];
    const p = P(g, c.player);
    const all = [...(o.leader ? [p.leader] : []), ...(o.chars === false ? [] : p.chars)].filter((t) => !o.f || o.f(g, t, c)).map((t) => t.uid);
    if (all.length) return ask(c, prompt, all, 0, max, intent);
  };

export const each =
  (fn: (g: Game, c: Ctx, uid: number) => void): Step =>
  (g, c) => {
    for (const u of c.sel) fn(g, c, u);
  };

const src = (c: Ctx): string => D(c.cardId).name;

// ---- removal and disruption

export const removeOpp = (prompt: string, mode: RemoveMode, f?: FieldFilter, max = 1): Step[] => [
  pickOpp(max, prompt, mode === 'ko' ? 'ko' : mode === 'hand' ? 'bounce' : 'bottomDeck', f),
  each((g, c, u) => removeByEffect(g, c.player, u, mode)),
];
export const koOpp = (prompt: string, f?: FieldFilter, max = 1): Step[] => removeOpp(prompt, 'ko', f, max);

/** "Return/Place up to N Character(s) ..." — may target either side. */
export const removeAny = (prompt: string, mode: RemoveMode, f?: FieldFilter, max = 1): Step[] => [
  pickAnyChar(max, prompt, mode === 'hand' ? 'bounce' : mode === 'bottom' ? 'bottomDeck' : 'ko', f),
  each((g, c, u) => removeByEffect(g, c.player, u, mode)),
];

export const restOpp = (prompt: string, f?: FieldFilter, max = 1): Step[] => [
  pickOpp(max, prompt, 'rest', (g, t, c) => !t.rested && (!f || f(g, t, c))),
  each((g, c, u) => {
    const t = findField(g, u);
    if (!t) return;
    t.rested = true;
    log(g, c.player, `${src(c)} rests ${D(t.id).name}.`, 'effect');
  }),
];

export const restOppDon =
  (n: number): Step =>
  (g, c) => {
    const o = P(g, opp(c.player));
    const k = Math.min(n, o.donActive);
    o.donActive -= k;
    o.donRested += k;
    if (k) log(g, c.player, `${src(c)} rests ${k} of ${own(g, opp(c.player), false)} DON!!.`, 'effect');
  };

export const statOpp = (stat: 'power' | 'cost', amount: number, until: Until, prompt: string, o: { leader?: boolean; max?: number; f?: FieldFilter } = {}): Step[] => [
  (o.leader ? pickOppUnit : pickOpp)(o.max ?? 1, prompt, 'debuff', o.f),
  each((g, c, u) => {
    const t = findField(g, u);
    if (!t) return;
    addMod(t, stat, amount, until);
    log(g, c.player, `${src(c)}: ${D(t.id).name} gets ${amount > 0 ? '+' : ''}${amount} ${stat} (now ${stat === 'power' ? powerOf(g, t) : costOf(g, t)}).`, 'effect');
  }),
];

// ---- buffs

export const buffSelf =
  (amount: number, until: Until): Step =>
  (g, c) => {
    const t = findField(g, c.src);
    if (!t) return;
    addMod(t, 'power', amount, until);
    log(g, c.player, `${D(t.id).name} gets +${amount} power (now ${powerOf(g, t)}).`, 'effect');
  };

/** [Counter] buff: goes on the card being attacked. */
export const buffBattle =
  (amount: number): Step =>
  (g, c) => {
    const t = g.battle ? findField(g, g.battle.target) : null;
    if (!t || ownerOf(t.uid) !== c.player) return;
    addMod(t, 'power', amount, 'battle');
    log(g, c.player, `${src(c)}: ${D(t.id).name} gets +${amount} power this battle (now ${powerOf(g, t)}).`, 'effect');
  };

export const buffOwn = (amount: number, until: Until, prompt: string, o: { leader?: boolean; chars?: boolean; f?: FieldFilter; max?: number } = { leader: true }): Step[] => [
  pickOwn(o.max ?? 1, prompt, 'buff', o),
  each((g, c, u) => {
    const t = findField(g, u);
    if (!t) return;
    addMod(t, 'power', amount, until);
    log(g, c.player, `${src(c)}: ${D(t.id).name} gets +${amount} power (now ${powerOf(g, t)}).`, 'effect');
  }),
];

export const flagSelf =
  (flag: Flag, until: Until): Step =>
  (g, c) => {
    const t = findField(g, c.src);
    if (!t) return;
    addFlag(t, flag, until);
    log(g, c.player, `${D(t.id).name} gains [${flag}].`, 'effect');
  };

export const flagOwn = (flag: Flag, until: Until, prompt: string, o: { leader?: boolean; chars?: boolean; f?: FieldFilter } = { leader: true }): Step[] => [
  pickOwn(1, prompt, 'buff', o),
  each((g, c, u) => {
    const t = findField(g, u);
    if (!t) return;
    addFlag(t, flag, until);
    log(g, c.player, `${src(c)}: ${D(t.id).name} gains [${flag}].`, 'effect');
  }),
];

export const setActiveSelf: Step = (g, c) => {
  const t = findField(g, c.src);
  if (!t || !t.rested) return;
  t.rested = false;
  log(g, c.player, `${D(t.id).name} is set as active.`, 'effect');
};

export const untapOwn = (prompt: string, f?: FieldFilter, max = 1): Step[] => [
  pickOwn(max, prompt, 'untap', { f: (g, t, c) => t.rested && (!f || f(g, t, c)) }),
  each((g, c, u) => {
    const t = findField(g, u);
    if (!t) return;
    t.rested = false;
    log(g, c.player, `${src(c)} sets ${D(t.id).name} as active.`, 'effect');
  }),
];

// ---- cards and hands

export const drawN =
  (n: number): Step =>
  (g, c) => {
    const k = draw(g, c.player, n);
    log(g, c.player, `${sv(g, c.player, 'draw')} ${k} card${k === 1 ? '' : 's'}.`, 'effect');
  };

export const discard = (n: number): Step[] => [
  (g, c) => {
    c.sel = [];
    const h = P(g, c.player).hand;
    if (h.length) return ask(c, `Trash ${Math.min(n, h.length)} card${n === 1 ? '' : 's'} from your hand.`, [...h], n, n, 'discard');
  },
  (g, c) => trashFromHand(g, c.player, c.sel),
];

export const oppDiscard = (n: number): Step[] => [
  (g, c) => {
    c.sel = [];
    const o = opp(c.player);
    const h = P(g, o).hand;
    if (h.length) return ask(c, `${src(c)}: choose ${Math.min(n, h.length)} card${n === 1 ? '' : 's'} from your hand to trash.`, [...h], n, n, 'discard', undefined, o);
  },
  (g, c) => trashFromHand(g, opp(c.player), c.sel),
];

export const millSelf =
  (n: number): Step =>
  (g, c) => {
    const p = P(g, c.player);
    const cards = p.deck.splice(0, n);
    p.trash.push(...cards);
    if (cards.length) log(g, c.player, `${sv(g, c.player, 'trash')} ${cards.length} card${cards.length === 1 ? '' : 's'} from the top of the deck.`, 'effect');
  };

/** Look at the top N cards, add up to 1 matching card to hand, the rest go to the bottom (or the trash). */
export const searchTop = (n: number, f: CardFilter, what: string, rest: 'bottom' | 'trash' = 'bottom'): Step[] => [
  (g, c) => {
    const p = P(g, c.player);
    c.list = p.deck.slice(0, n);
    c.sel = [];
    if (!c.list.length) return;
    const opts = c.list.filter((u) => f(defOf(g, u)));
    return ask(c, `Top ${c.list.length} cards of your deck. Reveal up to 1 ${what} and add it to your hand.`, opts, 0, 1, 'search', [...c.list]);
  },
  (g, c) => {
    const p = P(g, c.player);
    p.deck = p.deck.filter((u) => !c.list.includes(u));
    for (const u of c.sel) {
      p.hand.push(u);
      log(g, c.player, `${sv(g, c.player, 'reveal')} ${nameOf(g, u)} and ${vb(g, c.player, 'add')} it to hand.`, 'effect');
    }
    const others = c.list.filter((u) => !c.sel.includes(u));
    if (rest === 'bottom') p.deck.push(...others);
    else p.trash.push(...others);
    if (!c.sel.length && c.list.length) log(g, c.player, `${src(c)} finds nothing to add.`, 'effect');
    c.list = [];
  },
];

/** Look at the top N cards; choose which go to the bottom, the rest stay on top in order. */
export const scry = (n: number): Step[] => [
  (g, c) => {
    c.list = P(g, c.player).deck.slice(0, n);
    c.sel = [];
    if (c.list.length) return ask(c, `Top ${c.list.length} cards of your deck. Choose any to put on the BOTTOM — the rest stay on top.`, [...c.list], 0, c.list.length, 'deckOrder', [...c.list]);
  },
  (g, c) => {
    const p = P(g, c.player);
    p.deck = p.deck.filter((u) => !c.sel.includes(u));
    p.deck.push(...c.sel);
    log(g, c.player, `${sv(g, c.player, 'look')} at the top ${c.list.length} cards and ${vb(g, c.player, 'put')} ${c.sel.length} on the bottom.`, 'effect');
    c.list = [];
  },
];

export const recover = (f: CardFilter, what: string): Step[] => [
  (g, c) => {
    c.sel = [];
    const opts = P(g, c.player).trash.filter((u) => u !== c.src && f(defOf(g, u)));
    if (opts.length) return ask(c, `Add up to 1 ${what} from your trash to your hand.`, opts, 0, 1, 'recover', opts);
  },
  (g, c) => {
    const p = P(g, c.player);
    for (const u of c.sel) {
      p.trash.splice(p.trash.indexOf(u), 1);
      p.hand.push(u);
      log(g, c.player, `${sv(g, c.player, 'return')} ${nameOf(g, u)} from the trash to hand.`, 'effect');
    }
  },
];

/** Play up to 1 matching Character from hand / trash / deck. */
export const playFrom = (zone: 'hand' | 'trash' | 'deck', f: CardFilter, what: string, rested = false): Step[] => [
  (g, c) => {
    c.sel = [];
    const p = P(g, c.player);
    const pool = zone === 'hand' ? p.hand : zone === 'trash' ? p.trash : p.deck;
    const opts = pool.filter((u) => u !== c.src && defOf(g, u).category === 'Character' && defOf(g, u).sim !== 'none' && f(defOf(g, u)));
    if (!opts.length) {
      if (zone === 'deck') shuffle(g, p.deck);
      return;
    }
    return ask(c, `Play up to 1 ${what} from your ${zone}${rested ? ' rested' : ''}.`, opts, 0, 1, 'play', zone === 'hand' ? undefined : opts);
  },
  (g, c) => {
    const p = P(g, c.player);
    const pool = zone === 'hand' ? p.hand : zone === 'trash' ? p.trash : p.deck;
    for (const u of c.sel) {
      const i = pool.indexOf(u);
      if (i < 0) continue;
      pool.splice(i, 1);
      playCharacter(g, c.player, u, rested);
    }
    if (zone === 'deck') shuffle(g, p.deck);
  },
];

/** "[Trigger] Play this card." — works for Characters and Stages. */
export const playSelf: Step = (g, c) => {
  const p = P(g, c.player);
  for (const zone of [p.trash, p.hand]) {
    const i = zone.indexOf(c.src);
    if (i >= 0) zone.splice(i, 1);
  }
  if (D(c.cardId).category === 'Stage') placeStage(g, c.player, c.src);
  else playCharacter(g, c.player, c.src, false);
};

// ---- DON!!

export const addDon =
  (n: number, active: boolean): Step =>
  (g, c) => {
    const p = P(g, c.player);
    const k = Math.min(n, p.donDeck);
    p.donDeck -= k;
    if (active) p.donActive += k;
    else p.donRested += k;
    if (k) log(g, c.player, `${sv(g, c.player, 'add')} ${k} DON!! from the DON!! deck (${active ? 'active' : 'rested'}).`, 'effect');
  };

export const untapDon =
  (n: number): Step =>
  (g, c) => {
    const p = P(g, c.player);
    const k = Math.min(n, p.donRested);
    p.donRested -= k;
    p.donActive += k;
    if (k) log(g, c.player, `${sv(g, c.player, 'set')} ${k} DON!! as active.`, 'effect');
  };

export const giveRestedDon = (n: number, prompt: string, o: { leader?: boolean; chars?: boolean; f?: FieldFilter; max?: number } = { leader: true }): Step[] => [
  (g, c) => {
    c.sel = [];
    if (P(g, c.player).donRested <= 0) return;
    return pickOwn(o.max ?? 1, prompt, 'giveDon', o)(g, c);
  },
  each((g, c, u) => {
    const p = P(g, c.player);
    const t = findField(g, u);
    const k = Math.min(n, p.donRested);
    if (!t || k <= 0) return;
    p.donRested -= k;
    t.don += k;
    log(g, c.player, `${src(c)} gives ${k} rested DON!! to ${D(t.id).name}.`, 'effect');
  }),
];

// ---- Life

export const gainLife =
  (n: number): Step =>
  (g, c) => {
    const p = P(g, c.player);
    for (let i = 0; i < n; i++) {
      const u = p.deck.shift();
      if (u === undefined) break;
      p.life.unshift({ uid: u, faceUp: false });
    }
    log(g, c.player, `${sv(g, c.player, 'add')} a card from the deck to the top of Life (${p.life.length} Life).`, 'effect');
  };

export const trashOppLife =
  (n: number): Step =>
  (g, c) => {
    const o = P(g, opp(c.player));
    for (let i = 0; i < n; i++) {
      const lc = o.life.shift();
      if (!lc) break;
      o.trash.push(lc.uid);
      log(g, c.player, `${src(c)} trashes the top card of ${own(g, opp(c.player), false)} Life (${o.life.length} left).`, 'damage');
    }
  };

export const lifeTopToHand: Step = (g, c) => {
  const p = P(g, c.player);
  const lc = p.life.shift();
  if (!lc) return;
  p.hand.push(lc.uid);
  log(g, c.player, `${sv(g, c.player, 'add')} the top Life card to hand (${p.life.length} Life left).`, 'effect');
};

/** "Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom." */
export const lifeLook: Step[] = [
  (g, c) => {
    const mine = P(g, c.player).life.length > 0;
    const theirs = P(g, opp(c.player)).life.length > 0;
    c.v.which = -1;
    c.v.mine = mine ? 1 : 0;
    c.v.theirs = theirs ? 1 : 0;
    if (!mine && !theirs) return;
    const labels = [...(mine ? ['Look at your top Life card'] : []), ...(theirs ? ["Look at your opponent's top Life card"] : []), 'Skip'];
    return { kind: 'option', player: c.player, prompt: `${src(c)}: look at a Life card?`, labels, tag: 'lifeWhich', source: c.cardId };
  },
  (g, c) => {
    if (!c.v.mine && !c.v.theirs) return;
    const order: number[] = [...(c.v.mine ? [c.player] : []), ...(c.v.theirs ? [opp(c.player)] : [])];
    if (c.idx >= order.length) return;
    c.v.which = order[c.idx];
    const lc = P(g, c.v.which as PlayerId).life[0];
    const whose = c.v.which === c.player ? 'your' : "your opponent's";
    return { kind: 'option', player: c.player, prompt: `The top card of ${whose} Life is ${nameOf(g, lc.uid)}. Where should it go?`, labels: ['Keep it on top', 'Move it to the bottom'], tag: c.v.which === c.player ? 'lifePlaceMine' : 'lifePlaceTheirs', source: c.cardId, reveal: lc.uid };
  },
  (g, c) => {
    if (c.v.which < 0) return;
    const L = P(g, c.v.which as PlayerId).life;
    if (c.idx === 1 && L.length > 1) L.push(L.shift()!);
    log(g, c.player, `${sv(g, c.player, 'look')} at a Life card and ${c.idx === 1 ? `${vb(g, c.player, 'move')} it to the bottom` : `${vb(g, c.player, 'keep')} it on top`}.`, 'effect');
  },
];

/** "Your opponent chooses one: trash the top of their Life, or you add 1 card from your deck to your Life." */
export const linlinChoice: Step[] = [
  (g, c) => {
    c.idx = 1;
    if (P(g, opp(c.player)).life.length === 0) return;
    return {
      kind: 'option',
      player: opp(c.player),
      prompt: `${src(c)} — you must choose one:`,
      labels: ['Trash the top card of YOUR Life', 'Your opponent adds 1 card from their deck to the top of THEIR Life'],
      tag: 'linlin',
      source: c.cardId,
    };
  },
  (g, c) => {
    if (c.idx === 0) trashOppLife(1)(g, c);
    else gainLife(1)(g, c);
  },
];

/** Move up to 1 card from hand to the top of your Life. */
export const handToLife: Step[] = [
  (g, c) => {
    c.sel = [];
    const h = P(g, c.player).hand;
    if (h.length) return ask(c, 'Add up to 1 card from your hand to the top of your Life cards.', [...h], 0, 1, 'toLife');
  },
  (g, c) => {
    const p = P(g, c.player);
    for (const u of c.sel) {
      p.hand.splice(p.hand.indexOf(u), 1);
      p.life.unshift({ uid: u, faceUp: false });
      log(g, c.player, `${sv(g, c.player, 'add')} a card from hand to the top of Life (${p.life.length} Life).`, 'effect');
    }
  },
];

// ---- battle rules

export const noBlocker =
  (minPower = 0): Step =>
  (g, c) => {
    if (!g.battle) return;
    if (minPower > 0) g.battle.noBlockMin = minPower;
    else g.battle.noBlock = true;
    log(g, c.player, minPower ? `${src(c)}: [Blocker] Characters with ${minPower}+ power cannot block this attack.` : `${src(c)}: this attack cannot be blocked.`, 'effect');
  };

export const onlyIf =
  (test: (g: Game, c: Ctx) => boolean): Step =>
  (g, c) => {
    if (!test(g, c)) return 'stop';
  };

export { addFlag, addMod, costOf, defOf, findField, hasKw, leaveField, log, opp, ownerOf, powerOf, P };
