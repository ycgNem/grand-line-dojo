// Effect sentences: what a card DOES. Each sentence is parsed into an "action" — a list of engine
// steps plus, where it makes sense, a test for "could this be done in full right now?" so the same
// sentence can serve as an effect ("Trash 1 card from your hand."), as a cost ("You may trash 1
// card from your hand: ...") or as a replacement ("...you may trash 1 card from your hand instead").

import * as fx from './fx';
import {
  P,
  addFlagFor,
  addModFor,
  canPlayChar,
  costOf,
  dealDamage,
  defOf,
  draw,
  emit,
  findField,
  hasState,
  isLeader,
  log,
  nameOf,
  opp,
  own,
  ownerOf,
  placeStage,
  playCharacter,
  powerOf,
  rand,
  removeByEffect,
  restCard,
  restDon,
  returnDon,
  rulesOf,
  shuffle,
  sv,
  totalDon,
  trashFromHand,
  vb,
  type RemoveMode,
} from './game';
import { DUR, KW_RE, candidates, parseCond, parseCount, parseDesc, parseDur, parseSel, parseSels, spanWords, type Desc, type Sel, type Test } from './grammar';
import { D } from './registry';
import type { Choice, Ctx, FieldCard, Flag, Game, Intent, Keyword, PlayerId, Span, Step, Timing } from './types';

export interface Act {
  steps: Step[];
  tags: string[];
  /** Could this be done in full right now? Needed when the action is used as a cost. */
  can?: Test;
  /** [Counter] maths for the AI and the coach: power added to the card under attack. */
  boost?: number;
  /** "Activate this card's [Main] effect." */
  ref?: Timing;
  /** Extra sentences this action swallowed ("Then, place the rest at the bottom of your deck."). */
  consumed?: number;
  /** The condition in front of the clause, when there is one. */
  cond?: Test;
}
export interface Env {
  timing: Timing | null;
}

/** Collects what could not be understood, for the coverage report. */
export const trace = { on: false, misses: [] as string[] };
let depth = 0;
const miss = (kind: string, s: string): void => {
  if (trace.on && depth === 0) trace.misses.push(`${kind}: ${s}`);
};

const TIMING_REF: Record<string, Timing> = { Main: 'main', Counter: 'counter', 'On Play': 'onPlay', 'On KO': 'onKO', 'On K.O.': 'onKO', 'When Attacking': 'whenAttacking', Trigger: 'trigger' };
const srcName = (c: Ctx): string => D(c.cardId).name;
const pretty = (s: string): string => s.replace(/\bKO\b/g, 'K.O.');
const plural = (n: number, w = 'card'): string => `${n} ${w}${n === 1 ? '' : 's'}`;
const notLeader = (g: Game, _c: Ctx, t: FieldCard): boolean => !isLeader(g, t.uid);

let seq = 0;
/** Runs `steps` only when `test` held at the moment the effect reached this point. */
export function guarded(test: Test, steps: Step[]): Step[] {
  const key = `k${seq++}`;
  return [
    (g, c) => {
      c.v[key] = test(g, c) ? 1 : 0;
    },
    ...steps.map<Step>((s) => (g, c) => (c.v[key] ? s(g, c) : undefined)),
  ];
}

// ---------------------------------------------------------------- building blocks

type Apply = (g: Game, c: Ctx, t: FieldCard) => void;
type Extra = (g: Game, c: Ctx, t: FieldCard) => boolean;

const pool = (g: Game, c: Ctx, sel: Sel, extra?: Extra): FieldCard[] =>
  candidates(g, c, sel).filter((t) => (!extra || extra(g, c, t)) && !(c.v.acc && !sel.fixed && c.those?.includes(t.uid)));
/** So a later sentence can say "that Character" / "it". */
const remember = (c: Ctx, sel: Sel, hit: number[]): void => {
  if (sel.fixed === 'that') return;
  c.those = c.v.acc ? [...(c.those ?? []), ...hit] : hit;
  if (hit.length) c.v.that = hit[hit.length - 1];
};
const lifeLocked = (g: Game, pid: PlayerId): boolean => rulesOf(P(g, pid)).some((r) => r.kind === 'noLifeToHand');

/** Choose targets for `sel` (or take them all, when no choice is involved) and apply `fn` to each. */
function pick(sel: Sel, prompt: string, intent: Intent, fn: Apply, extra?: Extra, chooser?: 'opp'): Step[] {
  if (sel.fixed || sel.all) {
    return [
      (g, c) => {
        c.v.did = 0;
        const hit = pool(g, c, sel, extra);
        remember(c, sel, hit.map((t) => t.uid));
        for (const t of hit) {
          fn(g, c, t);
          c.v.did = 1;
        }
      },
    ];
  }
  return [
    (g, c) => {
      c.sel = [];
      c.v.did = 0;
      const o = pool(g, c, sel, extra).map((t) => t.uid);
      if (!o.length) return;
      const max = Math.min(sel.max, o.length);
      return { kind: 'select', player: chooser === 'opp' ? opp(c.player) : c.player, prompt: pretty(prompt), options: o, min: sel.upTo ? 0 : max, max, intent, source: c.cardId };
    },
    (g, c) => {
      remember(c, sel, [...c.sel]);
      for (const u of c.sel) {
        const t = findField(g, u);
        if (!t) continue;
        fn(g, c, t);
        c.v.did = 1;
      }
    },
  ];
}
/** The same action on several groups of targets: "your Leader and all of your Characters". */
function pickEach(sels: Sel[], prompt: string, intent: Intent | ((sel: Sel) => Intent), fn: Apply, extra?: Extra): Step[] {
  const of = (sel: Sel): Intent => (typeof intent === 'function' ? intent(sel) : intent);
  if (sels.length === 1) return pick(sels[0], prompt, of(sels[0]), fn, extra);
  return [
    (_g, c) => {
      c.those = [];
      c.v.acc = 1;
    },
    ...sels.flatMap((sel) => pick(sel, prompt, of(sel), fn, extra)),
    (_g, c) => {
      c.v.acc = 0;
    },
  ];
}
/** Targets on your own side, where card text leaves "of your" out ("your Leader and 1 Character"). */
function ownSels(target: string): Sel[] | null {
  const sels = parseSels(target) ?? parseSels(`1 of ${target}`);
  return sels ? sels.map((sel) => (sel.side === 'any' && !sel.fixed ? { ...sel, side: 'own' as const } : sel)) : null;
}
const giveRested =
  (count: number): Apply =>
  (g, c, t) => {
    const p = P(g, c.player);
    const k = Math.min(count, p.donRested);
    if (k <= 0 || p.stage?.uid === t.uid) return;
    p.donRested -= k;
    t.don += k;
    log(g, c.player, `${srcName(c)} gives ${k} rested DON!! to ${D(t.id).name}.`, 'effect');
    emit(g, { type: 'donGiven', player: c.player, uid: t.uid, n: k, by: c.player, how: 'effect', other: 0 });
  };
/** "A or B": the player picks one of two actions (only the possible ones are offered). */
function either(a: Act, b: Act, la: string, lb: string): Act {
  const key = `k${seq++}`;
  const ok = (x: Act, g: Game, c: Ctx): boolean => !x.can || x.can(g, c);
  return {
    steps: [
      (g, c): Choice | undefined => {
        const [ya, yb] = [ok(a, g, c), ok(b, g, c)];
        c.idx = ya ? 0 : 1;
        if (ya && yb) return { kind: 'option', player: c.player, prompt: `${srcName(c)} — choose one:`, labels: [pretty(la), pretty(lb)], tag: 'chooseOne', source: c.cardId };
      },
      (_g, c) => {
        c.v[key] = c.idx;
      },
      ...a.steps.map<Step>((st) => (g, c) => (c.v[key] === 0 ? st(g, c) : undefined)),
      ...b.steps.map<Step>((st) => (g, c) => (c.v[key] === 1 ? st(g, c) : undefined)),
    ],
    tags: [...new Set([...a.tags, ...b.tags])],
    can: a.can && b.can ? (g, c) => a.can!(g, c) || b.can!(g, c) : undefined,
  };
}
const selCan =
  (sel: Sel, extra?: Extra): Test =>
  (g, c) =>
    pool(g, c, sel, extra).length >= (sel.fixed || sel.all || sel.upTo ? 1 : sel.max);

type Zone = 'hand' | 'trash' | 'deck';

/** Choose cards from a hidden zone (hand / trash) and do something with them. */
function fromZone(o: { zone: Zone; who?: 'me' | 'opp'; chooser?: 'me' | 'opp'; n: number; upTo: boolean; d: Desc | null; prompt: string; intent: Intent; done: (g: Game, c: Ctx, pid: PlayerId, uids: number[]) => void }): { steps: Step[]; can: Test } {
  const owner = (c: Ctx): PlayerId => (o.who === 'opp' ? opp(c.player) : c.player);
  const list = (g: Game, c: Ctx): number[] => P(g, owner(c))[o.zone].filter((u) => u !== c.src && (!o.d || (o.d.cat(defOf(g, u)) && o.d.pred(g, c, u))));
  return {
    steps: [
      (g, c) => {
        c.sel = [];
        c.v.did = 0;
        const opts = list(g, c);
        if (!opts.length) return;
        const max = Math.min(o.n, opts.length);
        const player = (o.chooser ?? o.who) === 'opp' ? opp(c.player) : c.player;
        return { kind: 'select', player, prompt: pretty(o.prompt), options: opts, shown: o.zone === 'hand' ? undefined : opts, min: o.upTo ? 0 : max, max, intent: o.intent, source: c.cardId };
      },
      (g, c) => {
        if (!c.sel.length) return;
        o.done(g, c, owner(c), c.sel);
        c.v.did = 1;
      },
    ],
    can: (g, c) => list(g, c).length >= o.n,
  };
}

const moveCards = (g: Game, pid: PlayerId, from: Zone, uids: number[], to: (u: number) => void): void => {
  const z = P(g, pid)[from];
  for (const u of uids) {
    const i = z.indexOf(u);
    if (i < 0) continue;
    z.splice(i, 1);
    to(u);
  }
};

const drawStep =
  (n: number): Step =>
  (g, c) => {
    const k = draw(g, c.player, n);
    log(g, c.player, `${sv(g, c.player, 'draw')} ${plural(k)}.`, 'effect');
    if (k) emit(g, { type: 'drawFx', player: c.player, uid: 0, n: k, by: c.player, how: '', other: 0 });
  };

/** Put a Character or Stage card (already taken out of its zone) into play. */
function putIntoPlay(g: Game, pid: PlayerId, u: number, rested: boolean, from: string): void {
  if (defOf(g, u).category === 'Stage') placeStage(g, pid, u);
  else playCharacter(g, pid, u, rested, from);
}
const playable = (g: Game, c: Ctx, u: number, d: Desc): boolean => {
  const def = defOf(g, u);
  if (def.category !== 'Character' && def.category !== 'Stage') return false;
  if (def.sim === 'none' || u === c.src) return false;
  if (def.category === 'Character' && !canPlayChar(g, c.player, def)) return false;
  return d.cat(def) && d.pred(g, c, u);
};

