// Turns printed card text into runnable effects.
//
// Card text is built from a small vocabulary (see grammar.ts) and a set of effect sentences (see
// actions.ts). This file reads a card line by line: the [Timing] tags and costs in front, then the
// body, which is one of
//   - a triggered or activated effect            "[On Play] Draw 2 cards."
//   - a reaction to something that happens       "When your opponent activates an Event, ..."
//   - a replacement                              "If this Character would be K.O.'d, you may ... instead."
//   - a continuous effect                        "[DON!! x1] This Character gains +1000 power."
// The rule is strict: if ANY line on a card is not understood, the whole card is marked
// unsupported (sim: 'none') rather than played half-right.

import { normalise, parseBody, parseClause, splitSentences, trace } from './actions';
import { P, isLeader, mkCtx, ownerOf } from './game';
import { KW, KW_RE, inSel, parseCond, parseCount, parseDesc, parseSels, type Sel, type Test } from './grammar';
import { D } from './registry';
import type { CardDef, CostSpec, Ctx, EffectDef, EventType, FieldCard, Flag, Game, GameEvent, Keyword, RemovalCause, ReplaceDef, Timing } from './types';

export { isNamed } from './grammar';
export { trace };

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
  flagAura?: CardDef['flagAura'];
  handCost?: CardDef['handCost'];
  handAura?: CardDef['handAura'];
  auraFoe?: boolean;
  replaces?: ReplaceDef[];
  cantBeKoByEffect?: boolean;
  cantAttack?: boolean;
  anyCopies?: boolean;
}

const TIMINGS: Record<string, Timing> = {
  'On Play': 'onPlay',
  'When Attacking': 'whenAttacking',
  'On K.O.': 'onKO',
  'On KO': 'onKO',
  'On Block': 'onBlock',
  'Activate: Main': 'activateMain',
  Main: 'main',
  Counter: 'counter',
  Trigger: 'trigger',
  'End of Your Turn': 'endOfTurn',
  "On Your Opponent's Attack": 'onOppAttack',
};

const ctxOf = (self: FieldCard): Ctx => mkCtx(ownerOf(self.uid), self.uid, self.id);

const circled = (ch: string): number => {
  const code = ch.codePointAt(0) ?? 0;
  for (const base of [0x2460, 0x2780, 0x2776, 0x278a]) if (code >= base && code < base + 10) return code - base + 1;
  return 0;
};

// ---------------------------------------------------------------- costs

/** The costs the engine has always known by name. Kept as plain fields so the AI can reason about them. */
function simpleCost(input: string, k: CostSpec): boolean {
  let resting = false;
  for (const part of input.split(/ and /i)) {
    const s = part.trim();
    let m: RegExpExecArray | null;
    if (resting && /^this (Character|Stage|Leader|card)$/i.test(s)) {
      k.restSelf = true;
      continue;
    }
    resting = /^rest /i.test(s);
    if ((m = /^trash (\d+) cards? from your hand$/i.exec(s))) {
      if (k.trashFilter) return false;
      k.trashHand = (k.trashHand ?? 0) + +m[1];
    } else if (/^rest this (Character|Stage|Leader|card)$/i.test(s)) k.restSelf = true;
    else if ((m = /^rest (\d+) of your DON!! cards$/i.exec(s))) k.don = (k.don ?? 0) + +m[1];
    else if (/^add 1 card from the top or bottom of your Life cards to your hand$/i.test(s)) k.lifeToHand = true;
    else if ((m = /^return (\d+)(?: or more)? DON!! cards? from your field to your DON!! deck$/i.exec(s))) k.donMinus = (k.donMinus ?? 0) + +m[1];
    else return false;
  }
  return true;
}

