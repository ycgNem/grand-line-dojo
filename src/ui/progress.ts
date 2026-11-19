// Home and Progress: where you are on the road from first game to competitive player.

import { DRILLS } from '../content/drills';
import { LESSONS, TRACKS, type TrackId, lessonsOf } from '../content/lessons';
import { ALL_CARDS, OPPONENTS } from '../data/db';
import type { Level } from '../engine/ai';
import { HARBOUR, icon } from './art';
import { btn, clear, h, modal, pct } from './dom';
import { type MatchRec, type Save, load, resetAll } from './store';

interface Step {
  title: string;
  detail: string;
  done: boolean;
  progress: string;
  href: string;
}

const trackDone = (s: Save, t: TrackId): [number, number] => {
  const ls = lessonsOf(t);
  return [ls.filter((l) => s.lessons[l.id]?.done).length, ls.length];
};

const RANK: Record<Level, number> = { easy: 0, normal: 1, hard: 2 };

/** How many of the six CPU decks have been beaten under a condition. */
function beaten(s: Save, pred: (m: MatchRec) => boolean): number {
  return OPPONENTS.filter((o) => s.matches.some((m) => m.opp === o.deck.key && m.won && pred(m))).length;
}

export function ladder(s: Save): Step[] {
  const t = (id: TrackId): [number, number] => trackDone(s, id);
  const [r, rn] = t('rules');
  const [st, stn] = t('strategy');
  const [b, bn] = t('building');
  const [c, cn] = t('competing');
  const easy = beaten(s, () => true);
  const normal = beaten(s, (m) => RANK[m.level] >= 1);
  const hard = beaten(s, (m) => m.level === 'hard' && m.coach === 'off');
  const drills = DRILLS.filter((d) => (s.drills[d.id]?.best ?? 0) >= 10).length;
  const ownWin = s.matches.some((m) => m.won && m.level === 'hard' && m.deck !== 'st30');
  return [
    { title: 'Learn the rules', detail: 'Finish the 7 rules lessons.', done: r === rn, progress: `${r}/${rn}`, href: '#/learn' },
    { title: 'Win your first games', detail: 'Beat each of the six CPU decks at any difficulty.', done: easy === 6, progress: `${easy}/6`, href: '#/play' },
    { title: 'Learn to play well', detail: 'Finish the 8 strategy lessons.', done: st === stn, progress: `${st}/${stn}`, href: '#/learn' },
    { title: 'Make the maths automatic', detail: 'Reach a streak of 10 in each of the three drills.', done: drills === DRILLS.length, progress: `${drills}/${DRILLS.length}`, href: '#/learn' },
    { title: 'Beat a thinking opponent', detail: 'Beat each CPU deck on Normal or Hard.', done: normal === 6, progress: `${normal}/6`, href: '#/play' },
    { title: 'Fly solo', detail: 'Beat each CPU deck on Hard with coaching off.', done: hard === 6, progress: `${hard}/6`, href: '#/play' },
    { title: 'Become a deck builder', detail: 'Finish the deck-building lessons and save a deck of your own in Deck Lab.', done: b === bn && s.decks.length > 0, progress: `${b}/${bn} lessons · ${s.decks.length} deck${s.decks.length === 1 ? '' : 's'}`, href: '#/lab' },
    { title: 'Win with your own list', detail: 'Beat the Hard CPU with a deck you built.', done: ownWin, progress: ownWin ? 'done' : 'not yet', href: '#/lab' },
    { title: 'Get tournament-ready', detail: 'Finish the Compete lessons — then go and play real people.', done: c === cn, progress: `${c}/${cn}`, href: '#/learn' },
  ];
}

const TITLES = ['Cabin Hand', 'Deckhand', 'Rookie Pirate', 'Crew Member', 'Officer', 'Supernova', 'Captain', 'Warlord', 'Commander', 'Emperor of the Sea'];

