// The coach: turns the CPU's decision-making into advice, and the game's numbers into explanations.

import { currentThreat, decide, defencePolicy, type Decision } from './ai';
import {
  P,
  attackTargets,
  blockersFor,
  canReachTarget,
  counterOptions,
  defOf,
  findField,
  hasKw,
  isLeader,
  opp,
  ownerOf,
  powerOf,
  unitsOf,
  whoActs,
  whyCantAttack,
  whyCantPlay,
} from './game';
import { D } from './registry';
import type { Action, Game, PlayerId } from './types';

const k = (n: number): string => `${n / 1000}k`;

/** What a strong player would do right now, and why. Null when it is not `me` to act. */
export function hint(g: Game, me: PlayerId): Decision | null {
  if (whoActs(g) !== me) return null;
  return decide(g, me, 'hard', () => 0.5);
}

/** Plain-English description of an action ("Play Jozu for 5 DON!!"). */
export function describeAction(g: Game, a: Action): string {
  const nm = (u: number): string => defOf(g, u).name;
  switch (a.type) {
    case 'play':
      return `Play ${nm(a.uid)} (${defOf(g, a.uid).cost} DON!!)`;
    case 'don':
      return `Give ${a.n} DON!! to ${nm(a.target)}`;
    case 'attack':
      return `Attack ${isLeader(g, a.target) ? 'the enemy Leader' : nm(a.target)} with ${nm(a.attacker)}`;
    case 'activate':
      return `Activate ${nm(a.uid)}'s effect`;
    case 'end':
      return 'End the turn';
    case 'answer': {
      const ans = a.answer;
      const ch = g.pending;
      if (ans.kind === 'mulligan') return ans.redraw ? 'Mulligan (redraw 5)' : 'Keep this hand';
      if (ans.kind === 'select') return ans.uids.length ? `Choose ${ans.uids.map(nm).join(' + ')}` : 'Choose nothing';
      if (ans.kind === 'confirm') return ans.yes ? 'Yes — use the effect' : 'No — skip the effect';
      if (ans.kind === 'option') return ch && ch.kind === 'option' ? `Choose "${ch.labels[ans.index]}"` : 'Choose an option';
      if (ans.kind === 'block') return ans.uid === null ? 'Do not block' : `Block with ${nm(ans.uid)}`;
      if (ans.kind === 'counter') return ans.use === null ? 'No (more) counters — let the battle resolve' : `Counter with ${nm(ans.use)}`;
      return ans.activate ? 'Activate the [Trigger]' : 'Add the card to your hand instead';
    }
  }
}

export interface AttackPreview {
  atk: number;
  def: number;
  hits: boolean;
  /** Counter power the defender must add for the attack to fail. */
  need: number;
  /** Active [Blocker]s the defender could use against this attack. */
  blockers: number;
  /** A Leader hit that would end the game if it connects. */
  lethal: boolean;
  text: string;
}

/** Battle maths for an attack the active player is considering. */
export function attackPreview(g: Game, attacker: number, target: number): AttackPreview | null {
  const a = findField(g, attacker);
  const t = findField(g, target);
  if (!a || !t) return null;
  const atk = powerOf(g, a);
  const def = powerOf(g, t);
  const hits = atk >= def;
  const need = hits ? atk - def + 1000 : 0;
  const defP = ownerOf(target);
  const blockers = hasKw(g, a, 'Unblockable') ? 0 : P(g, defP).chars.filter((c) => !c.rested && c.uid !== target && hasKw(g, c, 'Blocker')).length;
  const onLeader = isLeader(g, target);
  // [Double Attack] cannot take more Life than there is, and never wins from 1 Life.
  const dmg = Math.min(hasKw(g, a, 'Double Attack') ? 2 : 1, Math.max(1, P(g, defP).life.length));
  const lethal = onLeader && hits && P(g, defP).life.length === 0;
  let text = `${k(atk)} vs ${k(def)}: `;
  if (!hits) text += `this attack FAILS as it stands. Attach ${Math.ceil((def - atk) / 1000)} more DON!! first to reach ${k(def)}.`;
  else {
    text += onLeader ? (lethal ? 'this hit WINS THE GAME if it connects. ' : `hits for ${dmg} Life. `) : `K.O.s ${D(t.id).name}. `;
    text += `The defender needs +${k(need)} of counter to stop it.`;
    if (blockers) text += ` They also have ${blockers} active [Blocker]${blockers > 1 ? 's' : ''}.`;
  }
  return { atk, def, hits, need, blockers, lethal, text };
}

