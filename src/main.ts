// App shell: navigation and a tiny hash router. Each screen renders into #view.

import '@fontsource/pirata-one/latin-400.css';
import '@fontsource/im-fell-english-sc/latin-400.css';
import './style.css';
import { COMPASS, EMBLEM, icon, installArt } from './ui/art';
import * as decklab from './ui/decklab';
import { clear, closeAllModals, h } from './ui/dom';
import * as learn from './ui/learn';
import * as library from './ui/library';
import * as mydeck from './ui/mydeck';
import * as play from './ui/play';
import * as progress from './ui/progress';

type Cleanup = void | (() => void);
const ROUTES: Record<string, { label: string; icon: string; render: (el: HTMLElement, arg: string) => Cleanup }> = {
  home: { label: 'Home', icon: 'wheel', render: (el) => progress.renderHome(el) },
  play: { label: 'Play', icon: 'swords', render: (el) => play.render(el) },
  learn: { label: 'Learn', icon: 'scroll', render: (el, arg) => learn.render(el, arg) },
  deck: { label: 'My Deck', icon: 'cards', render: (el) => mydeck.render(el) },
  cards: { label: 'Card Library', icon: 'spyglass', render: (el, arg) => library.render(el, arg) },
  lab: { label: 'Deck Lab', icon: 'anchor', render: (el) => decklab.render(el) },
  progress: { label: 'Progress', icon: 'flag', render: (el) => progress.render(el) },
};

installArt();
document.body.appendChild(h('div', { class: 'bgcompass', html: COMPASS }));

const app = document.getElementById('app')!;
const view = h('main', { id: 'view' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Main' });
app.appendChild(
  h('header', { class: 'top' }, h('a', { class: 'brand', href: '#/home' }, h('span', { class: 'logo', html: EMBLEM }), 'Grand Line Dojo'), nav),
);
app.appendChild(view);
app.appendChild(
  h('footer', { class: 'foot' }, 'Unofficial fan-made practice tool. ONE PIECE CARD GAME and all card names and text belong to their respective owners. Every picture here is an original drawing made for this site; no official card artwork is used. Progress is saved in this browser only.'),
);

let cleanup: Cleanup;

function route(): void {
  const [, name = 'home', ...rest] = location.hash.split('/');
  const key = ROUTES[name] ? name : 'home';
  if (typeof cleanup === 'function') cleanup();
  closeAllModals();
  clear(nav);
  for (const [k, r] of Object.entries(ROUTES)) nav.appendChild(h('a', { href: `#/${k}`, class: k === key ? 'on' : '', 'aria-current': k === key ? 'page' : null }, icon(r.icon), r.label));
  clear(view);
  view.className = `v-${key}`;
  cleanup = ROUTES[key].render(view, rest.join('/'));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