function ladderEl(s: Save): HTMLElement {
  const steps = ladder(s);
  const done = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  return h(
    'section',
    { class: 'panel' },
    h('h3', null, `Rank: ${TITLES[done]}`, h('small', null, ` · ${done}/${steps.length} steps`)),
    h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': done }, h('div', { style: { width: `${(done / steps.length) * 100}%` } })),
    next ? h('p', null, h('b', null, 'Next step: '), h('a', { href: next.href }, next.title), ` — ${next.detail}`) : h('p', null, 'Every step complete. You have outgrown the CPU — find a local store and play.'),
    h('ol', { class: 'ladder' }, steps.map((x) => h('li', { class: x.done ? 'done' : '' }, h('span', { class: 'tick' }, x.done ? '✓' : '○'), h('span', null, h('a', { href: x.href }, h('b', null, x.title)), h('small', null, x.detail)), h('span', { class: 'muted small' }, x.progress)))),
  );
}

export function renderHome(root: HTMLElement): void {
  clear(root);
  const s = load();
  const nextLesson = LESSONS.find((l) => !s.lessons[l.id]?.done);
  const playable = ALL_CARDS.filter((c) => c.sim !== 'none').length;
  const tile = (href: string, art: string, title: string, text: string): HTMLElement =>
    h('a', { class: 'tile', href }, h('span', { class: 'seal' }, icon(art)), h('span', { class: 'tilebody' }, h('b', null, title), h('span', null, text)));
  root.appendChild(
    h(
      'div',
      { class: 'page' },
      h('div', { class: 'hero' }, h('div', { class: 'heroart', html: HARBOUR }), h('div', { class: 'herotitle' }, h('h1', null, 'Grand Line Dojo'), h('p', null, 'Learn the game. Master your deck. Set sail.'))),
      h('p', { class: 'lead' }, 'A One Piece Card Game trainer built around your ST-30 "Luffy & Ace" deck. Learn the rules, play the CPU with a coach at your shoulder, study every card in the game, and build your own decks.'),
      h(
        'div',
        { class: 'key' },
        h('b', null, s.matches.length || Object.keys(s.lessons).length ? 'Welcome back. ' : 'Start here. '),
        nextLesson
          ? h('span', null, 'Your next lesson is ', h('a', { href: `#/learn/${nextLesson.id}` }, nextLesson.title), '. ')
          : 'All lessons complete. ',
        s.matches.length ? '' : h('span', null, 'New to the game? Read the first two lessons, then ', h('a', { href: '#/play' }, 'play a match on Easy with Full coaching'), ' — the coach explains every decision.'),
      ),
      h(
        'div',
        { class: 'tiles' },
        tile('#/play', 'swords', 'Play', 'ST-30 against six CPU decks — one of each colour — with hints, battle maths and take-backs.'),
        tile('#/learn', 'scroll', 'Learn', `${LESSONS.length} lessons in ${TRACKS.length} tracks, each with a quiz, plus endless counter-maths and lethal drills.`),
        tile('#/deck', 'cards', 'My Deck', 'The complete ST-30 guide: game plan, all 17 cards, combos, matchups and upgrade candidates.'),
        tile('#/cards', 'spyglass', 'Card Library', `Every card in the database (${ALL_CARDS.length.toLocaleString()}), searchable, with coach notes on each.`),
        tile('#/lab', 'anchor', 'Deck Lab', 'Build any deck, get it checked and analysed, then test it against the CPU.'),
        tile('#/progress', 'flag', 'Progress', 'Your rank, match record and the numbers that show whether you are improving.'),
      ),
      ladderEl(s),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'What this is, honestly'),
        h(
          'ul',
          { class: 'tight' },
          h('li', null, 'Your ST-30 deck and the six CPU starter decks are fully simulated, card by card, and tested against their printed text.'),
          h('li', null, `${playable.toLocaleString()} of ${ALL_CARDS.length.toLocaleString()} cards can be played in matches. The rest are in the Library for study and in Deck Lab for list-building, but their effects are too complex for the engine to run.`),
          h('li', null, 'The CPU plays a sound, rule-based game. It is a sparring partner for fundamentals, not a substitute for human opponents.'),
          h('li', null, 'Card data is a snapshot. Before a tournament, check the official card list and banned list.'),
        ),
      ),
    ),
  );
}