/** Things worth a second look before you pass the turn. */
export function endTurnWarnings(g: Game, me: PlayerId): string[] {
  if (g.active !== me || g.phase !== 'main') return [];
  const out: string[] = [];
  const p = P(g, me);
  // Only attacks that can actually reach a target's power are worth a reminder, and Blockers
  // held back to defend are a choice, not a mistake.
  const attackers = unitsOf(g, me).filter((fc) => !whyCantAttack(g, fc.uid) && !hasKw(g, fc, 'Blocker') && canReachTarget(g, fc));
  const playable = p.hand.filter((u) => !whyCantPlay(g, u));
  if (attackers.length) {
    const names = attackers.map((fc) => D(fc.id).name).join(', ');
    const onlyLeader = attackers.every((fc) => isLeader(g, fc.uid));
    out.push(
      `${names} can still attack and reach a target's power. Even an attack that gets countered costs the CPU cards from its hand. ${
        onlyLeader ? 'Your Leader risks nothing by attacking.' : 'The trade-off: a Character that attacks is rested, so the CPU can attack it next turn — your Leader risks nothing by attacking.'
      }`,
    );
  }
  if (playable.length) out.push(`You can still play: ${playable.map((u) => defOf(g, u).name).join(', ')}.`);
  // On your first turn nothing can attack, so spare DON!! only matters if a card could still be played.
  if (p.donActive > 0 && (p.turns > 1 || playable.length)) {
    const held = p.hand.map((u) => defOf(g, u)).filter((d) => d.category === 'Event' && d.cost <= p.donActive && d.effects?.some((e) => e.timing === 'counter'));
    const keep = held.length
      ? ` The one good reason to hold DON!! back: paying for a [Counter] Event on the CPU's turn (you hold ${[...new Set(held.map((d) => d.name))].join(', ')}). If that is the plan, end the turn.`
      : '';
    out.push(
      `${p.donActive} active DON!! would go unused. DON!! does not carry over as extra — every unspent DON!! is power you never used. ${
        attackers.length ? 'Attach it to an attacker before swinging.' : p.turns > 1 ? 'Next time, attach leftovers to your attackers BEFORE they attack.' : 'Is there a card you could play with it?'
      }${keep}`,
    );
  }
  return out;
}

/** A short "read the board" summary for the start of your Main Phase. */
export function boardRead(g: Game, me: PlayerId): string[] {
  const out: string[] = [];
  const mine = P(g, me);
  const foe = P(g, opp(me));
  const attackers = unitsOf(g, me).filter((fc) => !whyCantAttack(g, fc.uid));
  const foeBlockers = foe.chars.filter((c) => !c.rested && hasKw(g, c, 'Blocker')).length;
  if (mine.turns <= 1) {
    out.push('Nobody can attack on their first turn. Use this turn to play a cheap Character or search your deck.');
    return out;
  }
  const hitsToWin = foe.life.length + 1;
  // Attacks that can actually reach the enemy Leader's power with the DON!! available right now.
  const leaderPower = powerOf(g, foe.leader);
  const donNeeded = attackers.map((fc) => Math.max(0, Math.ceil((leaderPower - powerOf(g, fc)) / 1000))).sort((a, b) => a - b);
  let don = mine.donActive;
  let reach = 0;
  for (const n of donNeeded) {
    if (n > don) break;
    don -= n;
    reach++;
  }
  if (reach >= hitsToWin + foeBlockers) {
    out.push(
      `LETHAL CHECK: the CPU has ${foe.life.length} Life${foeBlockers ? ` and ${foeBlockers} active Blocker${foeBlockers > 1 ? 's' : ''}` : ''}. With the DON!! you have now, ${reach} of your attacks can reach its Leader's ${k(leaderPower)} and you need ${hitsToWin} to connect${
        foeBlockers ? ' (plus one attack per Blocker)' : ''
      }. You can win THIS turn if the CPU cannot counter them — it holds ${foe.hand.length} card${foe.hand.length === 1 ? '' : 's'}.`,
    );
  } else if (foe.life.length <= 1) {
    out.push(`The CPU is at ${foe.life.length} Life: you need ${hitsToWin} successful Leader hit${hitsToWin > 1 ? 's' : ''} to win. Make every attack as big as you can so counters run out.`);
  }
  const restedFoes = foe.chars.filter((c) => c.rested);
  if (restedFoes.length) out.push(`Rested enemy Characters can be attacked: ${restedFoes.map((c) => `${D(c.id).name} (${k(powerOf(g, c))})`).join(', ')}.`);
  if (foeBlockers) out.push(`The CPU has ${foeBlockers} active [Blocker]${foeBlockers > 1 ? 's' : ''}. Attack with your weakest attacker first to bait the block, and save your biggest swing for last.`);
  if (mine.life.length <= 1) out.push(`You are at ${mine.life.length} Life. Keep counter cards in hand and think twice before resting your [Blocker]s.`);
  if (foe.hand.length <= 2) out.push(`The CPU has only ${foe.hand.length} card${foe.hand.length === 1 ? '' : 's'} in hand, so it can barely counter. Big attacks are likely to land.`);
  return out;
}

