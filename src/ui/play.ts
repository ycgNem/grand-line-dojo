// The match screen: setup, the board, prompts, CPU pacing and the coach panel.

import { MATCHUPS } from '../content/st30';
import { OPPONENTS, ST30, canSimulate, deckSize } from '../data/db';
import { type Decision, type Level, decide } from '../engine/ai';
import { attackPreview, boardRead, defenceInfo, describeAction, endTurnWarnings, hint, mainLesson, review } from '../engine/coach';
import {
  P,
  apply,
  attackTargets,
  cloneGame,
  costText,
  counterOptions,
  createGame,
  defOf,
  findField,
  hasKw,
  isLeader,
  ownerOf,
  powerBreakdown,
  powerOf,
  whoActs,
  whyCantActivate,
  whyCantAttack,
  whyCantPlay,
} from '../engine/game';
import { D } from '../engine/registry';
import type { Action, Answer, Choice, Color, DeckList, FieldCard, Game, PlayerId } from '../engine/types';
import { openCard } from './carddetail';
import { type Child, COLOR_HEX, btn, cardEl, clear, h, modal, rebuild, richText } from './dom';
import { type CoachMode, load, recordMatch, update } from './store';

const ME: PlayerId = 0;
const CPU: PlayerId = 1;

interface Session {
  g: Game;
  myDeck: DeckList;
  oppDeck: DeckList;
  level: Level;
  coach: CoachMode;
  speed: number;
  undo: Game[];
  sel: number | null;
  inspect: number | null;
  picks: number[];
  hint: Decision | null;
  cpuNote: { text: string; reason: string } | null;
  timer: number | null;
  recorded: boolean;
  resultShown: boolean;
  err: string;
}

let S: Session | null = null;
let root: HTMLElement | null = null;
/** A deck handed over by the Deck Lab ("test this list"). */
let queuedDeck: DeckList | null = null;

export function queueDeck(d: DeckList): void {
  queuedDeck = d;
  S = null;
  update((s) => {
    s.settings.deck = d.key;
  });
}

const MIRROR = { deck: { ...ST30, key: 'st30', name: 'ST-30 Luffy & Ace (mirror)' }, color: 'Red' as Color, style: 'Mirror', blurb: 'The CPU pilots your own deck.', lesson: 'Watch how the CPU sequences your cards — and learn your deck’s weak points by attacking them.', exactList: true };
const ALL_OPPS = [...OPPONENTS, MIRROR];

const LEVELS: { id: Level; name: string; text: string }[] = [
  { id: 'easy', name: 'Easy', text: 'Plays its cards and attacks, but rarely defends and makes loose choices. For learning the flow of a turn.' },
  { id: 'normal', name: 'Normal', text: 'Defends sensibly and uses most effects well.' },
  { id: 'hard', name: 'Hard', text: 'The CPU’s best game: counts counters, orders attacks, protects its Life.' },
];
const COACH: { id: CoachMode; name: string; text: string }[] = [
  { id: 'full', name: 'Full coaching', text: 'The coach suggests a move at every decision and warns you before mistakes.' },
  { id: 'hints', name: 'Hints on request', text: 'Decide for yourself; press Hint when stuck. End-of-turn warnings stay on.' },
  { id: 'off', name: 'Off', text: 'No help. Play as you would at a table.' },
];

export function render(el: HTMLElement): () => void {
  root = el;
  if (S) {
    draw();
    pump();
  } else drawSetup();
  return () => {
    if (S?.timer) {
      clearTimeout(S.timer);
      S.timer = null;
    }
    root = null;
  };
}

// ---------------------------------------------------------------- setup screen

function myDecks(): DeckList[] {
  const saved = load().decks.filter((d) => canSimulate(d));
  const out = [ST30, ...saved.filter((d) => d.key !== 'st30')];
  if (queuedDeck && !out.some((d) => d.key === queuedDeck!.key)) out.push(queuedDeck);
  return out;
}

