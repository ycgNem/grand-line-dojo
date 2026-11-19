// My Deck: the complete guide to Starter Deck EX "Luffy & Ace" [ST-30].

import { COMBOS, CURVES, GAME_PLAN, MATCHUPS, MULLIGAN, NOTES, WEAKNESSES } from '../content/st30';
import { kw } from '../data/analysis';
import { ALL_CARDS, OPPONENTS, ST30, card } from '../data/db';
import type { CardDef } from '../engine/types';
import { openCard } from './carddetail';
import { cardEl, clear, h } from './dom';
import { adviceList, deckCharts } from './deckviz';

const inColours = (d: CardDef): boolean => d.colors.includes('Red') || d.colors.includes('Green');
const owned = new Set(ST30.cards.map(([id]) => id));

function upgrades(): { title: string; why: string; cards: CardDef[] }[] {
  const chars = ALL_CARDS.filter((d) => d.category === 'Character' && inColours(d) && !owned.has(d.id) && d.power < 7000);
  const named = chars.filter((d) => d.name === 'Portgas.D.Ace' || d.name === 'Monkey.D.Luffy');
  const six = chars.filter((d) => d.power === 6000 && !named.includes(d) && d.cost <= 6 && (kw(d, 'Blocker') || kw(d, 'Rush') || /\[(On Play|When Attacking)\]/.test(d.text)));
  const events = ALL_CARDS.filter((d) => d.category === 'Event' && inColours(d) && !owned.has(d.id) && d.cost <= 2 && /\[Counter\]/.test(d.text));
  const byCost = (a: CardDef, b: CardDef): number => (b.power === 6000 ? 1 : 0) - (a.power === 6000 ? 1 : 0) || a.cost - b.cost || a.id.localeCompare(b.id);
  return [
    {
      title: 'More Ace and Luffy',
      why: 'Every Red or Green Character named Portgas.D.Ace or Monkey.D.Luffy gets your Leader’s +3000 on the opponent’s turn. The ones with exactly 6000 power (listed first) also work with every searcher, draw cost, protector and Edward Newgate in your deck.',
      cards: named.sort(byCost),
    },
    {
      title: '6000-power Characters with abilities',
      why: 'Replacements for the plain bodies (Jozu, Mr.2). They keep every 6000 synergy and add an effect. Read each one: some need a specific Leader or crew to work.',
      cards: six.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id)).slice(0, 36),
    },
    {
      title: 'Cheap [Counter] Events in your colours',
      why: 'More ways to defend for 1–2 DON!!. Remember each one is a card without a counter value of its own — swap them for Events or vanillas, not for your 2000 counters.',
      cards: events.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id)).slice(0, 24),
    },
  ];
}

