// The vocabulary of card text: numbers, card descriptions, targets, conditions and durations.
//
// Card text is built from a small set of reusable pieces — "up to 1 of your opponent's rested
// Characters with a cost of 4 or less", "if you have 2 or less Life cards", "until the end of your
// opponent's next turn". Each piece is parsed here once, so effect sentences only have to say what
// they DO with it.

import { P, costOf, defOf, fieldCards, findField, hasState, opp, ownerOf, powerOf, totalDon } from './game';
import { D } from './registry';
import type { CardDef, Ctx, FieldCard, Game, Keyword, PlayerId, Span } from './types';

export type Test = (g: Game, c: Ctx) => boolean;
export type Num = (g: Game, c: Ctx) => number;
/** A test on one card, wherever it is (field, hand, deck, trash). */
export type Pred = (g: Game, c: Ctx, uid: number) => boolean;

export const KW: Keyword[] = ['Rush', 'Blocker', 'Double Attack', 'Banish', 'Unblockable', 'Rush: Character'];
export const KW_RE = 'Rush: Character|Rush|Blocker|Banish|Double Attack|Unblockable';

export const isNamed = (d: CardDef, name: string): boolean => d.name === name || !!d.aliases?.includes(name);
const hasType = (d: CardDef, t: string): boolean => d.types.includes(t);
const cmpWord = (word: string | undefined): ((a: number, n: number) => boolean) =>
  !word ? (a, n) => a === n : /less|fewer/i.test(word) ? (a, n) => a <= n : (a, n) => a >= n;

// ---------------------------------------------------------------- card descriptions

export interface Desc {
  /** Property tests (cost, power, type, name...). Does not test what kind of card it is. */
  pred: Pred;
  /** Which cards on the field the noun covers. */
  leader: boolean;
  chars: boolean;
  stage: boolean;
  /** The same noun as a test for cards in hand / deck / trash. */
  cat: (d: CardDef) => boolean;
  /** Mentions "this Character" — only meaningful for a card on the field. */
  text: string;
}

const NUMX = "(the (?:combined )?(?:total|number)(?: number)? of [^,.;]*?(?:Life cards|field|hand|trash))";

/** "{Straw Hat Crew} type Character card with a cost of 4 or less other than [Nami]" */
export function parseDesc(input: string): Desc | null {
  const one = parseDescOne(input);
  if (one) return one;
  const s = input.trim();
  // "... other than [X]" at the end covers every alternative in front of it.
  const om = /^(.+ or .+) other than \[([^\]]+)\]$/i.exec(s);
  if (om) {
    const inner = parseDesc(om[1]);
    if (inner) return { ...inner, text: s, pred: (g, c, u) => !isNamed(defOf(g, u), om[2]) && inner.pred(g, c, u) };
  }
  // "[Nami] or {Straw Hat Crew} type card", "{FILM} type Character or Character with a [Trigger]"
  const re = /,? or /gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const a = parseDescOne(s.slice(0, m.index));
    if (!a) continue;
    const b = parseDesc(s.slice(m.index + m[0].length));
    if (!b) continue;
    return {
      pred: (g, c, u) => (a.cat(defOf(g, u)) && a.pred(g, c, u)) || (b.cat(defOf(g, u)) && b.pred(g, c, u)),
      leader: a.leader || b.leader,
      chars: a.chars || b.chars,
      stage: a.stage || b.stage,
      cat: (d) => a.cat(d) || b.cat(d),
      text: s,
    };
  }
  return null;
}

