// Learn: the lesson tracks, each lesson's quiz, the generated drills and the glossary.

import { DRILLS, type Drill } from '../content/drills';
import { GLOSSARY } from '../content/glossary';
import { LESSONS, type Lesson, type Question, TRACKS, lesson, lessonsOf } from '../content/lessons';
import { btn, clear, h, rebuild } from './dom';
import { load, recordDrill, update } from './store';

export function render(root: HTMLElement, arg = ''): void {
  clear(root);
  const [a, b] = arg.split('/');
  if (a === 'drill' && b) return drillPage(root, b);
  if (a === 'glossary') return glossaryPage(root);
  const l = a ? lesson(a) : undefined;
  if (l) return lessonPage(root, l);
  overview(root);
}

const passMark = (n: number): number => Math.ceil((n * 2) / 3);

function overview(root: HTMLElement): void {
  const st = load();
  const next = LESSONS.find((l) => !st.lessons[l.id]?.done);
  root.appendChild(
    h(
      'div',
      { class: 'page' },
      h('h1', null, 'Learn'),
      h('p', { class: 'lead' }, 'Four tracks, in order: the rules, playing well, building decks, and competing. Each lesson ends with a short quiz. Then practise in a match.'),
      next ? h('div', { class: 'key' }, h('b', null, 'Up next: '), h('a', { href: `#/learn/${next.id}` }, next.title), ` — ${next.summary}`) : h('div', { class: 'key' }, 'Every lesson complete. Keep your edge with the drills and Hard-mode matches.'),
      TRACKS.map((t) => {
        const ls = lessonsOf(t.id);
        const done = ls.filter((l) => st.lessons[l.id]?.done).length;
        return h(
          'section',
          { class: 'panel' },
          h('h3', null, t.name, h('small', null, ` · ${done}/${ls.length} complete`)),
          h('p', { class: 'muted' }, t.blurb),
          h(
            'div',
            { class: 'lessonlist' },
            ls.map((l) => {
              const rec = st.lessons[l.id];
              return h('a', { class: `lessonrow ${rec?.done ? 'done' : ''}`, href: `#/learn/${l.id}` }, h('span', { class: 'tick' }, rec?.done ? '✓' : '○'), h('span', null, h('b', null, l.title), h('small', null, l.summary)), rec ? h('span', { class: 'muted small' }, `best ${rec.best}/${l.quiz.length}`) : null);
            }),
          ),
        );
      }),
      h(
        'section',
        { class: 'panel' },
        h('h3', null, 'Drills'),
        h('p', { class: 'muted' }, 'Endless generated problems. Aim for a streak of 10 on each.'),
        h(
          'div',
          { class: 'choices' },
          DRILLS.map((d) => {
            const r = st.drills[d.id];
            return h('a', { class: 'choice', href: `#/learn/drill/${d.id}` }, h('b', null, d.name), h('span', null, d.blurb), h('span', { class: 'muted' }, r ? `${r.right}/${r.total} correct · best streak ${r.best}` : 'not tried yet'));
          }),
        ),
      ),
      h('section', { class: 'panel' }, h('h3', null, 'Glossary'), h('p', null, 'Every bracketed term a card can print, in one place. ', h('a', { href: '#/learn/glossary' }, 'Open the glossary →'))),
    ),
  );
}

function quizEl(qs: Question[], onDone: (score: number) => void): HTMLElement {
  const picked: (number | null)[] = qs.map(() => null);
  const box = h('div', { class: 'quiz' });
  const paint = (): void => rebuild(box, () => {
    qs.forEach((q, qi) => {
      const sel = picked[qi];
      box.appendChild(
        h(
          'div',
          { class: 'q' },
          h('p', null, h('b', null, `${qi + 1}. `), q.q),
          h(
            'div',
            { class: 'opts' },
            q.options.map((o, oi) => {
              const cls = sel === null ? '' : oi === q.answer ? 'right' : oi === sel ? 'wrong' : 'dim';
              return h('button', { class: `opt ${cls}`, type: 'button', disabled: sel !== null, onclick: () => choose(qi, oi) }, o);
            }),
          ),
          sel !== null ? h('p', { class: `why ${sel === q.answer ? 'good' : 'bad'}` }, sel === q.answer ? '✓ Correct. ' : '✗ Not quite. ', q.why) : null,
        ),
      );
    });
    if (!picked.includes(null)) {
      const score = picked.filter((p, i) => p === qs[i].answer).length;
      box.appendChild(h('p', { class: 'score' }, h('b', null, `Score: ${score}/${qs.length}. `), score >= passMark(qs.length) ? 'Lesson complete.' : 'Read the explanations above, then try again.'));
      box.appendChild(btn('Try the quiz again', () => {
        for (let i = 0; i < picked.length; i++) picked[i] = null;
        paint();
      }, { cls: 'ghost' }));
    }
  });
  const choose = (qi: number, oi: number): void => {
    picked[qi] = oi;
    paint();
    if (!picked.includes(null)) onDone(picked.filter((p, i) => p === qs[i].answer).length);
  };
  paint();
  return box;
}

