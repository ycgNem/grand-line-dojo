// Turns printed card text into runnable effects.
//
// One Piece card text is highly templated, so a sentence-by-sentence pattern compiler can play a
// large share of the card pool faithfully. The rule is strict: if ANY sentence on a card is not
// understood, the whole card is marked unsupported (sim: 'none') rather than played half-right.

import * as fx from './fx';
import { P, costOf, findField, leaveField, log, opp, ownerOf, powerOf } from './game';
import { D } from './registry';
import type { CardDef, CostSpec, Ctx, EffectDef, FieldCard, Game, Keyword, Step, Timing, Until } from './types';

export interface RawCard {
  id: string;
  name: string;
  category: string;
  colors: string[];
  cost: number;
  life: number;
  power: number;
  counter: number;
  attribute: string[];
  types: string[];
  text: string;
}

export interface Compiled {
  ok: boolean;
  unparsed: string[];
  keywords: Keyword[];
  effects: EffectDef[];
  aliases: string[];
  powerAura?: CardDef['powerAura'];
  dynKeyword?: CardDef['dynKeyword'];
  costAura?: CardDef['costAura'];
  cantBeKoByEffect?: boolean;
  cantAttack?: boolean;
  anyCopies?: boolean;
}

type Test = (g: Game, c: Ctx) => boolean;
interface Parsed {
  steps: Step[];
  tags: string[];
  boost?: number;
  ref?: Timing;
}

const KEYWORDS: Keyword[] = ['Rush', 'Blocker', 'Double Attack', 'Banish', 'Unblockable', 'Rush: Character'];
const TIMINGS: Record<string, Timing> = {
  'On Play': 'onPlay',
  'When Attacking': 'whenAttacking',
  'On K.O.': 'onKO',
  'On Block': 'onBlock',
  'Activate: Main': 'activateMain',
  Main: 'main',
  Counter: 'counter',
  Trigger: 'trigger',
  'End of Your Turn': 'endOfTurn',
  "On Your Opponent's Attack": 'onOppAttack',
};

