import { describe, expect, it } from 'vitest';
import { DRILLS, canWin, fewestCards } from '../src/content/drills';
import { GLOSSARY } from '../src/content/glossary';
import { LESSONS, TRACKS } from '../src/content/lessons';
import { MATCHUPS, NOTES } from '../src/content/st30';
import { deckAdvice, deckStats, insights, kw, roles } from '../src/data/analysis';
import { ALL_CARDS, OPPONENTS, ST30 } from '../src/data/db';
import { boardRead, describeAction, endTurnWarnings, hint, review } from '../src/engine/coach';
import { apply, createGame, legalActions, whoActs } from '../src/engine/game';
import { exportText, importText } from '../src/ui/decklab';
import { rng } from './helpers';

describe('teaching content', () => {
  it('every lesson has a well-formed quiz and belongs to a track', () => {
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(TRACKS.some((t) => t.id === l.track)).toBe(true);
      expect(l.body.length).toBeGreaterThan(400);
      expect(l.quiz.length).toBeGreaterThanOrEqual(3);
      for (const q of l.quiz) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        expect(q.why.length).toBeGreaterThan(10);
      }
    }
  });

  it('the ST-30 guide covers every card in the box and every CPU matchup', () => {
    const ids = new Set([ST30.leader, ...ST30.cards.map(([id]) => id)]);
    expect(new Set(NOTES.map((n) => n.id))).toEqual(ids);
    for (const o of OPPONENTS) expect(MATCHUPS[o.deck.key]).toBeDefined();
  });

  it('the ST-30 numbers quoted in the guide match the list', () => {
    const s = deckStats(ST30);
    expect(s.total).toBe(50);
    expect(s.counter2k).toBe(6);
    expect(s.events).toBe(10);
    expect(s.curve[1]).toBe(18);
    expect(s.curve[3]).toBe(0);
    expect(s.curve[5]).toBe(12);
    const sixK = ST30.cards.reduce((n, [id, k]) => n + (ALL_CARDS.find((c) => c.id === id)!.power === 6000 ? k : 0), 0);
    expect(sixK).toBe(28);
    expect(deckAdvice(ST30).length).toBeGreaterThan(3);
  });

  it('every card in the game gets roles and coach notes', () => {
    for (const c of ALL_CARDS) {
      expect(roles(c).length).toBeGreaterThan(0);
      expect(insights(c).length).toBeGreaterThan(0);
    }
  });

  it('tells having a keyword apart from mentioning it', () => {
    const c = (id: string) => ALL_CARDS.find((x) => x.id === id)!;
    expect(kw(c('ST30-012'), 'Blocker')).toBe(false); // Luffy rests a [Blocker]; he is not one
    expect(kw(c('ST30-012'), 'Rush')).toBe(false); // he can GAIN Rush
    expect(kw(c('ST30-008'), 'Blocker')).toBe(true);
    expect(kw(c('ST30-011'), 'Blocker')).toBe(true); // Buggy: [Blocker] on its second line
    expect(kw(c('ST01-012'), 'Rush')).toBe(true);
    expect(kw(c('ST30-015'), 'Trigger')).toBe(true);
    expect(deckStats(ST30).blockers).toBe(10); // Marco 4, Crocodile 4, Buggy 2
    expect(deckStats(ST30).rush).toBe(0);
    expect(ALL_CARDS.filter((x) => kw(x, 'Blocker')).length).toBeGreaterThan(250);
  });

  it('glossary patterns are valid and find terms on real cards', () => {
    const jinbe = ALL_CARDS.find((c) => c.id === 'ST30-006')!;
    expect(GLOSSARY.filter((t) => t.re.test(jinbe.text)).map((t) => t.term)).toContain('[On Play]');
  });
});

describe('drills', () => {
  it('fewestCards finds the cheapest counter set', () => {
    expect(fewestCards([1000, 1000, 2000], 2000)).toBe(1);
    expect(fewestCards([1000, 1000, 2000], 3000)).toBe(2);
    expect(fewestCards([1000, 1000], 3000)).toBe(Infinity);
    expect(fewestCards([], 0)).toBe(0);
  });

  it('the lethal solver agrees with hand-checked positions', () => {
    // 0 Life, no defence: one attack that reaches the Leader wins.
    expect(canWin({ def: 5000, life: 0, blockers: 0, counters: [], attackers: [5000], don: 0 })).toBe(true);
    // One 1000 counter stops a single exact-power attack.
    expect(canWin({ def: 5000, life: 0, blockers: 0, counters: [1000], attackers: [5000], don: 0 })).toBe(false);
    // ...but one DON!! puts it out of reach of a single 1000.
    expect(canWin({ def: 5000, life: 0, blockers: 0, counters: [1000], attackers: [5000], don: 1 })).toBe(true);
    // A Blocker absorbs the only attack.
    expect(canWin({ def: 5000, life: 0, blockers: 1, counters: [], attackers: [9000], don: 0 })).toBe(false);
    // Two attackers, one Blocker: the second attack gets through.
    expect(canWin({ def: 5000, life: 0, blockers: 1, counters: [], attackers: [5000, 5000], don: 0 })).toBe(true);
    // The worked example from the lesson: 1 Life, three 6000s + 3 DON!! against 2000+1000+1000.
    expect(canWin({ def: 5000, life: 1, blockers: 0, counters: [1000, 1000, 2000], attackers: [6000, 6000, 6000], don: 3 })).toBe(true);
    // Too weak to touch the Leader.
    expect(canWin({ def: 6000, life: 0, blockers: 0, counters: [], attackers: [5000], don: 0 })).toBe(false);
    // Not enough attacks for the Life total.
    expect(canWin({ def: 5000, life: 2, blockers: 0, counters: [], attackers: [9000, 9000], don: 0 })).toBe(false);
  });

  it('every generator produces a valid, answerable problem', () => {
    const r = rng(7);
    for (const d of DRILLS) {
      for (let i = 0; i < 300; i++) {
        const p = d.make(r);
        expect(p.answer, `${d.id}: ${p.prompt}`).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThan(p.options.length);
        expect(new Set(p.options).size).toBe(p.options.length);
      }
    }
  });
});

describe('coach', () => {
  it('always has a legal suggestion and readable text while a full game is played', () => {
    const g = createGame({ decks: [ST30, OPPONENTS[0].deck], seed: 99 });
    let steps = 0;
    while (g.winner === null && steps++ < 3000) {
      const who = whoActs(g);
      expect(who).not.toBeNull();
      const d = hint(g, who!);
      expect(d).not.toBeNull();
      expect(describeAction(g, d!.action).length).toBeGreaterThan(3);
      if (!g.pending && who === 0) {
        expect(Array.isArray(boardRead(g, 0))).toBe(true);
        expect(Array.isArray(endTurnWarnings(g, 0))).toBe(true);
        expect(legalActions(g).length).toBeGreaterThan(0);
      }
      apply(g, d!.action);
    }
    expect(g.winner).not.toBeNull();
    const items = review(g, 0);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });
});

describe('deck text format', () => {
  it('round-trips a list through export and import', () => {
    const r = importText(exportText(ST30), 'copy');
    expect(r.unknown).toEqual([]);
    expect(r.deck!.leader).toBe(ST30.leader);
    expect(new Map(r.deck!.cards)).toEqual(new Map(ST30.cards));
  });
  it('reports unknown card numbers and a missing Leader', () => {
    const r = importText('4xZZ99-999\n4xST30-005', 'x');
    expect(r.deck).toBeNull();
    expect(r.unknown).toEqual(['ZZ99-999']);
  });
});