function drawSetup(): void {
  if (!root) return;
  clear(root);
  const st = load().settings;
  const decks = myDecks();
  if (!decks.some((d) => d.key === st.deck)) st.deck = 'st30';
  const set = (fn: () => void) => (): void => {
    fn();
    update(() => {});
    drawSetup();
  };
  const record = (key: string): string => {
    const ms = load().matches.filter((m) => m.opp === key);
    return ms.length ? `${ms.filter((m) => m.won).length}–${ms.filter((m) => !m.won).length}` : 'not played';
  };
  const opp = ALL_OPPS.find((o) => o.deck.key === st.opp) ?? ALL_OPPS[0];
  const tips = MATCHUPS[opp.deck.key];

  root.appendChild(
    h(
      'div',
      { class: 'page' },
      h('h1', null, 'Play a match'),
      h('p', { class: 'lead' }, 'You against the CPU. Every rule is enforced, every action is explained in the log, and you can take moves back.'),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, '1 · Your deck'),
        h(
          'div',
          { class: 'choices' },
          decks.map((d) =>
            h(
              'button',
              { class: `choice ${st.deck === d.key ? 'on' : ''}`, type: 'button', onclick: set(() => (st.deck = d.key)) },
              h('b', null, d.name),
              h('span', null, `${D(d.leader).name} · ${deckSize(d)} cards`),
            ),
          ),
        ),
        h('p', { class: 'muted small' }, 'Decks you save in Deck Lab appear here when every card in them can be simulated.'),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, '2 · Opponent'),
        h(
          'div',
          { class: 'choices opps' },
          ALL_OPPS.map((o) =>
            h(
              'button',
              { class: `choice ${st.opp === o.deck.key ? 'on' : ''}`, type: 'button', style: { borderLeftColor: COLOR_HEX[o.color] }, onclick: set(() => (st.opp = o.deck.key)) },
              h('b', null, o.deck.name),
              h('span', null, `${o.color} · ${o.style}`),
              h('span', { class: 'muted' }, `Your record: ${record(o.deck.key)}`),
            ),
          ),
        ),
        h(
          'div',
          { class: 'key' },
          h('p', null, h('b', null, `${D(opp.deck.leader).name} — ${opp.style}. `), opp.blurb),
          h('p', null, h('b', null, 'What this matchup teaches: '), opp.lesson),
          tips && st.deck === 'st30' ? h('p', null, h('b', null, 'Your plan with ST-30: '), tips.plan) : null,
          !opp.exactList ? h('p', { class: 'muted small' }, 'Note: this CPU deck uses the real cards of that starter deck, but the number of copies of each card is my reconstruction, not the verified boxed list.') : null,
          h('p', null, btn('Read the Leader', () => openCard(opp.deck.leader), { cls: 'small' })),
        ),
      ),
      h(
        'section',
        { class: 'panel cols3' },
        h('div', null, h('h3', null, '3 · Difficulty'), LEVELS.map((l) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'lvl', checked: st.level === l.id, onchange: set(() => (st.level = l.id)) }), h('span', null, h('b', null, l.name), ` — ${l.text}`)))),
        h('div', null, h('h3', null, '4 · Coaching'), COACH.map((c) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'coach', checked: st.coach === c.id, onchange: set(() => (st.coach = c.id)) }), h('span', null, h('b', null, c.name), ` — ${c.text}`)))),
        h(
          'div',
          null,
          h('h3', null, '5 · Table'),
          h('label', { class: 'field' }, 'Who goes first ', select(st.first, [['random', 'Random'], ['me', 'Me'], ['cpu', 'CPU']], (v) => set(() => (st.first = v as typeof st.first))())),
          h('label', { class: 'field' }, 'CPU speed ', select(String(st.speed), [['1300', 'Slow'], ['700', 'Normal'], ['250', 'Fast']], (v) => set(() => (st.speed = Number(v)))())),
        ),
      ),
      h('div', { class: 'row' }, btn('Start match', () => start(), { cls: 'primary big' })),
    ),
  );
}

function select(value: string, opts: [string, string][], onChange: (v: string) => void): HTMLSelectElement {
  const s = h('select', { onchange: () => onChange(s.value) }, opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  return s;
}

function start(): void {
  const st = load().settings;
  const myDeck = myDecks().find((d) => d.key === st.deck) ?? ST30;
  const opp = ALL_OPPS.find((o) => o.deck.key === st.opp) ?? ALL_OPPS[0];
  const first: PlayerId | undefined = st.first === 'me' ? ME : st.first === 'cpu' ? CPU : undefined;
  const g = createGame({ decks: [myDeck, opp.deck], seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) & 0x7fffffff, first });
  S = { g, myDeck, oppDeck: opp.deck, level: st.level, coach: st.coach, speed: st.speed, undo: [], sel: null, inspect: null, picks: [], hint: null, cpuNote: null, timer: null, recorded: false, resultShown: false, err: '' };
  queuedDeck = null;
  draw();
  pump();
}

// ---------------------------------------------------------------- game loop

function fallback(g: Game): Action {
  const ch = g.pending;
  if (!ch) return { type: 'end' };
  let answer: Answer;
  if (ch.kind === 'mulligan') answer = { kind: 'mulligan', redraw: false };
  else if (ch.kind === 'select') answer = { kind: 'select', uids: ch.options.slice(0, ch.min) };
  else if (ch.kind === 'confirm') answer = { kind: 'confirm', yes: false };
  else if (ch.kind === 'option') answer = { kind: 'option', index: 0 };
  else if (ch.kind === 'block') answer = { kind: 'block', uid: null };
  else if (ch.kind === 'counter') answer = { kind: 'counter', use: null };
  else answer = { kind: 'trigger', activate: false };
  return { type: 'answer', answer };
}