export function render(root: HTMLElement): void {
  clear(root);
  const leader = card(ST30.leader);
  const list = [...ST30.cards].sort((a, b) => card(a[0]).cost - card(b[0]).cost || a[0].localeCompare(b[0]));
  const toc: [string, string][] = [['plan', 'Game plan'], ['list', 'Deck list'], ['numbers', 'The numbers'], ['mulligan', 'Mulligan & curve'], ['combos', 'Combos'], ['cards', 'Card by card'], ['matchups', 'Matchups'], ['upgrades', 'Weak spots & upgrades']];
  root.appendChild(
    h(
      'div',
      { class: 'page wide' },
      h('h1', null, 'My Deck — ST-30 Luffy & Ace'),
      h('p', { class: 'lead' }, 'Starter Deck EX "Luffy & Ace": a Red/Green deck of 50 cards plus the Leader, exactly as it comes in the box. This page is everything about it — how it wins, every card, every matchup here, and how to make it your own.'),
      h('nav', { class: 'toc' }, toc.map(([id, label]) => h('a', { href: `#/deck`, onclick: (e: Event) => {
        e.preventDefault();
        document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } }, label))),

      h('section', { class: 'panel split', id: 'sec-plan' }, h('div', { class: 'leadercol' }, cardEl(leader, { size: 'lg', onClick: () => openCard(leader.id) })), h('div', { class: 'prose', html: `<h3>Game plan</h3>${GAME_PLAN}` })),

      h(
        'section',
        { class: 'panel', id: 'sec-list' },
        h('h3', null, 'Deck list', h('small', null, ' · 50 cards · click a card for full details')),
        h('div', { class: 'cardgrid' }, list.map(([id, n]) => h('div', { class: 'gcell' }, cardEl(card(id), { size: 'md', count: n, onClick: () => openCard(id) })))),
      ),

      h('section', { class: 'panel', id: 'sec-numbers' }, h('h3', null, 'The numbers'), deckCharts(ST30), h('h4', null, 'How this list measures up against competitive guidelines'), adviceList(ST30), h('p', { class: 'muted small' }, 'A starter deck is built around a theme, not tuned to these guidelines — the gaps are your first deck-building lessons.')),

      h('section', { class: 'panel', id: 'sec-mulligan' }, h('h3', null, 'Mulligan'), h('div', { class: 'prose', html: MULLIGAN }), h('h3', null, 'What to play each turn'), h('div', { class: 'prose', html: CURVES })),

      h('section', { class: 'panel', id: 'sec-combos' }, h('h3', null, 'Combos and sequencing'), h('div', { class: 'combos' }, COMBOS.map((c) => h('div', { class: 'combo' }, h('b', null, c.name), h('p', null, c.text))))),

      h(
        'section',
        { class: 'panel', id: 'sec-cards' },
        h('h3', null, 'Card by card'),
        NOTES.map((n) => {
          const d = card(n.id);
          const copies = ST30.cards.find(([id]) => id === n.id)?.[1];
          return h(
            'div',
            { class: 'note' },
            h('div', { class: 'notecard' }, cardEl(d, { size: 'md', count: copies, onClick: () => openCard(d.id) })),
            h(
              'div',
              null,
              h('h4', null, d.name, h('small', null, ` · ${n.role}${copies ? ` · ${copies} cop${copies === 1 ? 'y' : 'ies'}` : ''}`)),
              h('p', null, h('i', null, n.verdict)),
              h('p', { class: 'cardtext small' }, d.text.replace(/\n/g, ' ') || 'No effect text.'),
              h('b', null, 'How to use it'),
              h('ul', { class: 'tight' }, n.how.map((x) => h('li', null, x))),
              h('b', null, 'Common mistakes'),
              h('ul', { class: 'tight' }, n.mistakes.map((x) => h('li', null, x))),
            ),
          );
        }),
      ),

      h(
        'section',
        { class: 'panel', id: 'sec-matchups' },
        h('h3', null, 'Matchups against the six CPU decks'),
        OPPONENTS.map((o) => {
          const m = MATCHUPS[o.deck.key];
          return m ? h('div', { class: 'matchup' }, h('h4', null, `${o.deck.name}`, h('small', null, ` · ${o.color} ${o.style}`)), h('p', null, m.plan), h('ul', { class: 'tight' }, m.watch.map((w) => h('li', null, w)))) : null;
        }),
      ),

      h(
        'section',
        { class: 'panel', id: 'sec-upgrades' },
        h('h3', null, 'Weak spots'),
        h('ul', { class: 'tight' }, WEAKNESSES.map((w) => h('li', null, w))),
        h('h3', null, 'Upgrade finder'),
        h('p', null, 'These lists are pulled live from the full card database using your Leader’s rules: Red or Green, base power under 7000 (a 7000+ Character gives your Leader −2000). They are candidates to read and test, not a ranked "best of" — try them in ', h('a', { href: '#/lab' }, 'Deck Lab'), '.'),
        h('p', { class: 'muted small' }, 'Before buying: check that a card is legal in the format you play. Dimmed "REF" cards cannot be test-played in this simulator.'),
        upgrades().map((u) => h('div', null, h('h4', null, `${u.title} (${u.cards.length})`), h('p', { class: 'small' }, u.why), h('div', { class: 'cardgrid' }, u.cards.map((d) => h('div', { class: 'gcell' }, cardEl(d, { size: 'md', cls: d.sim === 'none' ? 'refonly' : '', onClick: () => openCard(d.id) })))))),
      ),
    ),
  );
}
