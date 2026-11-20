// Deck Lab: build, check, save and test your own lists.

import { ALL_CARDS, OPPONENTS, ST30, canSimulate, card, deckSize, starterTemplates, validateDeck } from '../data/db';
import { CARDS } from '../engine/registry';
import type { CardDef, DeckList } from '../engine/types';
import { openCard } from './carddetail';
import { btn, cardEl, clear, h, modal } from './dom';
import { adviceList, deckCharts } from './deckviz';
import { type Browser, cardBrowser, newFilter } from './library';
import { queueDeck } from './play';
import { deleteDeck, load, saveDeck, update } from './store';

const copyOf = (d: DeckList, name: string): DeckList => ({ key: `deck-${Date.now().toString(36)}`, name, leader: d.leader, cards: d.cards.map(([id, n]) => [id, n]) });

const editable = (d: DeckList): DeckList => ({ ...d, cards: d.cards.map(([id, n]) => [id, n]) });

/** Reopen the deck you last saved here; only a first visit starts from a copy of the boxed ST-30 list. */
function initialDeck(): DeckList {
  const s = load();
  const last = s.decks.find((d) => d.key === s.settings.lab) ?? s.decks[s.decks.length - 1];
  return last && CARDS[last.leader] ? editable(last) : copyOf(ST30, 'My ST-30 v1');
}

let cur: DeckList = initialDeck();
let dirty = false;
const filter = newFilter();
const leaderFilter = { ...newFilter(), category: 'Leader' };

const count = (id: string): number => cur.cards.find(([x]) => x === id)?.[1] ?? 0;

function setCount(id: string, n: number): void {
  const max = CARDS[id]?.anyCopies ? 50 : 4;
  n = Math.max(0, Math.min(max, n));
  const i = cur.cards.findIndex(([x]) => x === id);
  if (n === 0) {
    if (i >= 0) cur.cards.splice(i, 1);
  } else if (i >= 0) cur.cards[i][1] = n;
  else cur.cards.push([id, n]);
  dirty = true;
}

function toast(msg: string): void {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(t);
  window.setTimeout(() => t.remove(), 2200);
}

export function exportText(d: DeckList): string {
  return [`1x${d.leader}`, ...d.cards.map(([id, n]) => `${n}x${id}`)].join('\n');
}

/** Reads "4xOP01-016" / "4 OP01-016" lines. The first Leader found becomes the Leader. */
export function importText(text: string, name: string): { deck: DeckList | null; unknown: string[] } {
  const unknown: string[] = [];
  let leader = '';
  const cards = new Map<string, number>();
  for (const m of text.matchAll(/(\d+)\s*[xX×]?\s*([A-Za-z]{1,4}\d{0,2}-\d{3})/g)) {
    const id = m[2].toUpperCase();
    const n = Number(m[1]);
    const d = CARDS[id];
    if (!d) {
      unknown.push(id);
      continue;
    }
    if (d.category === 'Leader') leader ||= id;
    else cards.set(id, (cards.get(id) ?? 0) + n);
  }
  if (!leader) return { deck: null, unknown };
  return { deck: { key: `deck-${Date.now().toString(36)}`, name, leader, cards: [...cards.entries()] }, unknown };
}