function pump(): void {
  if (!S) return;
  if (S.timer) {
    clearTimeout(S.timer);
    S.timer = null;
  }
  const s = S;
  const g = s.g;
  if (g.winner !== null) {
    finish();
    return;
  }
  if (whoActs(g) !== CPU) return;
  const quick = g.pending && g.pending.kind !== 'mulligan';
  s.timer = window.setTimeout(
    () => {
      s.timer = null;
      if (S !== s || whoActs(g) !== CPU) return;
      let d: Decision;
      try {
        d = decide(g, CPU, s.level);
      } catch {
        d = { action: fallback(g), reason: '' };
      }
      // Never let the CPU's explanation reveal hidden information (its hand, deck order, Life).
      const ch = g.pending;
      const secret = !!ch && ch.kind === 'select' && (ch.intent === 'deckOrder' || ch.intent === 'toLife');
      const hideWhy = !!ch && (ch.kind === 'mulligan' || ch.kind === 'option' || ch.kind === 'select');
      const text = secret ? 'Made a hidden choice' : describeAction(g, d.action);
      let stuck = '';
      try {
        apply(g, d.action);
      } catch {
        try {
          apply(g, fallback(g));
        } catch (e) {
          stuck = e instanceof Error ? e.message : String(e);
        }
      }
      if (stuck) {
        // Both the chosen move and the safe default were refused. Say so instead of waiting forever.
        s.err = `The CPU could not make a move (${stuck}). Use “Take back” to step back, or start a new game.`;
        draw();
        return;
      }
      s.cpuNote = { text, reason: hideWhy ? '' : d.reason };
      draw();
      pump();
    },
    quick ? Math.max(200, s.speed * 0.7) : s.speed,
  );
}

function act(a: Action): void {
  if (!S) return;
  const snap = cloneGame(S.g);
  try {
    apply(S.g, a);
    S.undo.push(snap);
    if (S.undo.length > 80) S.undo.shift();
    S.err = '';
  } catch (e) {
    S.err = e instanceof Error ? e.message : String(e);
  }
  S.picks = [];
  S.hint = null;
  if (a.type !== 'don') S.sel = null;
  draw();
  pump();
}

const answer = (a: Answer): void => act({ type: 'answer', answer: a });

// Development aid: lets a test script drive the human seat through the same code path as clicks.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__dojo = {
    get session(): Session | null {
      return S;
    },
    act,
    suggest: (): Decision | null => (S ? hint(S.g, ME) : null),
  };
}

function takeBack(): void {
  if (!S || !S.undo.length) return;
  if (S.timer) clearTimeout(S.timer);
  S.timer = null;
  S.g = S.undo.pop()!;
  S.sel = null;
  S.picks = [];
  S.hint = null;
  S.err = '';
  S.cpuNote = null;
  // Stepping back from a finished game reopens it, so its new ending must be shown again.
  // (`recorded` stays set: the first result is the one that counts in your history.)
  S.resultShown = false;
  draw();
  pump();
}

function finish(): void {
  if (!S) return;
  const g = S.g;
  if (!S.recorded) {
    S.recorded = true;
    recordMatch({ date: Date.now(), opp: S.oppDeck.key, deck: S.myDeck.key, level: S.level, coach: S.coach, won: g.winner === ME, turns: g.turn, myTurns: P(g, ME).turns, stats: { ...g.stats[ME] } });
  }
  if (!S.resultShown) {
    S.resultShown = true;
    showResult();
  }
}

function showResult(): void {
  if (!S) return;
  const g = S.g;
  const won = g.winner === ME;
  const items = review(g, ME);
  let close: () => void = () => {};
  close = modal(
    h(
      'div',
      null,
      h('h2', { class: won ? 'good' : 'bad' }, won ? 'Victory!' : 'Defeat'),
      h('p', null, g.winReason),
      h('p', { class: 'muted' }, `${g.turn} turns · vs ${S.oppDeck.name} · ${S.level} · coaching ${S.coach}`),
      h('h3', null, 'Game review'),
      h('table', { class: 'tbl review' }, items.map((i) => h('tr', { class: `g-${i.grade}` }, h('th', null, i.label), h('td', null, i.value), h('td', null, i.note)))),
      h('div', { class: 'key' }, h('b', null, 'Work on this next: '), mainLesson(items)),
      h(
        'div',
        { class: 'modal-actions' },
        btn('Rematch', () => {
          close();
          start();
        }, { cls: 'primary' }),
        btn('Change setup', () => {
          close();
          S = null;
          drawSetup();
        }),
        btn('Look at the board', () => close()),
      ),
    ),
    { wide: true },
  );
}

// ---------------------------------------------------------------- interaction

const myTurnFree = (g: Game): boolean => g.winner === null && whoActs(g) === ME && !g.pending;

function clickCard(uid: number): void {
  if (!S) return;
  const g = S.g;
  S.inspect = uid;
  const ch = g.pending;
  if (ch && ch.player === ME && g.winner === null) {
    if (ch.kind === 'select' && ch.options.includes(uid)) {
      if (ch.max === 1 && ch.min === 1) return answer({ kind: 'select', uids: [uid] });
      const i = S.picks.indexOf(uid);
      if (i >= 0) S.picks.splice(i, 1);
      else if (S.picks.length < ch.max) S.picks.push(uid);
      else if (ch.max === 1) S.picks = [uid];
      return draw();
    }
    if (ch.kind === 'block' && ch.options.includes(uid)) return answer({ kind: 'block', uid });
    if (ch.kind === 'counter' && counterOptions(g, ME).includes(uid)) return answer({ kind: 'counter', use: uid });
    return draw();
  }
  if (myTurnFree(g)) {
    if (S.sel !== null && S.sel !== uid && ownerOf(uid) === CPU && findField(g, S.sel) && !whyCantAttack(g, S.sel) && attackTargets(g, S.sel).includes(uid)) {
      return act({ type: 'attack', attacker: S.sel, target: uid });
    }
    S.sel = S.sel === uid ? null : uid;
  }
  draw();
}