export interface DefenceInfo {
  atk: number;
  def: number;
  need: number;
  onLeader: boolean;
  lethal: boolean;
  /** Total counter power available in hand right now. */
  available: number;
  advice: string;
}

/** The numbers behind a Block / Counter decision. */
export function defenceInfo(g: Game, me: PlayerId): DefenceInfo | null {
  const t = currentThreat(g);
  if (!t) return null;
  const pol = defencePolicy(g, me, 'hard');
  let available = 0;
  for (const u of counterOptions(g, me)) {
    const d = defOf(g, u);
    available += d.category === 'Character' ? d.counter : (d.effects?.find((e) => e.timing === 'counter')?.boost ?? 0);
  }
  return { atk: t.atk, def: t.def, need: t.need, onLeader: t.onLeader, lethal: t.lethal, available, advice: pol.why };
}

export { attackTargets, blockersFor };

// ---------------------------------------------------------------- post-game review

export type Grade = 'good' | 'ok' | 'bad';
export interface ReviewItem {
  label: string;
  value: string;
  grade: Grade;
  note: string;
}

export function review(g: Game, me: PlayerId): ReviewItem[] {
  const s = g.stats[me];
  const turns = Math.max(1, P(g, me).turns);
  const attackTurns = Math.max(1, turns - 1);
  const out: ReviewItem[] = [];
  // First turns are left out of the DON!! and attack measures: nothing can attack then.
  const unusedPer = s.donUnused / attackTurns;
  out.push({
    label: 'DON!! left unused',
    value: `${s.donUnused} total (${unusedPer.toFixed(1)} per turn)`,
    grade: unusedPer <= 0.5 ? 'good' : unusedPer <= 1.5 ? 'ok' : 'bad',
    note:
      unusedPer <= 0.5
        ? 'Excellent. You used nearly every DON!! you were given.'
        : 'Every unused DON!! is +1000 power you did not swing with. Before ending a turn, attach leftover DON!! to an attacker (before it attacks).',
  });
  const idlePer = s.readyNoAttack / attackTurns;
  out.push({
    label: 'Attackers left idle',
    value: `${s.readyNoAttack} total (${idlePer.toFixed(1)} per turn)`,
    grade: idlePer <= 0.3 ? 'good' : idlePer <= 1 ? 'ok' : 'bad',
    note:
      idlePer <= 0.3
        ? 'You attacked with almost everything that could attack.'
        : 'These were non-Blockers that could reach a target’s power and stayed home. An attack that reaches makes the opponent choose: lose a Life or lose counter cards.',
  });
  const rate = s.attacks ? s.hits / s.attacks : 0;
  out.push({
    label: 'Attacks that connected',
    value: `${s.hits} of ${s.attacks} (${Math.round(rate * 100)}%)`,
    grade: s.attacks === 0 ? 'bad' : rate >= 0.55 ? 'good' : rate >= 0.35 ? 'ok' : 'bad',
    note:
      s.attacks === 0
        ? 'You never attacked. You cannot win without attacking the Leader.'
        : rate >= 0.55
          ? 'Your attacks were sized well.'
          : 'Many attacks were stopped. Swinging at exactly the defender’s power invites a cheap 1000 counter — adding 1–2 DON!! makes them pay 2 cards instead of 1.',
  });
  const perTurn = s.attacks / attackTurns;
  out.push({
    label: 'Attacks per turn',
    value: perTurn.toFixed(1),
    grade: perTurn >= 2 ? 'good' : perTurn >= 1.2 ? 'ok' : 'bad',
    note: perTurn >= 2 ? 'Good pressure: multiple attacks a turn drains counters.' : 'More bodies on the board means more attacks. Develop Characters early so you swing two or three times a turn by the mid-game.',
  });
  out.push({
    label: 'Counter power spent',
    value: k(s.counterPower),
    grade: 'ok',
    note: 'Counters are your hand. Early in the game it is usually right to take Leader hits (each one gives you a card) and save counters for when your Life is low.',
  });
  out.push({ label: 'Enemy Characters K.O.’d', value: String(s.kos), grade: s.kos >= 3 ? 'good' : 'ok', note: 'Removing rested Characters denies future attacks. Pick off valuable ones; ignore the ones that do not matter.' });
  return out;
}

/** The single most useful thing to work on, taken from the review. */
export function mainLesson(items: ReviewItem[]): string {
  // The first four items are the skills you control every turn; the last two are context only.
  const skills = items.slice(0, 4);
  const worst = skills.find((i) => i.grade === 'bad') ?? skills.find((i) => i.grade === 'ok');
  return worst ? `${worst.label}: ${worst.note}` : 'A clean game on every measure. Raise the difficulty, turn the coaching down, or try a different opponent deck.';
}
