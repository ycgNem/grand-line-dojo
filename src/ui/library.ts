// The Card Library: every card in the game, searchable. The browser is reused by the Deck Lab.

import { SIM_LABEL, kw } from '../data/analysis';
import { ALL_CARDS } from '../data/db';
import type { CardDef } from '../engine/types';
import { openCard } from './carddetail';
import { type Child, btn, cardEl, clear, h } from './dom';
import { localPictureCount } from './localart';

export interface FilterState {
  q: string;
  color: string;
  category: string;
  cost: string;
  counter: string;
  feature: string;
  set: string;
  sim: string;
  sort: string;
  page: number;
}

export const newFilter = (): FilterState => ({ q: '', color: '', category: '', cost: '', counter: '', feature: '', set: '', sim: '', sort: 'id', page: 0 });

const HAY = new Map<string, string>();
for (const c of ALL_CARDS) HAY.set(c.id, `${c.id} ${c.name} ${c.types.join(' ')} ${c.attribute.join(' ')} ${c.text}`.toLowerCase());

const SETS = [...new Set(ALL_CARDS.map((c) => c.set))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const FEATURES: [string, string, (d: CardDef) => boolean][] = [
  ['blocker', '[Blocker]', (d) => kw(d, 'Blocker')],
  ['rush', '[Rush]', (d) => kw(d, 'Rush')],
  ['double', '[Double Attack]', (d) => kw(d, 'Double Attack')],
  ['banish', '[Banish]', (d) => kw(d, 'Banish')],
  ['trigger', '[Trigger]', (d) => kw(d, 'Trigger')],
  ['counterEvent', '[Counter] Event', (d) => d.category === 'Event' && /\[Counter\]/.test(d.text)],
  ['onplay', '[On Play]', (d) => /\[On Play\]/.test(d.text)],
  ['attacking', '[When Attacking]', (d) => /\[When Attacking\]/.test(d.text)],
  ['onko', '[On K.O.]', (d) => /\[On K\.O\.\]/.test(d.text)],
  ['activate', '[Activate: Main]', (d) => /\[Activate: Main\]/.test(d.text)],
  ['search', 'Searches the deck', (d) => /Look at \d+ cards? from the top of your deck/.test(d.text)],
  ['draw', 'Draws cards', (d) => /[Dd]raw \d+ cards?/.test(d.text)],
  ['ko', 'K.O.s Characters', (d) => /K\.O\. (up to )?\d+ of your opponent's/.test(d.text)],
  ['bounce', 'Returns to hand / deck', (d) => /to the owner's hand|bottom of the owner's deck/.test(d.text)],
  ['rest', 'Rests opposing cards', (d) => /Rest up to \d+ of your opponent's/.test(d.text)],
  ['ramp', 'Adds DON!!', (d) => /Add up to \d+ DON!! cards? from your DON!! deck/.test(d.text)],
  ['donminus', 'DON!! −N cost', (d) => /DON!! -\d/.test(d.text)],
  ['life', 'Life manipulation', (d) => /Life cards?/.test(d.text) && d.category !== 'Leader'],
  ['vanilla', 'No effect (vanilla)', (d) => d.category === 'Character' && !d.text.trim()],
];

const SORTS: Record<string, (a: CardDef, b: CardDef) => number> = {
  id: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  cost: (a, b) => a.cost - b.cost || a.id.localeCompare(b.id),
  costd: (a, b) => b.cost - a.cost || a.id.localeCompare(b.id),
  power: (a, b) => b.power - a.power || a.id.localeCompare(b.id),
};

export function applyFilter(f: FilterState, pool: CardDef[]): CardDef[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const feat = FEATURES.find((x) => x[0] === f.feature)?.[2];
  const out = pool.filter((d) => {
    if (f.color && !d.colors.includes(f.color as CardDef['colors'][number])) return false;
    if (f.category && d.category !== f.category) return false;
    if (f.cost !== '' && (f.cost === '10' ? d.cost < 10 : d.cost !== Number(f.cost))) return false;
    if (f.cost !== '' && d.category === 'Leader') return false;
    if (f.counter !== '' && (d.category !== 'Character' || d.counter !== Number(f.counter))) return false;
    if (f.set && d.set !== f.set) return false;
    if (f.sim === 'play' && d.sim === 'none') return false;
    if (f.sim === 'ref' && d.sim !== 'none') return false;
    if (feat && !feat(d)) return false;
    if (words.length) {
      const hay = HAY.get(d.id) ?? '';
      for (const w of words) if (!hay.includes(w)) return false;
    }
    return true;
  });
  return out.sort(SORTS[f.sort] ?? SORTS.id);
}

export interface BrowserOpts {
  state: FilterState;
  pool: CardDef[];
  onCard: (d: CardDef) => void;
  /** Number shown on the card (copies in the deck being built). */
  count?: (d: CardDef) => number;
  /** Extra controls rendered under each card. */
  under?: (d: CardDef, refresh: () => void) => Child;
  pageSize?: number;
  lockCategory?: boolean;
}

export interface Browser {
  el: HTMLElement;
  refresh: () => void;
}

export function cardBrowser(o: BrowserOpts): Browser {
  const f = o.state;
  const size = o.pageSize ?? 48;
  const results = h('div', { class: 'results' });
  type TextKey = Exclude<keyof FilterState, 'page'>;
  const selects: [TextKey, HTMLSelectElement][] = [];
  const sel = (key: TextKey, label: string, opts: [string, string][]): HTMLElement => {
    const s = h('select', { 'aria-label': label, onchange: () => {
      f[key] = s.value;
      f.page = 0;
      refresh();
    } }, opts.map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
    selects.push([key, s]);
    return h('label', { class: 'fsel' }, h('span', null, label), s);
  };
  const input = h('input', { type: 'search', placeholder: 'Search name, text, type or number…', value: f.q, class: 'fsearch', 'aria-label': 'Search cards', oninput: () => {
    f.q = input.value;
    f.page = 0;
    refresh();
  } });
  const bar = h(
    'div',
    { class: 'filters' },
    input,
    sel('color', 'Colour', [['', 'Any'], ...['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'].map((c) => [c, c] as [string, string])]),
    o.lockCategory ? null : sel('category', 'Category', [['', 'Any'], ['Leader', 'Leader'], ['Character', 'Character'], ['Event', 'Event'], ['Stage', 'Stage']]),
    sel('cost', 'Cost', [['', 'Any'], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), String(n)] as [string, string]), ['10', '10+']]),
    sel('counter', 'Counter', [['', 'Any'], ['2000', '+2000'], ['1000', '+1000'], ['0', 'None']]),
    sel('feature', 'Feature', [['', 'Any'], ...FEATURES.map(([v, l]) => [v, l] as [string, string])]),
    sel('set', 'Set', [['', 'Any'], ...SETS.map((s) => [s, s] as [string, string])]),
    sel('sim', 'Simulator', [['', 'Any'], ['play', 'Playable here'], ['ref', 'Not playable yet']]),
    sel('sort', 'Sort', [['id', 'Card number'], ['name', 'Name'], ['cost', 'Cost ↑'], ['costd', 'Cost ↓'], ['power', 'Power ↓']]),
    btn('Reset', () => {
      Object.assign(f, newFilter(), o.lockCategory ? { category: f.category } : {});
      input.value = '';
      for (const [key, s] of selects) s.value = f[key];
      refresh();
    }, { cls: 'small ghost' }),
  );
  function refresh(): void {
    const list = applyFilter(f, o.pool);
    const pages = Math.max(1, Math.ceil(list.length / size));
    f.page = Math.min(f.page, pages - 1);
    const slice = list.slice(f.page * size, (f.page + 1) * size);
    const pager = (): HTMLElement =>
      h(
        'div',
        { class: 'pager' },
        h('span', null, h('b', null, list.length.toLocaleString()), ` card${list.length === 1 ? '' : 's'}`),
        h('span', { class: 'spacer' }),
        btn('‹ Prev', () => {
          f.page--;
          refresh();
        }, { cls: 'small', disabled: f.page <= 0 }),
        h('span', null, `Page ${f.page + 1} / ${pages}`),
        btn('Next ›', () => {
          f.page++;
          refresh();
        }, { cls: 'small', disabled: f.page >= pages - 1 }),
      );
    clear(results);
    results.appendChild(pager());
    results.appendChild(
      h(
        'div',
        { class: 'cardgrid' },
        slice.map((d) => {
          const n = o.count?.(d) ?? 0;
          return h('div', { class: 'gcell' }, cardEl(d, { size: 'md', cls: d.sim === 'none' ? 'refonly' : '', count: n > 0 ? n : undefined, onClick: () => o.onCard(d), title: `${d.name} (${d.id}) — ${SIM_LABEL[d.sim]}` }), o.under ? o.under(d, refresh) : null);
        }),
        slice.length ? null : h('p', { class: 'muted' }, 'No cards match these filters.'),
      ),
    );
    if (pages > 1) results.appendChild(pager());
  }
  refresh();
  return { el: h('div', { class: 'browser' }, bar, results), refresh };
}

const state = newFilter();

export function render(root: HTMLElement, arg = ''): void {
  clear(root);
  const playable = ALL_CARDS.filter((c) => c.sim !== 'none').length;
  const by = (s: CardDef['sim']): number => ALL_CARDS.filter((c) => c.sim === s).length;
  const browser = cardBrowser({ state, pool: ALL_CARDS, onCard: (d) => openCard(d.id) });
  root.appendChild(
    h(
      'div',
      { class: 'page wide' },
      h('h1', null, 'Card Library'),
      h(
        'p',
        { class: 'lead' },
        `All ${ALL_CARDS.length.toLocaleString()} cards in the database, from ${SETS.length} sets and promo packs. Click any card for its full text, what every term on it means, and coach notes on how it is used.`,
      ),
      h(
        'div',
        { class: 'key' },
        h('b', null, `${playable.toLocaleString()} cards (${Math.round((playable / ALL_CARDS.length) * 100)}%) can be played in matches here. `),
        `${by('scripted')} are hand-scripted and tested, ${by('auto').toLocaleString()} were read automatically from their printed text, and ${by('vanilla')} have no effect text. The other ${by('none').toLocaleString()} (dimmed, marked "REF") use one-off mechanics the simulator does not model yet: you can still read them and use them in Deck Lab lists. `,
        'The pictures are this site’s own drawings, one scene per colour — open a card to follow a link to its printed artwork.',
        localPictureCount ? ` ${localPictureCount === 1 ? '1 card shows your own picture' : `${localPictureCount.toLocaleString()} cards show your own pictures`} from the local-art folder (on this computer only).` : null,
      ),
      browser.el,
    ),
  );
  if (arg) openCard(arg);
}