export function render(root: HTMLElement): void {
  clear(root);
  const deckCol = h('div', { class: 'deckcol' });
  let browser: Browser | null = null;

  const pool = (): CardDef[] => {
    const cols = card(cur.leader)?.colors ?? [];
    return ALL_CARDS.filter((d) => d.category !== 'Leader' && d.colors.some((c) => cols.includes(c)));
  };

  const rebuildBrowser = (): void => {
    browser = cardBrowser({
      state: filter,
      pool: pool(),
      pageSize: 30,
      onCard: (d) => openCard(d.id, (dd, close) => [btn('+ Add a copy', () => {
        setCount(dd.id, count(dd.id) + 1);
        close();
        paint();
      }, { cls: 'primary' }), count(dd.id) ? btn('− Remove a copy', () => {
        setCount(dd.id, count(dd.id) - 1);
        close();
        paint();
      }) : null]),
      count: (d) => count(d.id),
      under: (d) =>
        h(
          'div',
          { class: 'qty' },
          btn('−', () => {
            setCount(d.id, count(d.id) - 1);
            paint();
          }, { cls: 'small', disabled: count(d.id) === 0, title: 'Remove a copy' }),
          h('span', null, count(d.id)),
          btn('+', () => {
            setCount(d.id, count(d.id) + 1);
            paint();
          }, { cls: 'small', disabled: count(d.id) >= (d.anyCopies ? 50 : 4), title: 'Add a copy' }),
        ),
    });
    const holder = root.querySelector('.poolcol');
    if (holder) {
      clear(holder);
      holder.appendChild(h('h3', null, 'Card pool', h('small', null, ` · cards your ${card(cur.leader).colors.join('/')} Leader may use`)));
      holder.appendChild(browser.el);
    }
  };

  const useDeck = (d: DeckList): void => {
    cur = d;
    dirty = false;
    filter.page = 0;
    paint();
    rebuildBrowser();
  };

  const chooseLeader = (): void => {
    let close: () => void = () => {};
    const b = cardBrowser({
      state: leaderFilter,
      pool: ALL_CARDS.filter((d) => d.category === 'Leader'),
      lockCategory: true,
      pageSize: 24,
      onCard: (d) => {
        cur.leader = d.id;
        dirty = true;
        close();
        paint();
        rebuildBrowser();
      },
    });
    close = modal(h('div', null, h('h2', null, 'Choose a Leader'), h('p', { class: 'muted' }, 'The Leader decides which colours your deck may use. Dimmed "REF" Leaders can be built with but not test-played here.'), b.el), { wide: true });
  };

  const loadMenu = (): void => {
    let close: () => void = () => {};
    const row = (d: DeckList, label: string, saved: boolean): HTMLElement =>
      h(
        'div',
        { class: 'loadrow' },
        h('span', null, h('b', null, d.name), h('small', null, ` · ${CARDS[d.leader]?.name ?? '?'} · ${deckSize(d)} cards · ${label}`)),
        btn(saved ? 'Open' : 'Copy & edit', () => {
          close();
          if (saved) update((s) => (s.settings.lab = d.key));
          useDeck(saved ? editable(d) : copyOf(d, `${d.name} (my version)`));
        }, { cls: 'small primary' }),
        saved
          ? btn('Delete', () => {
              deleteDeck(d.key);
              close();
              loadMenu();
            }, { cls: 'small ghost' })
          : null,
      );
    const saved = load().decks;
    close = modal(
      h(
        'div',
        null,
        h('h2', null, 'Open a deck'),
        h('h4', null, 'Your saved decks'),
        saved.length ? saved.map((d) => row(d, 'saved', true)) : h('p', { class: 'muted' }, 'Nothing saved yet.'),
        h('h4', null, 'Templates'),
        row(ST30, 'your boxed deck', false),
        OPPONENTS.map((o) => row(o.deck, `CPU deck${o.exactList ? '' : ' (approximate counts)'}`, false)),
        starterTemplates().filter((d) => d.key !== 'st30' && !OPPONENTS.some((o) => o.deck.leader === d.leader)).map((d) => row(d, 'starter deck list', false)),
      ),
      { wide: true },
    );
  };

  const exportImport = (): void => {
    let close: () => void = () => {};
    const ta = h('textarea', { rows: 14, class: 'deckta', spellcheck: 'false', 'aria-label': 'Deck list text' }, exportText(cur));
    const msg = h('p', { class: 'muted small' }, 'One card per line: "4xST30-005". The Leader is the line with a Leader’s card number.');
    close = modal(
      h(
        'div',
        null,
        h('h2', null, 'Export / import'),
        msg,
        ta,
        h(
          'div',
          { class: 'modal-actions' },
          btn('Copy to clipboard', () => {
            ta.select();
            void navigator.clipboard?.writeText(ta.value).then(() => toast('Copied.'), () => toast('Select the text and copy it manually.'));
          }),
          btn('Import this text as a new deck', () => {
            const r = importText(ta.value, 'Imported deck');
            if (!r.deck) {
              msg.textContent = `Could not find a Leader in that text.${r.unknown.length ? ` Unknown card numbers: ${r.unknown.join(', ')}.` : ''}`;
              msg.className = 'bad small';
              return;
            }
            close();
            useDeck(r.deck);
            dirty = true;
            if (r.unknown.length) toast(`Skipped unknown cards: ${r.unknown.join(', ')}`);
          }, { cls: 'primary' }),
        ),
      ),
    );
  };

  const test = (): void => {
    const problems = validateDeck(cur);
    if (problems.length) {
      modal(h('div', null, h('h2', null, 'This list cannot be test-played yet'), h('ul', null, problems.map((p) => h('li', { class: p.level === 'error' ? 'bad' : '' }, p.msg))), h('p', { class: 'muted' }, 'Fix the errors, and swap out the cards marked "REF" (not playable yet), then try again.')));
      return;
    }
    saveDeck(cur);
    dirty = false;
    queueDeck(cur);
    location.hash = '#/play';
  };

  function paint(): void {
    clear(deckCol);
    const leader = card(cur.leader);
    const problems = validateDeck(cur);
    const errors = problems.filter((p) => p.level === 'error');
    const warns = problems.filter((p) => p.level === 'warn');
    const total = deckSize(cur);
    const order = { Character: 0, Event: 1, Stage: 2, Leader: 3 } as const;
    const rows = [...cur.cards].filter(([id]) => CARDS[id]).sort((a, b) => order[CARDS[a[0]].category] - order[CARDS[b[0]].category] || CARDS[a[0]].cost - CARDS[b[0]].cost || a[0].localeCompare(b[0]));
    const name = h('input', { class: 'deckname', value: cur.name, 'aria-label': 'Deck name', onchange: () => {
      cur.name = name.value.trim() || 'Untitled deck';
      dirty = true;
    } });
    const isSaved = load().decks.some((d) => d.key === cur.key);
    deckCol.appendChild(
      h(
        'div',
        null,
        h('div', { class: 'row' }, name),
        h(
          'div',
          { class: 'row wrap' },
          btn(dirty || !isSaved ? 'Save' : 'Saved ✓', () => {
            saveDeck(cur);
            dirty = false;
            toast(`Saved "${cur.name}".`);
            paint();
          }, { cls: 'primary small' }),
          btn('Open…', loadMenu, { cls: 'small' }),
          btn('Duplicate', () => useDeck(copyOf(cur, `${cur.name} copy`)), { cls: 'small' }),
          btn('New empty', () => {
            useDeck({ key: `deck-${Date.now().toString(36)}`, name: 'New deck', leader: cur.leader, cards: [] });
            chooseLeader();
          }, { cls: 'small' }),
          btn('Export / import', exportImport, { cls: 'small' }),
          btn('Test vs CPU ▶', test, { cls: 'small accent', title: canSimulate(cur) ? 'Play this deck against the CPU' : 'Needs a legal list with only simulated cards' }),
        ),
        h('div', { class: 'leaderpick' }, cardEl(leader, { size: 'md', cls: leader.sim === 'none' ? 'refonly' : '', onClick: () => openCard(leader.id) }), h('div', null, h('b', null, leader.name), h('p', { class: 'small muted' }, `${leader.colors.join('/')} · ${leader.life ?? 5} Life · ${leader.power} power`), btn('Change Leader', chooseLeader, { cls: 'small' }))),
        h('h3', { class: total === 50 && !errors.length ? 'good' : '' }, `${total} / 50 cards`, errors.length ? h('small', { class: 'bad' }, ` · ${errors.length} problem${errors.length > 1 ? 's' : ''}`) : total === 50 ? h('small', null, ' · legal list') : null),
        errors.length ? h('ul', { class: 'problems' }, errors.map((p) => h('li', { class: 'bad' }, p.msg))) : null,
        warns.length ? h('details', { class: 'small' }, h('summary', null, `${warns.length} card${warns.length > 1 ? 's' : ''} cannot be simulated (the list can still be legal)`), h('ul', null, warns.map((p) => h('li', null, p.msg)))) : null,
        h(
          'div',
          { class: 'decklist' },
          rows.map(([id, n]) => {
            const d = CARDS[id];
            return h(
              'div',
              { class: `drow ${d.sim === 'none' ? 'ref' : ''}` },
              btn('−', () => {
                setCount(id, n - 1);
                paint();
                browser?.refresh();
              }, { cls: 'tiny', title: 'Remove a copy' }),
              h('b', { class: 'dn' }, n),
              btn('+', () => {
                setCount(id, n + 1);
                paint();
                browser?.refresh();
              }, { cls: 'tiny', disabled: n >= (d.anyCopies ? 50 : 4), title: 'Add a copy' }),
              h('span', { class: 'dcost' }, d.cost),
              h('button', { class: 'dname linkish', type: 'button', onclick: () => openCard(id) }, d.name),
              h('span', { class: 'dmeta' }, d.category === 'Character' ? `${d.power / 1000}k${d.counter ? ` · +${d.counter / 1000}k` : ''}` : d.category),
            );
          }),
          rows.length ? null : h('p', { class: 'muted' }, 'Empty. Add cards from the pool on the right.'),
        ),
        h('h3', null, 'Analysis'),
        deckCharts(cur),
        adviceList(cur),
      ),
    );
    browser?.refresh();
  }

  root.appendChild(
    h(
      'div',
      { class: 'page wide' },
      h('h1', null, 'Deck Lab'),
      h('p', { class: 'lead' }, 'Build any deck from the full card pool. Construction rules are checked as you go, the analysis updates live, and lists made only of simulated cards can be played against the CPU.'),
      h('div', { class: 'lab' }, deckCol, h('div', { class: 'poolcol' })),
    ),
  );
  paint();
  rebuildBrowser();
}