function endTurn(): void {
  if (!S) return;
  const warn = S.coach === 'off' ? [] : endTurnWarnings(S.g, ME);
  if (!warn.length) return act({ type: 'end' });
  let close: () => void = () => {};
  close = modal(
    h(
      'div',
      null,
      h('h2', null, 'Before you end the turn…'),
      h('ul', null, warn.map((w) => h('li', null, w))),
      h(
        'div',
        { class: 'modal-actions' },
        btn('Go back', () => close(), { cls: 'primary' }),
        btn('End turn anyway', () => {
          close();
          act({ type: 'end' });
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- drawing

function zoneOf(g: Game, uid: number): string {
  const pid = ownerOf(uid);
  const p = P(g, pid);
  const who = pid === ME ? 'your' : 'CPU’s';
  if (findField(g, uid)) return `${who} field`;
  if (p.hand.includes(uid)) return `${who} hand`;
  if (p.trash.includes(uid)) return `${who} trash`;
  if (p.life.some((l) => l.uid === uid)) return `${who} Life`;
  if (p.deck.includes(uid)) return `${who} deck`;
  return '';
}

function draw(): void {
  if (!S || !root || !root.isConnected) return;
  const s = S;
  const g = s.g;
  const ch = g.pending && g.pending.player === ME && g.winner === null ? g.pending : null;
  const free = myTurnFree(g);
  const selField = s.sel !== null ? findField(g, s.sel) : null;
  const targets = free && selField && ownerOf(s.sel!) === ME && !whyCantAttack(g, s.sel!) ? attackTargets(g, s.sel!) : [];
  const options = ch?.kind === 'select' ? ch.options : ch?.kind === 'block' ? ch.options : ch?.kind === 'counter' ? counterOptions(g, ME) : [];
  const logScroll = root.querySelector('.log');
  const keepLogAtEnd = !logScroll || logScroll.scrollTop + logScroll.clientHeight >= logScroll.scrollHeight - 30;

  const unit = (fc: FieldCard): HTMLElement => {
    const cls: string[] = [];
    if (s.sel === fc.uid) cls.push('selected');
    if (targets.includes(fc.uid)) cls.push('target');
    if (g.battle?.attacker === fc.uid) cls.push('attacking');
    if (g.battle?.target === fc.uid) cls.push('defending');
    if (options.includes(fc.uid)) cls.push('option');
    if (s.picks.includes(fc.uid)) cls.push('picked');
    if (fc.frozen) cls.push('frozen');
    const isStage = P(g, ownerOf(fc.uid)).stage?.uid === fc.uid;
    return cardEl(D(fc.id), { size: 'sm', rested: fc.rested, power: isStage ? undefined : powerOf(g, fc), don: fc.don, cls: cls.join(' '), onClick: () => clickCard(fc.uid) });
  };

  const side = (pid: PlayerId): HTMLElement => {
    const p = P(g, pid);
    const slots: Child[] = p.chars.map(unit);
    for (let i = p.chars.length; i < 5; i++) slots.push(h('div', { class: 'slot' }));
    return h(
      'div',
      { class: `side ${pid === ME ? 'mine' : 'theirs'} ${g.active === pid ? 'active' : ''}` },
      h('div', { class: 'leaderbox' }, h('div', { class: 'zlabel' }, pid === ME ? 'Your Leader' : 'CPU Leader'), unit(p.leader)),
      h('div', { class: 'chars' }, h('div', { class: 'zlabel' }, `Characters ${p.chars.length}/5`), h('div', { class: 'charrow' }, slots)),
      h('div', { class: 'stagebox' }, h('div', { class: 'zlabel' }, 'Stage'), p.stage ? unit(p.stage) : h('div', { class: 'slot' })),
    );
  };

  const info = (pid: PlayerId): HTMLElement => {
    const p = P(g, pid);
    const attached = p.leader.don + p.chars.reduce((n, c) => n + c.don, 0);
    const don: Child[] = [];
    for (let i = 0; i < p.donActive; i++) don.push(h('span', { class: 'don on', title: 'Active DON!!' }));
    for (let i = 0; i < p.donRested; i++) don.push(h('span', { class: 'don off', title: 'Rested DON!!' }));
    return h(
      'div',
      { class: `info ${pid === ME ? 'mine' : 'theirs'}` },
      h('span', { class: 'who' }, pid === ME ? 'You' : 'CPU', h('small', null, pid === ME ? s.myDeck.name : s.oppDeck.name)),
      h('span', { class: 'stat life', title: 'Life cards. At 0 Life, the next hit on the Leader loses the game.' }, 'Life ', h('b', null, '♥'.repeat(p.life.length) || '0')),
      h('span', { class: 'stat' }, 'Hand ', h('b', null, p.hand.length)),
      h('span', { class: 'stat' }, 'Deck ', h('b', null, p.deck.length)),
      h('button', { class: 'stat linkish', type: 'button', onclick: () => showTrash(pid) }, 'Trash ', h('b', null, p.trash.length)),
      h('span', { class: 'stat dons', title: `DON!!: ${p.donActive} active, ${p.donRested} rested, ${attached} attached, ${p.donDeck} still in the DON!! deck` }, 'DON!! ', don, h('small', null, ` ${p.donActive} active · ${p.donRested} rested · ${attached} attached · ${p.donDeck} in deck`)),
    );
  };

  const me = P(g, ME);
  const hand = h(
    'div',
    { class: 'hand' },
    me.hand.map((u) => {
      const d = defOf(g, u);
      const cls: string[] = [];
      if (s.sel === u) cls.push('selected');
      if (free && !whyCantPlay(g, u)) cls.push('playable');
      if (options.includes(u)) cls.push('option');
      if (s.picks.includes(u)) cls.push('picked');
      return cardEl(d, { size: 'sm', cls: cls.join(' '), onClick: () => clickCard(u) });
    }),
    me.hand.length ? null : h('span', { class: 'muted' }, 'Your hand is empty.'),
  );
  const cpuHand = h('div', { class: 'cpuhand' }, P(g, CPU).hand.map(() => h('span', { class: 'mini-back' })));

  const b = g.battle;
  const battleLine = b && findField(g, b.attacker) && findField(g, b.target)
    ? h('div', { class: 'battle' }, `⚔ ${ownerOf(b.attacker) === ME ? 'Your' : 'CPU’s'} ${D(findField(g, b.attacker)!.id).name} (${powerOf(g, findField(g, b.attacker)!)}) → ${ownerOf(b.target) === ME ? 'your' : 'CPU’s'} ${D(findField(g, b.target)!.id).name} (${powerOf(g, findField(g, b.target)!)})`)
    : null;
  const banner = h(
    'div',
    { class: 'banner' },
    h('span', { class: 'turn' }, g.winner !== null ? 'Game over' : g.phase === 'setup' ? `Setup · ${g.first === ME ? 'you go first' : 'the CPU goes first'}` : `Turn ${g.turn} · ${g.active === ME ? 'Your turn' : 'CPU’s turn'}`),
    battleLine,
    h('span', { class: 'spacer' }),
    btn('Quit', () => confirmQuit(), { cls: 'small ghost' }),
  );

  const board = h('div', { class: 'board' }, info(CPU), cpuHand, side(CPU), banner, side(ME), info(ME), hand, bar(ch, free));
  const sidebar = h('aside', { class: 'sidebar' }, coachPanel(ch, free), inspectPanel(), logPanel());
  const table = h('div', { class: 'table' }, board, sidebar);
  rebuild(root, () => root!.appendChild(table));
  const log = root.querySelector('.log');
  if (log && keepLogAtEnd) log.scrollTop = log.scrollHeight;
}

function confirmQuit(): void {
  if (!S) return;
  if (S.g.winner !== null) {
    S = null;
    return drawSetup();
  }
  let close: () => void = () => {};
  close = modal(
    h('div', null, h('h2', null, 'Leave this match?'), h('p', null, 'The game will be abandoned and not recorded.'), h('div', { class: 'modal-actions' }, btn('Keep playing', () => close(), { cls: 'primary' }), btn('Leave', () => {
      close();
      if (S?.timer) clearTimeout(S.timer);
      S = null;
      drawSetup();
    }))),
  );
}

function showTrash(pid: PlayerId): void {
  if (!S) return;
  const g = S.g;
  const p = P(g, pid);
  modal(
    h(
      'div',
      null,
      h('h2', null, `${pid === ME ? 'Your' : 'CPU’s'} trash (${p.trash.length})`),
      h('p', { class: 'muted' }, 'The trash is public: both players may look at it at any time. Most recent first.'),
      h('div', { class: 'cardgrid' }, [...p.trash].reverse().map((u) => cardEl(defOf(g, u), { size: 'md', onClick: () => openCard(g.ids[u]) }))),
      p.trash.length ? null : h('p', null, 'Empty.'),
    ),
    { wide: true },
  );
}

/** The bottom bar: either a question for you, or your Main Phase actions. */
function bar(ch: Choice | null, free: boolean): HTMLElement {
  const s = S!;
  const g = s.g;
  const out = h('div', { class: 'bar' });
  if (s.err) out.appendChild(h('div', { class: 'err' }, s.err));
  if (g.winner !== null) {
    out.appendChild(
      h(
        'div',
        { class: 'prompt' },
        h('b', { class: g.winner === ME ? 'good' : 'bad' }, g.winner === ME ? 'You won. ' : 'You lost. '),
        g.winReason,
        h('div', { class: 'row' }, btn('Review', () => showResult(), { cls: 'primary' }), btn('Rematch', () => start()), btn('Change setup', () => {
          S = null;
          drawSetup();
        }), btn('Take back', () => takeBack(), { disabled: !s.undo.length, title: 'Go back to before your last action' })),
      ),
    );
    return out;
  }
  if (ch) {
    out.appendChild(promptFor(ch));
    return out;
  }
  if (!free) {
    out.appendChild(h('div', { class: 'prompt waiting' }, h('span', { class: 'dots' }, 'CPU is thinking'), s.cpuNote ? h('span', { class: 'muted' }, ` · last: ${s.cpuNote.text}`) : null));
    return out;
  }
  // Main Phase.
  const me = P(g, ME);
  const acts: Child[] = [];
  let line: Child = 'Your Main Phase. Click a card in your hand to play it, or one of your cards on the field to attack, attach DON!! or use its ability.';
  if (s.sel !== null) {
    const d = defOf(g, s.sel);
    const fc = findField(g, s.sel);
    if (me.hand.includes(s.sel)) {
      const why = whyCantPlay(g, s.sel);
      line = why ? h('span', null, h('b', null, d.name), ` — cannot be played now: ${why}`) : h('span', null, h('b', null, d.name), ` — costs ${d.cost} DON!! (you have ${me.donActive} active).`);
      acts.push(btn(`Play (${d.cost} DON!!)`, () => act({ type: 'play', uid: s.sel! }), { cls: 'primary', disabled: !!why, title: why ?? '' }));
    } else if (fc && ownerOf(s.sel) === ME) {
      const isStage = me.stage?.uid === s.sel;
      const whyA = isStage ? 'Stages cannot attack.' : whyCantAttack(g, s.sel);
      const tg = whyA ? [] : attackTargets(g, s.sel);
      line = h(
        'span',
        null,
        h('b', null, d.name),
        isStage ? '' : ` — ${powerOf(g, fc)} power. `,
        whyA ? `Cannot attack: ${whyA}` : tg.length ? 'Click a glowing enemy card to attack it.' : 'No legal attack targets.',
      );
      if (!isStage) {
        acts.push(btn('+1 DON!!', () => act({ type: 'don', target: s.sel!, n: 1 }), { disabled: me.donActive < 1, title: 'Attach 1 active DON!!: +1000 power during your turn' }));
        if (me.donActive >= 2) acts.push(btn('+2', () => act({ type: 'don', target: s.sel!, n: 2 })));
      }
      d.effects?.forEach((e, i) => {
        if (e.timing !== 'activateMain') return;
        const why = whyCantActivate(g, s.sel!, i);
        acts.push(btn(`Activate${e.cost ? ` (${costText(e.cost)})` : ''}`, () => act({ type: 'activate', uid: s.sel!, idx: i }), { cls: 'accent', disabled: !!why, title: why ?? e.text }));
      });
    } else {
      line = h('span', null, h('b', null, d.name), fc ? ` — ${isLeader(g, s.sel) ? 'the CPU’s Leader' : 'a CPU card'}. Select one of YOUR cards first to attack it.` : '');
    }
  }
  out.appendChild(
    h(
      'div',
      { class: 'prompt' },
      h('div', { class: 'line' }, line),
      h(
        'div',
        { class: 'row' },
        acts,
        h('span', { class: 'spacer' }),
        s.coach !== 'off' ? btn('Hint', () => showHint(), { cls: 'ghost' }) : null,
        btn('Take back', () => takeBack(), { cls: 'ghost', disabled: !s.undo.length, title: 'Undo your last action' }),
        btn('End turn', () => endTurn(), { cls: 'warn' }),
      ),
    ),
  );
  return out;
}

function showHint(): void {
  if (!S) return;
  S.hint = hint(S.g, ME);
  draw();
}

/** The asking card's name in bold, unless the question already opens with it. */
function asker(ch: { source?: string; prompt: string }): Child {
  if (!ch.source) return null;
  const name = D(ch.source).name;
  return ch.prompt.startsWith(name) ? null : h('b', null, `${name}: `);
}

function promptFor(ch: Choice): HTMLElement {
  const s = S!;
  const g = s.g;
  const tb = btn('Take back', () => takeBack(), { cls: 'ghost', disabled: !s.undo.length });
  const hintBtn = s.coach === 'hints' ? btn('Hint', () => showHint(), { cls: 'ghost' }) : null;
  const tail = [h('span', { class: 'spacer' }), hintBtn, tb];
  switch (ch.kind) {
    case 'mulligan':
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, h('b', null, 'Opening hand. '), 'Keep these 5 cards, or shuffle them back and draw 5 new ones? You only get one mulligan.'),
        h('div', { class: 'row' }, btn('Keep', () => answer({ kind: 'mulligan', redraw: false }), { cls: 'primary' }), btn('Mulligan', () => answer({ kind: 'mulligan', redraw: true })), tail),
      );
    case 'select': {
      const cards = ch.shown ?? ch.options;
      const n = s.picks.length;
      const ok = n >= ch.min && n <= ch.max;
      const instant = ch.max === 1 && ch.min === 1;
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, asker(ch), ch.prompt, h('span', { class: 'muted' }, instant ? ' (click one)' : ` (choose ${ch.min === ch.max ? ch.min : `${ch.min}–${ch.max}`})`)),
        h(
          'div',
          { class: 'pickrow' },
          cards.map((u) => {
            const can = ch.options.includes(u);
            const fc = findField(g, u);
            return h(
              'div',
              { class: 'pick' },
              cardEl(defOf(g, u), { size: 'sm', power: fc ? powerOf(g, fc) : undefined, rested: fc?.rested, cls: `${can ? 'option' : 'dim'} ${s.picks.includes(u) ? 'picked' : ''}`, onClick: () => clickCard(u) }),
              h('small', null, zoneOf(g, u)),
            );
          }),
          cards.length ? null : h('span', { class: 'muted' }, 'No valid cards.'),
        ),
        h('div', { class: 'row' }, instant ? null : btn(n ? `Confirm (${n})` : 'Choose none', () => answer({ kind: 'select', uids: [...s.picks] }), { cls: 'primary', disabled: !ok }), tail),
      );
    }
    case 'confirm':
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, asker(ch), ch.prompt),
        h('div', { class: 'row' }, btn('Yes', () => answer({ kind: 'confirm', yes: true }), { cls: 'primary' }), btn('No', () => answer({ kind: 'confirm', yes: false })), tail),
      );
    case 'option':
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, asker(ch), ch.prompt),
        ch.reveal !== undefined ? h('div', { class: 'pickrow' }, cardEl(defOf(g, ch.reveal), { size: 'md', onClick: () => openCard(g.ids[ch.reveal!]) })) : null,
        h('div', { class: 'row' }, ch.labels.map((l, i) => btn(l, () => answer({ kind: 'option', index: i }), { cls: i === 0 ? 'primary' : '' })), tail),
      );
    case 'block': {
      const info = defenceInfo(g, ME);
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, h('b', null, 'Block Step. '), info ? `The attack is ${info.atk} against ${info.def}. ` : '', 'Rest one of your active [Blocker]s to take the attack instead — or let it through to the Counter Step.'),
        h('div', { class: 'pickrow' }, ch.options.map((u) => h('div', { class: 'pick' }, cardEl(defOf(g, u), { size: 'sm', power: powerOf(g, findField(g, u)!), cls: 'option', onClick: () => answer({ kind: 'block', uid: u }) }), h('small', null, 'Block with this')))),
        h('div', { class: 'row' }, btn('Do not block', () => answer({ kind: 'block', uid: null }), { cls: 'primary' }), tail),
      );
    }
    case 'counter': {
      const info = defenceInfo(g, ME);
      const opts = counterOptions(g, ME);
      return h(
        'div',
        { class: 'prompt' },
        h(
          'div',
          { class: 'line' },
          h('b', null, 'Counter Step. '),
          info
            ? h('span', null, `Attack ${info.atk} vs your ${info.def}. `, info.need > 0 ? h('b', { class: 'bad' }, `You need +${info.need} to stop it. `) : h('b', { class: 'good' }, 'It already fails. '), `Your hand can add up to +${info.available}.`, info.lethal ? h('b', { class: 'bad' }, ' THIS HIT WOULD END THE GAME.') : null)
            : null,
        ),
        h(
          'div',
          { class: 'pickrow' },
          opts.map((u) => {
            const d = defOf(g, u);
            const boost = d.category === 'Character' ? d.counter : (d.effects?.find((e) => e.timing === 'counter')?.boost ?? 0);
            return h('div', { class: 'pick' }, cardEl(d, { size: 'sm', cls: 'option', tag: `+${boost}`, onClick: () => answer({ kind: 'counter', use: u }) }), h('small', null, d.category === 'Event' ? `Event · ${d.cost} DON!!` : 'Trash for counter'));
          }),
        ),
        h('div', { class: 'row' }, btn(info && info.need > 0 ? 'No counter — take it' : 'Done', () => answer({ kind: 'counter', use: null }), { cls: 'primary' }), tail),
      );
    }
    case 'trigger': {
      const d = defOf(g, ch.uid);
      const e = d.effects?.find((x) => x.timing === 'trigger');
      return h(
        'div',
        { class: 'prompt' },
        h('div', { class: 'line' }, h('b', null, '[Trigger]! '), `Your Life card is ${d.name}. Use its Trigger for free (the card is then trashed), or add the card to your hand?`),
        h('div', { class: 'pickrow' }, cardEl(d, { size: 'md', onClick: () => openCard(d.id) }), e ? h('div', { class: 'trigtext' }, richText(e.text)) : null),
        h('div', { class: 'row' }, btn('Activate [Trigger]', () => answer({ kind: 'trigger', activate: true }), { cls: 'primary' }), btn('Add to hand', () => answer({ kind: 'trigger', activate: false })), tail),
      );
    }
  }
}