function parseDescOne(input: string): Desc | null {
  let s = ` ${input.trim()} `;
  const tests: Pred[] = [];
  let named = false;
  const eat = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void): boolean => {
    const m = re.exec(s);
    if (!m) return false;
    if (fn(m) === false) return false;
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ');
    return true;
  };
  const cost = (g: Game, uid: number, base: boolean): number => {
    const fc = base ? null : findField(g, uid);
    return fc ? costOf(g, fc) : defOf(g, uid).cost;
  };
  const power = (g: Game, uid: number, base: boolean): number => {
    const fc = base ? null : findField(g, uid);
    return fc ? powerOf(g, fc) : defOf(g, uid).power;
  };
  const hasPower = (g: Game, uid: number): boolean => defOf(g, uid).category === 'Character' || defOf(g, uid).category === 'Leader';

  eat(/ other than (?:your )?\[([^\]]+)\] or \[([^\]]+)\]/i, (m) => void tests.push((g, _c, u) => !isNamed(defOf(g, u), m[1]) && !isNamed(defOf(g, u), m[2])));
  eat(/ other than (?:your )?\[([^\]]+)\]/i, (m) => void tests.push((g, _c, u) => !isNamed(defOf(g, u), m[1])));
  eat(/ other than this (?:Character|card|Leader|Stage)/i, () => void tests.push((_g, c, u) => u !== c.src));
  eat(/ (?:(?:with|and|that has) )?(?:an? )?(base )?cost of (\d+) to (\d+)/i, (m) => void tests.push((g, _c, u) => cost(g, u, !!m[1]) >= +m[2] && cost(g, u, !!m[1]) <= +m[3]));
  eat(/ (?:(?:with|and|that has) )?(?:an? )?(base )?cost of (\d+) or (?:with a cost of )?(\d+) or more/i, (m) => void tests.push((g, _c, u) => cost(g, u, !!m[1]) === +m[2] || cost(g, u, !!m[1]) >= +m[3]));
  eat(/ (?:(?:with|and|that has) )?(\d+) to (\d+) (base )?power/i, (m) => void tests.push((g, _c, u) => hasPower(g, u) && power(g, u, !!m[3]) >= +m[1] && power(g, u, !!m[3]) <= +m[2]));
  eat(/ (?:(?:with|and|that has) )?(\d+) or (more|less) (base )?power/i, (m) => {
    const ok = cmpWord(m[2]);
    tests.push((g, _c, u) => hasPower(g, u) && ok(power(g, u, !!m[3]), +m[1]));
  });
  eat(/ (?:with|that has|that have) (?:a DON!! card|(\d+) or more DON!! cards?) given/i, (m) => void tests.push((g, _c, u) => (findField(g, u)?.don ?? 0) >= (m[1] ? +m[1] : 1)));
  eat(new RegExp(` (?:(?:with|and|that has) )?(?:an? )?(base )?cost (?:that is )?equal to or (less|more) than ${NUMX}`, 'i'), (m) => {
    const n = parseNum(m[3]);
    if (!n) return false;
    const ok = cmpWord(m[2]);
    tests.push((g, c, u) => ok(cost(g, u, !!m[1]), n(g, c)));
  });
  for (let k = 0; k < 2; k++) {
    eat(/ (?:and with |(?:with|and|that has|or) )?(?:an? )?(base |original )?cost (?:of )?(\d+)(?: (or less|or more))?/i, (m) => {
      const ok = cmpWord(m[3]);
      tests.push((g, _c, u) => ok(cost(g, u, !!m[1]), +m[2]));
    });
    eat(/ (?:(?:with|and|that has) )?(?:an? )?(base )?power of (\d+)(?: (or less|or more))?/i, (m) => {
      const ok = cmpWord(m[3]);
      tests.push((g, _c, u) => hasPower(g, u) && ok(power(g, u, !!m[1]), +m[2]));
    });
    eat(/ (?:(?:with|and|that has) )?(\d+) (base )?power(?: (or less|or more))?/i, (m) => {
      const ok = cmpWord(m[3]);
      tests.push((g, _c, u) => hasPower(g, u) && ok(power(g, u, !!m[2]), +m[1]));
    });
  }
  eat(/ (?:(?:with|and|that has) )?(?:an? )?types? including "([^"]+)"/i, (m) => void tests.push((g, _c, u) => defOf(g, u).types.some((t) => t.includes(m[1]))));
  eat(/ (?:with|and) no base effect/i, () => void tests.push((g, _c, u) => !defOf(g, u).text.trim()));
  eat(/ without (?:a )?Counter(?!\])/i, () => void tests.push((g, _c, u) => !defOf(g, u).counter));
  eat(/ (?:with )?both the \{([^}]+)\} type and (?:an? )?\[Trigger\]/i, (m) => void tests.push((g, _c, u) => hasType(defOf(g, u), m[1]) && /\[Trigger\]/.test(defOf(g, u).text)));
  eat(/ (?:and )?without (?:an? )?\[Trigger\]/i, () => void tests.push((g, _c, u) => !/\[Trigger\]/.test(defOf(g, u).text)));
  eat(/ (?:(?:with|and|that has) )?(?:an? )?\[Trigger\]/i, () => void tests.push((g, _c, u) => /\[Trigger\]/.test(defOf(g, u).text)));
  const kwTest = (g: Game, u: number, kw: Keyword): boolean => {
    const fc = findField(g, u);
    return fc ? hasState(g, fc, kw) : !!defOf(g, u).keywords?.includes(kw);
  };
  eat(new RegExp(` (?:and )?without (?:an? )?\\[(${KW_RE})\\]`, 'i'), (m) => void tests.push((g, _c, u) => !kwTest(g, u, m[1] as Keyword)));
  eat(new RegExp(` (?:with|and|that has) (?:an? )?\\[(${KW_RE})\\]`, 'i'), (m) => void tests.push((g, _c, u) => kwTest(g, u, m[1] as Keyword)));
  eat(/ without (?:an? )?\[(On Play|When Attacking|Activate: Main|On K\.?O\.?|Counter)\](?: effect)?/i, (m) => void tests.push((g, _c, u) => !defOf(g, u).text.includes(`[${m[1].replace('KO', 'K.O.')}]`)));
  eat(/ (?:with|and|that has) (?:an? )?\[(On Play|When Attacking|Activate: Main|On K\.?O\.?|Counter)\](?: effect)?/i, (m) => void tests.push((g, _c, u) => defOf(g, u).text.includes(`[${m[1].replace('KO', 'K.O.')}]`)));
  eat(/ (?:(?:with|and) (?:the )?)?<([A-Za-z]+)> or <([A-Za-z]+)> attribute/i, (m) => void tests.push((g, _c, u) => (defOf(g, u).attribute as string[]).some((a) => a === m[1] || a === m[2])));
  eat(/ (?:with )?both the \{([^}]+)\} and \{([^}]+)\} types/i, (m) => void tests.push((g, _c, u) => hasType(defOf(g, u), m[1]) && hasType(defOf(g, u), m[2])));
  eat(/ (?:(?:with|and) the )?\{([^}]+)\}, \{([^}]+)\},? or \{([^}]+)\} type/i, (m) => void tests.push((g, _c, u) => [m[1], m[2], m[3]].some((t) => hasType(defOf(g, u), t))));
  eat(/ \[([^\]]+)\], \[([^\]]+)\],? or \[([^\]]+)\]/i, (m) => {
    named = true;
    tests.push((g, _c, u) => [m[1], m[2], m[3]].some((x) => isNamed(defOf(g, u), x)));
  });
  eat(/ (?:(?:with|and) (?:the )?)?[<＜]([A-Za-z]+)[>＞] attribute/i, (m) => void tests.push((g, _c, u) => (defOf(g, u).attribute as string[]).includes(m[1])));
  eat(/ (?:(?:with|and) the )?\{([^}]+)\} or \{([^}]+)\} type/i, (m) => void tests.push((g, _c, u) => hasType(defOf(g, u), m[1]) || hasType(defOf(g, u), m[2])));
  eat(/ (?:(?:with|and) the )?\{([^}]+)\} type/i, (m) => void tests.push((g, _c, u) => hasType(defOf(g, u), m[1])));
  eat(/ \[([^\]]+)\] or \[([^\]]+)\]/i, (m) => {
    named = true;
    tests.push((g, _c, u) => isNamed(defOf(g, u), m[1]) || isNamed(defOf(g, u), m[2]));
  });
  eat(/ \[([^\]]+)\]/i, (m) => {
    named = true;
    tests.push((g, _c, u) => isNamed(defOf(g, u), m[1]));
  });
  eat(/ (red|green|blue|purple|black|yellow) /i, (m) => void tests.push((g, _c, u) => defOf(g, u).colors.some((x) => x.toLowerCase() === m[1].toLowerCase())));
  eat(/ monocolored /i, () => void tests.push((g, _c, u) => defOf(g, u).colors.length === 1));
  eat(/ (\d+) cost /i, (m) => void tests.push((g, _c, u) => cost(g, u, false) === +m[1]));
  eat(/ multicolored /i, () => void tests.push((g, _c, u) => defOf(g, u).colors.length > 1));
  eat(/ rested /i, () => void tests.push((g, _c, u) => !!findField(g, u)?.rested));
  eat(/ active /i, () => void tests.push((g, _c, u) => findField(g, u)?.rested === false));

  // the noun
  let leader = false;
  let chars = false;
  let stage = false;
  let cat: (d: CardDef) => boolean = () => true;
  const isCat = (...k: string[]) => (d: CardDef): boolean => k.includes(d.category);
  if (eat(/ (?:Leaders? or Character cards?|Leaders? or Characters?|Leaders? and Character cards?|Leaders? and Characters?|Characters? or Leader|Characters? and Leader) /i, () => undefined)) {
    leader = chars = true;
    cat = isCat('Character', 'Leader');
  } else if (eat(/ Leader or Stage cards? /i, () => undefined)) {
    leader = stage = true;
    cat = isCat('Leader', 'Stage');
  } else if (eat(/ (?:Character or Stage cards?|Characters? or Stages?) /i, () => undefined)) {
    chars = stage = true;
    cat = isCat('Character', 'Stage');
  } else if (eat(/ (?:Event or Stage cards?|Events? or Stages?) /i, () => undefined)) {
    stage = true;
    cat = isCat('Event', 'Stage');
  } else if (eat(/ (?:Character or Event cards?|Characters? or Events?) /i, () => undefined)) {
    chars = true;
    cat = isCat('Character', 'Event');
  } else if (eat(/ Characters?(?: cards?)? /i, () => undefined)) {
    chars = true;
    cat = isCat('Character');
  } else if (eat(/ Events?(?: cards?)? /i, () => undefined)) cat = isCat('Event');
  else if (eat(/ Stages?(?: cards?)? /i, () => undefined)) {
    stage = true;
    cat = isCat('Stage');
  } else if (eat(/ Leaders?(?: cards?)? /i, () => undefined)) {
    leader = true;
    cat = isCat('Leader');
  } else if (eat(/ cards? /i, () => undefined) || named) leader = chars = stage = true;
  else return null;
  if (s.trim()) return null;
  return { pred: (g, c, u) => tests.every((t) => t(g, c, u)), leader, chars, stage, cat, text: input.trim() };
}