export function render(root: HTMLElement): void {
  clear(root);
  const s = load();
  const ms = s.matches;
  const won = ms.filter((m) => m.won).length;
  const last = ms.slice(-10);
  const avg = (f: (m: MatchRec) => number): string => (last.length ? (last.reduce((a, m) => a + f(m), 0) / last.length).toFixed(2) : '—');
  const levels: Level[] = ['easy', 'normal', 'hard'];
  const cell = (opp: string, lv: Level): string => {
    const x = ms.filter((m) => m.opp === opp && m.level === lv);
    return x.length ? `${x.filter((m) => m.won).length}–${x.filter((m) => !m.won).length}` : '·';
  };
  const opps = [...OPPONENTS.map((o) => ({ key: o.deck.key, name: o.deck.name })), { key: 'st30', name: 'ST-30 mirror' }];
  const stat = (label: string, value: string, note: string): HTMLElement => h('div', { class: 'statbox big' }, h('b', null, value), h('span', null, label), h('small', null, note));
  root.appendChild(
    h(
      'div',
      { class: 'page' },
      h('h1', null, 'Progress'),
      ladderEl(s),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'Your play, last 10 matches'),
        ms.length
          ? h(
              'div',
              { class: 'statgrid' },
              stat('Matches', String(ms.length), `${won} won (${pct(won, ms.length)})`),
              stat('Unused DON!! / turn', avg((m) => m.stats.donUnused / Math.max(1, m.myTurns)), 'target: under 0.5'),
              stat('Idle attackers / turn', avg((m) => m.stats.readyNoAttack / Math.max(1, m.myTurns - 1)), 'target: under 0.3'),
              stat('Attacks / turn', avg((m) => m.stats.attacks / Math.max(1, m.myTurns - 1)), 'target: 2 or more'),
              stat('Hit rate', last.length ? pct(last.reduce((a, m) => a + m.stats.hits, 0), last.reduce((a, m) => a + m.stats.attacks, 0)) : '—', 'attacks that connected'),
            )
          : h('p', { class: 'muted' }, 'Play a match to start tracking your numbers.'),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'Record by opponent (wins–losses)'),
        h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Opponent'), levels.map((l) => h('th', null, l[0].toUpperCase() + l.slice(1)))), opps.map((o) => h('tr', null, h('td', null, o.name), levels.map((l) => h('td', null, cell(o.key, l)))))),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'Lessons and drills'),
        h('div', { class: 'statgrid' }, TRACKS.map((t) => {
          const [d, n] = trackDone(s, t.id);
          return stat(t.name, `${d}/${n}`, d === n ? 'complete' : 'in progress');
        }), DRILLS.map((d) => {
          const r = s.drills[d.id];
          return stat(d.name, r ? `${r.best}` : '—', r ? `best streak · ${pct(r.right, r.total)} correct` : 'not tried');
        })),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'Recent matches'),
        ms.length
          ? h(
              'table',
              { class: 'tbl' },
              h('tr', null, ['Date', 'Opponent', 'Deck', 'Level', 'Coach', 'Result', 'Turns'].map((x) => h('th', null, x))),
              [...ms].reverse().slice(0, 20).map((m) => h('tr', null, h('td', null, new Date(m.date).toLocaleDateString()), h('td', null, opps.find((o) => o.key === m.opp)?.name ?? m.opp), h('td', null, m.deck === 'st30' ? 'ST-30' : (s.decks.find((d) => d.key === m.deck)?.name ?? 'custom')), h('td', null, m.level), h('td', null, m.coach), h('td', { class: m.won ? 'good' : 'bad' }, m.won ? 'Win' : 'Loss'), h('td', null, m.turns))),
            )
          : h('p', { class: 'muted' }, 'No matches yet.'),
      ),
      h(
        'div',
        { class: 'row' },
        btn('Reset all progress…', () => {
          let close: () => void = () => {};
          close = modal(h('div', null, h('h2', null, 'Reset everything?'), h('p', null, 'This erases lesson progress, drill scores, match history and saved decks from this browser. It cannot be undone.'), h('div', { class: 'modal-actions' }, btn('Cancel', () => close(), { cls: 'primary' }), btn('Erase everything', () => {
            resetAll();
            close();
            render(root);
          }, { cls: 'warn' }))));
        }, { cls: 'ghost small' }),
      ),
    ),
  );
}
