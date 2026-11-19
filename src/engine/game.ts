// The rules engine: setup, turn structure, DON!!, battles, counters, triggers and effect resolution.
//
// Everything that needs a decision becomes a `pending` Choice on the game. The caller answers with
// apply(g, { type: 'answer', ... }) and the engine carries on from exactly where it stopped. Effects
// are lists of small steps (see STEPS) that run on a stack of frames, so the whole game state stays
// plain data.

import { CARDS, D, STEPS } from './registry';
import type {
  Action,
  Answer,
  CardDef,
  CostSpec,
  Ctx,
  DeckList,
  EffectDef,
  FieldCard,
  Flag,
  Frame,
  Game,
  Keyword,
  LogKind,
  PlayerId,
  PlayerState,
  Step,
  Timing,
  Until,
} from './types';

// ---------------------------------------------------------------- basics

export const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
export const ownerOf = (uid: number): PlayerId => (uid < 1000 ? 0 : 1);
export const P = (g: Game, p: PlayerId): PlayerState => g.players[p];
export const defOf = (g: Game, uid: number): CardDef => D(g.ids[uid]);
export const nameOf = (g: Game, uid: number): string => defOf(g, uid).name;

export const mkCtx = (player: PlayerId, src: number, cardId: string, v: Record<string, number> = {}): Ctx => ({
  player,
  src,
  cardId,
  sel: [],
  yes: false,
  idx: 0,
  v,
  list: [],
  jump: -1,
});

const mkField = (uid: number, id: string, turn: number): FieldCard => ({
  uid,
  id,
  rested: false,
  don: 0,
  playedTurn: turn,
  mods: [],
  flags: [],
  used: [],
  frozen: false,
});

export function log(g: Game, p: PlayerId | null, msg: string, kind: LogKind = 'info'): void {
  g.log.push({ turn: g.turn, p, msg, kind });
}

// Log grammar. The human player is named "You", so verbs and possessives must agree:
// "You play" / "CPU plays", "Your Jinbe" / "CPU's Jinbe".
const isYou = (g: Game, pid: PlayerId): boolean => g.players[pid].name === 'You';
const third = (verb: string): string => (verb === 'have' ? 'has' : /(s|sh|ch|x|o)$/.test(verb) ? `${verb}es` : `${verb}s`);
/** A verb that agrees with the player: "play" for You, "plays" for anyone else. */
export const vb = (g: Game, pid: PlayerId, verb: string): string => (isYou(g, pid) ? verb : third(verb));
/** Subject plus verb: "You play" / "CPU plays". */
export const sv = (g: Game, pid: PlayerId, verb: string): string => `${g.players[pid].name} ${vb(g, pid, verb)}`;
/** Possessive: "Your" / "CPU's". Pass `false` for mid-sentence ("your"). */
export const own = (g: Game, pid: PlayerId, capital = true): string => (isYou(g, pid) ? (capital ? 'Your' : 'your') : `${g.players[pid].name}'s`);
/** Possessive pronoun: "your" / "its". */
export const their = (g: Game, pid: PlayerId): string => (isYou(g, pid) ? 'your' : 'its');