function guide(ch: Choice | null, free: boolean): string {
  const g = S!.g;
  if (g.winner !== null) return 'The game is over. Open the review to see what to work on.';
  if (ch) {
    switch (ch.kind) {
      case 'mulligan':
        return 'Mulligan: you may swap your whole hand once. A keepable hand has something to do on turns 1–3.';
      case 'block':
        return 'Block Step: a [Blocker] takes the hit instead of the original target. The blocker is rested, and is K.O.’d if the attack beats its power.';
      case 'counter':
        return 'Counter Step: trash Characters from your hand for their counter value, or play [Counter] Events, to raise the target’s power for this battle only. You need to end up HIGHER than the attacker.';
      case 'trigger':
        return 'A Life card with [Trigger] left your Life. Using the Trigger is free, but the card goes to the trash instead of your hand.';
      default:
        return 'A card effect is resolving and needs your decision.';
    }
  }
  if (free) return 'Main Phase: play cards, attach DON!!, use abilities and attack — in any order you like. The order matters.';
  return g.active === CPU ? 'The CPU is taking its turn. Every action is explained in the log.' : 'Resolving…';
}

function coachPanel(ch: Choice | null, free: boolean): HTMLElement {
  const s = S!;
  const g = s.g;
  const box = h('section', { class: 'sbox coach' }, h('h3', null, 'Coach', h('small', null, ` · ${COACH.find((c) => c.id === s.coach)?.name}`)));
  box.appendChild(h('p', { class: 'guide' }, guide(ch, free)));
  if (s.coach === 'off' || g.winner !== null) return box;
  const mine = whoActs(g) === ME;
  if (mine) {
    const auto = s.coach === 'full' ? hint(g, ME) : s.hint;
    if (auto) box.appendChild(h('div', { class: 'hintbox' }, h('b', null, 'Suggested: '), describeAction(g, auto.action), auto.reason ? h('p', null, auto.reason) : null));
    if (ch?.kind === 'counter' || ch?.kind === 'block') {
      const info = defenceInfo(g, ME);
      if (info && s.coach === 'full') box.appendChild(h('p', { class: 'small' }, h('b', null, 'Defence rule of thumb: '), info.advice));
    }
    if (free && s.coach === 'full') {
      const tips = boardRead(g, ME);
      if (tips.length) box.appendChild(h('ul', { class: 'tight small' }, tips.map((t) => h('li', null, t))));
    }
    if (free && s.sel !== null && findField(g, s.sel) && ownerOf(s.sel) === ME && !whyCantAttack(g, s.sel)) {
      const lines = attackTargets(g, s.sel).map((t) => {
        const pv = attackPreview(g, s.sel!, t);
        return pv ? h('li', null, h('b', null, `${isLeader(g, t) ? 'Leader' : defOf(g, t).name}: `), pv.text) : null;
      });
      box.appendChild(h('div', { class: 'small' }, h('b', null, 'If you attack with this card:'), h('ul', { class: 'tight' }, lines)));
    }
  }
  if (s.cpuNote) box.appendChild(h('div', { class: 'cpunote small' }, h('b', null, 'CPU’s last move: '), s.cpuNote.text, s.cpuNote.reason ? h('p', { class: 'muted' }, `What it was thinking, from its side of the table: “${s.cpuNote.reason}”`) : null));
  return box;
}