function playFromZones(zones: Zone[], k: number, d: Desc, what: string, rested: boolean): Step[] {
  return [
    (g, c) => {
      c.sel = [];
      const p = P(g, c.player);
      const opts = zones.flatMap((z) => p[z].filter((u) => playable(g, c, u, d)));
      if (!opts.length) {
        if (zones.includes('deck')) shuffle(g, p.deck);
        return;
      }
      const hidden = zones.length === 1 && zones[0] === 'hand';
      return { kind: 'select', player: c.player, prompt: pretty(`Play up to ${k} ${what} from your ${zones.join(' or ')}${rested ? ' rested' : ''}.`), options: opts, shown: hidden ? undefined : opts, min: 0, max: Math.min(k, opts.length), intent: 'play', source: c.cardId };
    },
    (g, c) => {
      const p = P(g, c.player);
      for (const u of c.sel) {
        for (const z of zones) {
          const i = p[z].indexOf(u);
          if (i < 0) continue;
          p[z].splice(i, 1);
          putIntoPlay(g, c.player, u, rested, z);
          break;
        }
      }
      if (zones.includes('deck')) shuffle(g, p.deck);
    },
  ];
}

type RestOf = 'bottom' | 'trash' | 'top' | 'choice';
/** "Look at N cards from the top of your deck; reveal up to K <cards> and add them to your hand / play them." */
function searchSteps(n: number, k: number, d: Desc, what: string, mode: 'hand' | 'play' | 'playRested', rest: RestOf): Step[] {
  const steps: Step[] = [
    (g, c) => {
      const p = P(g, c.player);
      c.list = p.deck.slice(0, n);
      c.sel = [];
      if (!c.list.length) return;
      const opts = c.list.filter((u) => (mode === 'hand' ? d.cat(defOf(g, u)) && d.pred(g, c, u) : playable(g, c, u, d)));
      const verb = mode === 'hand' ? 'Reveal' : 'Play';
      return { kind: 'select', player: c.player, prompt: pretty(`Top ${c.list.length} cards of your deck. ${verb} up to ${k} ${what}${mode === 'hand' ? ' and add to your hand' : ''}.`), options: opts, shown: [...c.list], min: 0, max: Math.min(k, opts.length), intent: mode === 'hand' ? 'search' : 'play', source: c.cardId };
    },
    (g, c) => {
      const p = P(g, c.player);
      p.deck = p.deck.filter((u) => !c.list.includes(u));
      const others = c.list.filter((u) => !c.sel.includes(u));
      if (rest === 'trash') p.trash.push(...others);
      else if (rest === 'bottom') p.deck.push(...others);
      else p.deck.unshift(...others);
      for (const u of c.sel) {
        if (mode === 'hand') {
          p.hand.push(u);
          log(g, c.player, `${sv(g, c.player, 'reveal')} ${nameOf(g, u)} and ${vb(g, c.player, 'add')} it to hand.`, 'effect');
        } else putIntoPlay(g, c.player, u, mode === 'playRested', 'deck');
      }
      if (!c.sel.length && c.list.length) log(g, c.player, `${srcName(c)} finds nothing to take.`, 'effect');
      c.list = rest === 'choice' ? others : [];
    },
  ];
  if (rest === 'choice') {
    steps.push(
      (_g, c) => {
        c.sel = [];
        if (c.list.length) return { kind: 'select', player: c.player, prompt: 'The rest go back on your deck. Choose any to put on the BOTTOM — the others stay on top.', options: [...c.list], shown: [...c.list], min: 0, max: c.list.length, intent: 'deckOrder', source: c.cardId };
      },
      (g, c) => {
        const p = P(g, c.player);
        p.deck = p.deck.filter((u) => !c.sel.includes(u));
        p.deck.push(...c.sel);
        c.list = [];
      },
    );
  }
  return steps;
}

const mod = (g: Game, c: Ctx, t: FieldCard, stat: 'power' | 'cost' | 'base', amount: number, span: Span): void => {
  addModFor(g, c.player, t, stat, amount, span);
  const now = stat === 'cost' ? costOf(g, t) : powerOf(g, t);
  const what = stat === 'base' ? `base power becomes ${amount}` : `gets ${amount > 0 ? '+' : ''}${amount} ${stat}`;
  log(g, c.player, `${srcName(c)}: ${D(t.id).name} ${what} ${spanWords(span)} (now ${now}).`, 'effect');
};
const flag = (g: Game, c: Ctx, t: FieldCard, f: Flag, span: Span, words: string): void => {
  addFlagFor(g, c.player, t, f, span);
  log(g, c.player, `${srcName(c)}: ${D(t.id).name} ${words} ${spanWords(span)}.`, 'effect');
};

/** A power buff. In the Counter Step it goes straight onto the card under attack when that card qualifies. */
function buff(sel: Sel, amount: number, span: Span, prompt: string): Step[] {
  const fn: Apply = (g, c, t) => mod(g, c, t, 'power', amount, span);
  const ask = pick(sel, prompt, amount > 0 ? 'buff' : 'debuff', fn);
  if (sel.fixed || sel.all || amount < 0) return ask;
  const key = `k${seq++}`;
  return [
    (g, c) => {
      c.v[key] = 0;
      const b = g.battle;
      const t = b ? findField(g, b.target) : null;
      if (!b || !t || span !== 'battle' || ownerOf(b.target) !== c.player || g.active === c.player) return;
      if (!candidates(g, c, sel).some((x) => x.uid === t.uid)) return;
      remember(c, sel, [t.uid]);
      fn(g, c, t);
      c.v[key] = 1;
      c.v.did = 1;
    },
    ...ask.map<Step>((s) => (g, c) => (c.v[key] ? undefined : s(g, c))),
  ];
}

const lifeTake = (g: Game, pid: PlayerId, bottom: boolean): number | null => {
  const p = P(g, pid);
  const lc = bottom ? p.life.pop() : p.life.shift();
  if (!lc) return null;
  emit(g, { type: 'lifeLost', player: pid, uid: lc.uid, n: 1, by: pid, how: 'effect', other: 0 });
  return lc.uid;
};

// ---------------------------------------------------------------- single sentences