export const isNamed = (d: CardDef, name: string): boolean => d.name === name || !!d.aliases?.includes(name);
const hasType = (d: CardDef, t: string): boolean => d.types.includes(t);
const plural = (n: number, s: string): string => `${n} ${s}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- filters

/** "{Straw Hat Crew} type Character card with a cost of 4 or less other than [Nami]" */
export function parseCardFilter(input: string): ((d: CardDef) => boolean) | null {
  let s = ` ${input.trim()} `;
  const tests: ((d: CardDef) => boolean)[] = [];
  const eat = (re: RegExp, fn: (m: RegExpExecArray) => void): void => {
    const m = re.exec(s);
    if (!m) return;
    fn(m);
    s = s.replace(m[0], ' ');
  };
  eat(/ other than \[([^\]]+)\]/i, (m) => tests.push((d) => !isNamed(d, m[1])));
  eat(/ with a cost of (\d+) or less/i, (m) => tests.push((d) => d.cost <= +m[1]));
  eat(/ with a cost of (\d+) or more/i, (m) => tests.push((d) => d.cost >= +m[1]));
  eat(/ with a cost of (\d+)/i, (m) => tests.push((d) => d.cost === +m[1]));
  eat(/ with (\d+) power or less/i, (m) => tests.push((d) => d.category === 'Character' && d.power <= +m[1]));
  eat(/ with (\d+) power or more/i, (m) => tests.push((d) => d.category === 'Character' && d.power >= +m[1]));
  eat(/ with (\d+) power/i, (m) => tests.push((d) => d.category === 'Character' && d.power === +m[1]));
  eat(/ \{([^}]+)\} or \{([^}]+)\} type/i, (m) => tests.push((d) => hasType(d, m[1]) || hasType(d, m[2])));
  eat(/ \{([^}]+)\} type/i, (m) => tests.push((d) => hasType(d, m[1])));
  eat(/ \[([^\]]+)\] or \[([^\]]+)\]/i, (m) => tests.push((d) => isNamed(d, m[1]) || isNamed(d, m[2])));
  eat(/ \[([^\]]+)\]/i, (m) => tests.push((d) => isNamed(d, m[1])));
  eat(/ (red|green|blue|purple|black|yellow) /i, (m) => tests.push((d) => d.colors.some((c) => c.toLowerCase() === m[1].toLowerCase())));
  eat(/ Character cards? /i, () => tests.push((d) => d.category === 'Character'));
  eat(/ Events?( cards?)? /i, () => tests.push((d) => d.category === 'Event'));
  eat(/ Stage cards? /i, () => tests.push((d) => d.category === 'Stage'));
  eat(/ cards? /i, () => undefined);
  if (s.trim()) return null;
  return (d) => tests.every((t) => t(d));
}

/** " with a cost of 5 or less" → a test for cards on the field. Returns null when not understood. */
function parseFieldFilter(input: string): fx.FieldFilter | null {
  const s = input.trim();
  if (!s) return () => true;
  let m: RegExpExecArray | null;
  if ((m = /^with a (base )?cost of (\d+) or less$/i.exec(s))) {
    const [base, n] = [!!m[1], +m[2]];
    return (g, t) => (base ? D(t.id).cost : costOf(g, t)) <= n;
  }
  if ((m = /^with a (base )?cost of (\d+) or more$/i.exec(s))) {
    const [base, n] = [!!m[1], +m[2]];
    return (g, t) => (base ? D(t.id).cost : costOf(g, t)) >= n;
  }
  if ((m = /^with a (base )?cost of (\d+)$/i.exec(s))) {
    const [base, n] = [!!m[1], +m[2]];
    return (g, t) => (base ? D(t.id).cost : costOf(g, t)) === n;
  }
  if ((m = /^with (\d+) (base )?power or less$/i.exec(s))) {
    const [n, base] = [+m[1], !!m[2]];
    return (g, t) => (base ? D(t.id).power : powerOf(g, t)) <= n;
  }
  if ((m = /^with (\d+) (base )?power or more$/i.exec(s))) {
    const [n, base] = [+m[1], !!m[2]];
    return (g, t) => (base ? D(t.id).power : powerOf(g, t)) >= n;
  }
  return null;
}

function parseCond(input: string): Test | null {
  const s = input.trim();
  let m: RegExpExecArray | null;
  const leader = (g: Game, c: Ctx): CardDef => D(P(g, c.player).leader.id);
  if ((m = /^your Leader has the \{([^}]+)\} type$/i.exec(s))) return (g, c) => hasType(leader(g, c), m![1]);
  if ((m = /^your Leader's type includes "([^"]+)"$/i.exec(s))) return (g, c) => leader(g, c).types.some((t) => t.includes(m![1]));
  if ((m = /^your Leader is \[([^\]]+)\]$/i.exec(s))) return (g, c) => isNamed(leader(g, c), m![1]);
  if ((m = /^your Leader is multicolored$/i.exec(s))) return (g, c) => leader(g, c).colors.length > 1;
  const cmp = (word: string, a: number, n: number): boolean => (/less|fewer/.test(word) ? a <= n : a >= n);
  if ((m = /^you have (\d+) or (less|more|fewer) cards in your hand$/i.exec(s))) return (g, c) => cmp(m![2], P(g, c.player).hand.length, +m![1]);
  if ((m = /^your opponent has (\d+) or (less|more|fewer) cards in their hand$/i.exec(s))) return (g, c) => cmp(m![2], P(g, opp(c.player)).hand.length, +m![1]);
  if ((m = /^you have (\d+) or (less|more|fewer) Life cards$/i.exec(s))) return (g, c) => cmp(m![2], P(g, c.player).life.length, +m![1]);
  if ((m = /^your opponent has (\d+) or (less|more|fewer) Life cards$/i.exec(s))) return (g, c) => cmp(m![2], P(g, opp(c.player)).life.length, +m![1]);
  if ((m = /^you have (\d+) or (less|more|fewer) DON!! cards on your field$/i.exec(s))) {
    return (g, c) => {
      const p = P(g, c.player);
      return cmp(m![2], p.donActive + p.donRested + p.leader.don + p.chars.reduce((n, x) => n + x.don, 0), +m![1]);
    };
  }
  if ((m = /^you have (\d+) or (less|more|fewer) Characters$/i.exec(s))) return (g, c) => cmp(m![2], P(g, c.player).chars.length, +m![1]);
  if ((m = /^your opponent has (\d+) or (less|more|fewer) Characters$/i.exec(s))) return (g, c) => cmp(m![2], P(g, opp(c.player)).chars.length, +m![1]);
  if ((m = /^you have (\d+) or (less|more|fewer) cards in your trash$/i.exec(s))) return (g, c) => cmp(m![2], P(g, c.player).trash.length, +m![1]);
  if ((m = /^there is a Character with a cost of (\d+) or more$/i.exec(s))) return (g) => ([0, 1] as const).some((p) => P(g, p).chars.some((x) => costOf(g, x) >= +m![1]));
  if ((m = /^there is a Character with a cost of (\d+)$/i.exec(s))) return (g) => ([0, 1] as const).some((p) => P(g, p).chars.some((x) => costOf(g, x) === +m![1]));
  if (/^you have less Life cards than your opponent$/i.test(s)) return (g, c) => P(g, c.player).life.length < P(g, opp(c.player)).life.length;
  if (/^you have (\d+) or more rested DON!! cards$/i.test(s)) {
    const n = +/(\d+)/.exec(s)![1];
    return (g, c) => P(g, c.player).donRested >= n;
  }
  return null;
}

function parseCost(input: string, k: CostSpec): boolean {
  for (const part of input.split(/ and /i)) {
    const s = part.trim();
    let m: RegExpExecArray | null;
    if ((m = /^trash (\d+) cards? from your hand$/i.exec(s))) k.trashHand = (k.trashHand ?? 0) + +m[1];
    else if ((m = /^trash (\d+) (.+?) from your hand$/i.exec(s))) {
      const f = parseCardFilter(m[2]);
      if (!f || k.trashHand) return false;
      k.trashHand = +m[1];
      k.trashFilter = f;
      k.trashDesc = m[2];
    } else if (/^rest this (Character|Stage|Leader|card)$/i.test(s)) k.restSelf = true;
    else if ((m = /^rest (\d+) of your DON!! cards$/i.exec(s))) k.don = (k.don ?? 0) + +m[1];
    else if (/^add 1 card from the top or bottom of your Life cards to your hand$/i.test(s)) k.lifeToHand = true;
    else return false;
  }
  return true;
}

// ---------------------------------------------------------------- effect sentences

let condSeq = 0;
/** Runs `steps` only when `test` held at the moment the effect reached this point. */
function guarded(test: Test, steps: Step[]): Step[] {
  const key = `cond${condSeq++}`;
  return [
    (g, c) => {
      c.v[key] = test(g, c) ? 1 : 0;
    },
    ...steps.map<Step>((s) => (g, c) => (c.v[key] ? s(g, c) : undefined)),
  ];
}

function parseEffect(sentence: string, timing: Timing | null, next: string | undefined): (Parsed & { consumed?: number }) | null {
  const s = sentence.trim().replace(/\.$/, '');
  const text = `${s}.`;
  let m: RegExpExecArray | null;
  const n = (x: string): number => +x;

  if ((m = /^draw (\d+) cards? and trash (\d+) cards? from your hand$/i.exec(s))) return { steps: [fx.drawN(n(m[1])), ...fx.discard(n(m[2]))], tags: ['draw'] };
  if ((m = /^draw (\d+) cards?$/i.exec(s))) return { steps: [fx.drawN(n(m[1]))], tags: ['draw'] };
  if ((m = /^trash (\d+) cards? from your hand$/i.exec(s))) return { steps: fx.discard(n(m[1])), tags: ['discard'] };
  if ((m = /^your opponent trashes (\d+) cards? from their hand$/i.exec(s))) return { steps: fx.oppDiscard(n(m[1])), tags: ['disrupt'] };
  if ((m = /^trash (\d+) cards? from the top of your deck$/i.exec(s))) return { steps: [fx.millSelf(n(m[1]))], tags: ['mill'] };

  if ((m = /^KO up to (\d+) of your opponent's (rested |active )?Characters(.*)$/i.exec(s))) {
    const f = parseFieldFilter(m[3]);
    if (!f) return null;
    const state = (m[2] ?? '').trim().toLowerCase();
    return { steps: fx.koOpp(text.replace(/^KO/, 'K.O.'), (g, t, c) => (state === 'rested' ? t.rested : state === 'active' ? !t.rested : true) && f(g, t, c), n(m[1])), tags: ['ko'] };
  }
  if ((m = /^return up to (\d+) (of your opponent's )?Characters?(.*) to the owner's hand$/i.exec(s))) {
    const f = parseFieldFilter(m[3]);
    if (!f) return null;
    return { steps: m[2] ? fx.removeOpp(text, 'hand', f, n(m[1])) : fx.removeAny(text, 'hand', f, n(m[1])), tags: ['bounce'] };
  }
  if ((m = /^place up to (\d+) (of your opponent's )?Characters?(.*) at the bottom of the owner's deck$/i.exec(s))) {
    const f = parseFieldFilter(m[3]);
    if (!f) return null;
    return { steps: m[2] ? fx.removeOpp(text, 'bottom', f, n(m[1])) : fx.removeAny(text, 'bottom', f, n(m[1])), tags: ['bounce'] };
  }
  if ((m = /^rest up to (\d+) of your opponent's DON!! cards$/i.exec(s))) return { steps: [fx.restOppDon(n(m[1]))], tags: ['rest'] };
  if ((m = /^rest up to (\d+) of your opponent's Characters(.*)$/i.exec(s))) {
    const f = parseFieldFilter(m[2]);
    if (!f) return null;
    return { steps: fx.restOpp(text, f, n(m[1])), tags: ['rest'] };
  }
  if ((m = /^up to (\d+) of your opponent's rested Characters(.*) will not become active in your opponent's next Refresh Phase$/i.exec(s))) {
    const f = parseFieldFilter(m[2]);
    if (!f) return null;
    return {
      steps: [
        fx.pickOpp(n(m[1]), text, 'freeze', (g, t, c) => t.rested && f(g, t, c)),
        fx.each((g, c, u) => {
          const t = findField(g, u);
          if (!t) return;
          t.frozen = true;
          log(g, c.player, `${D(t.id).name} will not become active in its owner's next Refresh Phase.`, 'effect');
        }),
      ],
      tags: ['rest'],
    };
  }
  if ((m = /^give up to (\d+) of your opponent's (Characters|Leader or Character cards) [-−](\d+) (power|cost) during this turn$/i.exec(s))) {
    return { steps: fx.statOpp(m[4].toLowerCase() as 'power' | 'cost', -n(m[3]), 'turn', text, { leader: /Leader/i.test(m[2]), max: n(m[1]) }), tags: ['debuff'] };
  }

  if ((m = /^up to (\d+) of your Leader or Character(?:s| cards) gains? \+(\d+) power during this (battle|turn)$/i.exec(s))) {
    const until = m[3].toLowerCase() as Until;
    if ((timing === 'counter' || timing === 'onOppAttack') && until === 'battle') return { steps: [fx.buffBattle(n(m[2]))], tags: ['buff'], boost: n(m[2]) };
    return { steps: fx.buffOwn(n(m[2]), until, text, { leader: true, max: n(m[1]) }), tags: ['buff'] };
  }
  if ((m = /^up to (\d+) of your Characters gains? \+(\d+) power during this (battle|turn)$/i.exec(s))) {
    return { steps: fx.buffOwn(n(m[2]), m[3].toLowerCase() as Until, text, { leader: false, max: n(m[1]) }), tags: ['buff'] };
  }
  if ((m = /^add up to (\d+) DON!! cards? as rested from your DON!! deck$/i.exec(s))) return { steps: [fx.addDon(n(m[1]), false)], tags: ['ramp'] };
  if ((m = /^(?:your Leader|up to 1 of your Leader) gains \+(\d+) power during this (battle|turn)$/i.exec(s))) {
    const amount = n(m[1]);
    const until = m[2].toLowerCase() as Until;
    return {
      steps: [
        (g, c) => {
          const L = P(g, c.player).leader;
          L.mods.push({ stat: 'power', amount, until });
          log(g, c.player, `${D(L.id).name} gets +${amount} power (now ${powerOf(g, L)}).`, 'effect');
        },
      ],
      tags: ['buff'],
      boost: timing === 'counter' ? amount : undefined,
    };
  }
  if ((m = /^this (?:Character|Leader|card) gains \+(\d+) power during this (battle|turn)$/i.exec(s))) return { steps: [fx.buffSelf(n(m[1]), m[2].toLowerCase() as Until)], tags: ['buff'] };
  if ((m = /^this (?:Character|Leader|card) gains \[(Rush|Blocker|Banish|Double Attack|Unblockable)\] during this (battle|turn)$/i.exec(s))) {
    return { steps: [fx.flagSelf(m[1] as Keyword, m[2].toLowerCase() as Until)], tags: ['buff'] };
  }
  if (/^set this (Character|Leader|card) as active$/i.test(s)) return { steps: [fx.setActiveSelf], tags: ['untap'] };
  if (/^your opponent cannot activate \[Blocker\] during this battle$/i.test(s)) return { steps: [fx.noBlocker()], tags: ['evasion'] };

  if ((m = /^look at (\d+) cards from the top of your deck; reveal up to 1 (.+?) and add it to your hand$/i.exec(s))) {
    const f = parseCardFilter(m[2]);
    const nx = (next ?? '').trim().replace(/\.$/, '').replace(/^then, /i, '');
    const rest = /^place the rest at the bottom of your deck in any order$/i.test(nx) ? 'bottom' : /^trash the rest$/i.test(nx) ? 'trash' : null;
    if (!f || !rest) return null;
    return { steps: fx.searchTop(n(m[1]), f, m[2], rest), tags: ['search'], consumed: 1 };
  }
  if ((m = /^look at (\d+) cards from the top of your deck and place them at the top or bottom of the deck in any order$/i.exec(s))) return { steps: fx.scry(n(m[1])), tags: ['filter'] };
  if (/^look at up to 1 card from the top of your or your opponent's Life cards,? and place it at the top or bottom of the Life cards$/i.test(s)) return { steps: fx.lifeLook, tags: ['life'] };

  if ((m = /^add up to (\d+) DON!! cards? from your DON!! deck and (set (?:it|them) as active|rest (?:it|them))$/i.exec(s))) {
    return { steps: [fx.addDon(n(m[1]), /active/i.test(m[2]))], tags: ['ramp'] };
  }
  if ((m = /^set up to (\d+) of your DON!! cards as active$/i.exec(s))) return { steps: [fx.untapDon(n(m[1]))], tags: ['ramp'] };
  if ((m = /^give up to (\d+) rested DON!! cards? to your Leader or 1 of your Characters$/i.exec(s))) {
    return { steps: fx.giveRestedDon(n(m[1]), text, { leader: true }), tags: ['don'] };
  }
  if ((m = /^give up to (\d+) rested DON!! cards? to your Leader$/i.exec(s))) return { steps: fx.giveRestedDon(n(m[1]), text, { leader: true, chars: false }), tags: ['don'] };
  if ((m = /^give this Leader or 1 of your Characters up to (\d+) rested DON!! cards?$/i.exec(s))) return { steps: fx.giveRestedDon(n(m[1]), text, { leader: true }), tags: ['don'] };

  if (/^play this card$/i.test(s)) return { steps: [fx.playSelf], tags: ['play'] };
  if ((m = /^activate this card's \[(Main|Counter|On Play|On KO)\] effect$/i.exec(s))) return { steps: [], tags: [], ref: TIMINGS[m[1] === 'On KO' ? 'On K.O.' : m[1]] };
  if ((m = /^play up to 1 (.+?) from your (hand|trash)( rested)?$/i.exec(s))) {
    const f = parseCardFilter(m[1]);
    if (!f) return null;
    return { steps: fx.playFrom(m[2].toLowerCase() as 'hand' | 'trash', f, m[1], !!m[3]), tags: ['play'] };
  }
  if ((m = /^add up to 1 (.+?) from your trash to your hand$/i.exec(s))) {
    const f = parseCardFilter(m[1]);
    if (!f) return null;
    return { steps: fx.recover(f, m[1]), tags: ['recover'] };
  }
  if ((m = /^add up to (\d+) cards? from the top of your deck to the top of your Life cards$/i.exec(s))) return { steps: [fx.gainLife(n(m[1]))], tags: ['life'] };
  if (/^add 1 card from the top of your Life cards to your hand$/i.test(s)) return { steps: [fx.lifeTopToHand], tags: ['life'] };
  if ((m = /^trash up to (\d+) cards? from the top of your opponent's Life cards$/i.exec(s))) return { steps: [fx.trashOppLife(n(m[1]))], tags: ['life'] };
  return null;
}

// ---------------------------------------------------------------- lines

const circled = (ch: string): number => {
  const code = ch.codePointAt(0) ?? 0;
  for (const base of [0x2460, 0x2780, 0x2776, 0x278a]) if (code >= base && code < base + 10) return code - base + 1;
  return 0;
};

const splitSentences = (body: string): string[] =>
  body
    .replace(/K\.O\.'d/g, "KO'd")
    .replace(/K\.O\./g, 'KO')
    .split(/(?<=\.)\s+|,? and then |, then /)
    .map((x) => x.trim())
    .filter(Boolean);

export function compileCard(raw: RawCard): Compiled {
  const out: Compiled = { ok: true, unparsed: [], keywords: [], effects: [], aliases: [] };
  const powerAuras: NonNullable<CardDef['powerAura']>[] = [];
  const kwAuras: NonNullable<CardDef['dynKeyword']>[] = [];
  const costAuras: NonNullable<CardDef['costAura']>[] = [];
  const refs: { effect: EffectDef; ref: Timing }[] = [];
  const fail = (line: string): void => {
    out.ok = false;
    out.unparsed.push(line);
  };

  for (const line of raw.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    let rest = line;
    let timing: Timing | null = null;
    let don = 0;
    let opt = false;
    let yourTurn = false;
    let oppTurn = false;
    const cost: CostSpec = {};
    const kws: Keyword[] = [];
    let bad = false;
    for (;;) {
      const m = /^\s*(?:\[([^\]]+)\]|DON!! ?[-−–](\d+)|([①-⑩❶-➓]))\s*:?\s*/.exec(rest);
      if (!m) break;
      if (m[1] !== undefined) {
        const tag = m[1];
        const dm = /^DON!! ?x(\d+)$/i.exec(tag);
        if (TIMINGS[tag]) {
          if (timing) bad = true;
          timing = TIMINGS[tag];
        } else if (dm) don = +dm[1];
        else if (tag === 'Once Per Turn') opt = true;
        else if (tag === 'Your Turn') yourTurn = true;
        else if (tag === "Opponent's Turn") oppTurn = true;
        else if ((KEYWORDS as string[]).includes(tag) && !timing && !don) kws.push(tag as Keyword);
        else break; // a [Card Name] at the start of a sentence — part of the body
      } else if (m[2] !== undefined) cost.donMinus = +m[2];
      else if (m[3] !== undefined) cost.don = circled(m[3]);
      rest = rest.slice(m[0].length);
    }
    let body = rest.trim();
    if (bad) {
      fail(line);
      continue;
    }
    if (!body) {
      if (kws.length && !timing) out.keywords.push(...kws);
      else fail(line);
      continue;
    }
    if (kws.length) {
      fail(line);
      continue;
    }

    // "You may <cost>: <effect>"
    const cm = /^You may (.+?): (.+)$/i.exec(body);
    if (cm) {
      if (!parseCost(cm[1], cost)) {
        fail(line);
        continue;
      }
      body = cm[2];
    }
    const hasCost = Object.keys(cost).length > 0;
    const sentences = splitSentences(body);

    // ---- continuous effects (no timing word)
    if (!timing) {
      if (hasCost || opt || sentences.length !== 1) {
        fail(line);
        continue;
      }
      let s = sentences[0].replace(/\.$/, '');
      let cond: Test | null = null;
      const im = /^If (.+?), (.+)$/i.exec(s);
      if (im) {
        cond = parseCond(im[1]);
        if (!cond) {
          fail(line);
          continue;
        }
        s = im[2];
      }
      const on = (g: Game, self: FieldCard): boolean => {
        const owner = ownerOf(self.uid);
        if (self.don < don) return false;
        if (yourTurn && g.active !== owner) return false;
        if (oppTurn && g.active === owner) return false;
        return !cond || cond(g, { player: owner, src: self.uid, cardId: self.id, sel: [], yes: false, idx: 0, v: {}, list: [], jump: -1 });
      };
      let m: RegExpExecArray | null;
      if ((m = /^this (?:Character|Leader) gains \+(\d+) power$/i.exec(s))) {
        const amount = +m[1];
        powerAuras.push((g, self, t) => (t.uid === self.uid && on(g, self) ? amount : 0));
      } else if ((m = /^this (?:Character|Leader) gains \[(Rush|Blocker|Banish|Double Attack|Unblockable)\]$/i.exec(s))) {
        const kw = m[1] as Keyword;
        kwAuras.push((g, self, k) => k === kw && on(g, self));
      } else if ((m = /^this Character gains \+(\d+) cost$/i.exec(s))) {
        const amount = +m[1];
        costAuras.push((g, self) => (on(g, self) ? amount : 0));
      } else if (/^this Character cannot be KO'd by effects$/i.test(s) && !don && !yourTurn && !oppTurn && !cond) out.cantBeKoByEffect = true;
      else if ((m = /^also treat this card's name as \[([^\]]+)\] according to the rules$/i.exec(s))) out.aliases.push(m[1]);
      else if (/^this (Leader|Character) cannot attack$/i.test(s) && !don && !yourTurn && !oppTurn && !cond) out.cantAttack = true;
      else if (/^under the rules of this game, you may have any number of this card in your deck$/i.test(s)) out.anyCopies = true;
      else fail(line);
      continue;
    }

    // ---- triggered / activated effects
    const steps: Step[] = [];
    const tags: string[] = [];
    let boost: number | undefined;
    let when: Test | undefined;
    let ref: Timing | undefined;
    let ok = true;
    for (let i = 0; i < sentences.length && ok; i++) {
      let s = sentences[i].replace(/^then, /i, '');
      let cond: Test | null = null;
      const im = /^If (.+?), (.+)$/i.exec(s);
      if (im) {
        cond = parseCond(im[1]);
        if (!cond) {
          ok = false;
          break;
        }
        s = im[2];
      }
      const p = parseEffect(s, timing, sentences[i + 1]);
      if (!p) {
        ok = false;
        break;
      }
      i += p.consumed ?? 0;
      if (p.ref) ref = p.ref;
      if (cond && i === (p.consumed ?? 0) && !steps.length) when = cond;
      steps.push(...(cond ? guarded(cond, p.steps) : p.steps));
      for (const t of p.tags) if (!tags.includes(t)) tags.push(t);
      if (p.boost !== undefined) boost = (boost ?? 0) + p.boost;
    }
    if (!ok || (ref && sentences.length !== 1)) {
      fail(line);
      continue;
    }
    const turnGate: Test | undefined = yourTurn ? (g, c) => g.active === c.player : oppTurn ? (g, c) => g.active !== c.player : undefined;
    const gates = [turnGate, when].filter((x): x is Test => !!x);
    const e: EffectDef = {
      timing,
      text: line,
      steps,
      tags,
      ...(don ? { don } : {}),
      ...(opt ? { opt } : {}),
      ...(hasCost ? { cost } : {}),
      ...(boost !== undefined ? { boost } : {}),
      ...(gates.length ? { when: (g: Game, c: Ctx) => gates.every((t) => t(g, c)) } : {}),
    };
    out.effects.push(e);
    if (ref) refs.push({ effect: e, ref });
  }

  // "[Trigger] Activate this card's [Main] effect."
  for (const { effect, ref } of refs) {
    const target = out.effects.find((e) => e.timing === ref && e !== effect);
    if (!target) {
      out.ok = false;
      out.unparsed.push(effect.text);
      continue;
    }
    effect.steps = target.steps;
    effect.tags = target.tags;
    if (!effect.when && target.when) effect.when = target.when;
  }

  if (powerAuras.length) out.powerAura = (g, self, t) => powerAuras.reduce((sum, a) => sum + a(g, self, t), 0);
  if (kwAuras.length) out.dynKeyword = (g, self, kw) => kwAuras.some((a) => a(g, self, kw));
  if (costAuras.length) out.costAura = (g, self) => costAuras.reduce((sum, a) => sum + a(g, self), 0);
  // Cards the engine cannot place yet.
  if (raw.category === 'Event' && !out.effects.some((e) => e.timing === 'main' || e.timing === 'counter')) out.ok = false;
  return out;
}

// Helpers shared with hand-written card scripts.
export { leaveField, plural };