function inspectPanel(): HTMLElement {
  const s = S!;
  const g = s.g;
  const box = h('section', { class: 'sbox inspect' }, h('h3', null, 'Card'));
  const uid = s.inspect;
  if (uid === null || !g.ids[uid]) {
    box.appendChild(h('p', { class: 'muted small' }, 'Click any card to read it here.'));
    return box;
  }
  const hiddenFromMe = ownerOf(uid) === CPU && !findField(g, uid) && !P(g, CPU).trash.includes(uid);
  if (hiddenFromMe) {
    box.appendChild(h('p', { class: 'muted small' }, 'That card is hidden.'));
    return box;
  }
  const d = defOf(g, uid);
  const fc = findField(g, uid);
  box.appendChild(cardEl(d, { size: 'lg', onClick: () => openCard(d.id) }));
  if (fc && d.category !== 'Stage') {
    const pb = powerBreakdown(g, fc);
    const kws = (['Rush', 'Blocker', 'Double Attack', 'Banish', 'Unblockable'] as const).filter((kw) => hasKw(g, fc, kw));
    box.appendChild(
      h(
        'p',
        { class: 'small' },
        h('b', null, `Power now: ${pb.total}`),
        ` = ${pb.base} base${pb.don ? ` + ${pb.don} DON!!` : ''}${pb.effects ? ` ${pb.effects > 0 ? '+' : '−'} ${Math.abs(pb.effects)} effects` : ''}.`,
        fc.don && g.active !== ownerOf(uid) ? ` (${fc.don} attached DON!! give nothing on the other player’s turn.)` : '',
        fc.rested ? ' Rested.' : ' Active.',
        fc.frozen ? ' Will not become active in its next Refresh Phase.' : '',
        kws.length ? ` Has ${kws.map((x) => `[${x}]`).join(' ')} right now.` : '',
      ),
    );
  }
  box.appendChild(btn('Full details & coach notes', () => openCard(d.id), { cls: 'small ghost' }));
  return box;
}

function logPanel(): HTMLElement {
  const g = S!.g;
  const entries = g.log.slice(-120);
  return h(
    'section',
    { class: 'sbox' },
    h('h3', null, 'Log'),
    h('div', { class: 'log' }, entries.map((e) => h('div', { class: `le k-${e.kind} ${e.p === ME ? 'me' : e.p === CPU ? 'cpu' : ''}` }, e.msg))),
  );
}