function parseCost(input: string, k: CostSpec): boolean {
  const trial: CostSpec = {};
  if (simpleCost(input, trial)) {
    k.trashHand = trial.trashHand ?? k.trashHand;
    k.restSelf = trial.restSelf ?? k.restSelf;
    k.don = (k.don ?? 0) + (trial.don ?? 0) || undefined;
    k.lifeToHand = trial.lifeToHand ?? k.lifeToHand;
    k.donMinus = (k.donMinus ?? 0) + (trial.donMinus ?? 0) || undefined;
    for (const key of Object.keys(k) as (keyof CostSpec)[]) if (k[key] === undefined) delete k[key];
    return true;
  }
  const act = parseClause(input, { timing: null });
  if (!act || !act.can || act.consumed) return false;
  (k.extra ??= []).push({ text: input.replace(/\bKO\b/g, 'K.O.'), can: act.can, steps: act.steps });
  return true;
}

// ---------------------------------------------------------------- "When ..." reactions

type Match = (g: Game, self: FieldCard, ev: GameEvent) => boolean;
interface Reaction {
  event: EventType;
  match: Match;
}

function parseEvent(input: string): Reaction[] | null {
  const s = input.trim();
  const owner = (self: FieldCard): number => ownerOf(self.uid);
  const mine: Match = (_g, self, ev) => ev.player === owner(self);
  const theirs: Match = (_g, self, ev) => ev.player !== owner(self);
  const one = (event: EventType, match: Match): Reaction[] => [{ event, match }];
  const how = (suffix: string | undefined): ((ev: GameEvent, self: FieldCard) => boolean) => {
    const x = (suffix ?? '').toLowerCase();
    if (x.includes("opponent's effect")) return (ev, self) => ev.how === 'effect' && ev.by !== owner(self);
    if (x.includes('effect')) return (ev) => ev.how === 'effect';
    if (x.includes('battle')) return (ev) => ev.how === 'battle';
    return () => true;
  };
  let m: RegExpExecArray | null;

  if ((m = /^(?:a|(\d+) or more) DON!! cards? on (?:your|the) field (?:is|are) returned to your DON!! deck( by your effect)?$/i.exec(s))) {
    const n = m[1] ? +m[1] : 1;
    const byMe = !!m[2];
    return one('donReturned', (_g, self, ev) => ev.player === owner(self) && ev.n >= n && (!byMe || ev.by === owner(self)));
  }
  if (/^this Leader or any of your Characters is given a DON!! card$/i.test(s)) return one('donGiven', mine);
  if ((m = /^this Character is KO'd( by your opponent's effect| by an effect| in battle)?$/i.exec(s))) {
    const h = how(m[1]);
    return one('ko', (_g, self, ev) => ev.uid === self.uid && h(ev, self));
  }
  if (/^this Character battles and KO's your opponent's Character$/i.test(s)) return one('ko', (_g, self, ev) => ev.how === 'battle' && ev.other === self.uid && ev.player !== owner(self));
  if (/^a Character is KO'd$/i.test(s)) return one('ko', () => true);
  if (/^your opponent's Character is KO'd$/i.test(s)) return one('ko', theirs);
  if ((m = /^(?:one of )?your (.+?) is KO'd( by your opponent's effect| by an effect| in battle)?$/i.exec(s))) {
    const d = parseDesc(m[1]);
    const h = how(m[2]);
    return d ? one('ko', (g, self, ev) => ev.player === owner(self) && h(ev, self) && d.pred(g, ctxOf(self), ev.uid)) : null;
  }
  if (/^a Character is removed from the field by your effect$/i.test(s)) return one('removed', (_g, self, ev) => ev.by === owner(self));
  if ((m = /^your opponent's Character is (removed from the field|returned to the owner's hand) by your effect$/i.exec(s))) {
    const hand = /hand/i.test(m[1]);
    return one('removed', (_g, self, ev) => ev.player !== owner(self) && ev.by === owner(self) && (!hand || ev.how === 'hand'));
  }
  if ((m = /^your (.+?) is removed from the field by (an|your opponent's) effect$/i.exec(s))) {
    const d = parseDesc(m[1]);
    const foe = /opponent/i.test(m[2]);
    return d ? one('removed', (g, self, ev) => ev.player === owner(self) && (!foe || ev.by !== owner(self)) && d.pred(g, ctxOf(self), ev.uid)) : null;
  }
  if (/^you activate an Event$/i.test(s)) return one('useEvent', mine);
  if (/^your opponent activates an Event$/i.test(s)) return one('useEvent', theirs);
  if (/^your opponent activates (?:an? )?\[Blocker\]$/i.test(s)) return one('useBlocker', theirs);
  if (/^your opponent activates (?:(?:an? )?\[Blocker\] or an Event|an Event or (?:an? )?\[Blocker\])$/i.test(s)) return [...one('useEvent', theirs), ...one('useBlocker', theirs)];
  if ((m = /^you play a (Character.*?)( from your hand)?$/i.exec(s))) {
    const d = parseDesc(m[1]);
    const hand = !!m[2];
    return d ? one('playChar', (g, self, ev) => ev.player === owner(self) && (!hand || ev.how === 'hand') && d.pred(g, ctxOf(self), ev.uid)) : null;
  }
  if (/^your opponent plays a Character$/i.test(s)) return one('playChar', theirs);
  if ((m = /^an? (.+?) is played from your trash$/i.exec(s))) {
    const d = parseDesc(m[1]);
    return d ? one('playChar', (g, self, ev) => ev.player === owner(self) && ev.how === 'trash' && d.pred(g, ctxOf(self), ev.uid)) : null;
  }
  if (/^this (?:Character|Leader)'s attack deals damage to your opponent's Life$/i.test(s)) return one('damage', (_g, self, ev) => ev.uid === self.uid);
  if (/^you deal damage to your opponent's Life$/i.test(s)) return one('damage', theirs);
  if (/^you take damage$/i.test(s)) return one('damage', mine);
  if (/^a card is removed from your or your opponent's Life cards$/i.test(s)) return one('lifeLost', () => true);
  if (/^a card is removed from your opponent's Life cards$/i.test(s)) return one('lifeLost', theirs);
  if (/^a card is removed from your Life cards$/i.test(s)) return one('lifeLost', mine);
  if (/^a card is added to your hand from your Life(?: cards)?$/i.test(s)) return one('lifeToHand', mine);
  if (/^this (?:Character|Leader) becomes rested$/i.test(s)) return one('rested', (_g, self, ev) => ev.uid === self.uid);
  if (/^a \[Trigger\] activates$/i.test(s)) return one('trigger', () => true);
  if (/^this (?:Leader|Character) attacks or is attacked$/i.test(s)) return one('attack', (_g, self, ev) => ev.uid === self.uid || ev.other === self.uid);
  if (/^this (?:Leader|Character) attacks your opponent's Leader$/i.test(s)) return one('attack', (g, self, ev) => ev.uid === self.uid && isLeader(g, ev.other));
  if (/^you draw a card outside of your Draw Phase$/i.test(s)) return one('drawFx', mine);
  if (/^a card is trashed from your hand(?: by an effect)?$/i.test(s)) return one('handTrashed', mine);
  if (/^your opponent attacks$/i.test(s)) return one('attack', theirs);
  if (/^your opponent's Character attacks$/i.test(s)) return one('attack', (g, self, ev) => ev.player !== owner(self) && !isLeader(g, ev.uid));
  if (/^your opponent activates an Event or (?:a )?\[Trigger\]$/i.test(s)) return [...one('useEvent', theirs), ...one('trigger', theirs)];
  if (/^this (?:Character|Leader) (?:becomes|is) rested by your opponent's (?:Character's )?effect$/i.test(s)) return one('rested', (_g, self, ev) => ev.uid === self.uid && ev.by !== owner(self) && ev.how === 'effect');
  // "When A or B, ..."
  const om = /^(.+?),? or (?:when )?(.+)$/i.exec(s);
  if (om) {
    const [a, b] = [parseEvent(om[1]), parseEvent(om[2])];
    if (a && b) return [...a, ...b];
  }
  return null;
}

// ---------------------------------------------------------------- "If ... would be K.O.'d, you may ... instead"

type CauseTest = (cause: RemovalCause) => boolean;
function parseCause(verb: string, tail: string): CauseTest | null {
  const v = verb.toLowerCase();
  const t = tail.trim().toLowerCase();
  const by = (x: string): CauseTest | null =>
    x === ''
      ? () => true
      : x === 'in battle'
        ? (c) => c.battle
        : x === 'by an effect' || x === 'by effects'
          ? (c) => !c.battle
          : x === "by your opponent's effect" || x === "by your opponent's effects" || x === 'by your opponent'
            ? (c) => !c.battle && c.byOpp
            : null;
  if (v === 'leave the field') return t === '' ? () => true : null;
  if (v === 'removed from the field') {
    const km = /^(.*?)\s*or ko'd$/.exec(t);
    if (km) {
      const b = by(km[1].trim());
      return b ? (c) => c.mode === 'ko' || b(c) : null;
    }
    return by(t);
  }
  // K.O.'d, possibly "... or would be removed from the field by your opponent's effect"
  const om = /^(.*?)\s*or (?:would be )?removed from the field (by your opponent's effects?)$/.exec(t);
  if (om) {
    const b = by(om[1].trim());
    return b ? (c) => (c.mode === 'ko' && b(c)) || (!c.battle && c.byOpp) : null;
  }
  const b = by(t);
  return b ? (c) => c.mode === 'ko' && b(c) : null;
}

function parseVictim(input: string): ((g: Game, self: FieldCard, victim: FieldCard) => boolean) | null {
  const s = input.trim();
  if (/^this (Character|card)$/i.test(s)) return (_g, self, victim) => victim.uid === self.uid;
  const m = /^(?:one of |any of )?your (.+)$/i.exec(s);
  const d = m ? parseDesc(m[1]) : null;
  if (!d) return null;
  return (g, self, victim) => ownerOf(victim.uid) === ownerOf(self.uid) && !isLeader(g, victim.uid) && P(g, ownerOf(victim.uid)).stage?.uid !== victim.uid && d.pred(g, ctxOf(self), victim.uid);
}

// ---------------------------------------------------------------- the compiler

export function compileCard(raw: RawCard): Compiled {
  const out: Compiled = { ok: true, unparsed: [], keywords: [], effects: [], aliases: [] };
  const powerAuras: NonNullable<CardDef['powerAura']>[] = [];
  const costAuras: NonNullable<CardDef['costAura']>[] = [];
  const flagAuras: NonNullable<CardDef['flagAura']>[] = [];
  const selfKw: NonNullable<CardDef['dynKeyword']>[] = [];
  const handCosts: NonNullable<CardDef['handCost']>[] = [];
  const handAuras: NonNullable<CardDef['handAura']>[] = [];
  const replaces: ReplaceDef[] = [];
  const refs: { effect: EffectDef; ref: Timing }[] = [];
  const fail = (line: string): void => {
    out.ok = false;
    out.unparsed.push(line);
  };

  // "Choose one:" options are printed as separate "•" lines; fold them back into their sentence.
  const lines: string[] = [];
  for (const l of raw.text.split('\n').map((x) => x.trim()).filter(Boolean)) {
    if (/^(?:[•・]|- )/.test(l) && lines.length) lines[lines.length - 1] += ` ${l.replace(/^(?:・|- )/, '• ')}`;
    else if (/^Then, /.test(l) && lines.length) lines[lines.length - 1] += ` ${l}`;
    else lines.push(l);
  }

  for (const line of lines) {
    let rest = normalise(line);
    const timings: Timing[] = [];
    let don = 0;
    let opt = false;
    let yourTurn = false;
    let oppTurn = false;
    const cost: CostSpec = {};
    const kws: Keyword[] = [];
    for (;;) {
      const m = /^\s*(?:\[([^\]]+)\]|DON!! ?-(\d+)|([①-⑩❶-➓]))\s*[:/,]?\s*/.exec(rest);
      if (!m) break;
      if (m[1] !== undefined) {
        const tag = m[1];
        const dm = /^DON!! ?x(\d+)$/i.exec(tag);
        if (TIMINGS[tag]) timings.push(TIMINGS[tag]);
        else if (dm) don = +dm[1];
        else if (tag === 'Once Per Turn') opt = true;
        else if (tag === 'Your Turn') yourTurn = true;
        else if (tag === "Opponent's Turn") oppTurn = true;
        else if ((KW as string[]).includes(tag) && !timings.length && !don) kws.push(tag as Keyword);
        else break; // a [Card Name] at the start of a sentence — part of the body
      } else if (m[2] !== undefined) cost.donMinus = +m[2];
      else if (m[3] !== undefined) cost.don = circled(m[3]);
      rest = rest.slice(m[0].length);
    }
    let body = rest.trim();
    // Reminder text in brackets after a keyword: "[Blocker] (After your opponent declares an attack, ...)"
    if (kws.length && /^\(.*\)$/.test(body)) body = '';
    if (!body) {
      if (kws.length && !timings.length) out.keywords.push(...kws);
      else fail(line);
      continue;
    }
    if (kws.length) {
      fail(line);
      continue;
    }

    // "Rest 1 of your DON!! cards and you may rest this Character: …" is one cost with the "you may" in the middle.
    body = body.replace(/^((?:rest|trash|return|place) [^:.]+?) and you may ([^:.]+?): /i, 'You may $1 and $2: ');
    // "You may <cost>: <effect>"
    const cm = /^You may (.+?): (.+)$/is.exec(body);
    if (cm) {
      if (!parseCost(cm[1], cost)) {
        if (trace.on) trace.misses.push(`cost: ${cm[1]}`);
        fail(line);
        continue;
      }
      body = cm[2];
    }
    const hasCost = Object.keys(cost).length > 0;
    const turnGate: Test | undefined = yourTurn ? (g, c) => g.active === c.player : oppTurn ? (g, c) => g.active !== c.player : undefined;

    const addEffect = (timing: Timing, b: NonNullable<ReturnType<typeof parseBody>>, extra: Partial<EffectDef> = {}): void => {
      const gates = [turnGate, b.when].filter((x): x is Test => !!x);
      const e: EffectDef = {
        timing,
        text: line,
        steps: b.steps,
        tags: b.tags,
        ...(don ? { don } : {}),
        ...(opt ? { opt } : {}),
        ...(hasCost ? { cost } : {}),
        ...(b.boost !== undefined ? { boost: b.boost } : {}),
        ...(gates.length ? { when: (g: Game, c: Ctx) => gates.every((t) => t(g, c)) } : {}),
        ...extra,
      };
      out.effects.push(e);
      if (b.ref) refs.push({ effect: e, ref: b.ref });
    };

    // ---- triggered / activated effects
    if (timings.length) {
      const b = parseBody(body, { timing: timings[0] });
      if (!b) {
        fail(line);
        continue;
      }
      for (const t of timings) addEffect(t, b);
      continue;
    }

    // ---- reactions: "When X, ..." / "This effect can be activated when X. ..."
    const wm = /^When (.+?), (.+)$/is.exec(body) ?? /^This effect can be activated when (.+?)\. (.+)$/is.exec(body);
    if (wm) {
      const reactions = parseEvent(wm[1]);
      if (!reactions) {
        if (trace.on) trace.misses.push(`when: ${wm[1]}`);
        fail(line);
        continue;
      }
      const b = parseBody(wm[2], { timing: 'event' });
      if (!b || b.ref) {
        fail(line);
        continue;
      }
      for (const r of reactions) addEffect('event', b, { event: r.event, match: r.match });
      continue;
    }

    const sentences = splitSentences(body);
    if (hasCost || sentences.length !== 1) {
      if (trace.on) trace.misses.push(`static: ${body}`);
      fail(line);
      continue;
    }
    let s = sentences[0].replace(/\.$/, '');

    // ---- replacements
    const rm = /^If (.+?) would (?:be )?(KO'd|removed from the field|leave the field)(.*?), (?:you may )?(.+?) instead(?: of .+)?$/i.exec(s);
    if (rm) {
      let victimText = rm[1];
      let pre: Test | null = null;
      const am = /^(.+) and (this Character|your .+)$/i.exec(victimText);
      if (am && !parseVictim(victimText)) {
        pre = parseCond(am[1]);
        victimText = am[2];
        if (!pre) {
          if (trace.on) trace.misses.push(`cond: ${am[1]}`);
          fail(line);
          continue;
        }
      }
      const victim = parseVictim(victimText);
      const cause = parseCause(rm[2], rm[3]);
      const act = parseClause(rm[4], { timing: null });
      if (!victim || !cause || !act || !act.can || act.consumed) {
        if (trace.on) trace.misses.push(!victim ? `victim: ${victimText}` : !cause ? `cause: ${rm[2]}${rm[3]}` : `instead: ${rm[4]}`);
        fail(line);
        continue;
      }
      const can = act.can;
      replaces.push({
        text: line,
        opt,
        steps: act.steps,
        can: (g, self, v, c) => {
          const owner = ownerOf(self.uid);
          if (self.don < don || (yourTurn && g.active !== owner) || (oppTurn && g.active === owner)) return false;
          const ctx = ctxOf(self);
          ctx.v.that = v.uid;
          return victim(g, self, v) && cause(c) && (!pre || pre(g, ctx)) && can(g, ctx);
        },
      });
      continue;
    }

    // ---- continuous effects
    let cond: Test | null = null;
    const im = /^If (.+?), (.+)$/i.exec(s);
    if (im) {
      cond = parseCond(im[1]);
      if (!cond) {
        if (trace.on) trace.misses.push(`cond: ${im[1]}`);
        fail(line);
        continue;
      }
      s = im[2];
    } else {
      // "This Character gains [Double Attack] if you have 5 or more cards in your hand."
      const tm = /^(.+?),? if (.+)$/i.exec(s);
      const tc = tm ? parseCond(tm[2]) : null;
      if (tm && tc) {
        cond = tc;
        s = tm[1];
      }
    }
    const gated = !!cond || !!don || yourTurn || oppTurn || opt;
    const on = (g: Game, self: FieldCard): boolean => {
      const owner = ownerOf(self.uid);
      if (self.don < don) return false;
      if (yourTurn && g.active !== owner) return false;
      if (oppTurn && g.active === owner) return false;
      return !cond || cond(g, ctxOf(self));
    };
    type Who = (g: Game, self: FieldCard, t: FieldCard) => boolean;
    /** Who a continuous effect applies to. Only "this card", a Leader, or "all of ..." make sense here. */
    const subject = (text: string): Who | null => {
      const sels: Sel[] | null = parseSels(text) ?? (/^your /i.test(text.trim()) ? parseSels(`all of ${text.trim()}`) : null);
      if (!sels || !sels.every((sel) => sel.fixed === 'self' || sel.fixed === 'leader' || sel.fixed === 'oppLeader' || sel.all)) return null;
      if (sels.some((sel) => sel.fixed === 'oppLeader' || (!sel.fixed && sel.side !== 'own'))) out.auraFoe = true;
      return (g, self, t) => sels.some((sel) => (sel.fixed === 'self' ? t.uid === self.uid : inSel(g, ctxOf(self), sel, t)));
    };
    const kwOf = (name: string): Keyword | undefined => KW.find((k) => k.toLowerCase() === name.toLowerCase());
    const addStat = (who: Who, stat: string, amount: number): void => {
      (stat.toLowerCase() === 'power' ? powerAuras : costAuras).push((g, self, t) => (who(g, self, t) && on(g, self) ? amount : 0));
    };
    const addFlag = (who: Who, f: Flag): void => {
      flagAuras.push((g, self, t, flag) => flag === f && who(g, self, t) && on(g, self));
    };
    const one = (t: string): boolean => {
      let m: RegExpExecArray | null;
      if ((m = /^(?:under the rules of this game, )?also treat this card's name as \[([^\]]+)\](?: and \[([^\]]+)\])?(?: according to the rules)?$/i.exec(t)) && !gated) {
        out.aliases.push(m[1]);
        if (m[2]) out.aliases.push(m[2]);
        return true;
      }
      if (/^under the rules of this game, you may have any number of this card in your deck$/i.test(t) && !gated) {
        out.anyCopies = true;
        return true;
      }
      // cards still in hand
      if ((m = /^give this card in your hand -(\d+) cost$/i.exec(t))) {
        const amount = +m[1];
        handCosts.push((g, pid) => ((!yourTurn || g.active === pid) && (!oppTurn || g.active !== pid) && (!cond || cond(g, mkCtx(pid, 0, raw.id))) ? -amount : 0));
        return true;
      }
      if ((m = /^the cost of playing (.+?) from your hand will be reduced by (\d+)$/i.exec(t)) || (m = /^give (.+?) in your hand -(\d+) cost$/i.exec(t))) {
        const d = parseDesc(m[1]);
        if (!d) return false;
        const amount = +m[2];
        handAuras.push((g, self, uid) => (on(g, self) && d.cat(D(g.ids[uid])) && d.pred(g, ctxOf(self), uid) ? -amount : 0));
        return true;
      }
      if ((m = /^(.+?) gains? \+(\d+) power(?: and \+(\d+) cost)? for every (\d+ )?(.+)$/i.exec(t))) {
        const who = subject(m[1]);
        const count = parseCount(m[5]);
        if (!who || !count) return false;
        const [amount, costUp, per] = [+m[2], m[3] ? +m[3] : 0, m[4] ? +m[4] : 1];
        const times = (g: Game, self: FieldCard): number => Math.floor(count(g, ctxOf(self)) / per);
        powerAuras.push((g, self, x) => (who(g, self, x) && on(g, self) ? amount * times(g, self) : 0));
        if (costUp) costAuras.push((g, self, x) => (who(g, self, x) && on(g, self) ? costUp * times(g, self) : 0));
        return true;
      }
      if ((m = /^(.+?) gains? ([-+])(\d+) (power|cost)(?: and ([-+])(\d+) (power|cost))?$/i.exec(t)) || (m = /^give (.+?) ([-+])(\d+) (power|cost)$/i.exec(t))) {
        const who = subject(m[1]);
        if (!who) return false;
        addStat(who, m[4], (m[2] === '-' ? -1 : 1) * +m[3]);
        if (m[5]) addStat(who, m[7], (m[5] === '-' ? -1 : 1) * +m[6]);
        return true;
      }
      if ((m = new RegExp(`^(.+?) gains? \\[(${KW_RE})\\](?:,? (?:and )?\\[(${KW_RE})\\])?(?: and \\+(\\d+) (power|cost))?$`, 'i').exec(t))) {
        const who = subject(m[1]);
        const kws2 = [kwOf(m[2]), m[3] ? kwOf(m[3]) : undefined].filter((k): k is Keyword => !!k);
        if (!who || !kws2.length) return false;
        if (/^this (Character|Leader|card)$/i.test(m[1].trim())) selfKw.push((g, self, k) => kws2.includes(k) && on(g, self));
        else for (const k of kws2) addFlag(who, k);
        if (m[4]) addStat(who, m[5], +m[4]);
        return true;
      }
      if ((m = new RegExp(`^(.+?) gains? \\+(\\d+) (power|cost) and \\[(${KW_RE})\\]$`, 'i').exec(t))) {
        const who = subject(m[1]);
        const kw = kwOf(m[4]);
        if (!who || !kw) return false;
        addStat(who, m[3], +m[2]);
        addFlag(who, kw);
        return true;
      }
      if ((m = /^(.+?) can attack Characters on the turn in which (?:it is|they are) played$/i.exec(t))) {
        const who = subject(m[1]);
        if (!who) return false;
        addFlag(who, 'Rush: Character');
        return true;
      }
      if ((m = /^(.+?) cannot be KO'd( in battle| by effects| by your opponent's effects)?(?: by (?:<(\w+)> attribute (?:cards|Characters|Leaders or Characters)|(Leaders)))?$/i.exec(t))) {
        const who = subject(m[1]);
        if (!who) return false;
        const kind = (m[2] ?? '').toLowerCase();
        const attr = m[3];
        const leaders = !!m[4];
        const f: Flag = kind.includes('battle') || attr || leaders ? 'NoKOBattle' : kind ? 'NoKOEffect' : 'NoKO';
        if (f === 'NoKOEffect' && /^this Character$/i.test(m[1].trim()) && !gated) out.cantBeKoByEffect = true;
        flagAuras.push((g, self, x, flag) => {
          if (flag !== f || !who(g, self, x) || !on(g, self)) return false;
          if (!attr && !leaders) return true;
          const atk = g.battle ? g.ids[g.battle.attacker] : undefined;
          if (!g.battle || !atk) return false;
          return leaders ? isLeader(g, g.battle.attacker) : (D(atk).attribute as string[]).includes(attr);
        });
        return true;
      }
      if ((m = /^(.+?) cannot attack$/i.exec(t))) {
        const who = subject(m[1]);
        if (!who) return false;
        if (/^this (Leader|Character)$/i.test(m[1].trim()) && !gated) out.cantAttack = true;
        else addFlag(who, 'CantAttack');
        return true;
      }
      if ((m = /^(.+?) can(?: also)? attack (?:your opponent's )?active Characters$/i.exec(t))) {
        const who = subject(m[1]);
        if (who) addFlag(who, 'AttackActive');
        return !!who;
      }
      if ((m = /^(.+?) cannot be removed from the field by your opponent's effects$/i.exec(t))) {
        const who = subject(m[1]);
        if (who) addFlag(who, 'NoRemove');
        return !!who;
      }
      // "Your {X} type Leader's base power becomes 6000." — written as the difference from the printed power.
      if ((m = /^(?:the base power of (.+?) becomes (\d+)|set the base power of (.+?) to (\d+)|(.+?)(?:'s| cards')? base power becomes (\d+))$/i.exec(t))) {
        const who = subject(m[1] ?? m[3] ?? m[5]);
        const amount = +(m[2] ?? m[4] ?? m[6]);
        if (!who) return false;
        powerAuras.push((g, self, x) => (who(g, self, x) && on(g, self) ? amount - D(x.id).power : 0));
        return true;
      }
      return false;
    };
    let done = one(s);
    if (!done) {
      // "This Character cannot be removed ... and gains [Blocker]" — one subject, two statements.
      const sm = /^(.+?) (?:gains?|cannot|can) /i.exec(s);
      const cut = /,? and /i.exec(s);
      const parts = s.split(/,? and /i);
      if (sm && cut && parts.length === 2) {
        const second = /^(?:gains?|cannot|can) /i.test(parts[1]) ? `${sm[1]} ${parts[1]}` : parts[1];
        done = one(parts[0]) && one(second);
      }
    }
    if (!done) {
      if (trace.on) trace.misses.push(`static: ${s}`);
      fail(line);
    }
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
    if (!effect.cost && target.cost) effect.cost = target.cost;
  }

  if (powerAuras.length) out.powerAura = (g, self, t) => powerAuras.reduce((sum, a) => sum + a(g, self, t), 0);
  if (costAuras.length) out.costAura = (g, self, t) => costAuras.reduce((sum, a) => sum + a(g, self, t), 0);
  if (flagAuras.length) out.flagAura = (g, self, t, f) => flagAuras.some((a) => a(g, self, t, f));
  if (selfKw.length) out.dynKeyword = (g, self, kw) => selfKw.some((a) => a(g, self, kw));
  if (handCosts.length) out.handCost = (g, pid) => handCosts.reduce((sum, a) => sum + a(g, pid), 0);
  if (handAuras.length) out.handAura = (g, self, uid) => handAuras.reduce((sum, a) => sum + a(g, self, uid), 0);
  if (replaces.length) out.replaces = replaces;
  // Cards the engine cannot place yet.
  if (raw.category === 'Event' && !out.effects.some((e) => e.timing === 'main' || e.timing === 'counter')) out.ok = false;
  return out;
}