// ---------------------------------------------------------------- targets on the field

export interface Sel {
  side: 'own' | 'opp' | 'any';
  /** A target that needs no choosing: the card itself, a Leader, or "that Character". */
  fixed?: 'self' | 'leader' | 'oppLeader' | 'that';
  all: boolean;
  max: number;
  upTo: boolean;
  desc?: Desc;
  /** "your Leader or 1 of your Characters" */
  plusLeader?: boolean;
  /** Characters only (no Leader, no Stage) — used by the generic "select" action. */
  noLeader?: boolean;
  text: string;
}

export function parseSel(input: string): Sel | null {
  const s = input.trim();
  const base = { all: false, max: 1, upTo: false, text: s };
  let m: RegExpExecArray | null;
  if (/^this (?:Character|Leader|card|Stage)$/i.test(s)) return { ...base, side: 'own', fixed: 'self' };
  if (/^(?:your|this) Leader$/i.test(s) || /^up to 1 of your Leader$/i.test(s)) return { ...base, side: 'own', fixed: 'leader' };
  if (/^your opponent's Leader$/i.test(s)) return { ...base, side: 'opp', fixed: 'oppLeader' };
  if (/^(?:that|the selected|the chosen|those|the selected) (?:Characters?|cards?|Leader or Character cards?)$|^it$|^them$/i.test(s)) return { ...base, side: 'any', fixed: 'that' };
  // "your {Navy} type Leader", "your 1 active Leader", "your Leader [Kouzuki Oden]"
  if ((m = /^(?:up to 1 of )?(your opponent's|your) (?:1 )?(.*\bLeader\b.*)$/i.exec(s)) && !/ or \d| or up to | and /i.test(m[2])) {
    const desc = parseDescOne(m[2]);
    if (desc && desc.leader && !desc.chars && !desc.stage) return /opponent/i.test(m[1]) ? { ...base, side: 'opp', fixed: 'oppLeader', desc } : { ...base, side: 'own', fixed: 'leader', desc };
  }
  // "up to 1 of your Leader with X or up to 1 of your Characters with X"
  if ((m = /^(up to )?(\d+) of your (.+?),? or (?:up to )?\2 of your (.+)$/i.exec(s))) {
    const desc = parseDesc(`${m[3]} or ${m[4]}`);
    if (desc) return { ...base, side: 'own', upTo: !!m[1], max: +m[2], desc };
  }
  if ((m = /^(?:this|your) Leader or (up to )?(\d+) of your (.+)$/i.exec(s))) {
    const desc = parseDesc(m[3]);
    return desc ? { ...base, side: 'own', upTo: !!m[1], max: +m[2], desc, plusLeader: true } : null;
  }
  if ((m = /^(up to )?(?:a total of )?(\d+|all|any number) (?:of )?(your opponent's |your |the opponent's |their |)(.+)$/i.exec(s))) {
    const mine = / on your field$/i.test(m[4]);
    const desc = parseDesc(m[4].replace(/ on (?:your|their) field$/i, ''));
    if (!desc) return null;
    const who = mine ? 'your' : m[3].trim().toLowerCase();
    const all = /^all$/i.test(m[2]);
    const any = /^any number$/i.test(m[2]);
    return { ...base, side: who === 'your' ? 'own' : who ? 'opp' : 'any', all, upTo: !!m[1] || any, max: all || any ? 99 : +m[2], desc };
  }
  if ((m = /^(your opponent's|your) (.+)$/i.exec(s))) {
    const desc = parseDesc(m[2]);
    if (!desc || !/s$/i.test(m[2].replace(/ with .*$/i, '').replace(/ other than .*$/i, '').trim())) return null;
    return { ...base, side: /opponent/i.test(m[1]) ? 'opp' : 'own', all: true, max: 99, desc };
  }
  return null;
}

/** Is `t` one of the cards this selector could mean? */
export function inSel(g: Game, c: Ctx, sel: Sel, t: FieldCard): boolean {
  const owner = ownerOf(t.uid);
  const p = P(g, owner);
  if (sel.fixed === 'self') return t.uid === c.src;
  if (sel.fixed === 'leader') return owner === c.player && p.leader.uid === t.uid && (!sel.desc || sel.desc.pred(g, c, t.uid));
  if (sel.fixed === 'oppLeader') return owner !== c.player && p.leader.uid === t.uid && (!sel.desc || sel.desc.pred(g, c, t.uid));
  if (sel.fixed === 'that') return c.those?.length ? c.those.includes(t.uid) : t.uid === c.v.that;
  if (sel.side === 'own' && owner !== c.player) return false;
  if (sel.side === 'opp' && owner === c.player) return false;
  const d = sel.desc!;
  const isLeader = p.leader.uid === t.uid;
  if (isLeader && sel.plusLeader && owner === c.player) return true;
  const isStage = p.stage?.uid === t.uid;
  if (isLeader ? !d.leader : isStage ? !d.stage : !d.chars) return false;
  return d.pred(g, c, t.uid);
}

export function candidates(g: Game, c: Ctx, sel: Sel): FieldCard[] {
  if (sel.fixed === 'self') {
    const t = findField(g, c.src);
    return t ? [t] : [];
  }
  if (sel.fixed === 'that') return (c.those?.length ? c.those : [c.v.that ?? 0]).map((u) => findField(g, u)).filter((t): t is FieldCard => !!t);
  if (sel.fixed === 'leader' || sel.fixed === 'oppLeader') {
    const t = P(g, sel.fixed === 'leader' ? c.player : opp(c.player)).leader;
    return inSel(g, c, sel, t) ? [t] : [];
  }
  const sides: PlayerId[] = sel.side === 'own' ? [c.player] : sel.side === 'opp' ? [opp(c.player)] : [opp(c.player), c.player];
  return sides.flatMap((pid) => fieldCards(g, pid)).filter((t) => inSel(g, c, sel, t));
}

/** "your Leader and all of your Characters", "up to 1 of X and up to 1 of Y" — one selector per part. */
export function parseSels(input: string): Sel[] | null {
  const s = input.trim();
  const whole = parseSel(s);
  if (whole) return [whole];
  const re = /,? and /gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const left = parseSel(s.slice(0, m.index));
    if (!left) continue;
    const tail = s.slice(m.index + m[0].length);
    // "all of your [A] and {B} type Characters" — the second half borrows "all of your".
    const lead = /^(all of your |all your |all of your opponent's |up to \d+ of your (?:opponent's )?)/i.exec(s)?.[1];
    const right = parseSels(tail) ?? (lead ? parseSels(`${lead}${tail}`) : null);
    if (right) return [left, ...right];
  }
  return null;
}

// ---------------------------------------------------------------- numbers and counts

/** "cards in your hand", "Events in your trash", "{Navy} type Characters", "rested DON!! cards"... as a number. */
export function parseCount(input: string, who: 'me' | 'opp' | 'both' = 'me'): Num | null {
  let s = input.trim().replace(/^of /i, '');
  let side = who;
  let m: RegExpExecArray | null;
  if ((m = /^(your opponent's|your|their) (.+)$/i.exec(s))) {
    side = /^your$/i.test(m[1]) ? 'me' : /their/i.test(m[1]) ? who : 'opp';
    s = m[2];
  }
  const players = (c: Ctx): PlayerId[] => (side === 'me' ? [c.player] : side === 'opp' ? [opp(c.player)] : [c.player, opp(c.player)]);
  const sum = (f: (g: Game, pid: PlayerId, c: Ctx) => number): Num => (g, c) => players(c).reduce<number>((n, pid) => n + f(g, pid, c), 0);
  if ((m = /^(.+?) (?:in|from) (your opponent's|your|their) (hand|trash|deck)$/i.exec(s))) {
    const whose = /^your$/i.test(m[2]) ? 'me' : /their/i.test(m[2]) ? side : 'opp';
    const zone = m[3].toLowerCase() as 'hand' | 'trash' | 'deck';
    const d = parseDesc(m[1]);
    if (!d) return null;
    return (g, c) => (whose === 'me' ? [c.player] : whose === 'opp' ? [opp(c.player)] : [c.player, opp(c.player)] as PlayerId[]).reduce<number>((n, pid) => n + P(g, pid)[zone].filter((u) => d.cat(defOf(g, u)) && d.pred(g, c, u)).length, 0);
  }
  if (/^Life cards?$/i.test(s)) return sum((g, pid) => P(g, pid).life.length);
  if (/^face-up Life cards?$/i.test(s)) return sum((g, pid) => P(g, pid).life.filter((l) => l.faceUp).length);
  if (/^(?:given DON!! cards?|DON!! cards? given)$/i.test(s)) return sum((g, pid) => [P(g, pid).leader, ...P(g, pid).chars].reduce((k, fc) => k + fc.don, 0));
  if (/^cards? in (?:your|their) Life area and hand$/i.test(s)) return sum((g, pid) => P(g, pid).life.length + P(g, pid).hand.length);
  if (/^DON!! cards?(?: on (?:your|their|your opponent's|the) field)?$/i.test(s)) {
    if (/your opponent's/i.test(s)) side = 'opp';
    return sum((g, pid) => totalDon(P(g, pid)));
  }
  if (/^rested DON!! cards?$/i.test(s)) return sum((g, pid) => P(g, pid).donRested);
  if (/^active DON!! cards?$/i.test(s)) return sum((g, pid) => P(g, pid).donActive);
  if ((m = /^(.+?) on (your opponent's|your|their) field$/i.exec(s))) {
    if (/opponent/i.test(m[2])) side = 'opp';
    else if (/^your$/i.test(m[2])) side = 'me';
    s = m[1];
  }
  const d = parseDesc(s);
  if (!d) return null;
  return sum((g, pid, c) => {
    const p = P(g, pid);
    let n = 0;
    if (d.leader && d.pred(g, c, p.leader.uid)) n++;
    if (d.chars) n += p.chars.filter((x) => d.pred(g, c, x.uid)).length;
    if (d.stage && p.stage && d.pred(g, c, p.stage.uid)) n++;
    return n;
  });
}

export function parseNum(input: string): Num | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) {
    const n = +s;
    return () => n;
  }
  let m: RegExpExecArray | null;
  if (/^the (?:combined )?(?:total|number)(?: number)? of your and your opponent's Life cards$/i.test(s)) return (g, c) => P(g, c.player).life.length + P(g, opp(c.player)).life.length;
  if ((m = /^the (?:total )?number of (.+)$/i.exec(s))) return parseCount(m[1]);
  return null;
}

// ---------------------------------------------------------------- durations

export const DUR = "(during this (?:turn|battle)|until the (?:end|start) of (?:your opponent's next (?:turn|End Phase)|your next turn|your next End Phase|the turn|this turn|the battle|this battle))";

export function parseDur(input: string | undefined): Span | null {
  const s = (input ?? '').trim().toLowerCase();
  if (s === 'during this turn' || s === 'until the end of the turn' || s === 'until the end of this turn') return 'turn';
  if (s === 'during this battle' || s === 'until the end of the battle' || s === 'until the end of this battle') return 'battle';
  if (s === "until the end of your opponent's next turn") return 'oppTurn';
  if (s === "until the end of your opponent's next end phase") return 'oppEnd';
  if (s === 'until the start of your next turn') return 'myStart';
  if (s === 'until the end of your next turn' || s === 'until the end of your next end phase') return 'myTurn';
  return null;
}

export const spanWords = (span: Span): string =>
  span === 'battle' ? 'this battle' : span === 'turn' ? 'this turn' : span === 'oppTurn' ? "until the end of the opponent's next turn" : span === 'oppEnd' ? "until the end of the opponent's next End Phase" : span === 'myStart' ? 'until the start of its owner\'s next turn' : "until the end of its owner's next turn";

// ---------------------------------------------------------------- conditions

function condAtom(input: string): Test | null {
  const s = input.trim();
  let m: RegExpExecArray | null;
  const leader = (g: Game, c: Ctx): CardDef => D(P(g, c.player).leader.id);
  if ((m = /^your Leader (?:has|is) (?:the )?\{([^}]+)\}(?: or (?:the )?\{([^}]+)\})? type$/i.exec(s))) return (g, c) => hasType(leader(g, c), m![1]) || (!!m![2] && hasType(leader(g, c), m![2]));
  if ((m = /^your Leader(?:'s type includes| has a type including) "([^"]+)"$/i.exec(s))) return (g, c) => leader(g, c).types.some((t) => t.includes(m![1]));
  if ((m = /^your Leader is \[([^\]]+)\](?: or \[([^\]]+)\])?$/i.exec(s))) return (g, c) => isNamed(leader(g, c), m![1]) || (!!m![2] && isNamed(leader(g, c), m![2]));
  if (/^your Leader is multicolored$/i.test(s)) return (g, c) => leader(g, c).colors.length > 1;
  if ((m = /^your Leader is \{([^}]+)\}$/i.exec(s))) return (g, c) => hasType(leader(g, c), m![1]);
  if ((m = /^(your|your opponent's) Leader has the <([A-Za-z]+)> attribute$/i.exec(s))) return (g, c) => (D(P(g, /opponent/i.test(m![1]) ? opp(c.player) : c.player).leader.id).attribute as string[]).includes(m![2]);
  if ((m = /^your Leader's colors? includes? (red|green|blue|purple|black|yellow)$/i.exec(s))) return (g, c) => leader(g, c).colors.some((x) => x.toLowerCase() === m![1].toLowerCase());
  if ((m = /^your opponent's Leader has (\d+) power or (more|less)$/i.exec(s))) return (g, c) => cmpWord(m![2])(powerOf(g, P(g, opp(c.player)).leader), +m![1]);
  if ((m = /^(you have|your opponent has) any (active |rested )?DON!! cards?( given| on (?:your|their) field)?$/i.exec(s))) {
    const me = /^you have$/i.test(m[1]);
    const kind = (m[2] ?? '').trim().toLowerCase();
    const given = /given/i.test(m[3] ?? '');
    return (g, c) => {
      const p = P(g, me ? c.player : opp(c.player));
      if (given) return [p.leader, ...p.chars].some((fc) => fc.don > 0);
      return kind === 'active' ? p.donActive > 0 : kind === 'rested' ? p.donRested > 0 : totalDon(p) > 0;
    };
  }
  if (/^all of your DON!! cards are rested$/i.test(s)) return (g, c) => P(g, c.player).donActive === 0;
  if ((m = /^your opponent has (more|less|fewer) (.+?) than you$/i.exec(s)) || (m = /^you have (more|less|fewer) (.+?) than your opponent$/i.exec(s))) {
    const first = /^your opponent/i.test(s) ? 'opp' : 'me';
    const what = m[2].replace(/ on (?:their|your) field$/i, '');
    const [a, b] = [parseCount(what, first), parseCount(what, first === 'me' ? 'opp' : 'me')];
    const more = /more/i.test(m[1]);
    if (a && b) return (g, c) => (more ? a(g, c) > b(g, c) : a(g, c) < b(g, c));
  }
  if ((m = /^the number of (DON!! cards on your field|cards in your hand|your Characters|your Life cards) is (at least (\d+) less than|equal to or less than|less than|equal to or more than|more than) the number (?:of )?(?:DON!! cards )?(?:on your opponent's field|in your opponent's hand|of your opponent's Characters|your opponent's Characters|your opponent's Life cards|of your opponent's Life cards)$/i.exec(s))) {
    const what = m[1].toLowerCase();
    const count = (g: Game, pid: PlayerId): number => (what.startsWith('don') ? totalDon(P(g, pid)) : what.startsWith('cards') ? P(g, pid).hand.length : what.includes('life') ? P(g, pid).life.length : P(g, pid).chars.length);
    const w = m[2].toLowerCase();
    const gap = m[3] ? +m[3] : 0;
    return (g, c) => {
      const [a, b] = [count(g, c.player), count(g, opp(c.player))];
      return gap ? a <= b - gap : w === 'equal to or less than' ? a <= b : w === 'less than' ? a < b : w === 'equal to or more than' ? a >= b : a > b;
    };
  }
  if ((m = /^you only have (.+)$/i.exec(s))) {
    const d = parseDesc(m[1]);
    return d ? (g, c) => P(g, c.player).chars.every((x) => d.pred(g, c, x.uid)) : null;
  }
  if ((m = /^your Leader is (active|rested)$/i.exec(s))) return (g, c) => P(g, c.player).leader.rested === /rested/i.test(m![1]);
  if ((m = /^your Leader has (\d+) power or (more|less)$/i.exec(s))) return (g, c) => cmpWord(m![2])(powerOf(g, P(g, c.player).leader), +m![1]);
  if ((m = /^this (?:Character|Leader|card|Stage) is (rested|active)$/i.exec(s))) return (g, c) => findField(g, c.src)?.rested === /rested/i.test(m![1]);
  if ((m = /^this (?:Character|Leader) has (\d+) power or (more|less)$/i.exec(s))) {
    return (g, c) => {
      const t = findField(g, c.src);
      return !!t && cmpWord(m![2])(powerOf(g, t), +m![1]);
    };
  }
  if ((m = /^this (?:Character|Leader) has (\d+) or (more|less) DON!! cards? given$/i.exec(s))) return (g, c) => cmpWord(m![2])(findField(g, c.src)?.don ?? 0, +m![1]);
  if (/^this Character was played on this turn$/i.test(s)) return (g, c) => findField(g, c.src)?.playedTurn === g.turn;
  if (/^it is your turn$/i.test(s)) return (g, c) => g.active === c.player;
  if (/^it is your opponent's turn$/i.test(s)) return (g, c) => g.active !== c.player;
  if (/^you do$/i.test(s)) return (_g, c) => c.v.did === 1;
  if ((m = /^you have (less|fewer|more) Life cards than your opponent$/i.exec(s))) {
    return (g, c) => {
      const [a, b] = [P(g, c.player).life.length, P(g, opp(c.player)).life.length];
      return /more/i.test(m![1]) ? a > b : a < b;
    };
  }
  if ((m = /^your opponent has (less|fewer|more) Life cards than you$/i.exec(s))) {
    return (g, c) => {
      const [a, b] = [P(g, opp(c.player)).life.length, P(g, c.player).life.length];
      return /more/i.test(m![1]) ? a > b : a < b;
    };
  }
  if ((m = /^the number of DON!! cards on your field is (equal to or less than|less than|equal to or more than|more than|equal to) the number (?:of DON!! cards )?on your opponent's field$/i.exec(s))) {
    const w = m[1].toLowerCase();
    return (g, c) => {
      const [a, b] = [totalDon(P(g, c.player)), totalDon(P(g, opp(c.player)))];
      return w === 'equal to or less than' ? a <= b : w === 'less than' ? a < b : w === 'equal to or more than' ? a >= b : w === 'more than' ? a > b : a === b;
    };
  }
  if ((m = /^the only Characters on your field are (.+)$/i.exec(s))) {
    const d = parseDesc(m[1]);
    return d ? (g, c) => P(g, c.player).chars.every((x) => d.pred(g, c, x.uid)) : null;
  }
  const who = (w: string): 'me' | 'opp' | 'both' => (/^you have$/i.test(w) ? 'me' : /^your opponent has$/i.test(w) ? 'opp' : 'both');
  const WHO = '(you have|your opponent has|there is|there are|you and your opponent have|either you or your opponent has)';
  if ((m = new RegExp(`^${WHO} (?:a total of )?(\\d+) or (less|more|fewer) (.+)$`, 'i').exec(s))) {
    const n = parseCount(m[4], who(m[1]));
    const ok = cmpWord(m[3]);
    return n ? (g, c) => ok(n(g, c), +m![2]) : null;
  }
  if ((m = new RegExp(`^${WHO} (?:exactly )?(\\d+) (.+)$`, 'i').exec(s))) {
    const n = parseCount(m[3], who(m[1]));
    return n ? (g, c) => n(g, c) === +m![2] : null;
  }
  if ((m = /^(you have|your opponent has|there (?:is|are)) no (other )?(.+)$/i.exec(s))) {
    const n = parseCount(m[2] ? `${m[3]} other than this card` : m[3], who(m[1]));
    return n ? (g, c) => n(g, c) === 0 : null;
  }
  if ((m = /^(you|your opponent) (?:don't|do not|doesn't|does not) have (\d+) (.+)$/i.exec(s))) {
    const cnt = parseCount(m[3], /^you$/i.test(m[1]) ? 'me' : 'opp');
    if (cnt) return (g, c) => cnt(g, c) < +m![2];
  }
  if (/^the revealed card has the chosen cost$/i.test(s)) return (_g, c) => c.v.hit === 1;
  if ((m = /^(you|your opponent) (?:don't|do not|doesn't|does not) have (?:an? |any )?(.+)$/i.exec(s))) {
    const n = parseCount(m[2], /^you$/i.test(m[1]) ? 'me' : 'opp');
    return n ? (g, c) => n(g, c) === 0 : null;
  }
  if ((m = /^(you have|your opponent has|there is) (?:an? |another )?(.+)$/i.exec(s))) {
    const n = parseCount(m[2], who(m[1]));
    return n ? (g, c) => n(g, c) >= 1 : null;
  }
  return null;
}

/** "your Leader has the {Navy} type and you have 2 or less Life cards" */
export function parseCond(input: string): Test | null {
  const s = input.trim();
  const whole = condAtom(s);
  if (whole) return whole;
  const re = /,? and /gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const left = condAtom(s.slice(0, m.index));
    if (!left) continue;
    const right = parseCond(s.slice(m.index + m[0].length));
    if (right) return (g, c) => left(g, c) && right(g, c);
  }
  // The second half often leaves its subject out: "your Leader has the {X} type or is [Y]".
  const subject = /^(your Leader|you have|your opponent has|this Character|there is)\b/i.exec(s)?.[1];
  const carried = (x: string): Test | null => {
    const direct = condAtom(x);
    if (direct || !subject) return direct;
    for (const glue of ['', 'is ', 'has ', 'has the ']) {
      const t = condAtom(`${subject} ${glue}${x}`);
      if (t) return t;
    }
    return null;
  };
  re.lastIndex = 0;
  while ((m = re.exec(s))) {
    const left = condAtom(s.slice(0, m.index));
    if (!left) continue;
    const right = carried(s.slice(m.index + m[0].length));
    if (right) return (g, c) => left(g, c) && right(g, c);
  }
  const om = /^(.+?),? or (.+)$/i.exec(s);
  if (om) {
    const [a, b] = [condAtom(om[1]), carried(om[2])];
    if (a && b) return (g, c) => a(g, c) || b(g, c);
  }
  return null;
}
