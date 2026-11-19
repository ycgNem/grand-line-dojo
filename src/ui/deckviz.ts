// Deck statistics drawn as simple HTML bars: curve, counter spread, composition, advice.

import { deckAdvice, deckStats } from '../data/analysis';
import type { DeckList } from '../engine/types';
import { h } from './dom';

export function deckCharts(d: DeckList): HTMLElement {
  const s = deckStats(d);
  const max = Math.max(1, ...s.curve);
  const curve = h(
    'div',
    { class: 'curve', role: 'img', 'aria-label': `Cost curve: ${s.curve.map((n, i) => `${n} cards at cost ${i}`).join(', ')}` },
    s.curve.map((n, i) => h('div', { class: 'cbar' }, h('span', { class: 'cn' }, n || ''), h('div', { class: 'cfill', style: { height: `${Math.round((n / max) * 100)}%` } }), h('span', { class: 'cl' }, i === 10 ? '10+' : i))),
  );
  const tot = Math.max(1, s.total);
  const seg = (n: number, cls: string, label: string): HTMLElement | null => (n ? h('div', { class: `seg ${cls}`, style: { width: `${(n / tot) * 100}%` }, title: `${label}: ${n}` }, n) : null);
  const counter = h('div', { class: 'stack' }, seg(s.counter2k, 's2k', '+2000 counter'), seg(s.counter1k, 's1k', '+1000 counter'), seg(s.counterEvents, 'sev', '[Counter] Events'), seg(s.counter0, 's0', 'No counter'));
  const stat = (label: string, value: string | number): HTMLElement => h('div', { class: 'statbox' }, h('b', null, value), h('span', null, label));
  return h(
    'div',
    { class: 'deckviz' },
    h('div', { class: 'vizrow' }, h('div', null, h('h4', null, 'Cost curve'), curve), h('div', null, h('h4', null, 'Defence from hand'), counter, h('p', { class: 'legend small' }, h('i', { class: 'sw s2k' }), '+2000 ', h('i', { class: 'sw s1k' }), '+1000 ', h('i', { class: 'sw sev' }), 'Counter Events ', h('i', { class: 'sw s0' }), 'none'), h('p', { class: 'small muted' }, `Average printed counter per card: ${Math.round(s.counterPerCard)}`))),
    h(
      'div',
      { class: 'statgrid' },
      stat('Cards', s.total),
      stat('Characters', s.characters),
      stat('Events', s.events),
      stat('Stages', s.stages),
      stat('Avg cost', s.avgCost.toFixed(2)),
      stat('Cost ≤ 2 bodies', s.cheapPlays),
      stat('Blockers', s.blockers),
      stat('Rush', s.rush),
      stat('Triggers', s.triggers),
      stat('Searchers', s.searchers),
      stat('Card draw', s.draw),
      stat('Removal', s.removal),
    ),
  );
}

export function adviceList(d: DeckList): HTMLElement {
  return h('ul', { class: 'advice' }, deckAdvice(d).map((a) => h('li', { class: `a-${a.level}` }, h('span', { class: 'amark' }, a.level === 'good' ? '✓' : a.level === 'warn' ? '!' : 'i'), a.msg)));
}