/** Deterministic PRNG (mulberry32) so games can be replayed from a seed. */
export function rand(g: Game): number {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(g: Game, a: number[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export const cloneGame = (g: Game): Game => structuredClone(g);

// ---------------------------------------------------------------- queries

export function findField(g: Game, uid: number): FieldCard | null {
  const p = P(g, ownerOf(uid));
  if (p.leader.uid === uid) return p.leader;
  if (p.stage?.uid === uid) return p.stage;
  return p.chars.find((c) => c.uid === uid) ?? null;
}

export const isLeader = (g: Game, uid: number): boolean => P(g, ownerOf(uid)).leader.uid === uid;

/** Leader + Characters of a player (the cards that have power). */
export const unitsOf = (g: Game, p: PlayerId): FieldCard[] => [P(g, p).leader, ...P(g, p).chars];

export function powerOf(g: Game, fc: FieldCard): number {
  const owner = ownerOf(fc.uid);
  let p = D(fc.id).power;
  if (g.active === owner) p += fc.don * 1000;
  for (const m of fc.mods) if (m.stat === 'power') p += m.amount;
  for (const src of unitsOf(g, owner)) {
    const aura = D(src.id).powerAura;
    if (aura) p += aura(g, src, fc);
  }
  const stage = P(g, owner).stage;
  if (stage) {
    const aura = D(stage.id).powerAura;
    if (aura) p += aura(g, stage, fc);
  }
  return p;
}

/** Itemised power for the UI ("6000 base +2000 DON!! +1000 effects"). */
export function powerBreakdown(g: Game, fc: FieldCard): { base: number; don: number; effects: number; total: number } {
  const base = D(fc.id).power;
  const don = g.active === ownerOf(fc.uid) ? fc.don * 1000 : 0;
  const total = powerOf(g, fc);
  return { base, don, effects: total - base - don, total };
}

export function costOf(g: Game, fc: FieldCard): number {
  const d = D(fc.id);
  let c = d.cost + (d.costAura ? d.costAura(g, fc) : 0);
  for (const m of fc.mods) if (m.stat === 'cost') c += m.amount;
  return Math.max(0, c);
}

export const hasFlag = (fc: FieldCard, flag: Flag): boolean => fc.flags.some((f) => f.flag === flag);

export function hasKw(g: Game, fc: FieldCard, kw: Keyword): boolean {
  const d = D(fc.id);
  return !!d.keywords?.includes(kw) || hasFlag(fc, kw) || !!d.dynKeyword?.(g, fc, kw);
}

export const totalDon = (p: PlayerState): number =>
  p.donActive + p.donRested + p.leader.don + p.chars.reduce((n, c) => n + c.don, 0);

export const busy = (g: Game): boolean => !!g.pending || !!g.battle || g.frames.length > 0 || g.queue.length > 0;

/** The player who has to do something right now (null when the game is over or mid-resolution). */
export function whoActs(g: Game): PlayerId | null {
  if (g.winner !== null) return null;
  if (g.pending) return g.pending.player;
  if (g.phase === 'main' && !busy(g)) return g.active;
  return null;
}

// ---------------------------------------------------------------- state changes

export function addMod(fc: FieldCard, stat: 'power' | 'cost', amount: number, until: Until): void {
  fc.mods.push({ stat, amount, until });
}
export function addFlag(fc: FieldCard, flag: Flag, until: Until): void {
  fc.flags.push({ flag, until });
}

export function draw(g: Game, pid: PlayerId, n: number): number {
  const p = P(g, pid);
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const u = p.deck.shift();
    if (u === undefined) break;
    p.hand.push(u);
    drawn++;
  }
  return drawn;
}

export function restDon(g: Game, pid: PlayerId, n: number): void {
  const p = P(g, pid);
  const k = Math.min(n, p.donActive);
  p.donActive -= k;
  p.donRested += k;
}

/** DON!! −N: rested DON!! go back first, then active, then DON!! attached to cards. */
export function returnDon(g: Game, pid: PlayerId, n: number): void {
  const p = P(g, pid);
  let left = n;
  const take = (have: number): number => {
    const k = Math.min(have, left);
    left -= k;
    return k;
  };
  p.donRested -= take(p.donRested);
  p.donActive -= take(p.donActive);
  for (const fc of [...p.chars, p.leader]) fc.don -= take(fc.don);
  p.donDeck += n - left;
}

export function trashFromHand(g: Game, pid: PlayerId, uids: number[]): void {
  const p = P(g, pid);
  for (const u of uids) {
    const i = p.hand.indexOf(u);
    if (i < 0) continue;
    p.hand.splice(i, 1);
    p.trash.push(u);
    log(g, pid, `${sv(g, pid, 'trash')} ${nameOf(g, u)} from hand.`);
  }
}

type Dest = 'trash' | 'hand' | 'deckBottom' | 'lifeTop';

/** Removes a Character or Stage from the field. Attached DON!! return to the cost area rested. */
export function leaveField(g: Game, uid: number, dest: Dest): boolean {
  const p = P(g, ownerOf(uid));
  let fc: FieldCard | null = null;
  const i = p.chars.findIndex((c) => c.uid === uid);
  if (i >= 0) fc = p.chars.splice(i, 1)[0];
  else if (p.stage?.uid === uid) {
    fc = p.stage;
    p.stage = null;
  }
  if (!fc) return false;
  p.donRested += fc.don;
  if (dest === 'trash') p.trash.push(uid);
  else if (dest === 'hand') p.hand.push(uid);
  else if (dest === 'deckBottom') p.deck.push(uid);
  else p.life.unshift({ uid, faceUp: true });
  return true;
}

export function koCard(g: Game, uid: number, cause: 'battle' | 'effect'): boolean {
  const fc = findField(g, uid);
  if (!fc || isLeader(g, uid)) return false;
  const owner = ownerOf(uid);
  const d = D(fc.id);
  if (P(g, owner).noKO || hasFlag(fc, 'NoKO') || (cause === 'effect' && d.cantBeKoByEffect)) {
    log(g, null, `${d.name} cannot be K.O.'d.`);
    return false;
  }
  leaveField(g, uid, 'trash');
  g.stats[opp(owner)].kos++;
  log(g, owner, `${own(g, owner)} ${d.name} is K.O.'d.`, 'ko');
  trigger(g, 'onKO', uid, fc);
  return true;
}

export type RemoveMode = 'ko' | 'hand' | 'bottom' | 'trash';
const MODES: RemoveMode[] = ['ko', 'hand', 'bottom', 'trash'];

function doRemove(g: Game, uid: number, mode: RemoveMode): void {
  const owner = ownerOf(uid);
  const name = findField(g, uid) ? nameOf(g, uid) : '';
  if (mode === 'ko') koCard(g, uid, 'effect');
  else if (leaveField(g, uid, mode === 'hand' ? 'hand' : mode === 'bottom' ? 'deckBottom' : 'trash')) {
    const where = mode === 'hand' ? "returned to its owner's hand" : mode === 'bottom' ? "placed at the bottom of its owner's deck" : 'trashed';
    log(g, owner, `${own(g, owner)} ${name} is ${where}.`, 'effect');
  }
}

/** Removal by a card effect. Gives the owner the chance to use a replacement effect first. */
export function removeByEffect(g: Game, by: PlayerId, uid: number, mode: RemoveMode): void {
  const fc = findField(g, uid);
  if (!fc || isLeader(g, uid)) return;
  const owner = ownerOf(uid);
  const d = D(fc.id);
  if (mode === 'ko' && (d.cantBeKoByEffect || P(g, owner).noKO || hasFlag(fc, 'NoKO'))) {
    log(g, null, `${d.name} cannot be K.O.'d by this effect.`);
    return;
  }
  if (by !== owner && d.category === 'Character') {
    const reps = P(g, owner).chars.filter((r) => r.uid !== uid && D(r.id).replaceRemoval?.can(g, r, fc));
    if (reps.length) {
      const c = mkCtx(owner, uid, fc.id, { mode: MODES.indexOf(mode) });
      c.list = reps.map((r) => r.uid);
      g.frames.push({ key: 'sys#replace', step: 0, ctx: c });
      return;
    }
  }
  doRemove(g, uid, mode);
}

/** Puts a Character into play. The card must already be out of its previous zone. */
export function playCharacter(g: Game, pid: PlayerId, uid: number, rested: boolean): void {
  if (!g.limbo.includes(uid)) g.limbo.push(uid);
  g.frames.push({ key: 'sys#play', step: 0, ctx: mkCtx(pid, uid, g.ids[uid], { rested: rested ? 1 : 0 }) });
}

export function placeStage(g: Game, pid: PlayerId, uid: number): void {
  const p = P(g, pid);
  const li = g.limbo.indexOf(uid);
  if (li >= 0) g.limbo.splice(li, 1);
  if (p.stage) {
    log(g, pid, `${nameOf(g, p.stage.uid)} is trashed to make room for the new Stage.`);
    leaveField(g, p.stage.uid, 'trash');
  }
  p.stage = mkField(uid, g.ids[uid], g.turn);
  log(g, pid, `${sv(g, pid, 'play')} the Stage ${nameOf(g, uid)}.`, 'play');
  trigger(g, 'onPlay', uid);
}

export function win(g: Game, pid: PlayerId, reason: string): void {
  if (g.winner !== null) return;
  g.winner = pid;
  g.winReason = reason;
  g.phase = 'over';
  g.pending = null;
  g.pendingFrom = null;
  g.frames = [];
  g.queue = [];
  g.battle = null;
  log(g, pid, `${sv(g, pid, 'win')} — ${reason}`, 'win');
}

// ---------------------------------------------------------------- effects

export const effectKey = (id: string, i: number): string => `${id}#${i}`;

export function canPay(g: Game, pid: PlayerId, src: number, k: CostSpec): boolean {
  const p = P(g, pid);
  if (k.don && p.donActive < k.don) return false;
  if (k.donMinus && totalDon(p) < k.donMinus) return false;
  if (k.restSelf) {
    const fc = findField(g, src);
    if (!fc || fc.rested) return false;
  }
  if (k.trashHand) {
    const n = p.hand.filter((u) => u !== src && (!k.trashFilter || k.trashFilter(defOf(g, u)))).length;
    if (n < k.trashHand) return false;
  }
  if (k.reveal) {
    const n = p.hand.filter((u) => !k.revealFilter || k.revealFilter(defOf(g, u))).length;
    if (n < k.reveal) return false;
  }
  if (k.lifeToHand && p.life.length === 0) return false;
  return true;
}

/** Human-readable description of a cost, for prompts. */
export function costText(k: CostSpec): string {
  const parts: string[] = [];
  if (k.don) parts.push(`rest ${k.don} DON!!`);
  if (k.donMinus) parts.push(`return ${k.donMinus} DON!! to your DON!! deck`);
  if (k.restSelf) parts.push('rest this card');
  if (k.trashHand) parts.push(`trash ${k.trashHand} ${k.trashDesc ?? 'card'}${k.trashDesc ? '' : k.trashHand > 1 ? 's' : ''} from your hand`);
  if (k.reveal) parts.push(`reveal ${k.reveal} matching cards from your hand`);
  if (k.lifeToHand) parts.push('add 1 Life card to your hand');
  return parts.join(', ');
}

const FIELD_TIMINGS: Timing[] = ['onPlay', 'whenAttacking', 'onBlock', 'activateMain', 'endOfTurn', 'onOppAttack', 'afterBattleChar'];

function buildSteps(d: CardDef, e: EffectDef, key: string): Step[] {
  const needsField = FIELD_TIMINGS.includes(e.timing);
  // Effects the player explicitly chose to use don't need a second "are you sure?".
  const chosen = e.timing === 'activateMain' || e.timing === 'main' || e.timing === 'counter' || e.timing === 'trigger';
  const markUsed = (g: Game, c: Ctx): void => {
    if (!e.opt) return;
    const fc = findField(g, c.src);
    if (fc && !fc.used.includes(key)) fc.used.push(key);
  };
  const s: Step[] = [];
  s.push((g, c) => {
    if (needsField && !findField(g, c.src)) return 'stop';
    if (e.when && !e.when(g, c)) return 'stop';
    if (!e.cost) {
      markUsed(g, c);
      return;
    }
    if (!canPay(g, c.player, c.src, e.cost)) return 'stop';
    c.yes = true;
    if (!chosen) return { kind: 'confirm', player: c.player, prompt: `${d.name} — ${e.text}`, source: d.id, effectKey: key };
  });
  const k = e.cost;
  if (k) {
    s.push((g, c) => {
      if (!c.yes) return 'stop';
      markUsed(g, c);
      const p = P(g, c.player);
      if (k.don) restDon(g, c.player, k.don);
      if (k.donMinus) {
        returnDon(g, c.player, k.donMinus);
        log(g, c.player, `${sv(g, c.player, 'return')} ${k.donMinus} DON!! to the DON!! deck.`);
      }
      if (k.restSelf) {
        const fc = findField(g, c.src);
        if (fc) fc.rested = true;
      }
      if (k.reveal) {
        const shown = p.hand.filter((u) => !k.revealFilter || k.revealFilter(defOf(g, u))).slice(0, k.reveal);
        log(g, c.player, `${sv(g, c.player, 'reveal')} ${shown.map((u) => nameOf(g, u)).join(' and ')}.`);
      }
      if (k.lifeToHand) {
        c.idx = 0;
        if (p.life.length > 1) {
          return { kind: 'option', player: c.player, prompt: 'Add which Life card to your hand?', labels: ['Top card', 'Bottom card'], tag: 'lifeCost', source: d.id };
        }
      }
    });
    if (k.lifeToHand) {
      s.push((g, c) => {
        const p = P(g, c.player);
        const lc = c.idx === 0 ? p.life.shift() : p.life.pop();
        if (lc) {
          p.hand.push(lc.uid);
          log(g, c.player, `${sv(g, c.player, 'add')} a Life card to hand (${p.life.length} Life left).`);
        }
      });
    }
    if (k.trashHand) {
      const n = k.trashHand;
      s.push((g, c) => {
        const opts = P(g, c.player).hand.filter((u) => u !== c.src && (!k.trashFilter || k.trashFilter(defOf(g, u))));
        return {
          kind: 'select',
          player: c.player,
          prompt: `Cost: trash ${n} ${k.trashDesc ?? 'card'} from your hand.`,
          options: opts,
          min: Math.min(n, opts.length),
          max: Math.min(n, opts.length),
          intent: 'discard',
          source: d.id,
        };
      });
      s.push((g, c) => trashFromHand(g, c.player, c.sel));
    }
  }
  s.push(...e.steps);
  return s;
}

export function registerCards(defs: CardDef[]): void {
  for (const d of defs) {
    CARDS[d.id] = d;
    d.effects?.forEach((e, i) => {
      const key = effectKey(d.id, i);
      STEPS[key] = buildSteps(d, e, key);
    });
  }
}

/** Queues every effect of `uid` with the given timing whose conditions are met. */
export function trigger(g: Game, timing: Timing, uid: number, was?: FieldCard): void {
  const id = g.ids[uid];
  const d = D(id);
  if (!d.effects) return;
  // `was` is the card as it stood on the field, for effects that fire as it leaves ([On K.O.]).
  const fc = findField(g, uid) ?? was ?? null;
  const owner = ownerOf(uid);
  d.effects.forEach((e, i) => {
    if (e.timing !== timing) return;
    const key = effectKey(id, i);
    if (e.don && (!fc || fc.don < e.don)) return;
    if (e.opt && fc?.used.includes(key)) return;
    const c = mkCtx(owner, uid, id);
    if (e.when && !e.when(g, c)) return;
    g.queue.push({ key, step: 0, ctx: c });
  });
}

// ---------------------------------------------------------------- system routines

STEPS['sys#play'] = [
  (g, c) => {
    const p = P(g, c.player);
    c.sel = [];
    if (p.chars.length >= 5) {
      return {
        kind: 'select',
        player: c.player,
        prompt: 'Your Character area is full (5). Choose 1 of your Characters to trash to make room.',
        options: p.chars.map((x) => x.uid),
        min: 1,
        max: 1,
        intent: 'overflow',
        source: c.cardId,
      };
    }
  },
  (g, c) => {
    const p = P(g, c.player);
    for (const u of c.sel) {
      const n = nameOf(g, u);
      if (leaveField(g, u, 'trash')) log(g, c.player, `${n} is trashed to make room (this is not a K.O.).`);
    }
    const li = g.limbo.indexOf(c.src);
    if (li >= 0) g.limbo.splice(li, 1);
    const fc = mkField(c.src, c.cardId, g.turn);
    fc.rested = c.v.rested === 1;
    p.chars.push(fc);
    log(g, c.player, `${sv(g, c.player, 'play')} ${D(c.cardId).name}${fc.rested ? ' (rested)' : ''}.`, 'play');
    trigger(g, 'onPlay', c.src);
  },
];

STEPS['sys#replace'] = [
  (g, c) => {
    const opts = c.list.filter((u) => {
      const r = findField(g, u);
      const v = findField(g, c.src);
      return !!r && !!v && !!D(r.id).replaceRemoval?.can(g, r, v);
    });
    c.sel = [];
    if (!findField(g, c.src) || !opts.length) return;
    return {
      kind: 'select',
      player: c.player,
      prompt: `Your opponent's effect would remove ${D(c.cardId).name}. Use one of these cards to protect it instead?`,
      options: opts,
      min: 0,
      max: 1,
      intent: 'protect',
      source: c.cardId,
    };
  },
  (g, c) => {
    const rep = c.sel.length ? findField(g, c.sel[0]) : null;
    if (rep) {
      const rd = D(rep.id);
      log(g, c.player, `${rd.name} protects ${D(c.cardId).name}: ${rd.replaceRemoval!.text}`, 'effect');
      rd.replaceRemoval!.apply(g, rep);
    } else doRemove(g, c.src, MODES[c.v.mode]);
  },
];

function usableTrigger(g: Game, pid: PlayerId, uid: number): number {
  const d = defOf(g, uid);
  if (!d.effects) return -1;
  return d.effects.findIndex((e) => {
    if (e.timing !== 'trigger') return false;
    const c = mkCtx(pid, uid, d.id);
    if (e.when && !e.when(g, c)) return false;
    return !e.cost || canPay(g, pid, uid, e.cost);
  });
}

// ctx.player = the player taking damage; v.n = damage left; v.banish = 1 if the attacker has [Banish].
STEPS['sys#damage'] = [
  (g, c) => {
    if (c.v.n <= 0) return 'stop';
    const p = P(g, c.player);
    if (p.life.length === 0) {
      // Defeat is decided when the hit lands: only a Leader that ALREADY had 0 Life loses.
      // A [Double Attack] that takes the last Life card does not win — its second damage is lost.
      if (c.v.dealt) {
        log(g, c.player, `No Life cards are left, so the rest of the damage is lost. ${own(g, c.player)} Leader survives — for now.`, 'damage');
        return 'stop';
      }
      win(g, opp(c.player), `${own(g, c.player)} Leader took damage with no Life cards left.`);
      return 'stop';
    }
    const lc = p.life.shift()!;
    c.v.n--;
    c.v.dealt = 1;
    c.v.card = lc.uid;
    if (c.v.banish) {
      p.trash.push(lc.uid);
      log(g, c.player, `${sv(g, c.player, 'take')} 1 damage — [Banish] trashes the Life card ${nameOf(g, lc.uid)} (${p.life.length} Life left).`, 'damage');
      c.jump = 0;
      return;
    }
    log(g, c.player, `${sv(g, c.player, 'take')} 1 damage (${p.life.length} Life left).`, 'damage');
    if (usableTrigger(g, c.player, lc.uid) >= 0) {
      // The card waits in limbo (revealed to its owner only) while they decide.
      g.limbo.push(lc.uid);
      return { kind: 'trigger', player: c.player, uid: lc.uid };
    }
    p.hand.push(lc.uid);
    c.jump = 0;
  },
  (g, c) => {
    const p = P(g, c.player);
    const uid = c.v.card;
    const ti = usableTrigger(g, c.player, uid);
    if (c.yes && ti >= 0) {
      const id = g.ids[uid];
      log(g, c.player, `${sv(g, c.player, 'reveal')} ${D(id).name} and ${vb(g, c.player, 'activate')} its [Trigger]!`, 'effect');
      g.frames.push({ key: effectKey(id, ti), step: 0, ctx: mkCtx(c.player, uid, id) });
    } else {
      const li = g.limbo.indexOf(uid);
      if (li >= 0) g.limbo.splice(li, 1);
      p.hand.push(uid);
    }
    c.jump = 0;
  },
];

// ---------------------------------------------------------------- setup & turns

const emptyStats = () => ({ donUnused: 0, donSpent: 0, attacks: 0, hits: 0, kos: 0, counterPower: 0, cardsPlayed: 0, readyNoAttack: 0 });

export function createGame(o: { decks: [DeckList, DeckList]; seed: number; first?: PlayerId }): Game {
  const g: Game = {
    rng: o.seed | 0,
    turn: 0,
    active: 0,
    first: 0,
    phase: 'setup',
    players: [null, null] as unknown as [PlayerState, PlayerState],
    ids: {},
    battle: null,
    pending: null,
    pendingFrom: null,
    frames: [],
    queue: [],
    limbo: [],
    winner: null,
    winReason: '',
    log: [],
    stats: [emptyStats(), emptyStats()],
  };
  for (const pid of [0, 1] as PlayerId[]) {
    const dl = o.decks[pid];
    let uid = pid * 1000 + 1;
    const leaderUid = uid++;
    g.ids[leaderUid] = dl.leader;
    const deck: number[] = [];
    for (const [id, n] of dl.cards) {
      D(id);
      for (let i = 0; i < n; i++) {
        g.ids[uid] = id;
        deck.push(uid++);
      }
    }
    shuffle(g, deck);
    g.players[pid] = {
      name: pid === 0 ? 'You' : 'CPU',
      leader: mkField(leaderUid, dl.leader, 0),
      chars: [],
      stage: null,
      hand: [],
      deck,
      trash: [],
      life: [],
      donDeck: 10,
      donActive: 0,
      donRested: 0,
      turns: 0,
      noKO: false,
    };
  }
  g.first = o.first ?? (rand(g) < 0.5 ? 0 : 1);
  g.active = g.first;
  for (const pid of [0, 1] as PlayerId[]) draw(g, pid, 5);
  log(g, null, `${P(g, g.first).name} will go first. Each player draws 5 cards.`, 'turn');
  g.pending = { kind: 'mulligan', player: g.first };
  g.pendingFrom = 'setup';
  return g;
}

function finishSetup(g: Game): void {
  for (const pid of [0, 1] as PlayerId[]) {
    const p = P(g, pid);
    const n = D(p.leader.id).life ?? 5;
    // The top card of the deck ends up at the bottom of the Life pile.
    for (let i = 0; i < n; i++) {
      const u = p.deck.shift();
      if (u !== undefined) p.life.unshift({ uid: u, faceUp: false });
    }
  }
  log(g, null, 'Life cards are set. The game begins!', 'turn');
  startTurn(g);
}

function startTurn(g: Game): void {
  const p = P(g, g.active);
  g.turn++;
  p.turns++;
  log(g, g.active, `Turn ${g.turn} — ${own(g, g.active, false)} turn`, 'turn');
  // Refresh Phase: attached DON!! return to the cost area, then everything is set active.
  for (const fc of unitsOf(g, g.active)) {
    p.donRested += fc.don;
    fc.don = 0;
    fc.used = [];
  }
  p.donActive += p.donRested;
  p.donRested = 0;
  p.leader.rested = false;
  if (p.stage) {
    p.stage.rested = false;
    p.stage.used = [];
  }
  for (const fc of p.chars) {
    if (fc.frozen) {
      fc.frozen = false;
      if (fc.rested) log(g, g.active, `${D(fc.id).name} stays rested this Refresh Phase.`, 'effect');
    } else fc.rested = false;
  }
  // Draw Phase: the player going first does not draw on their first turn.
  if (g.turn > 1) draw(g, g.active, 1);
  // DON!! Phase: 2 DON!! (only 1 on the very first turn of the game).
  const n = Math.min(g.turn === 1 ? 1 : 2, p.donDeck);
  p.donDeck -= n;
  p.donActive += n;
  g.phase = 'main';
}

function finishTurn(g: Game): void {
  for (const pid of [0, 1] as PlayerId[]) {
    const q = P(g, pid);
    q.noKO = false;
    for (const fc of [...unitsOf(g, pid), ...(q.stage ? [q.stage] : [])]) {
      fc.mods = [];
      fc.flags = [];
    }
  }
  g.active = opp(g.active);
  startTurn(g);
}

// ---------------------------------------------------------------- legality checks (also used by the UI to explain "why not")

export function mainEffectIndex(d: CardDef): number {
  return d.effects?.findIndex((e) => e.timing === 'main') ?? -1;
}

export function whyCantPlay(g: Game, uid: number): string | null {
  const pid = ownerOf(uid);
  const p = P(g, pid);
  const d = defOf(g, uid);
  if (g.winner !== null) return 'The game is over.';
  if (g.active !== pid || g.phase !== 'main' || busy(g)) return 'You can only play cards during your own Main Phase.';
  if (!p.hand.includes(uid)) return 'That card is not in your hand.';
  if (d.sim === 'none') return 'The simulator cannot run this card’s effect yet.';
  if (d.category === 'Event') {
    const i = mainEffectIndex(d);
    if (i < 0) {
      return d.effects?.some((e) => e.timing === 'counter')
        ? 'This is a [Counter] Event: it can only be used in the Counter Step, when your opponent attacks.'
        : 'This Event has no [Main] effect to play.';
    }
    const e = d.effects![i];
    if (e.when && !e.when(g, mkCtx(pid, uid, d.id))) return 'Its condition is not met right now, so it would do nothing.';
    if (e.cost && !canPay(g, pid, uid, e.cost)) return 'You cannot pay its additional cost.';
  }
  if (d.category === 'Leader') return 'Leaders are never played from hand.';
  if (p.donActive < d.cost) return `It costs ${d.cost} DON!! and you only have ${p.donActive} active.`;
  return null;
}

export function whyCantAttack(g: Game, uid: number): string | null {
  const pid = ownerOf(uid);
  const p = P(g, pid);
  const fc = findField(g, uid);
  if (g.winner !== null) return 'The game is over.';
  if (!fc || g.active !== pid || g.phase !== 'main' || busy(g)) return 'You can only attack during your own Main Phase.';
  if (p.stage?.uid === uid) return 'Stages cannot attack.';
  if (D(fc.id).cantAttack) return 'This card cannot attack (it says so on the card).';
  if (p.turns <= 1) return 'Neither player can attack on their first turn.';
  if (fc.rested) return 'A rested card cannot attack.';
  if (summoningSick(g, fc) && !hasKw(g, fc, 'Rush: Character')) {
    return 'A Character cannot attack on the turn it is played (unless it has [Rush]).';
  }
  return null;
}

/** Played this turn without [Rush]. */
function summoningSick(g: Game, fc: FieldCard): boolean {
  return !isLeader(g, fc.uid) && fc.playedTurn === g.turn && !hasKw(g, fc, 'Rush');
}

/** The opponent's Leader plus any of their rested Characters. */
export function attackTargets(g: Game, uid: number): number[] {
  const o = P(g, opp(ownerOf(uid)));
  const fc = findField(g, uid);
  const rested = o.chars.filter((c) => c.rested).map((c) => c.uid);
  // [Rush: Character] lets a freshly played Character attack Characters only.
  if (fc && summoningSick(g, fc)) return rested;
  return [o.leader.uid, ...rested];
}

/** Could this card, given every active DON!! its owner still has, match the power of something it may attack? */
export function canReachTarget(g: Game, fc: FieldCard): boolean {
  const spare = P(g, ownerOf(fc.uid)).donActive * 1000;
  return attackTargets(g, fc.uid).some((t) => {
    const target = findField(g, t);
    return !!target && powerOf(g, fc) + spare >= powerOf(g, target);
  });
}

export function whyCantActivate(g: Game, uid: number, idx: number): string | null {
  const pid = ownerOf(uid);
  const fc = findField(g, uid);
  if (g.winner !== null) return 'The game is over.';
  if (!fc || g.active !== pid || g.phase !== 'main' || busy(g)) return 'You can only activate this during your own Main Phase.';
  const d = D(fc.id);
  const e = d.effects?.[idx];
  if (!e || e.timing !== 'activateMain') return 'Not an [Activate: Main] effect.';
  if (e.don && fc.don < e.don) return `Needs ${e.don} DON!! attached to this card ([DON!! x${e.don}]).`;
  if (e.opt && fc.used.includes(effectKey(d.id, idx))) return 'Already used this turn ([Once Per Turn]).';
  if (e.cost && !canPay(g, pid, uid, e.cost)) return `You cannot pay the cost (${costText(e.cost)}).`;
  if (e.when && !e.when(g, mkCtx(pid, uid, d.id))) return 'Its condition is not met right now.';
  return null;
}

/** Hand cards the defender could use in the current Counter Step. */
export function counterOptions(g: Game, pid: PlayerId): number[] {
  const p = P(g, pid);
  return p.hand.filter((u) => {
    const d = defOf(g, u);
    if (d.category === 'Character') return d.counter > 0;
    if (d.category !== 'Event' || d.sim === 'none') return false;
    const e = d.effects?.find((x) => x.timing === 'counter');
    if (!e || p.donActive < d.cost) return false;
    if (e.cost && !canPay(g, pid, u, e.cost)) return false;
    return !e.when || e.when(g, mkCtx(pid, u, d.id));
  });
}

export function blockersFor(g: Game): number[] {
  const b = g.battle;
  if (!b) return [];
  const a = findField(g, b.attacker);
  if (!a || b.noBlock || hasKw(g, a, 'Unblockable')) return [];
  return P(g, opp(ownerOf(b.attacker)))
    .chars.filter((c) => !c.rested && c.uid !== b.target && hasKw(g, c, 'Blocker') && !(b.noBlockMin > 0 && powerOf(g, c) >= b.noBlockMin))
    .map((c) => c.uid);
}

/** Every main-phase action the active player could take right now. */
export function legalActions(g: Game): Action[] {
  const out: Action[] = [];
  if (g.winner !== null || g.phase !== 'main' || busy(g)) return out;
  const pid = g.active;
  const p = P(g, pid);
  for (const u of p.hand) if (!whyCantPlay(g, u)) out.push({ type: 'play', uid: u });
  for (const fc of [...unitsOf(g, pid), ...(p.stage ? [p.stage] : [])]) {
    D(fc.id).effects?.forEach((_e, i) => {
      if (!whyCantActivate(g, fc.uid, i)) out.push({ type: 'activate', uid: fc.uid, idx: i });
    });
  }
  for (const fc of unitsOf(g, pid)) {
    if (p.donActive > 0) out.push({ type: 'don', target: fc.uid, n: 1 });
    if (!whyCantAttack(g, fc.uid)) for (const t of attackTargets(g, fc.uid)) out.push({ type: 'attack', attacker: fc.uid, target: t });
  }
  out.push({ type: 'end' });
  return out;
}

// ---------------------------------------------------------------- actions

function doPlay(g: Game, uid: number): void {
  const why = whyCantPlay(g, uid);
  if (why) throw new Error(why);
  const pid = g.active;
  const p = P(g, pid);
  const d = defOf(g, uid);
  restDon(g, pid, d.cost);
  g.stats[pid].donSpent += d.cost;
  g.stats[pid].cardsPlayed++;
  p.hand.splice(p.hand.indexOf(uid), 1);
  if (d.category === 'Character') playCharacter(g, pid, uid, false);
  else if (d.category === 'Stage') placeStage(g, pid, uid);
  else {
    g.limbo.push(uid);
    log(g, pid, `${sv(g, pid, 'play')} the Event ${d.name}.`, 'play');
    g.frames.push({ key: effectKey(d.id, mainEffectIndex(d)), step: 0, ctx: mkCtx(pid, uid, d.id) });
  }
}

function doAttack(g: Game, attacker: number, target: number): void {
  const why = whyCantAttack(g, attacker);
  if (why) throw new Error(why);
  if (!attackTargets(g, attacker).includes(target)) throw new Error('You can only attack the opposing Leader or a rested Character.');
  const pid = g.active;
  const a = findField(g, attacker)!;
  const t = findField(g, target)!;
  a.rested = true;
  g.stats[pid].attacks++;
  g.battle = { attacker, target, step: 'declared', noBlock: false, noBlockMin: 0, blocked: false, counterAdded: 0 };
  log(g, pid, `${own(g, pid)} ${D(a.id).name} (${powerOf(g, a)}) attacks ${own(g, opp(pid), false)} ${D(t.id).name} (${powerOf(g, t)}).`, 'attack');
  trigger(g, 'whenAttacking', attacker);
  const dp = P(g, opp(pid));
  for (const fc of [...unitsOf(g, opp(pid)), ...(dp.stage ? [dp.stage] : [])]) trigger(g, 'onOppAttack', fc.uid);
}

function doEnd(g: Game): void {
  const pid = g.active;
  const p = P(g, pid);
  // Nobody can attack on their first turn, so leftover DON!! there is not a missed opportunity.
  if (p.turns > 1) g.stats[pid].donUnused += p.donActive;
  // "Idle" means it had a real attack available: Blockers held back and attackers too small to reach anything do not count.
  if (p.turns > 1) g.stats[pid].readyNoAttack += unitsOf(g, pid).filter((fc) => !whyCantAttack(g, fc.uid) && !hasKw(g, fc, 'Blocker') && canReachTarget(g, fc)).length;
  g.phase = 'end';
  for (const fc of [...unitsOf(g, pid), ...(p.stage ? [p.stage] : [])]) trigger(g, 'endOfTurn', fc.uid);
}

function useCounter(g: Game, pid: PlayerId, uid: number): void {
  if (!counterOptions(g, pid).includes(uid)) throw new Error('That card cannot be used as a counter right now.');
  const b = g.battle!;
  const p = P(g, pid);
  const d = defOf(g, uid);
  p.hand.splice(p.hand.indexOf(uid), 1);
  if (d.category === 'Character') {
    p.trash.push(uid);
    const t = findField(g, b.target);
    if (t) addMod(t, 'power', d.counter, 'battle');
    b.counterAdded += d.counter;
    g.stats[pid].counterPower += d.counter;
    log(g, pid, `${sv(g, pid, 'counter')} with ${d.name}: +${d.counter} (target is now ${t ? powerOf(g, t) : 0}).`, 'effect');
  } else {
    const i = d.effects!.findIndex((e) => e.timing === 'counter');
    restDon(g, pid, d.cost);
    // DON!! held back and then spent on a [Counter] Event was not wasted after all.
    g.stats[pid].donUnused = Math.max(0, g.stats[pid].donUnused - d.cost);
    g.limbo.push(uid);
    b.counterAdded += d.effects![i].boost ?? 0;
    g.stats[pid].counterPower += d.effects![i].boost ?? 0;
    log(g, pid, `${sv(g, pid, 'play')} the [Counter] Event ${d.name}.`, 'effect');
    g.frames.push({ key: effectKey(d.id, i), step: 0, ctx: mkCtx(pid, uid, d.id) });
  }
}

function answer(g: Game, ans: Answer): void {
  const ch = g.pending;
  if (!ch) throw new Error('Nothing is waiting for an answer.');
  if (ch.kind !== ans.kind) throw new Error(`Expected a '${ch.kind}' answer but got '${ans.kind}'.`);
  const from = g.pendingFrom;
  if (ch.kind === 'select' && ans.kind === 'select') {
    const uniq = new Set(ans.uids);
    if (uniq.size !== ans.uids.length || ans.uids.some((u) => !ch.options.includes(u))) throw new Error('Invalid selection.');
    if (ans.uids.length < ch.min || ans.uids.length > ch.max) throw new Error(`Select between ${ch.min} and ${ch.max} cards.`);
  }
  if (ch.kind === 'option' && ans.kind === 'option' && (ans.index < 0 || ans.index >= ch.labels.length)) throw new Error('Invalid option.');
  if (ch.kind === 'block' && ans.kind === 'block' && ans.uid !== null && !ch.options.includes(ans.uid)) throw new Error('That card cannot block.');
  // Validate before touching any state, so an illegal answer leaves the question open.
  if (ch.kind === 'counter' && ans.kind === 'counter' && ans.use !== null && !counterOptions(g, ch.player).includes(ans.use)) {
    throw new Error('That card cannot be used as a counter right now.');
  }
  g.pending = null;
  g.pendingFrom = null;

  if (from === 'setup' && ans.kind === 'mulligan') {
    const pid = ch.player;
    const p = P(g, pid);
    if (ans.redraw) {
      p.deck.push(...p.hand);
      p.hand = [];
      shuffle(g, p.deck);
      draw(g, pid, 5);
      log(g, pid, `${sv(g, pid, 'take')} a mulligan and ${vb(g, pid, 'draw')} a new hand of 5.`);
    } else log(g, pid, `${sv(g, pid, 'keep')} ${their(g, pid)} opening hand.`);
    if (pid === g.first) {
      g.pending = { kind: 'mulligan', player: opp(pid) };
      g.pendingFrom = 'setup';
    } else finishSetup(g);
    return;
  }

  if (from === 'battle') {
    const b = g.battle!;
    const defP = ch.player;
    if (ans.kind === 'block') {
      if (ans.uid !== null) {
        const fc = findField(g, ans.uid)!;
        fc.rested = true;
        b.target = ans.uid;
        b.blocked = true;
        log(g, defP, `${sv(g, defP, 'block')} with ${D(fc.id).name} (${powerOf(g, fc)}).`, 'attack');
        trigger(g, 'onBlock', ans.uid);
      }
    } else if (ans.kind === 'counter') {
      if (ans.use === null) b.step = 'damage';
      else useCounter(g, defP, ans.use);
    }
    return;
  }

  // Answer belongs to the effect frame on top of the stack.
  const f = g.frames[g.frames.length - 1];
  if (!f) throw new Error('No effect is waiting for this answer.');
  if (ans.kind === 'select') f.ctx.sel = ans.uids;
  else if (ans.kind === 'confirm') f.ctx.yes = ans.yes;
  else if (ans.kind === 'option') f.ctx.idx = ans.index;
  else if (ans.kind === 'trigger') f.ctx.yes = ans.activate;
}

// ---------------------------------------------------------------- battle

function battleStep(g: Game): void {
  const b = g.battle!;
  const atkP = ownerOf(b.attacker);
  const defP = opp(atkP);
  const a = findField(g, b.attacker);
  const t = findField(g, b.target);
  if (b.step !== 'end' && (!a || !t)) {
    log(g, null, 'The battle ends because one of the battling cards left the field.');
    b.step = 'end';
  }
  switch (b.step) {
    case 'declared':
      b.step = 'block';
      return;
    case 'block': {
      b.step = 'counter';
      const bl = blockersFor(g);
      if (bl.length) {
        g.pending = { kind: 'block', player: defP, options: bl };
        g.pendingFrom = 'battle';
      }
      return;
    }
    case 'counter': {
      // If the attack already fails there is nothing to defend against.
      if (powerOf(g, a!) >= powerOf(g, t!) && counterOptions(g, defP).length) {
        g.pending = { kind: 'counter', player: defP };
        g.pendingFrom = 'battle';
      } else b.step = 'damage';
      return;
    }
    case 'damage': {
      b.step = 'end';
      const ap = powerOf(g, a!);
      const tp = powerOf(g, t!);
      const an = D(a!.id).name;
      const tn = D(t!.id).name;
      if (ap < tp) {
        log(g, defP, `The attack fails: ${an} ${ap} vs ${tn} ${tp}.`, 'attack');
        return;
      }
      g.stats[atkP].hits++;
      if (isLeader(g, b.target)) {
        const n = hasKw(g, a!, 'Double Attack') ? 2 : 1;
        log(g, atkP, `The attack hits: ${an} ${ap} vs ${tn} ${tp}.${n === 2 ? ' [Double Attack] deals 2 damage!' : ''}`, 'attack');
        g.frames.push({ key: 'sys#damage', step: 0, ctx: mkCtx(defP, 0, '', { n, banish: hasKw(g, a!, 'Banish') ? 1 : 0, card: 0, dealt: 0 }) });
      } else {
        log(g, atkP, `The attack wins the battle: ${an} ${ap} vs ${tn} ${tp}.`, 'attack');
        koCard(g, b.target, 'battle');
      }
      return;
    }
    case 'end': {
      for (const pid of [0, 1] as PlayerId[]) {
        for (const fc of unitsOf(g, pid)) {
          fc.mods = fc.mods.filter((m) => m.until !== 'battle');
          fc.flags = fc.flags.filter((f) => f.until !== 'battle');
        }
      }
      const foughtChar = !isLeader(g, b.target);
      g.battle = null;
      if (a && foughtChar) trigger(g, 'afterBattleChar', b.attacker);
      return;
    }
  }
}

// ---------------------------------------------------------------- main loop

function finishFrame(g: Game, f: Frame): void {
  const i = g.frames.indexOf(f);
  if (i >= 0) g.frames.splice(i, 1);
  // An Event (or an activated Trigger card) goes to the trash once it has resolved.
  const li = g.limbo.indexOf(f.ctx.src);
  if (li >= 0 && f.key !== 'sys#play' && !g.frames.some((x) => x.ctx.src === f.ctx.src)) {
    g.limbo.splice(li, 1);
    P(g, ownerOf(f.ctx.src)).trash.push(f.ctx.src);
  }
}

function checkDeckOut(g: Game): void {
  if (g.phase === 'setup' || g.winner !== null) return;
  for (const pid of [g.active, opp(g.active)]) {
    if (P(g, pid).deck.length === 0) {
      win(g, opp(pid), `${sv(g, pid, 'have')} no cards left in ${their(g, pid)} deck.`);
      return;
    }
  }
}

function run(g: Game): void {
  for (let guard = 0; guard < 20000; guard++) {
    checkDeckOut(g);
    if (g.winner !== null || g.pending) return;
    const f = g.frames[g.frames.length - 1];
    if (f) {
      const steps = STEPS[f.key];
      if (!steps) throw new Error(`No steps registered for ${f.key}`);
      if (f.step >= steps.length) {
        finishFrame(g, f);
        continue;
      }
      const c = f.ctx;
      c.jump = -1;
      const r = steps[f.step++](g, c);
      if (g.winner !== null) return;
      if (c.jump >= 0) f.step = c.jump;
      if (r === 'stop') finishFrame(g, f);
      else if (r) {
        g.pending = r;
        g.pendingFrom = 'frame';
      }
      continue;
    }
    if (g.queue.length) {
      g.frames.push(g.queue.shift()!);
      continue;
    }
    if (g.battle) {
      battleStep(g);
      continue;
    }
    if (g.phase === 'end') {
      finishTurn(g);
      continue;
    }
    return;
  }
  throw new Error('Engine did not settle (possible infinite loop).');
}

/** Applies one action. Throws if the action is illegal; the game is left unchanged in that case. */
export function apply(g: Game, a: Action): void {
  if (g.winner !== null) return;
  if (a.type === 'answer') answer(g, a.answer);
  else {
    if (g.phase !== 'main' || busy(g)) throw new Error('That action is only possible in your Main Phase.');
    if (a.type === 'play') doPlay(g, a.uid);
    else if (a.type === 'don') {
      const p = P(g, g.active);
      const fc = findField(g, a.target);
      if (!fc || ownerOf(a.target) !== g.active || p.stage?.uid === a.target) throw new Error('DON!! can only be given to your own Leader or Characters.');
      if (a.n < 1 || p.donActive < a.n) throw new Error('Not enough active DON!!.');
      p.donActive -= a.n;
      fc.don += a.n;
      log(g, g.active, `${sv(g, g.active, 'give')} ${a.n} DON!! to ${D(fc.id).name} (now ${powerOf(g, fc)}).`);
    } else if (a.type === 'attack') doAttack(g, a.attacker, a.target);
    else if (a.type === 'activate') {
      const why = whyCantActivate(g, a.uid, a.idx);
      if (why) throw new Error(why);
      const d = defOf(g, a.uid);
      log(g, g.active, `${sv(g, g.active, 'activate')} ${d.name}.`, 'effect');
      g.frames.push({ key: effectKey(d.id, a.idx), step: 0, ctx: mkCtx(g.active, a.uid, d.id) });
    } else doEnd(g);
  }
  run(g);
}

/** Total cards a player owns across every zone — used by tests to prove nothing is lost or duplicated. */
export function countCards(g: Game, pid: PlayerId): number {
  const p = P(g, pid);
  const inLimbo = g.limbo.filter((u) => ownerOf(u) === pid).length;
  return 1 + p.chars.length + (p.stage ? 1 : 0) + p.hand.length + p.deck.length + p.trash.length + p.life.length + inLimbo;
}
