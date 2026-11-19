// Generated practice problems. Each generator returns a self-contained puzzle with a checked answer.

export interface Drill {
  kind: 'counter' | 'lethal' | 'sizing';
  /** HTML. */
  prompt: string;
  options: string[];
  answer: number;
  /** HTML. */
  why: string;
}

const pick = <T>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const k = (n: number): string => `${n / 1000}k`;

// ---------------------------------------------------------------- counter maths

/** Fewest counter cards whose values add up to at least `need` (Infinity if impossible). */
export function fewestCards(values: number[], need: number): number {
  if (need <= 0) return 0;
  let best = Infinity;
  for (let mask = 1; mask < 1 << values.length; mask++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < values.length; i++) {
      if (mask & (1 << i)) {
        sum += values[i];
        n++;
      }
    }
    if (sum >= need && n < best) best = n;
  }
  return best;
}

export function counterDrill(rnd: () => number): Drill {
  const def = pick(rnd, [5000, 5000, 6000, 6000, 6000, 7000, 9000]);
  const atk = def + pick(rnd, [0, 1000, 1000, 2000, 2000, 3000, 4000]);
  const need = atk - def + 1000;
  const who = def === 9000 ? 'your Ace (9000 on the opponent’s turn)' : def === 6000 ? 'your Leader (6000)' : `your ${k(def)} Character`;
  if (rnd() < 0.5) {
    const opts = [need - 1000, need, need + 1000, atk].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    while (opts.length < 4) opts.push(opts[opts.length - 1] + 1000);
    opts.sort((a, b) => a - b);
    return {
      kind: 'counter',
      prompt: `An attack of <b>${atk}</b> is declared on ${who}. How much counter power do you need to make it fail?`,
      options: opts.map(String),
      answer: opts.indexOf(need),
      why: `You must end up <i>higher</i> than the attacker: ${atk} − ${def} + 1000 = <b>${need}</b>. With exactly ${need - 1000} you would tie at ${atk}, and ties go to the attacker.`,
    };
  }
  const hand: number[] = [];
  const n = 3 + Math.floor(rnd() * 2); // at most 4 cards, so the answer always fits the options
  for (let i = 0; i < n; i++) hand.push(pick(rnd, [1000, 1000, 1000, 2000, 2000, 0]));
  const usable = hand.filter((v) => v > 0);
  const few = fewestCards(usable, need);
  const options = ['1 card', '2 cards', '3 cards', '4 cards', 'It cannot be stopped'];
  return {
    kind: 'counter',
    prompt: `An attack of <b>${atk}</b> is declared on ${who}. Your hand has counter values <b>${hand.map((v) => (v ? `+${v}` : 'none')).join(', ')}</b>. What is the <i>fewest</i> cards that stops it?`,
    options,
    answer: few === Infinity ? 4 : Math.min(few, 4) - 1,
    why:
      few === Infinity
        ? `You need ${need} and your hand only has ${usable.reduce((a, b) => a + b, 0)} in total. Take the hit (or block).`
        : `You need ${atk} − ${def} + 1000 = ${need}. The cheapest way is ${few} card${few > 1 ? 's' : ''}. Always spend 2000s where one of them replaces two 1000s.`,
  };
}

// ---------------------------------------------------------------- attack sizing

export function sizingDrill(rnd: () => number): Drill {
  const def = pick(rnd, [5000, 5000, 6000]);
  const base = pick(rnd, [5000, 6000, 6000, 7000]);
  const cards = pick(rnd, [1, 2, 2, 3]);
  // Smallest attack that cannot be stopped by `cards` cards of at most 2000 each.
  const target = def + cards * 2000;
  const don = Math.max(0, (target - base) / 1000);
  const opts = [don - 1, don, don + 1, don + 2].filter((v) => v >= 0);
  while (opts.length < 4) opts.push(opts[opts.length - 1] + 1);
  return {
    kind: 'sizing',
    prompt: `Your <b>${base}</b>-power attacker swings at a <b>${def}</b> Leader. The opponent has exactly <b>${cards}</b> card${cards > 1 ? 's' : ''} in hand and no active DON!!. Character counters are at most +2000 each. How many DON!! must you attach so the attack <i>cannot</i> be countered from hand?`,
    options: opts.map((v) => `${v} DON!!`),
    answer: opts.indexOf(don),
    why: `${cards} card${cards > 1 ? 's' : ''} can add at most ${cards * 2000}. They need attack − ${def} + 1000, so the attack must reach ${def} + ${cards * 2000} = <b>${target}</b>. From ${base} that is ${don} DON!!. (With no active DON!! they cannot play a [Counter] Event.)`,
  };
}

// ---------------------------------------------------------------- lethal puzzles

export interface LethalPos {
  /** Opposing Leader power and Life. */
  def: number;
  life: number;
  /** Active [Blocker]s — each absorbs one attack. */
  blockers: number;
  /** Counter values in the opposing hand. */
  counters: number[];
  /** Your attackers' current power. */
  attackers: number[];
  /** Spare DON!! you may attach (1 DON!! = +1000), any time between attacks. */
  don: number;
}

/**
 * Exact answer to "can the attacker force a win this turn?", assuming the defender sees every
 * attack before answering and plays perfectly. Blockers are treated as "one attack is absorbed".
 */
