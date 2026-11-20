// The "everything about this card" panel, shown in a modal from any screen.

import { termsIn } from '../content/glossary';
import { NOTES } from '../content/st30';
import { SIM_LABEL, SIM_NOTE, insights, roles } from '../data/analysis';
import { ALL_CARDS, card } from '../data/db';
import type { CardDef } from '../engine/types';
import { type Child, btn, cardEl, h, modal } from './dom';
import { localPicture } from './localart';

const EARLY_SETS = new Set(['OP01', 'OP02', 'OP03', 'OP04', 'ST01', 'ST02', 'ST03', 'ST04']);

const TIMING_LABEL: Record<string, string> = {
  onPlay: 'On Play',
  whenAttacking: 'When Attacking',
  onKO: 'On K.O.',
  onBlock: 'On Block',
  activateMain: 'Activate: Main',
  main: 'Main (Event)',
  counter: 'Counter (Event)',
  trigger: 'Trigger',
  endOfTurn: 'End of Your Turn',
  onOppAttack: 'On Your Opponent’s Attack',
  afterBattleChar: 'After battling a Character',
};

const row = (label: string, value: Child): HTMLElement => h('tr', null, h('th', null, label), h('td', null, value));

export function cardInfo(d: CardDef, onOpen?: (id: string) => void): HTMLElement {
  const note = NOTES.find((n) => n.id === d.id);
  const sameName = ALL_CARDS.filter((c) => c.name === d.name && c.id !== d.id).slice(0, 24);
  const terms = termsIn(d.text);
  const simulated: string[] = [];
  if (d.sim !== 'none') {
    for (const e of d.effects ?? []) simulated.push(`${TIMING_LABEL[e.timing] ?? e.timing}${e.opt ? ' · once per turn' : ''}${e.don ? ` · needs ${e.don} DON!!` : ''}`);
    if (d.powerAura) simulated.push('Continuous power effect');
    if (d.dynKeyword) simulated.push('Conditional keyword');
    if (d.costAura) simulated.push('Continuous cost effect');
    if (d.replaceRemoval) simulated.push('Replacement effect ("instead")');
    if (d.cantBeKoByEffect) simulated.push('Cannot be K.O.’d by effects');
    for (const kw of d.keywords ?? []) simulated.push(`Keyword: ${kw}`);
  }
  return h(
    'div',
    { class: 'cinfo' },
    h(
      'div',
      { class: 'cinfo-card' },
      cardEl(d, { size: 'lg' }),
      // Your own picture from the local-art/ folder, shown whole. It exists only on this computer.
      localPicture(d.id) ? h('img', { class: 'localpic', src: localPicture(d.id), alt: `Your picture of ${d.name} (${d.id})`, loading: 'lazy' }) : null,
      // The picture above is this site's own drawing. The printed card's artwork belongs to its publisher, so we link to it instead of copying it.
      h('a', { class: 'printed', href: `https://onepiece.limitlesstcg.com/cards/${encodeURIComponent(d.id)}`, target: '_blank', rel: 'noopener noreferrer' }, 'See the printed card ↗'),
    ),
    h(
      'div',
      { class: 'cinfo-body' },
      h('h2', null, d.name),
      h('div', { class: 'pills' }, roles(d).map((r) => h('span', { class: 'pill role' }, r))),
      h(
        'table',
        { class: 'kv' },
        row('Card number', d.id),
        row('Category', d.category),
        row('Colour', d.colors.join(' / ')),
        d.category === 'Leader' ? row('Life', d.life ?? 5) : row('Cost', d.cost),
        d.category === 'Leader' || d.category === 'Character' ? row('Power', d.power) : null,
        d.category === 'Character' ? row('Counter', d.counter ? `+${d.counter}` : 'none') : null,
        d.attribute.length ? row('Attribute', d.attribute.join(' / ')) : null,
        row('Type', d.types.join(' / ') || '—'),
      ),
      h('div', { class: `simbox sim-${d.sim}` }, h('b', null, SIM_LABEL[d.sim]), h('span', null, ` — ${SIM_NOTE[d.sim]}`)),
      simulated.length ? h('p', { class: 'muted small' }, `What the simulator runs: ${simulated.join('; ')}.`) : null,
      note
        ? h(
            'div',
            { class: 'key' },
            h('b', null, `In your ST-30 deck — ${note.role}. `),
            note.verdict,
            h('ul', null, note.how.map((x) => h('li', null, x))),
            h('p', null, h('b', null, 'Common mistakes')),
            h('ul', null, note.mistakes.map((x) => h('li', null, x))),
          )
        : null,
      h('h4', null, 'Coach notes'),
      h('ul', { class: 'tight' }, insights(d).map((x) => h('li', null, x))),
      terms.length ? h('h4', null, 'Terms on this card') : null,
      terms.length ? h('dl', { class: 'terms' }, terms.map((t) => [h('dt', null, t.term), h('dd', null, t.text)])) : null,
      EARLY_SETS.has(d.set)
        ? h('p', { class: 'muted small' }, `Legality note: ${d.id} comes from the game’s first block of sets. Standard now rotates by block icon, so this number may no longer be Standard-legal unless it has been reprinted with a newer icon. Check the official card list before a tournament.`)
        : null,
      sameName.length
        ? h(
            'div',
            null,
            h('h4', null, `Other cards named ${d.name} (${sameName.length}${sameName.length === 24 ? '+' : ''})`),
            h(
              'div',
              { class: 'chips' },
              sameName.map((c) => h('button', { class: 'chip', type: 'button', onclick: () => onOpen?.(c.id), title: c.text }, `${c.id} · ${c.colors.join('/')} · ${c.category === 'Leader' ? 'Leader' : `cost ${c.cost}`}`)),
            ),
          )
        : null,
    ),
  );
}

export function openCard(id: string, actions?: (d: CardDef, close: () => void) => Child): void {
  const d = card(id);
  if (!d) return;
  let close: () => void = () => {};
  const body = h('div', null, cardInfo(d, (other) => {
    close();
    openCard(other, actions);
  }));
  close = modal(body, { wide: true });
  const extra = actions?.(d, close);
  body.appendChild(h('div', { class: 'modal-actions' }, extra ?? null, btn('Close', () => close())));
}
