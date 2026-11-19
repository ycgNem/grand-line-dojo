import { describe, expect, it } from 'vitest';
import { ALL_CARDS, OPPONENTS, ST30, deckSize, starterTemplates, validateDeck } from '../src/data/db';
import { compileCard, type RawCard } from '../src/engine/compile';
import raw from '../src/data/cards.json';

describe('card database', () => {
  it('reports simulator coverage', () => {
    const by: Record<string, number> = {};
    for (const c of ALL_CARDS) by[c.sim] = (by[c.sim] ?? 0) + 1;
    console.log('coverage', ALL_CARDS.length, JSON.stringify(by));
    const classic = ALL_CARDS.filter((c) => /^ST0[1-7]$/.test(c.set) && c.sim === 'none');
    for (const c of classic) console.log('UNSUPPORTED', c.id, c.name, '|', compileCard((raw as RawCard[]).find((r) => r.id === c.id)!).unparsed.join(' || '));
    // most common unparsed sentences
    const miss: Record<string, number> = {};
    for (const r of raw as RawCard[]) for (const u of compileCard(r).unparsed) {
      const k = u.replace(/\{[^}]+\}/g, '{T}').replace(/\d+/g, 'N');
      miss[k] = (miss[k] ?? 0) + 1;
    }
    console.log(Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 45).map((e) => `${e[1]}  ${e[0]}`).join('\n'));
    expect(ALL_CARDS.length).toBeGreaterThan(2500);
  });

  it('ST-30 is a legal, fully simulated 50-card deck', () => {
    expect(deckSize(ST30)).toBe(50);
    expect(validateDeck(ST30)).toEqual([]);
    for (const [id] of ST30.cards) expect(ALL_CARDS.find((c) => c.id === id)!.sim).not.toBe('none');
  });

  it('every CPU deck is legal and simulated', () => {
    for (const o of OPPONENTS) {
      expect(deckSize(o.deck), o.deck.name).toBe(50);
      expect(validateDeck(o.deck), o.deck.name).toEqual([]);
    }
    for (const t of starterTemplates()) console.log(t.name, deckSize(t), validateDeck(t).filter((p) => p.level === 'error').length, 'errors', validateDeck(t).filter((p) => p.level === 'warn').length, 'unsimulated');
  });

  it('rejects a list with a card number the database does not know', () => {
    const [first, ...rest] = ST30.cards;
    const bad = { ...ST30, cards: [...rest, ['ZZ99-999', first[1]] as [string, number]] };
    expect(deckSize(bad)).toBe(50);
    expect(validateDeck(bad).some((p) => p.level === 'error' && p.msg.includes('ZZ99-999'))).toBe(true);
  });
});