function parseAtom(s: string, env: Env, rest: string[], text: string): Act | null {
  let m: RegExpExecArray | null;
  const n = (x: string): number => +x;
  const dur = (x: string | undefined): Span | null => parseDur(x);

  // Wordings that mean the same as a sentence the parser already knows.
  const before = s;
  s = s
    .replace(/ gains? an additional \+/i, ' gains +')
    .replace(/^none of (your .+?) can be /i, 'all of $1 cannot be ')
    .replace(/^they (trash|place) /i, (_x, v: string) => `your opponent ${/trash/i.test(v) ? 'trashes' : 'places'} `)
    .replace(/^your opponent chooses (\d+) cards? from their hand and trashes (?:it|them)$/i, 'your opponent trashes $1 cards from their hand')
    .replace(/^reveal 1 card from the top of your deck(?: and|,) (play|add) up to/i, 'look at 1 card from the top of your deck; $1 up to')
    .replace(new RegExp(`^give ([-+]\\d+ (?:power|cost)) ${DUR} to (.+)$`, 'i'), 'give $3 $1 $2')
    .replace(/^(this Character gains \[Rush(?:: Character)?\])$/i, '$1 during this turn')
    .replace(/^trash up to (\d+) of your opponent's Life cards$/i, "trash up to $1 cards from the top of your opponent's Life cards")
    .replace(/ of the owner's choosing$/i, '')
    .replace(/^(your opponent (?:places|returns) \d+ cards? from their hand at the (?:top|bottom) of their deck) in any order$/i, '$1')
    .replace(new RegExp(`^the base power of (.+?) becomes (\\d+) ${DUR}$`, 'i'), 'set the base power of $1 to $2 $3');
  const revealOne = /^reveal 1 card/i.test(before) && s !== before;

  // ---- choosing first, acting on "that card" afterwards
  if ((m = /^(?:select|choose) (.+)$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (sels) return { steps: pickEach(sels, text, (sel) => (sel.side === 'own' ? 'buff' : 'debuff'), () => undefined), tags: [] };
  }
  if ((m = /^(KO|rest) or (KO|rest) (.+)$/i.exec(s))) {
    const [a, b] = [parseAtom(`${m[1]} ${m[3]}`, env, [], text), parseAtom(`${m[2]} ${m[3]}`, env, [], text)];
    return a && b ? either(a, b, `${m[1]} it`, `${m[2]} it`) : null;
  }
  if ((m = /^rest up to (\d+) of your opponent's DON!! cards? or (.+)$/i.exec(s))) {
    const [a, b] = [parseAtom(`rest up to ${m[1]} of your opponent's DON!! cards`, env, [], text), parseAtom(`rest up to ${m[1]} of your opponent's ${m[2]}`, env, [], text)];
    return a && b ? either(a, b, `Rest up to ${m[1]} of their DON!! cards`, `Rest up to ${m[1]} of their ${m[2]}`) : null;
  }
  if ((m = /^rest up to a total of (\d+) of your opponent's (?:Characters or DON!! cards|DON!! cards or Characters)$/i.exec(s))) {
    const total = n(m[1]);
    const sel = parseSel(`up to ${total} of your opponent's Characters`)!;
    return {
      steps: [
        ...pick(sel, `${text} Characters you do not choose here are replaced by resting their DON!! cards.`, 'rest', (g, c, t) => {
          restCard(g, t, c.player, 'effect');
          log(g, c.player, `${srcName(c)} rests ${D(t.id).name}.`, 'effect');
        }, (_g, _c, t) => !t.rested),
        (g, c) => {
          const o = P(g, opp(c.player));
          const k = Math.min(total - (c.those?.length ?? 0), o.donActive);
          if (k <= 0) return;
          o.donActive -= k;
          o.donRested += k;
          log(g, c.player, `${srcName(c)} rests ${k} of ${own(g, opp(c.player), false)} DON!!.`, 'effect');
        },
      ],
      tags: ['rest'],
    };
  }

  // ---- hidden information
  if ((m = /^look at (\d+) cards? from the top of your opponent's deck$/i.exec(s))) {
    return {
      steps: [
        (g, c): Choice | undefined => {
          const top = P(g, opp(c.player)).deck.slice(0, n(m![1]));
          log(g, c.player, `${sv(g, c.player, 'look')} at the top ${plural(top.length)} of ${own(g, opp(c.player), false)} deck.`, 'effect');
          if (top.length) return { kind: 'select', player: c.player, prompt: `The top of your opponent's deck (${srcName(c)}). Nothing to choose — just remember it.`, options: [], shown: top, min: 0, max: 0, intent: 'search', source: c.cardId };
        },
      ],
      tags: [],
    };
  }
  if ((m = /^choose a cost and reveal (\d+) cards? from the top of your opponent's deck$/i.exec(s)) && n(m[1]) === 1) {
    return {
      steps: [
        (_g, c): Choice => ({ kind: 'option', player: c.player, prompt: `${srcName(c)} — guess the cost of the top card of your opponent's deck:`, labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], tag: 'guessCost', source: c.cardId }),
        (g, c) => {
          const u = P(g, opp(c.player)).deck[0];
          c.v.guess = c.idx;
          c.v.that = u ?? 0;
          c.v.hit = u !== undefined && defOf(g, u).cost === c.idx ? 1 : 0;
          if (u !== undefined) log(g, c.player, `${sv(g, c.player, 'guess')} cost ${c.idx}; the top card of ${own(g, opp(c.player), false)} deck is ${nameOf(g, u)} (cost ${defOf(g, u).cost}) — ${c.v.hit ? 'correct!' : 'wrong.'}`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if ((m = /^look at all (?:of )?(your|your opponent's) Life cards and place them back in (?:your|their) Life area in any order$/i.exec(s))) {
    const mine = /^your$/i.test(m[1]);
    return {
      steps: [
        (g, c): Choice | undefined => {
          c.sel = [];
          const life = P(g, mine ? c.player : opp(c.player)).life.map((l) => l.uid);
          if (life.length > 1) return { kind: 'select', player: c.player, prompt: `${mine ? 'Your' : "Your opponent's"} Life cards. Click them in the order you want them, TOP card first.`, options: life, shown: life, min: life.length, max: life.length, intent: 'order', source: c.cardId };
        },
        (g, c) => {
          const p = P(g, mine ? c.player : opp(c.player));
          if (c.sel.length !== p.life.length) return;
          p.life = c.sel.map((u) => p.life.find((l) => l.uid === u)!).filter(Boolean);
          log(g, c.player, `${sv(g, c.player, 'rearrange')} ${mine ? own(g, c.player, false) : own(g, opp(c.player), false)} Life cards.`, 'effect');
        },
      ],
      tags: ['life'],
    };
  }
  if ((m = /^your opponent draws (\d+) cards?$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const k = draw(g, opp(c.player), n(m![1]));
          log(g, c.player, `${sv(g, opp(c.player), 'draw')} ${plural(k)}.`, 'effect');
        },
      ],
      tags: [],
    };
  }

  // ---- the opponent chooses which of their own cards
  if ((m = /^your opponent (?:returns|places|chooses) (\d+) of their (.+?)(?: and returns? (?:it|them))? (to the owner's hand|at the bottom of the owner's deck)$/i.exec(s))) {
    const sel = parseSel(`${m[1]} of your opponent's ${m[2]}`);
    const mode: RemoveMode = /hand/i.test(m[3]) ? 'hand' : 'bottom';
    if (sel) return { steps: pick(sel, `${text} (your opponent's effect — you choose which)`, 'sacrifice', (g, c, t) => removeByEffect(g, c.player, t.uid, mode), notLeader, 'opp'), tags: ['bounce'] };
  }
  if ((m = /^give up to (\d+) (?:rested DON!! cards?|DON!! cards? from (?:its owner's|your opponent's) cost area) to its owner's Leader or (\d+) of their Characters$/i.exec(s))) {
    const k = n(m[1]);
    const anyDon = /cost area/i.test(s);
    const desc = parseDesc('Leader or Character cards')!;
    const sel: Sel = { side: 'opp', all: false, max: 1, upTo: true, desc, text: m[0] };
    return {
      steps: pick(sel, text, 'giveDon', (g, c, t) => {
        const o = P(g, opp(c.player));
        let x = Math.min(k, o.donRested);
        o.donRested -= x;
        if (anyDon && x < k) {
          const y = Math.min(k - x, o.donActive);
          o.donActive -= y;
          x += y;
        }
        if (!x) return;
        t.don += x;
        log(g, c.player, `${srcName(c)} gives ${x} of ${own(g, opp(c.player), false)} DON!! to ${D(t.id).name}.`, 'effect');
      }),
      tags: ['disrupt'],
    };
  }
  if ((m = /^play (?:up to )?(\d+) (.+?) from your (hand|trash) (with .+?)( rested)?$/i.exec(s))) {
    const d = parseDesc(`${m[2]} ${m[4]}`);
    if (d) return { steps: playFromZones([m[3].toLowerCase() as Zone], n(m[1]), d, `${m[2]} ${m[4]}`, !!m[5]), tags: ['play'] };
  }

  // ---- this card coming back from the trash
  if ((m = /^play this (?:Character )?card from your trash( rested)?$/i.exec(s))) {
    const rested = !!m[1];
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          const i = p.trash.indexOf(c.src);
          if (i < 0 || !canPlayChar(g, c.player, D(c.cardId))) return;
          p.trash.splice(i, 1);
          playCharacter(g, c.player, c.src, rested, 'trash');
        },
      ],
      tags: ['play'],
    };
  }

  // ---- whole hands
  if (/^return all cards in your hand to your deck and shuffle your deck$/i.test(s) || /^your opponent returns all cards in their hand to their deck and shuffles their deck$/i.test(s)) {
    const theirs = /^your opponent/i.test(s);
    return {
      steps: [
        (g, c) => {
          const pid = theirs ? opp(c.player) : c.player;
          const p = P(g, pid);
          const k = p.hand.length;
          p.deck.push(...p.hand.splice(0));
          shuffle(g, p.deck);
          log(g, c.player, `${sv(g, pid, 'return')} ${plural(k)} from hand to the deck and ${vb(g, pid, 'shuffle')}.`, 'effect');
        },
      ],
      tags: theirs ? ['disrupt'] : [],
    };
  }
  if (/^trash all cards from your hand$/i.test(s)) return { steps: [(g, c) => trashFromHand(g, c.player, [...P(g, c.player).hand])], tags: ['discard'] };
  if (/^place all cards in your hand at the bottom of your deck(?: in any order)?$/i.test(s)) {
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          const k = p.hand.length;
          p.deck.push(...p.hand.splice(0));
          log(g, c.player, `${sv(g, c.player, 'place')} ${plural(k)} from hand at the bottom of the deck.`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if ((m = /^trash cards from your hand until you have (\d+) cards? in your hand$/i.exec(s))) {
    const keep = n(m[1]);
    return {
      steps: [
        (g, c) => {
          c.sel = [];
          const h = P(g, c.player).hand;
          const extra = h.length - keep;
          if (extra > 0) return { kind: 'select', player: c.player, prompt: `Trash ${plural(extra)} from your hand (down to ${keep}).`, options: [...h], min: extra, max: extra, intent: 'discard', source: c.cardId };
        },
        (g, c) => {
          if (c.sel.length) trashFromHand(g, c.player, c.sel);
        },
      ],
      tags: ['discard'],
    };
  }
  if ((m = /^draw up to (\d+) cards?$/i.exec(s))) return { steps: [drawStep(n(m[1]))], tags: ['draw'] };
  if ((m = /^your opponent (?:places|returns) (\d+) (.+?) from their trash (?:at|to) the bottom of their deck(?: in any order)?$/i.exec(s)) || (m = /^place (up to )(\d+) (.+?) from your opponent's trash at the bottom of (?:their|the owner's) deck(?: in any order)?$/i.exec(s))) {
    const mineToChoose = /^place/i.test(s);
    const [count, what] = mineToChoose ? [n(m[2]), m[3]] : [n(m[1]), m[2]];
    const d = /^cards?$/i.test(what) ? null : parseDesc(what);
    if (/^cards?$/i.test(what) || d) {
      const z = fromZone({
        zone: 'trash',
        who: 'opp',
        chooser: mineToChoose ? 'me' : 'opp',
        n: count,
        upTo: mineToChoose,
        d,
        prompt: mineToChoose ? text : `${text} (your opponent's effect)`,
        intent: mineToChoose ? 'discard' : 'deckOrder',
        done: (g, c, pid, uids) => {
          moveCards(g, pid, 'trash', uids, (u) => P(g, pid).deck.push(u));
          log(g, c.player, `${plural(uids.length)} from ${own(g, pid, false)} trash ${uids.length === 1 ? 'goes' : 'go'} to the bottom of the deck.`, 'effect');
        },
      });
      return { steps: z.steps, tags: ['disrupt'] };
    }
  }

  // ---- Life
  if ((m = /^add (?:up to )?(\d+) cards? from the top of your deck to the top of your Life cards( at the end of this turn)?$/i.exec(s))) {
    if (m[2]) return { steps: [(g, c) => void rulesOf(P(g, c.player)).push({ kind: 'endGainLife', n: n(m![1]), exp: g.turn })], tags: ['life'] };
    return { steps: [fx.gainLife(n(m[1]))], tags: ['life'] };
  }
  if ((m = /^your opponent adds (\d+) cards? from (?:the top of their Life cards|their Life area) to their hand$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const o = opp(c.player);
          for (let i = 0; i < n(m![1]); i++) {
            const u = lifeTake(g, o, false);
            if (u === null) break;
            P(g, o).hand.push(u);
            log(g, c.player, `${srcName(c)}: ${sv(g, o, 'add')} a Life card to hand (${P(g, o).life.length} left).`, 'damage');
          }
        },
      ],
      tags: ['life'],
    };
  }
  if (/^add all of your Life cards to your hand$/i.test(s) || /^trash all of your Life cards$/i.test(s)) {
    const toHand = /^add/i.test(s);
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          let k = 0;
          for (;;) {
            const u = lifeTake(g, c.player, false);
            if (u === null) break;
            (toHand ? p.hand : p.trash).push(u);
            k++;
          }
          c.v.did = k ? 1 : 0;
          log(g, c.player, `${sv(g, c.player, toHand ? 'add' : 'trash')} all ${k} Life cards${toHand ? ' to hand' : ''}.`, 'effect');
        },
      ],
      tags: ['life'],
      can: (g, c) => P(g, c.player).life.length > 0 && !(toHand && lifeLocked(g, c.player)),
    };
  }
  if ((m = /^deal (\d+) damage to your opponent$/i.exec(s)) || (m = /^you take (\d+) damage$/i.exec(s))) {
    const me = /^you take/i.test(s);
    return { steps: [(g, c) => dealDamage(g, me ? c.player : opp(c.player), n(m![1]))], tags: [me ? 'life' : 'damage'] };
  }
  if ((m = /^reveal (\d+) cards? from the top of your Life cards$/i.exec(s)) && n(m[1]) === 1) {
    return {
      steps: [
        (g, c) => {
          const top = P(g, c.player).life[0];
          c.v.that = top?.uid ?? 0;
          if (top) log(g, c.player, `${sv(g, c.player, 'reveal')} ${nameOf(g, top.uid)} from the top of the Life cards.`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if ((m = /^turn (\d+) cards? from the top( or bottom)? of your Life cards face-(up|down)$/i.exec(s))) {
    const k = n(m[1]);
    const up = /up/i.test(m[3]);
    const eitherEnd = !!m[2];
    const part = (g: Game, c: Ctx, bottom: boolean): { faceUp: boolean }[] => (bottom ? P(g, c.player).life.slice(-k) : P(g, c.player).life.slice(0, k));
    const ok = (g: Game, c: Ctx, bottom: boolean): boolean => part(g, c, bottom).length >= k && part(g, c, bottom).every((l) => l.faceUp !== up);
    return {
      steps: [
        (g, c) => {
          const bottom = eitherEnd && !ok(g, c, false);
          c.v.did = 0;
          if (!ok(g, c, bottom)) return;
          for (const l of part(g, c, bottom)) l.faceUp = up;
          c.v.did = 1;
          log(g, c.player, `${sv(g, c.player, 'turn')} ${plural(k, 'Life card')} face-${up ? 'up' : 'down'}.`, 'effect');
        },
      ],
      tags: ['life'],
      can: (g, c) => ok(g, c, false) || (eitherEnd && ok(g, c, true)),
    };
  }
  if ((m = /^turn (\d+) of your face-up Life cards face-down$/i.exec(s))) {
    const k = n(m[1]);
    return {
      steps: [
        (g, c) => {
          let left = k;
          for (const l of P(g, c.player).life) {
            if (left > 0 && l.faceUp) {
              l.faceUp = false;
              left--;
            }
          }
          c.v.did = left < k ? 1 : 0;
        },
      ],
      tags: ['life'],
      can: (g, c) => P(g, c.player).life.filter((l) => l.faceUp).length >= k,
    };
  }
  if ((m = /^(?:add|place) (.+?) (?:to|at) the top or bottom of (?:the owner's|your opponent's|their|your) Life cards( face-up| face-down)?$/i.exec(s))) {
    const faceUp = !/down/i.test(m[2] ?? '');
    const key = `k${seq++}`;
    const spot = (any: Test): Step[] => [
      (g, c): Choice | undefined => {
        c.idx = 0;
        if (any(g, c)) return { kind: 'option', player: c.player, prompt: `${srcName(c)} — where in the Life cards should it go?`, labels: ['Top of the Life cards', 'Bottom of the Life cards'], tag: 'lifeSpot', source: c.cardId };
      },
      (_g, c) => {
        c.v[key] = c.idx;
      },
    ];
    const hm = /^up to (\d+) (.+?) from your (hand|trash)$/i.exec(m[1]);
    if (hm) {
      const d = /^cards?$/i.test(hm[2]) ? null : parseDesc(hm[2]);
      const zone = hm[3].toLowerCase() as Zone;
      if (/^cards?$/i.test(hm[2]) || d) {
        const z = fromZone({
          zone,
          n: n(hm[1]),
          upTo: true,
          d,
          prompt: text,
          intent: 'toLife',
          done: (g, c, pid, uids) =>
            moveCards(g, pid, zone, uids, (u) => {
              if (c.v[key] === 1) P(g, pid).life.push({ uid: u, faceUp });
              else P(g, pid).life.unshift({ uid: u, faceUp });
              log(g, c.player, `${sv(g, pid, 'add')} a card from ${zone} to the ${c.v[key] === 1 ? 'bottom' : 'top'} of Life (${P(g, pid).life.length} Life).`, 'effect');
            }),
        });
        return { steps: [...spot(z.can), ...z.steps], tags: ['life'] };
      }
    } else {
      const sels = parseSels(m[1]);
      if (sels) {
        const any: Test = (g, c) => sels.some((sel) => pool(g, c, sel, notLeader).length > 0);
        return {
          steps: [
            ...spot(any),
            ...pickEach(
              sels,
              text,
              (sel) => (sel.side === 'own' ? 'sacrifice' : 'bottomDeck'),
              (g, c, t) => {
                const owner = ownerOf(t.uid);
                const bottom = c.v[key] === 1;
                removeByEffect(g, c.player, t.uid, bottom ? 'lifeBottom' : 'life');
                const life = P(g, owner).life;
                const lc = bottom ? life[life.length - 1] : life[0];
                if (!faceUp && lc && lc.uid === t.uid) lc.faceUp = false;
              },
              notLeader,
            ),
          ],
          tags: sels.every((sel) => sel.side === 'own') ? ['life'] : ['bounce'],
          can: (g, c) => sels.every((sel) => selCan(sel, notLeader)(g, c)),
        };
      }
    }
  }
  if ((m = /^add up to (\d+) (.+?) from your trash to the top of your Life cards( face-up| face-down)?$/i.exec(s)) || (m = /^reveal up to (\d+) (.+?) from your hand and add (?:it|them) to the top of your Life cards( face-up| face-down)?$/i.exec(s))) {
    const zone: Zone = /^reveal/i.test(s) ? 'hand' : 'trash';
    const d = /^cards?$/i.test(m[2]) ? null : parseDesc(m[2]);
    const faceUp = /up/i.test(m[3] ?? '');
    if (/^cards?$/i.test(m[2]) || d) {
      const z = fromZone({
        zone,
        n: n(m[1]),
        upTo: true,
        d,
        prompt: text,
        intent: 'toLife',
        done: (g, c, pid, uids) =>
          moveCards(g, pid, zone, uids, (u) => {
            P(g, pid).life.unshift({ uid: u, faceUp });
            log(g, c.player, `${sv(g, pid, 'add')} ${zone === 'hand' ? 'a card from hand' : nameOf(g, u)} to the top of Life (${P(g, pid).life.length} Life).`, 'effect');
          }),
      });
      return { steps: z.steps, tags: ['life'] };
    }
  }
  if (/^you cannot add Life cards to your hand using your own effects during this turn$/i.test(s)) {
    return {
      steps: [
        (g, c) => {
          rulesOf(P(g, c.player)).push({ kind: 'noLifeToHand', n: 0, exp: g.turn });
          log(g, c.player, `${sv(g, c.player, 'can')}not add Life cards to hand with ${own(g, c.player, false)} own effects for the rest of this turn.`, 'effect');
        },
      ],
      tags: [],
    };
  }

  // ---- DON!! moved in unusual ways
  if ((m = /^give (\d+) (?:of your )?active DON!! cards? to (.+)$/i.exec(s))) {
    const k = n(m[1]);
    const sels = ownSels(m[2]);
    if (sels) {
      return {
        steps: pickEach(sels, text, 'giveDon', (g, c, t) => {
          const p = P(g, c.player);
          const x = Math.min(k, p.donActive);
          if (x <= 0 || p.stage?.uid === t.uid) return;
          p.donActive -= x;
          t.don += x;
          log(g, c.player, `${srcName(c)} gives ${x} active DON!! to ${D(t.id).name}.`, 'effect');
          emit(g, { type: 'donGiven', player: c.player, uid: t.uid, n: x, by: c.player, how: 'effect', other: 0 });
        }),
        tags: ['don'],
        can: (g, c) => P(g, c.player).donActive >= k && sels.every((sel) => selCan(sel)(g, c)),
      };
    }
  }
  if ((m = /^give (up to )?(\d+) (?:of your opponent's rested DON!! cards?|DON!! cards? from your opponent's cost area) to (\d+) of your opponent's (.+)$/i.exec(s))) {
    const k = n(m[2]);
    const anyDon = /cost area/i.test(s);
    const sel = parseSel(`${m[3]} of your opponent's ${m[4]}`);
    if (sel) {
      const have = (g: Game, c: Ctx): number => P(g, opp(c.player)).donRested + (anyDon ? P(g, opp(c.player)).donActive : 0);
      return {
        steps: pick(
          sel,
          text,
          'giveDon',
          (g, c, t) => {
            const o = P(g, opp(c.player));
            let x = Math.min(k, o.donRested);
            o.donRested -= x;
            if (anyDon && x < k) {
              const y = Math.min(k - x, o.donActive);
              o.donActive -= y;
              x += y;
            }
            if (!x) return;
            t.don += x;
            log(g, c.player, `${srcName(c)} gives ${x} of ${own(g, opp(c.player), false)} DON!! to ${D(t.id).name}.`, 'effect');
          },
          notLeader,
        ),
        tags: ['disrupt'],
        can: (g, c) => have(g, c) >= k && selCan(sel, notLeader)(g, c),
      };
    }
  }
  if ((m = /^return (\d+) of your active DON!! cards? to your DON!! deck$/i.exec(s))) {
    const k = n(m[1]);
    return {
      steps: [
        (g, c) => {
          returnDon(g, c.player, k, c.player, true);
          log(g, c.player, `${sv(g, c.player, 'return')} ${k} active DON!! to the DON!! deck.`, 'effect');
        },
      ],
      tags: [],
      can: (g, c) => P(g, c.player).donActive >= k,
    };
  }
  if (/^set all of your DON!! cards as active$/i.test(s)) return { steps: [fx.untapDon(10)], tags: ['ramp'] };
  if ((m = /^give (up to )?(\d+) rested DON!! cards? to each of (your .+)$/i.exec(s)) || (m = /^give (.+?) up to (\d+) rested DON!! cards? each$/i.exec(s))) {
    const each = /^give (?:up to )?\d/i.test(s);
    const sels = each ? parseSels(`all of ${m[3]}`) : ownSels(m[1]);
    const count = n(m[2]);
    if (sels) return { steps: pickEach(sels, text, 'giveDon', giveRested(count)), tags: ['don'] };
  }

  // ---- end of turn and next turn
  if ((m = /^set (.+) as active at the end of this turn$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (sels) {
      return {
        steps: pickEach(sels, text, 'untap', (g, c, t) => {
          rulesOf(P(g, g.active)).push({ kind: 'endActive', n: t.uid, exp: g.turn });
          log(g, c.player, `${D(t.id).name} will be set as active at the end of this turn.`, 'effect');
        }),
        tags: ['untap'],
      };
    }
  }

  // ---- power that depends on the board
  if ((m = new RegExp(`^(.+?)(?:'s base power becomes| becomes) the same(?: power)? as (?:the power of )?your opponent's Leader(?:'s power)? ${DUR}$`, 'i').exec(s))) {
    const sels = parseSels(m[1]);
    const span = dur(m[2]);
    if (sels && span) return { steps: pickEach(sels, text, 'buff', (g, c, t) => mod(g, c, t, 'base', powerOf(g, P(g, opp(c.player)).leader), span)), tags: ['buff'] };
  }
  if ((m = new RegExp(`^(.+?) gains? \\+(\\d+) power for (?:each of|every) (.+?) ${DUR}$`, 'i').exec(s)) || (m = new RegExp(`^(.+?) gains? \\+(\\d+) power ${DUR} for (?:each of|every) (.+)$`, 'i').exec(s))) {
    const first = parseDur(m[3]) === null;
    const [what, when] = first ? [m[3], m[4]] : [m[4], m[3]];
    const sels = parseSels(m[1]);
    const count = parseCount(what);
    const span = dur(when);
    if (sels && count && span) return { steps: pickEach(sels, text, 'buff', (g, c, t) => mod(g, c, t, 'power', n(m![2]) * count(g, c), span)), tags: ['buff'] };
  }
  if ((m = /^(.+?) can attack Characters on the turn in which (?:it is|they are) played$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (sels) return { steps: pickEach(sels, text, 'buff', (g, c, t) => flag(g, c, t, 'Rush: Character', 'turn', 'can attack Characters on the turn it is played')), tags: ['buff'] };
  }

  // ---- cards in hand and deck
  if ((m = /^draw (\d+) cards?$/i.exec(s))) return { steps: [drawStep(n(m[1]))], tags: ['draw'], can: (g, c) => P(g, c.player).deck.length > n(m![1]) };
  if ((m = /^draw cards? (?:so that you have|until you have) (\d+) cards? in your hand$/i.exec(s))) {
    return { steps: [(g, c) => drawStep(Math.max(0, n(m![1]) - P(g, c.player).hand.length))(g, c)], tags: ['draw'] };
  }
  if ((m = /^trash (up to )?(\d+) (.+?) from your hand$/i.exec(s))) {
    const d = /^cards?$/i.test(m[3]) ? null : parseDesc(m[3]);
    if (!/^cards?$/i.test(m[3]) && !d) return null;
    const z = fromZone({ zone: 'hand', n: n(m[2]), upTo: !!m[1], d, prompt: text, intent: 'discard', done: (g, _c, pid, uids) => trashFromHand(g, pid, uids) });
    return { ...z, tags: ['discard'] };
  }
  if ((m = /^place (up to )?(\d+) (.+?) from your hand at the (top or bottom|bottom|top) of (?:your|the) deck(?: in any order)?$/i.exec(s))) {
    const d = /^cards?$/i.test(m[3]) ? null : parseDesc(m[3]);
    if (!/^cards?$/i.test(m[3]) && !d) return null;
    const top = /^top$/i.test(m[4]);
    const z = fromZone({
      zone: 'hand',
      n: n(m[2]),
      upTo: !!m[1],
      d,
      prompt: text,
      intent: 'discard',
      done: (g, c, pid, uids) => {
        moveCards(g, pid, 'hand', uids, (u) => (top ? P(g, pid).deck.unshift(u) : P(g, pid).deck.push(u)));
        log(g, c.player, `${sv(g, pid, 'place')} ${plural(uids.length)} from hand at the ${top ? 'top' : 'bottom'} of the deck.`, 'effect');
      },
    });
    return { ...z, tags: ['discard'] };
  }
  if ((m = /^your opponent (?:trashes|must trash) (\d+) cards? from their hand$/i.exec(s))) {
    return { ...fromZone({ zone: 'hand', who: 'opp', n: n(m[1]), upTo: false, d: null, prompt: `${text} (your opponent's effect)`, intent: 'discard', done: (g, _c, pid, uids) => trashFromHand(g, pid, uids) }), tags: ['disrupt'] };
  }
  if ((m = /^your opponent (?:places|must place|returns) (\d+) cards? from their hand at the (top|bottom) of their deck$/i.exec(s))) {
    const top = /top/i.test(m[2]);
    return {
      ...fromZone({
        zone: 'hand',
        who: 'opp',
        n: n(m[1]),
        upTo: false,
        d: null,
        prompt: `${text} (your opponent's effect)`,
        intent: 'discard',
        done: (g, c, pid, uids) => {
          moveCards(g, pid, 'hand', uids, (u) => (top ? P(g, pid).deck.unshift(u) : P(g, pid).deck.push(u)));
          log(g, c.player, `${sv(g, pid, 'place')} ${plural(uids.length)} from hand at the ${top ? 'top' : 'bottom'} of the deck.`, 'effect');
        },
      }),
      tags: ['disrupt'],
    };
  }
  if ((m = /^trash (\d+) cards? from your opponent's hand$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const o = opp(c.player);
          for (let i = 0; i < n(m![1]); i++) {
            const h = P(g, o).hand;
            if (!h.length) break;
            trashFromHand(g, o, [h[Math.floor(rand(g) * h.length)]]);
          }
        },
      ],
      tags: ['disrupt'],
    };
  }
  if ((m = /^trash (\d+) cards? from the top of (your|your opponent's) deck$/i.exec(s))) {
    const mine = /^your$/i.test(m[2]);
    return {
      steps: [
        (g, c) => {
          const pid = mine ? c.player : opp(c.player);
          const p = P(g, pid);
          const cards = p.deck.splice(0, n(m![1]));
          p.trash.push(...cards);
          if (cards.length) log(g, c.player, `${sv(g, pid, 'trash')} ${plural(cards.length)} from the top of the deck.`, 'effect');
        },
      ],
      tags: ['mill'],
      can: (g, c) => P(g, mine ? c.player : opp(c.player)).deck.length > n(m![1]),
    };
  }
  if (/^shuffle your deck$/i.test(s)) return { steps: [(g, c) => shuffle(g, P(g, c.player).deck)], tags: [] };

  // ---- looking at the top of the deck
  if ((m = /^look at (?:up to )?(\d+) cards? from the top of your deck(?:;|,| and) (reveal|play|add) (?:up to (?:a total of )?|a total of up to )(\d+) (.+)$/i.exec(s))) {
    const verb = m[2].toLowerCase();
    let what = m[4];
    let where: string | null = null;
    let after: string | undefined;
    let consumed = 0;
    // "..., add it to your hand and place the rest at the bottom of your deck in any order"
    const inm =
      /^(.+?),? (?:and|then|and then) (?:place|return) the rest (?:at|to) the (top or bottom|bottom|top) of (?:your|the) deck(?: in any order)?$/i.exec(what) ?? /^(.+?),? (?:and|then|and then) (trash) the rest$/i.exec(what);
    if (inm) {
      what = inm[1];
      where = inm[2];
    }
    const rested = / rested$/i.test(what);
    what = what
      .replace(/ rested$/i, '')
      .replace(/,? (?:and )?add (?:it|them) to your hand$/i, '')
      .replace(/ to your hand$/i, '');
    const d = parseDesc(what);
    if (!d) return null;
    if (!where) {
      const nx = (rest[0] ?? '').trim().replace(/\.$/, '').replace(/^then, /i, '');
      const rm = /^(?:place|return) the rest (?:at|to) the (top or bottom|bottom|top) of (?:your|the) deck(?: in any order)?(?:,? and (.+))?$/i.exec(nx) ?? /^(trash) the rest(?:,? and (.+))?$/i.exec(nx);
      if (rm) {
        where = rm[1];
        after = rm[2];
        consumed = 1;
      } else if (revealOne) where = 'top';
      else return null;
    }
    where = where.toLowerCase();
    const restOf: RestOf = where === 'trash' ? 'trash' : where === 'bottom' ? 'bottom' : where === 'top' ? 'top' : 'choice';
    const tail = after ? parseClause(after, env, []) : null;
    if (after && !tail) return null;
    const mode = verb === 'play' ? (rested ? 'playRested' : 'play') : 'hand';
    return { steps: [...searchSteps(n(m[1]), n(m[3]), d, what, mode, restOf), ...(tail?.steps ?? [])], tags: [mode === 'hand' ? 'search' : 'play', ...(tail?.tags ?? [])], consumed };
  }
  if ((m = /^look at (\d+) cards? from the top of your deck(?: and|, reorganize them in any order and) (?:place|return) them (?:at|to) the top or bottom of (?:the|your) deck(?: in any order)?$/i.exec(s))) return { steps: fx.scry(n(m[1])), tags: ['filter'] };
  if ((m = /^look at (\d+) cards? from the top of your deck and place them at the top of (?:the|your) deck in any order$/i.exec(s))) return { steps: [], tags: ['filter'] };
  if (/^look at up to 1 card from the top of your or your opponent's Life cards,? and place it at the top or bottom of the Life cards$/i.test(s)) return { steps: fx.lifeLook, tags: ['life'] };
  if ((m = /^reveal (\d+) cards? from the top of your deck$/i.exec(s)) && n(m[1]) === 1) {
    return {
      steps: [
        (g, c) => {
          const u = P(g, c.player).deck[0];
          c.v.that = u ?? 0;
          if (u !== undefined) log(g, c.player, `${sv(g, c.player, 'reveal')} ${nameOf(g, u)} from the top of the deck.`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if ((m = /^play (?:that|the revealed) card( rested)?$/i.exec(s))) {
    const rested = !!m[1];
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          const u = c.v.that ?? 0;
          const i = p.deck.indexOf(u);
          const li = p.life.findIndex((l) => l.uid === u);
          const def = i >= 0 || li >= 0 ? defOf(g, u) : null;
          c.v.did = 0;
          if (!def || (def.category !== 'Character' && def.category !== 'Stage') || def.sim === 'none') return;
          if (def.category === 'Character' && !canPlayChar(g, c.player, def)) return;
          if (i >= 0) p.deck.splice(i, 1);
          else p.life.splice(li, 1);
          c.v.that = 0;
          c.v.did = 1;
          putIntoPlay(g, c.player, u, rested, i >= 0 ? 'deck' : 'life');
        },
      ],
      tags: ['play'],
    };
  }
  if ((m = /^add (?:that|the revealed) card to your hand$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          const i = p.deck.indexOf(c.v.that ?? 0);
          if (i < 0) return;
          p.hand.push(p.deck.splice(i, 1)[0]);
          c.v.that = 0;
        },
      ],
      tags: ['draw'],
    };
  }
  if ((m = /^(?:place|trash) the (?:revealed card|rest)(?: at the (bottom|top) of your deck)?$/i.exec(s)) && /revealed/i.test(s)) {
    const toTrash = /^trash/i.test(s);
    const bottom = !/top/i.test(m[1] ?? 'bottom');
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          const i = p.deck.indexOf(c.v.that ?? 0);
          if (i < 0) return;
          const [u] = p.deck.splice(i, 1);
          if (toTrash) p.trash.push(u);
          else if (bottom) p.deck.push(u);
          else p.deck.unshift(u);
        },
      ],
      tags: [],
    };
  }

  // ---- playing and recovering cards
  if (/^play this card$/i.test(s)) return { steps: [fx.playSelf], tags: ['play'] };
  if (/^add this (?:Character )?card(?: from your trash)? to your hand$/i.test(s)) {
    return {
      steps: [
        (g, c) => {
          const li = g.limbo.indexOf(c.src);
          const ti = P(g, c.player).trash.indexOf(c.src);
          if (li < 0 && ti < 0) return;
          if (li >= 0) g.limbo.splice(li, 1);
          else P(g, c.player).trash.splice(ti, 1);
          P(g, c.player).hand.push(c.src);
          log(g, c.player, `${srcName(c)} goes to ${own(g, c.player, false)} hand.`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if ((m = /^activate this card's \[(Main|Counter|On Play|On KO|When Attacking|Trigger)\] effect$/i.exec(s))) return { steps: [], tags: [], ref: TIMING_REF[m[1]] };
  if ((m = /^play (?:up to )?(\d+) (?:of your )?(.+?) from your (hand|trash|deck|hand or trash|trash or hand|hand or deck|deck or hand)( rested)?$/i.exec(s))) {
    const d = parseDesc(m[2]);
    if (!d) return null;
    const zones = m[3].toLowerCase().split(' or ') as Zone[];
    return { steps: playFromZones(zones, n(m[1]), d, m[2], !!m[4]), tags: ['play'] };
  }
  if ((m = /^add up to (\d+) (?:of your )?(.+?) from your trash to your hand$/i.exec(s))) {
    const d = parseDesc(m[2]);
    if (!d) return null;
    const z = fromZone({
      zone: 'trash',
      n: n(m[1]),
      upTo: true,
      d,
      prompt: text,
      intent: 'recover',
      done: (g, c, pid, uids) =>
        moveCards(g, pid, 'trash', uids, (u) => {
          P(g, pid).hand.push(u);
          log(g, c.player, `${sv(g, pid, 'return')} ${nameOf(g, u)} from the trash to hand.`, 'effect');
        }),
    });
    return { steps: z.steps, tags: ['recover'] };
  }
  if ((m = /^(?:place|return) (up to )?(\d+) (.+?) from your trash (?:at|to) the (?:top or bottom|bottom|top) of (?:your|the) deck(?: in any order)?$/i.exec(s))) {
    const d = /^cards?$/i.test(m[3]) ? null : parseDesc(m[3]);
    if (!/^cards?$/i.test(m[3]) && !d) return null;
    const z = fromZone({
      zone: 'trash',
      n: n(m[2]),
      upTo: !!m[1],
      d,
      prompt: text,
      intent: 'deckOrder',
      done: (g, c, pid, uids) => {
        moveCards(g, pid, 'trash', uids, (u) => P(g, pid).deck.push(u));
        log(g, c.player, `${sv(g, pid, 'place')} ${plural(uids.length)} from the trash at the bottom of the deck.`, 'effect');
      },
    });
    return { ...z, tags: [] };
  }
  if ((m = /^reveal (\d+) (.+?) from your hand$/i.exec(s))) {
    const d = /^cards?$/i.test(m[2]) ? null : parseDesc(m[2]);
    if (!/^cards?$/i.test(m[2]) && !d) return null;
    const list = (g: Game, c: Ctx): number[] => P(g, c.player).hand.filter((u) => u !== c.src && (!d || (d.cat(defOf(g, u)) && d.pred(g, c, u))));
    return {
      steps: [(g, c) => log(g, c.player, `${sv(g, c.player, 'reveal')} ${list(g, c).slice(0, n(m![1])).map((u) => nameOf(g, u)).join(' and ')}.`, 'effect')],
      tags: [],
      can: (g, c) => list(g, c).length >= n(m![1]),
    };
  }

  // ---- Life
  if ((m = /^add up to (\d+) cards? from the top of your deck to the top of your Life cards$/i.exec(s))) return { steps: [fx.gainLife(n(m[1]))], tags: ['life'] };
  if ((m = /^add (up to )?(\d+) cards? from (?:the top( or bottom)? of your Life cards|your Life area) to your hand$/i.exec(s))) {
    const k = n(m[2]);
    const either = !!m[3] || /Life area/i.test(s);
    const key = `k${seq++}`;
    return {
      steps: [
        (g, c) => {
          c.idx = 0;
          c.v[key] = P(g, c.player).life.length;
          if (lifeLocked(g, c.player)) return;
          if (either && k === 1 && P(g, c.player).life.length > 1) return { kind: 'option', player: c.player, prompt: 'Add which Life card to your hand?', labels: ['Top card', 'Bottom card'], tag: 'lifeCost', source: c.cardId };
        },
        (g, c) => {
          const p = P(g, c.player);
          let got = 0;
          for (let i = 0; i < k && !lifeLocked(g, c.player); i++) {
            const u = lifeTake(g, c.player, c.idx === 1);
            if (u === null) break;
            p.hand.push(u);
            got++;
          }
          c.v.did = got ? 1 : 0;
          if (got) log(g, c.player, `${sv(g, c.player, 'add')} ${plural(got, 'Life card')} to hand (${p.life.length} Life left).`, 'effect');
        },
      ],
      tags: ['life'],
      can: (g, c) => P(g, c.player).life.length >= k && !lifeLocked(g, c.player),
    };
  }
  if ((m = /^trash (up to )?(\d+) cards? from the top of your opponent's Life cards$/i.exec(s))) return { steps: [fx.trashOppLife(n(m[2]))], tags: ['life'] };
  if ((m = /^trash (up to )?(\d+) cards? from the top(?: or bottom)? of your Life cards$/i.exec(s))) {
    const k = n(m[2]);
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          let got = 0;
          for (let i = 0; i < k; i++) {
            const u = lifeTake(g, c.player, false);
            if (u === null) break;
            p.trash.push(u);
            got++;
          }
          c.v.did = got ? 1 : 0;
          if (got) log(g, c.player, `${sv(g, c.player, 'trash')} ${plural(got, 'Life card')} (${p.life.length} Life left).`, 'effect');
        },
      ],
      tags: ['life'],
      can: (g, c) => P(g, c.player).life.length >= k,
    };
  }
  if ((m = /^trash cards from the top of your Life cards until you have (\d+) Life cards?$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const p = P(g, c.player);
          while (p.life.length > n(m![1])) {
            const u = lifeTake(g, c.player, false);
            if (u === null) break;
            p.trash.push(u);
          }
          log(g, c.player, `${sv(g, c.player, 'trash')} Life cards down to ${p.life.length}.`, 'effect');
        },
      ],
      tags: ['life'],
    };
  }
  if ((m = /^add up to (\d+) (.+?) from your hand to the top of your Life cards( face-up| face-down)?$/i.exec(s))) {
    const d = /^cards?$/i.test(m[2]) ? null : parseDesc(m[2]);
    if (!/^cards?$/i.test(m[2]) && !d) return null;
    const faceUp = /up/i.test(m[3] ?? '');
    const z = fromZone({
      zone: 'hand',
      n: n(m[1]),
      upTo: true,
      d,
      prompt: text,
      intent: 'toLife',
      done: (g, c, pid, uids) =>
        moveCards(g, pid, 'hand', uids, (u) => {
          P(g, pid).life.unshift({ uid: u, faceUp });
          log(g, c.player, `${sv(g, pid, 'add')} a card from hand to the top of Life (${P(g, pid).life.length} Life).`, 'effect');
        }),
    });
    return { steps: z.steps, tags: ['life'] };
  }
  if ((m = /^add up to (\d+) cards? from the top of your opponent's Life cards to (?:the owner's|their) hand$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          const o = opp(c.player);
          for (let i = 0; i < n(m![1]); i++) {
            const u = lifeTake(g, o, false);
            if (u === null) break;
            P(g, o).hand.push(u);
            log(g, c.player, `${srcName(c)} moves the top card of ${own(g, o, false)} Life to ${own(g, o, false)} hand (${P(g, o).life.length} left).`, 'damage');
          }
        },
      ],
      tags: ['life'],
    };
  }
  if ((m = /^turn (\d+) cards? from the top of your Life cards face-up$/i.exec(s))) {
    const k = n(m[1]);
    return {
      steps: [
        (g, c) => {
          let left = k;
          for (const lc of P(g, c.player).life) {
            if (left <= 0) break;
            if (!lc.faceUp) {
              lc.faceUp = true;
              left--;
            }
          }
          c.v.did = left < k ? 1 : 0;
          log(g, c.player, `${sv(g, c.player, 'turn')} ${plural(k - left, 'Life card')} face-up.`, 'effect');
        },
      ],
      tags: ['life'],
      can: (g, c) => P(g, c.player).life.filter((lc) => !lc.faceUp).length >= k,
    };
  }
  if (/^turn all of your Life cards face-down$/i.test(s)) {
    return {
      steps: [
        (g, c) => {
          for (const lc of P(g, c.player).life) lc.faceUp = false;
          log(g, c.player, `${sv(g, c.player, 'turn')} all Life cards face-down.`, 'effect');
        },
      ],
      tags: ['life'],
    };
  }

  // ---- DON!!
  if ((m = /^add (?:up to )?(\d+) DON!! cards? from your DON!! deck and (set (?:it|them) as active|rest (?:it|them))$/i.exec(s))) return { steps: [fx.addDon(n(m[1]), /active/i.test(m[2]))], tags: ['ramp'] };
  if ((m = /^add up to (\d+) DON!! cards? as (rested|active) from your DON!! deck$/i.exec(s))) return { steps: [fx.addDon(n(m[1]), /active/i.test(m[2]))], tags: ['ramp'] };
  if ((m = /^add up to (\d+) (?:additional )?DON!! cards? from your DON!! deck and rest (?:it|them)$/i.exec(s))) return { steps: [fx.addDon(n(m[1]), false)], tags: ['ramp'] };
  if ((m = /^add up to (\d+) additional DON!! cards? and (set (?:it|them) as active|rest (?:it|them))$/i.exec(s))) return { steps: [fx.addDon(n(m[1]), /active/i.test(m[2]))], tags: ['ramp'] };
  if ((m = /^set up to (\d+) of your DON!! cards? as active( at the end of this turn)?$/i.exec(s))) {
    if (!m[2]) return { steps: [fx.untapDon(n(m[1]))], tags: ['ramp'] };
    return { steps: [(g, c) => void rulesOf(P(g, c.player)).push({ kind: 'endUntapDon', n: n(m![1]), exp: g.turn })], tags: ['ramp'] };
  }
  if ((m = /^rest up to (\d+) of your opponent's DON!! cards?$/i.exec(s))) return { steps: [fx.restOppDon(n(m[1]))], tags: ['rest'] };
  if ((m = /^rest (\d+) of your (?:active )?DON!! cards?$/i.exec(s))) {
    const k = n(m[1]);
    return {
      steps: [
        (g, c) => {
          restDon(g, c.player, k);
          log(g, c.player, `${sv(g, c.player, 'rest')} ${k} DON!!.`, 'effect');
        },
      ],
      tags: [],
      can: (g, c) => P(g, c.player).donActive >= k,
    };
  }
  if ((m = /^(?:return (\d+)(?: or more)? DON!! cards? from your field to your DON!! deck|DON!! ?-(\d+))$/i.exec(s))) {
    const k = n(m[1] ?? m[2]);
    return {
      steps: [
        (g, c) => {
          returnDon(g, c.player, k);
          log(g, c.player, `${sv(g, c.player, 'return')} ${k} DON!! to the DON!! deck.`, 'effect');
        },
      ],
      tags: [],
      can: (g, c) => totalDon(P(g, c.player)) >= k,
    };
  }
  if ((m = /^your opponent returns (\d+) DON!! cards? from their field to their DON!! deck$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          returnDon(g, opp(c.player), n(m![1]), c.player);
          log(g, c.player, `${srcName(c)}: ${sv(g, opp(c.player), 'return')} ${plural(n(m![1]), 'DON!! card')} to the DON!! deck.`, 'effect');
        },
      ],
      tags: ['disrupt'],
    };
  }
  if ((m = /^give (up to )?(\d+) rested DON!! cards? to (.+)$/i.exec(s)) || (m = /^give (.+?) (up to )(\d+) rested DON!! cards?$/i.exec(s))) {
    const [target, count] = /^\d+$/.test(m[2]) ? [m[3], n(m[2])] : [m[1], n(m[3])];
    const sel = parseSel(/^\d+ of your /i.test(target) || /^(?:this|your|that) /i.test(target) ? target : `1 of ${target}`) ?? parseSel(target);
    if (!sel || sel.side === 'opp') return null;
    return { steps: pick(sel, text, 'giveDon', giveRested(count)), tags: ['don'] };
  }

  // ---- battle and turn rules
  if ((m = /^your opponent cannot activate (?:an? )?\[Blocker\](?: Characters?)?(?: (?:that has|that have|with)(?: a)?(?: power of)? (\d+)(?: power)? or (more|less)(?: power)?)? during this battle$/i.exec(s))) {
    const lim = m[1] ? n(m[1]) : 0;
    const less = /less/i.test(m[2] ?? '');
    return {
      steps: [
        (g, c) => {
          if (!g.battle) return;
          if (!lim) g.battle.noBlock = true;
          else if (less) g.battle.noBlockMax = lim;
          else g.battle.noBlockMin = lim;
          log(g, c.player, lim ? `${srcName(c)}: [Blocker] Characters with ${lim} power or ${less ? 'less' : 'more'} cannot block this attack.` : `${srcName(c)}: this attack cannot be blocked.`, 'effect');
        },
      ],
      tags: ['evasion'],
    };
  }
  if ((m = /^you cannot play (?:any )?Character cards?(?: with a base cost of (\d+) or more)?(?: from your hand| on your field)? during this turn$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          rulesOf(P(g, c.player)).push({ kind: 'noPlayChar', n: m![1] ? n(m![1]) : 0, exp: g.turn });
          log(g, c.player, `${sv(g, c.player, 'can')}not play ${m![1] ? `Characters with a base cost of ${m![1]} or more` : 'Character cards'} for the rest of this turn.`, 'effect');
        },
      ],
      tags: [],
    };
  }
  if (/^trash this Character at the end of this turn$/i.test(s)) return { steps: [(g, c) => void rulesOf(P(g, c.player)).push({ kind: 'endTrash', n: c.src, exp: g.turn })], tags: [] };

  // ---- removal
  const removal = (target: string, mode: RemoveMode, faceDown = false): Act | null => {
    const sels = parseSels(target);
    if (!sels) return null;
    const mine = sels.every((sel) => sel.side === 'own');
    const intent = (sel: Sel): Intent => (sel.side === 'own' ? 'sacrifice' : mode === 'ko' ? 'ko' : mode === 'hand' ? 'bounce' : 'bottomDeck');
    return {
      steps: pickEach(
        sels,
        text,
        intent,
        (g, c, t) => {
          const owner = ownerOf(t.uid);
          removeByEffect(g, c.player, t.uid, mode);
          if (mode === 'life' && faceDown) {
            const top = P(g, owner).life[0];
            if (top && top.uid === t.uid) top.faceUp = false;
          }
        },
        notLeader,
      ),
      tags: mine ? [] : [mode === 'ko' ? 'ko' : 'bounce'],
      can: (g, c) => sels.every((sel) => selCan(sel, notLeader)(g, c)),
    };
  };
  if ((m = /^KO (.+)$/i.exec(s))) return removal(m[1], 'ko');
  if ((m = /^return (.+) to (?:the|its|their) owner's hand$/i.exec(s)) || (m = /^return (.+) to (?:your|their) hand$/i.exec(s))) return removal(m[1], 'hand');
  if ((m = /^(?:place|return) (.+) (?:at|to) the (top|bottom) of (?:the owner's|its owner's|their owner's|your|their) deck(?: in any order)?$/i.exec(s))) return removal(m[1], /top/i.test(m[2]) ? 'top' : 'bottom');
  if ((m = /^add (.+) to the top of (?:the owner's|your opponent's|their|your) Life cards( face-up| face-down)?$/i.exec(s))) return removal(m[1], 'life', /down/i.test(m[2] ?? ''));
  if ((m = /^trash (.+)$/i.exec(s)) && !/ from /i.test(m[1])) return removal(m[1], 'trash');

  // ---- resting and readying
  if ((m = /^rest (.+)$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (!sels) return null;
    const sel = sels[0];
    const ok: Extra = (g, _c, t) => !t.rested && !hasState(g, t, 'CantRest');
    return {
      steps: pickEach(
        sels,
        text,
        (x) => (x.side === 'own' ? 'sacrifice' : 'rest'),
        (g, c, t) => {
          restCard(g, t, c.player, 'effect');
          log(g, c.player, `${srcName(c)} rests ${D(t.id).name}.`, 'effect');
        },
        ok,
      ),
      tags: sel.side === 'own' ? [] : ['rest'],
      can: (g, c) => sels.every((x) => selCan(x, ok)(g, c)),
    };
  }
  if ((m = /^set (.+) as active$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (!sels) return null;
    return {
      steps: pickEach(
        sels,
        text,
        'untap',
        (g, c, t) => {
          t.rested = false;
          log(g, c.player, `${D(t.id).name} is set as active.`, 'effect');
        },
        (_g, _c, t) => t.rested,
      ),
      tags: ['untap'],
    };
  }
  if ((m = /^(.+) will not become active in (?:your opponent's|their|the|your) next Refresh Phase$/i.exec(s))) {
    const sels = parseSels(m[1]);
    if (!sels) return null;
    return {
      steps: pickEach(
        sels,
        text,
        'freeze',
        (g, c, t) => {
          t.frozen = true;
          log(g, c.player, `${D(t.id).name} will not become active in its owner's next Refresh Phase.`, 'effect');
        },
        (g, _c, t) => P(g, ownerOf(t.uid)).stage?.uid !== t.uid,
      ),
      tags: ['rest'],
    };
  }

  // ---- temporary states
  const state = (target: string, f: Flag, d: string | undefined, words: string, intent: Intent): Act | null => {
    const sels = parseSels(target);
    const span = dur(d);
    if (!sels || !span) return null;
    return { steps: pickEach(sels, text, intent, (g, c, t) => flag(g, c, t, f, span, words)), tags: [sels[0].side === 'own' ? 'buff' : 'debuff'] };
  };
  if ((m = /^your opponent cannot activate the \[Blocker\] of any Character with a cost of (\d+) or less during this battle$/i.exec(s))) {
    return {
      steps: [
        (g, c) => {
          if (!g.battle) return;
          g.battle.noBlockCostMax = n(m![1]);
          log(g, c.player, `${srcName(c)}: [Blocker] Characters with a cost of ${m![1]} or less cannot block this attack.`, 'effect');
        },
      ],
      tags: ['evasion'],
    };
  }
  if (/^your opponent cannot activate \[Blocker\] during this turn$/i.test(s)) return state("all of your opponent's Characters", 'CantBlock', 'during this turn', 'cannot activate [Blocker]', 'debuff');
  if ((m = new RegExp(`^(.+) cannot activate \\[Blocker\\] ${DUR}$`, 'i').exec(s))) return state(m[1], 'CantBlock', m[2], 'cannot activate [Blocker]', 'debuff');
  if ((m = new RegExp(`^(.+) cannot be rested ${DUR}$`, 'i').exec(s))) return state(m[1], 'CantRest', m[2], 'cannot be rested', 'debuff');
  if ((m = new RegExp(`^(.+) cannot attack ${DUR}$`, 'i').exec(s))) return state(m[1], 'CantAttack', m[2], 'cannot attack', 'debuff');
  if ((m = new RegExp(`^(.+) cannot be KO'd( in battle| by effects| by your opponent's effects)? ${DUR}$`, 'i').exec(s))) {
    return state(m[1], /battle/i.test(m[2] ?? '') ? 'NoKOBattle' : m[2] ? 'NoKOEffect' : 'NoKO', m[3], `cannot be K.O.'d${m[2] ?? ''}`, 'buff');
  }
  if ((m = new RegExp(`^(.+) can(?: also)? attack (?:your opponent's )?active Characters ${DUR}$`, 'i').exec(s))) return state(m[1], 'AttackActive', m[2], 'can also attack active Characters', 'buff');
  if ((m = new RegExp(`^(.+) cannot be removed from the field by your opponent's effects ${DUR}$`, 'i').exec(s))) return state(m[1], 'NoRemove', m[2], "cannot be removed by an opponent's effects", 'buff');
  if ((m = new RegExp(`^negate the effects? of (.+) ${DUR}$`, 'i').exec(s))) return state(m[1], 'Negated', m[2], 'has its effects negated', 'debuff');
  if ((m = new RegExp(`^(.+?) gains? \\[(${KW_RE})\\](?: and \\+(\\d+) power)? ${DUR}$`, 'i').exec(s)) || (m = new RegExp(`^(.+?) gains? \\+(\\d+) power and \\[(${KW_RE})\\] ${DUR}$`, 'i').exec(s))) {
    const [kwName, amount] = /^\d+$/.test(m[2]) ? [m[3], n(m[2])] : [m[2], m[3] ? n(m[3]) : 0];
    const sels = parseSels(m[1]);
    const span = dur(m[4]);
    if (!sels || !span) return null;
    const kw = (['Rush', 'Blocker', 'Double Attack', 'Banish', 'Unblockable', 'Rush: Character'] as Keyword[]).find((k) => k.toLowerCase() === kwName.toLowerCase());
    if (!kw) return null;
    return {
      steps: pickEach(sels, text, 'buff', (g, c, t) => {
        flag(g, c, t, kw, span, `gains [${kw}]`);
        if (amount) mod(g, c, t, 'power', amount, span);
      }),
      tags: ['buff'],
    };
  }

  // ---- power and cost
  if ((m = new RegExp(`^give (.+?) ([-+])(\\d+) (power|cost) ${DUR}$`, 'i').exec(s)) || (m = new RegExp(`^(.+?) gains? ([-+])(\\d+) (power|cost) ${DUR}$`, 'i').exec(s))) {
    const sels = parseSels(m[1]);
    const span = dur(m[5]);
    if (!sels || !span) return null;
    const amount = (m[2] === '-' ? -1 : 1) * n(m[3]);
    const stat = m[4].toLowerCase() as 'power' | 'cost';
    const mine = sels[0].side === 'own';
    const can: Test = (g, c) => sels.every((sel) => selCan(sel)(g, c));
    const tags = [amount > 0 ? 'buff' : 'debuff'];
    if (stat === 'power' && sels.length === 1) return { steps: buff(sels[0], amount, span, text), tags, can, boost: env.timing === 'counter' && mine && amount > 0 && span === 'battle' ? amount : undefined };
    return { steps: pickEach(sels, text, amount > 0 ? 'buff' : 'debuff', (g, c, t) => mod(g, c, t, stat, amount, span)), tags, can };
  }
  if ((m = new RegExp(`^set the (?:base )?power of (.+?) to (\\d+) ${DUR}$`, 'i').exec(s)) || (m = new RegExp(`^(.+?)(?:'s| cards'|')? base power becomes (\\d+) ${DUR}$`, 'i').exec(s))) {
    const sels = parseSels(m[1].replace(/^the base power of /i, ''));
    const span = dur(m[3]);
    if (!sels || !span) return null;
    const amount = n(m[2]);
    const mine = sels[0].side === 'own';
    return { steps: pickEach(sels, text, mine ? 'buff' : 'debuff', (g, c, t) => mod(g, c, t, 'base', amount, span)), tags: [mine ? 'buff' : 'debuff'] };
  }
  return null;
}

// ---------------------------------------------------------------- clauses and whole effects

/** Conditions that only make sense in the middle of an effect ("If you do", "If that card is..."). */
function clauseCond(input: string): Test | null {
  const s = input.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(?:that card|the revealed card|that Character|it)(?:'s type includes| has a type including) "([^"]+)"$/i.exec(s))) return (g, c) => !!c.v.that && defOf(g, c.v.that).types.some((t) => t.includes(m![1]));
  if ((m = /^(?:that card|the revealed card|that Character|it) is (?:an? )?(.+)$/i.exec(s)) || (m = /^(?:that card|the revealed card|that Character|it) has (.+)$/i.exec(s))) {
    const d = parseDesc(/ has /i.test(s) ? `card with ${m[1]}` : m[1]);
    if (d) return (g, c) => !!c.v.that && d.cat(defOf(g, c.v.that)) && d.pred(g, c, c.v.that);
  }
  return parseCond(s);
}

const both = (a: Test | undefined, b: Test | undefined): Test | undefined => (a && b ? (g, c) => a(g, c) && b(g, c) : undefined);

export function parseClause(input: string, env: Env, rest: string[] = []): Act | null {
  const s = input
    .trim()
    .replace(/\.$/, '')
    .replace(/^(?:then|and then|and),? /i, '')
    // Saying "cannot be blocked when it attacks" the long way round.
    .replace(/^if (?:the selected|that) (?:Character|card|Leader or Character) attacks during this turn, your opponent cannot activate \[Blocker\]$/i, 'that card gains [Unblockable] during this turn')
    .replace(/^your opponent cannot activate \[Blocker\] if (?:the selected|that) (?:Character|card|Leader or Character) attacks during this turn$/i, 'that card gains [Unblockable] during this turn')
    .replace(/^your opponent cannot activate \[Blocker\] whenever your Leader attacks during this turn$/i, 'your Leader gains [Unblockable] during this turn');
  const text = `${s}.`;
  let m: RegExpExecArray | null;

  if (/^if /i.test(s)) {
    let failed = '';
    const re = /, /g;
    while ((m = re.exec(s))) {
      const cond = clauseCond(s.slice(3, m.index));
      if (!cond) continue;
      depth++;
      const inner = parseClause(s.slice(m.index + 2), env, rest);
      depth--;
      if (!inner) {
        failed = s.slice(m.index + 2);
        continue;
      }
      return { ...inner, steps: guarded(cond, inner.steps), cond: inner.cond ? both(cond, inner.cond) : cond, can: inner.can ? both(cond, inner.can) : undefined };
    }
    if (failed) miss('effect', failed);
    else miss('cond', s);
    return null;
  }
  // "..., you may trash 1 card from your hand: Draw 2 cards." — a cost in the middle of an effect.
  if ((m = /^you (?:may|can) (.+?): (.+)$/i.exec(s))) {
    depth++;
    const cost = parseClause(m[1], env, []);
    const effect = parseClause(m[2], env, rest);
    depth--;
    if (cost?.can && !cost.consumed && effect) {
      const key = `k${seq++}`;
      const what = pretty(m[1]);
      const can = cost.can;
      return {
        steps: [
          (g, c): Choice | undefined => {
            c.yes = false;
            if (can(g, c)) return { kind: 'confirm', player: c.player, prompt: `${srcName(c)} — you may ${what} to use the effect. Do it?`, source: c.cardId };
          },
          (_g, c) => {
            c.v[key] = c.yes ? 1 : 0;
          },
          ...[...cost.steps, ...effect.steps].map<Step>((st) => (g, c) => (c.v[key] ? st(g, c) : undefined)),
          (_g, c) => {
            c.v.did = c.v[key];
          },
        ],
        tags: effect.tags,
        consumed: effect.consumed,
      };
    }
  }
  if ((m = /^you may (.+)$/i.exec(s))) {
    depth++;
    const inner = parseClause(m[1], env, rest);
    depth--;
    if (!inner) {
      miss('effect', m[1]);
      return null;
    }
    const key = `k${seq++}`;
    const what = pretty(m[1]);
    return {
      ...inner,
      steps: [
        (g, c): Choice | undefined => {
          c.yes = false;
          if (inner.can && !inner.can(g, c)) return;
          return { kind: 'confirm', player: c.player, prompt: `${srcName(c)} — you may ${what}. Do it?`, source: c.cardId };
        },
        (_g, c) => {
          c.v[key] = c.yes ? 1 : 0;
        },
        ...inner.steps.map<Step>((st) => (g, c) => (c.v[key] ? st(g, c) : undefined)),
        (_g, c) => {
          c.v.did = c.v[key];
        },
      ],
      can: undefined,
      cond: undefined,
    };
  }

  depth++;
  try {
    const a = parseAtom(s, env, rest, text);
    if (a) return a;
    // "Draw 1 card if you have 3 or less cards in your hand."
    if ((m = /^(.+?),? if (.+)$/i.exec(s))) {
      const cond = clauseCond(m[2]);
      const inner = cond ? parseClause(m[1], env, rest) : null;
      if (cond && inner) return { ...inner, steps: guarded(cond, inner.steps), cond, can: inner.can ? both(cond, inner.can) : undefined };
    }
    // "A and B", "A, then B"
    const re = /,? and then |, then |,? and /gi;
    while ((m = re.exec(s))) {
      const tailText = s.slice(m.index + m[0].length);
      const headText = s.slice(0, m.index);
      const shared = new RegExp(` ${DUR}$`, 'i').exec(tailText)?.[0] ?? '';
      const left = parseAtom(headText, env, [], `${headText}.`) ?? (shared ? parseAtom(`${headText}${shared}`, env, [], `${headText}${shared}.`) : null);
      if (!left || left.consumed) continue;
      const verb = /^(rest|trash|KO|return|place|give|play)\b/i.exec(s)?.[1];
      const right = parseClause(tailText, env, rest) ?? (verb ? parseClause(`${verb} ${tailText}`, env, rest) : null);
      if (!right) continue;
      return {
        steps: [...left.steps, ...right.steps],
        tags: [...new Set([...left.tags, ...right.tags])],
        can: both(left.can, right.can),
        boost: left.boost !== undefined || right.boost !== undefined ? (left.boost ?? 0) + (right.boost ?? 0) : undefined,
        consumed: right.consumed,
      };
    }
    // "A or B" — both must be things the player could be unable to do (costs), so each can be tested.
    const ore = / or /gi;
    const verb = /^(rest|trash|KO|return|place|give|play)\b/i.exec(s)?.[1];
    while ((m = ore.exec(s))) {
      const [ls, rs] = [s.slice(0, m.index), s.slice(m.index + m[0].length)];
      const left = parseAtom(ls, env, [], `${ls}.`);
      if (!left || left.consumed || !left.can) continue;
      const direct = parseAtom(rs, env, [], `${rs}.`);
      const right = direct ?? (verb ? parseAtom(`${verb} ${rs}`, env, [], `${verb} ${rs}.`) : null);
      if (!right || right.consumed || !right.can) continue;
      return either(left, right, ls, direct ? rs : `${verb} ${rs}`);
    }
  } finally {
    depth--;
  }
  miss('effect', s);
  return null;
}

export interface Body {
  steps: Step[];
  tags: string[];
  boost?: number;
  /** Set when the whole effect hangs on one condition (so it is not even offered when that fails). */
  when?: Test;
  ref?: Timing;
  can?: Test;
}

export const normalise = (body: string): string =>
  body
    .replace(/K\.O\.'d/g, "KO'd")
    .replace(/K\.O\.'s/g, "KO's")
    .replace(/K\.O\./g, 'KO')
    .replace(/[’‘]/g, "'")
    .replace(/[−–]/g, '-')
    .replace(/＜/g, '<')
    .replace(/＞/g, '>');

export function splitSentences(body: string): string[] {
  // Full stops inside [Card Names] and "quoted types" do not end a sentence.
  const shielded = body.replace(/\[[^\]]*\]|"[^"]*"/g, (x) => x.replace(/\./g, '\u0001'));
  return shielded
    .split(/(?<=\.)\s+/)
    .map((x) => x.replace(/\u0001/g, '.').trim())
    .filter(Boolean);
}

export function parseBody(input: string, env: Env): Body | null {
  const body = input.trim();
  // "Choose one: • A • B"
  const cm = /^(.*?)(Your opponent chooses one|Choose one):\s*•\s*(.+)$/is.exec(body);
  if (cm) {
    let lead = cm[1].trim();
    let gate: Test | null = null;
    const gm = /^(?:then, )?if (.+),$/i.exec(lead);
    if (gm) {
      gate = clauseCond(gm[1]);
      if (!gate) return null;
      lead = '';
    }
    lead = lead.replace(/,? then$/i, '.');
    const pre = lead ? parseBody(lead, env) : { steps: [], tags: [] as string[] };
    const labels = cm[3].split(/\s*•\s*/).map((x) => x.trim());
    const opts = labels.map((x) => parseBody(x, env));
    if (!pre || opts.some((o) => !o)) return null;
    const key = `k${seq++}`;
    const theirs = /opponent/i.test(cm[2]);
    const chosen: Body = {
      steps: [
        ...pre.steps,
        (_g, c): Choice => ({ kind: 'option', player: theirs ? opp(c.player) : c.player, prompt: `${srcName(c)} — ${theirs ? "your opponent's effect: you choose which one happens" : 'choose one'}:`, labels: labels.map(pretty), tag: theirs ? 'chooseOneTheirs' : 'chooseOne', source: c.cardId }),
        (_g, c) => {
          c.v[key] = c.idx;
        },
        ...opts.flatMap((o, i) => o!.steps.map<Step>((st) => (g, c) => (c.v[key] === i ? st(g, c) : undefined))),
      ],
      tags: [...new Set([...pre.tags, ...opts.flatMap((o) => o!.tags)])],
    };
    return gate ? { ...chosen, steps: guarded(gate, chosen.steps), when: gate } : chosen;
  }
  const sentences = splitSentences(body);
  const out: Body = { steps: [], tags: [] };
  for (let i = 0; i < sentences.length; i++) {
    const a = parseClause(sentences[i], env, sentences.slice(i + 1));
    if (!a) return null;
    i += a.consumed ?? 0;
    if (a.ref) {
      if (sentences.length !== 1) return null;
      out.ref = a.ref;
    }
    if (sentences.length === 1 + (a.consumed ?? 0)) {
      out.when = a.cond;
      out.can = a.can;
    }
    out.steps.push(...a.steps);
    for (const t of a.tags) if (!out.tags.includes(t)) out.tags.push(t);
    if (a.boost !== undefined) out.boost = (out.boost ?? 0) + a.boost;
  }
  return out;
}