export function canWin(pos: LethalPos): boolean {
  const memo = new Map<string, boolean>();
  const go = (atk: number[], don: number, ctr: number[], life: number, blk: number): boolean => {
    if (!atk.length) return false;
    if (atk.length < life + 1) return false; // not enough attacks left even if all connect
    const key = `${atk.join(',')}|${don}|${ctr.join(',')}|${life}|${blk}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let res = false;
    outer: for (let i = 0; i < atk.length; i++) {
      if (i > 0 && atk[i] === atk[i - 1]) continue;
      const rest = atk.filter((_, j) => j !== i);
      for (let d = 0; d <= don; d++) {
        const power = atk[i] + d * 1000;
        if (power < pos.def) continue;
        // The defender picks the reply that is best for them. The attacker wins this branch
        // only if EVERY reply still loses for the defender.
        let defenderEscapes = false;
        if (blk > 0 && !go(rest, don - d, ctr, life, blk - 1)) defenderEscapes = true;
        if (!defenderEscapes) {
          const need = power - pos.def + 1000;
          const seen = new Set<string>();
          for (let mask = 1; mask < 1 << ctr.length && !defenderEscapes; mask++) {
            let sum = 0;
            const left: number[] = [];
            for (let c = 0; c < ctr.length; c++) {
              if (mask & (1 << c)) sum += ctr[c];
              else left.push(ctr[c]);
            }
            if (sum < need) continue;
            const sig = left.join(',');
            if (seen.has(sig)) continue;
            seen.add(sig);
            if (!go(rest, don - d, left, life, blk)) defenderEscapes = true;
          }
        }
        if (!defenderEscapes) {
          // Taking the hit.
          const winsNow = life === 0;
          if (!winsNow && !go(rest, don - d, ctr, life - 1, blk)) defenderEscapes = true;
        }
        if (!defenderEscapes) {
          res = true;
          break outer;
        }
      }
    }
    memo.set(key, res);
    return res;
  };
  return go([...pos.attackers].sort((a, b) => a - b), pos.don, [...pos.counters].sort((a, b) => a - b), pos.life, pos.blockers);
}

export function lethalDrill(rnd: () => number): Drill {
  const pos: LethalPos = {
    def: pick(rnd, [5000, 5000, 6000]),
    life: pick(rnd, [0, 0, 1, 1, 2]),
    blockers: pick(rnd, [0, 0, 0, 1]),
    counters: [],
    attackers: [],
    don: Math.floor(rnd() * 5),
  };
  const nc = Math.floor(rnd() * 4);
  for (let i = 0; i < nc; i++) pos.counters.push(pick(rnd, [1000, 1000, 2000]));
  const na = Math.min(5, pos.life + 1 + pos.blockers + Math.floor(rnd() * 2));
  for (let i = 0; i < na; i++) pos.attackers.push(pick(rnd, [5000, 6000, 6000, 6000, 7000]));
  const win = canWin(pos);
  const needHits = pos.life + 1;
  const total = pos.counters.reduce((a, b) => a + b, 0);
  return {
    kind: 'lethal',
    prompt: `
<p><b>Can you force a win this turn?</b></p>
<ul>
<li>Opposing Leader: <b>${pos.def}</b> power, <b>${pos.life}</b> Life${pos.blockers ? `, <b>${pos.blockers}</b> active [Blocker]` : ', no Blockers'}.</li>
<li>Their hand (you peeked!): counters <b>${pos.counters.length ? pos.counters.map((c) => `+${c}`).join(', ') : 'none'}</b>, no Events.</li>
<li>Your attackers: <b>${pos.attackers.join(', ')}</b>.</li>
<li>Spare DON!! to attach: <b>${pos.don}</b>.</li>
</ul>`,
    options: ['Yes — I can force it', 'No — a perfect defender survives'],
    answer: win ? 0 : 1,
    why: `You need <b>${needHits}</b> hit${needHits > 1 ? 's' : ''}${pos.blockers ? ` and must get past ${pos.blockers} Blocker` : ''}, from ${pos.attackers.length} attacks. So the defender must stop <b>${Math.max(0, pos.attackers.length - pos.blockers - needHits + 1)}</b> attack(s) with ${k(total)} of counter in ${pos.counters.length} card(s). ${
      win
        ? 'Spread your DON!! so that every stop costs more than they have: +2000 over the Leader forces two cards per stop.'
        : 'However you distribute the DON!!, they can afford the stops they need. In a real game: attack anyway to drain their hand, but keep your own defence up.'
    } <i>In real games you cannot see their hand — estimate about 1000–1500 counter per card.</i>`,
  };
}

export const DRILLS: { id: Drill['kind']; name: string; blurb: string; make: (rnd: () => number) => Drill }[] = [
  { id: 'counter', name: 'Counter maths', blurb: 'How much do you need, and what is the cheapest way to get it?', make: counterDrill },
  { id: 'sizing', name: 'Attack sizing', blurb: 'How many DON!! make this attack impossible to stop from hand?', make: sizingDrill },
  { id: 'lethal', name: 'Lethal check', blurb: 'Full-information puzzles solved exactly: can you force the win this turn?', make: lethalDrill },
];