function lessonPage(root: HTMLElement, l: Lesson): void {
  const all = LESSONS;
  const i = all.indexOf(l);
  const prev = all[i - 1];
  const next = all[i + 1];
  const track = TRACKS.find((t) => t.id === l.track)!;
  const nav = h('div', { class: 'row lessonnav' }, prev ? h('a', { class: 'btn ghost', href: `#/learn/${prev.id}` }, `← ${prev.title}`) : null, h('span', { class: 'spacer' }), next ? h('a', { class: 'btn primary', href: `#/learn/${next.id}` }, `Next: ${next.title} →`) : h('a', { class: 'btn primary', href: '#/play' }, 'Go play a match →'));
  root.appendChild(
    h(
      'div',
      { class: 'page lesson' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Learn'), ` › ${track.name}`),
      h('h1', null, l.title),
      h('p', { class: 'lead' }, l.summary),
      h('article', { class: 'prose', html: l.body }),
      h('h3', null, 'Check yourself'),
      quizEl(l.quiz, (score) => {
        update((s) => {
          const r = (s.lessons[l.id] ??= { done: false, best: 0 });
          r.best = Math.max(r.best, score);
          if (score >= passMark(l.quiz.length)) r.done = true;
        });
      }),
      nav,
    ),
  );
}

function drillPage(root: HTMLElement, kind: string): void {
  const def = DRILLS.find((d) => d.id === kind);
  if (!def) return overview(root);
  const box = h('div', { class: 'drill' });
  let cur: Drill = def.make(Math.random);
  let picked: number | null = null;
  const paint = (): void => rebuild(box, () => {
    const r = load().drills[def.id];
    box.appendChild(h('p', { class: 'muted' }, r ? `Streak ${r.streak} · best ${r.best} · ${r.right}/${r.total} correct` : 'First problem — good luck.'));
    box.appendChild(h('div', { class: 'q' }, h('div', { class: 'prose', html: cur.prompt }), h('div', { class: 'opts' }, cur.options.map((o, oi) => h('button', { class: `opt ${picked === null ? '' : oi === cur.answer ? 'right' : oi === picked ? 'wrong' : 'dim'}`, type: 'button', disabled: picked !== null, onclick: () => choose(oi) }, o)))));
    if (picked !== null) {
      box.appendChild(h('p', { class: `why ${picked === cur.answer ? 'good' : 'bad'}` }, picked === cur.answer ? '✓ Correct. ' : '✗ Not quite. ', h('span', { html: cur.why })));
      box.appendChild(btn('Next problem', () => {
        cur = def.make(Math.random);
        picked = null;
        paint();
      }, { cls: 'primary' }));
    }
  });
  const choose = (oi: number): void => {
    picked = oi;
    recordDrill(def.id, oi === cur.answer);
    paint();
  };
  paint();
  root.appendChild(h('div', { class: 'page lesson' }, h('p', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Learn'), ' › Drills'), h('h1', null, def.name), h('p', { class: 'lead' }, def.blurb), box));
}

function glossaryPage(root: HTMLElement): void {
  root.appendChild(
    h(
      'div',
      { class: 'page lesson' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/learn' }, 'Learn'), ' › Glossary'),
      h('h1', null, 'Glossary'),
      h('p', { class: 'lead' }, 'The words in [brackets] tell you when and how an effect works.'),
      h('dl', { class: 'terms big' }, GLOSSARY.map((t) => [h('dt', null, t.term), h('dd', null, t.text)])),
    ),
  );
}
