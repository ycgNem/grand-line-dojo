// Tiny DOM helpers and the card renderer. No framework: views rebuild their own subtree.

import { kw } from '../data/analysis';
import type { CardDef, Color } from '../engine/types';
import { crestOf, hash, icon } from './art';
import { localPicture } from './localart';

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (key === 'class') el.className = String(v);
      else if (key === 'html') el.innerHTML = String(v);
      else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(v));
    }
  }
  add(el, children);
  return el;
}

function add(el: Node, c: Child): void {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) for (const x of c) add(el, x);
  else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Rebuild `el` in place without the page jumping. Emptying a tall element shrinks the page,
 * which makes the browser pull the scroll position up; holding the height during the rebuild stops that.
 */
export function rebuild(el: HTMLElement, build: () => void): void {
  const y = window.scrollY;
  el.style.minHeight = `${el.offsetHeight}px`;
  clear(el);
  build();
  el.style.minHeight = '';
  if (window.scrollY !== y) window.scrollTo(0, y);
}

export const btn = (label: Child, onClick: () => void, opts: { cls?: string; disabled?: boolean; title?: string } = {}): HTMLButtonElement =>
  h('button', { class: `btn ${opts.cls ?? ''}`, onclick: onClick, disabled: opts.disabled, title: opts.title, type: 'button' }, label);

export const COLOR_HEX: Record<Color, string> = {
  Red: '#c8402f',
  Green: '#2e9d5b',
  Blue: '#2f7fc8',
  Purple: '#8e52b8',
  Black: '#4a5563',
  Yellow: '#d0a51c',
};

/** A lighter and a darker shade of each colour, for the bevelled card frame. */
const FRAME: Record<Color, [string, string]> = {
  Red: ['#e2604c', '#8f2418'],
  Green: ['#4cc07c', '#176a3a'],
  Blue: ['#559fe4', '#184f8a'],
  Purple: ['#ab74d6', '#58307c'],
  Black: ['#74808f', '#262d36'],
  Yellow: ['#f0c94a', '#94700a'],
};

export function colorBg(colors: Color[]): string {
  const c = colors.map((x) => FRAME[x] ?? ['#888', '#444']);
  if (!c.length) return '#666';
  if (c.length === 1) return `linear-gradient(160deg, ${c[0][0]}, ${c[0][1]})`;
  return `linear-gradient(115deg, ${c[0][0]} 0, ${c[0][1]} 50%, ${c[1][0]} 50%, ${c[1][1]} 100%)`;
}

/** Card text with [bracketed] terms highlighted. Escapes everything else. */
export function richText(text: string): HTMLElement {
  const box = h('div', { class: 'ctext' });
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const p = h('p');
    for (const part of line.split(/(\[[^\]]+\])/)) {
      if (!part) continue;
      if (part.startsWith('[') && part.endsWith(']')) {
        const isName = !/^\[(Rush|Blocker|Double Attack|Banish|Unblockable|Trigger|On |When |Activate|Main|Counter|Your Turn|Opponent|End of|Once Per|DON!!)/.test(part);
        p.appendChild(h('span', { class: isName ? 'kw name' : 'kw' }, part));
      } else p.appendChild(document.createTextNode(part));
    }
    box.appendChild(p);
  }
  return box;
}

export interface CardOpts {
  size?: 'sm' | 'md' | 'lg';
  rested?: boolean;
  /** Current power, if different from printed. */
  power?: number;
  don?: number;
  faceDown?: boolean;
  cls?: string;
  /** Small label in the corner (e.g. "+2000", "RUSH"). */
  tag?: string;
  count?: number;
  onClick?: (e: MouseEvent) => void;
  title?: string;
}

const kwShort = (d: CardDef): string[] => {
  const out: string[] = [];
  const t = d.text;
  if (kw(d, 'Blocker')) out.push('Blocker');
  if (kw(d, 'Rush')) out.push('Rush');
  if (kw(d, 'Double Attack')) out.push('Dbl Atk');
  if (kw(d, 'Banish')) out.push('Banish');
  if (kw(d, 'Trigger')) out.push('Trigger');
  if (d.category === 'Event' && /\[Counter\]/.test(t)) out.push('Counter');
  return out;
};

/** A card with a click action behaves like a button: reachable with Tab, pressed with Enter or Space. */
function clickable(onClick: ((e: MouseEvent) => void) | undefined, label: string): Attrs {
  if (!onClick) return {};
  return {
    onclick: onClick,
    role: 'button',
    tabindex: '0',
    'aria-label': label,
    onkeydown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    },
  };
}

/**
 * The picture on a card: an original scene for its colour (two colours split the frame diagonally),
 * nudged sideways, mirrored and tinted by the card number so neighbours do not look identical.
 * A picture of your own in the local-art/ folder replaces the drawn scene (on this computer only).
 */
function cardArt(d: CardDef): HTMLElement {
  const pic = localPicture(d.id);
  if (pic) return h('div', { class: 'cart photo', style: { backgroundImage: `url(${JSON.stringify(pic)})` } });
  const n = hash(d.id);
  const scene = (c: Color | undefined): string => `s-${(c ?? 'Black').toLowerCase()}`;
  return h(
    'div',
    { class: `cart ${scene(d.colors[0])} ${n & 1 ? 'flip' : ''}`, style: `--px:${(n >>> 1) % 101}%;--hue:${((n >>> 9) % 23) - 11}deg` },
    d.colors[1] ? h('div', { class: `cart2 ${scene(d.colors[1])}` }) : null,
  );
}

export function cardEl(d: CardDef, o: CardOpts = {}): HTMLElement {
  const size = o.size ?? 'sm';
  if (o.faceDown) return h('div', { class: `card ${size} back ${o.cls ?? ''}`, title: o.title, ...clickable(o.onClick, o.title ?? 'Face-down card') }, h('div', { class: 'backmark' }, '☠'));
  const isLeader = d.category === 'Leader';
  const hasPower = d.category === 'Leader' || d.category === 'Character';
  const shown = o.power ?? d.power;
  const powCls = shown > d.power ? 'up' : shown < d.power ? 'down' : '';
  const el = h(
    'div',
    {
      class: `card ${size} cat-${d.category.toLowerCase()} ${o.rested ? 'rested' : ''} ${o.cls ?? ''}`,
      style: { background: colorBg(d.colors) },
      title: o.title ?? `${d.name} (${d.id})`,
      ...clickable(o.onClick, `${d.name}, ${d.category}${o.rested ? ', rested' : ''}`),
      'data-id': d.id,
    },
    cardArt(d),
    h('span', { class: 'crest', title: d.attribute.join(' / ') || d.category }, icon(crestOf(d))),
    h(
      'div',
      { class: 'chead' },
      h('span', { class: `cost ${isLeader ? 'life' : ''}`, title: isLeader ? 'Life' : 'Cost' }, isLeader ? `♥${d.life ?? 5}` : d.cost),
      hasPower ? h('span', { class: `pow ${powCls}`, title: 'Power' }, shown) : h('span', { class: 'pow cat' }, d.category),
    ),
    // A zero-width space after each full stop lets long names such as "Monkey.D.Luffy" wrap between words.
    h('div', { class: 'cname' }, d.name.replace(/\.(?=\S)/g, '.​')),
    size !== 'sm' ? h('div', { class: 'cmeta' }, `${d.category}${d.attribute.length ? ` · ${d.attribute.join('/')}` : ''}`) : null,
    size === 'lg' ? richText(d.text || '(No effect text.)') : null,
    h(
      'div',
      { class: 'cfoot' },
      d.counter > 0 ? h('span', { class: 'ctr', title: 'Counter value' }, `+${d.counter / 1000}k`) : null,
      size !== 'lg' ? kwShort(d).map((k) => h('span', { class: 'pill' }, k)) : null,
    ),
    size !== 'sm' ? h('div', { class: 'ctype' }, d.types.join(' / ')) : null,
    size !== 'sm' ? h('div', { class: 'cid' }, d.id) : null,
    o.don ? h('span', { class: 'donbadge', title: 'Attached DON!! (+1000 each on your turn)' }, `+${o.don} DON`) : null,
    o.tag ? h('span', { class: 'tagbadge' }, o.tag) : null,
    o.rested ? h('span', { class: 'restbadge' }, 'RESTED') : null,
    o.count !== undefined ? h('span', { class: 'countbadge' }, `×${o.count}`) : null,
  );
  return el;
}

/** Close functions of the dialogs that are open right now, oldest first. */
const openModals: (() => void)[] = [];

/** A modal dialog. Returns a function that closes it. */
export function modal(content: Child, opts: { wide?: boolean; onClose?: () => void } = {}): () => void {
  const close = (): void => {
    const i = openModals.indexOf(close);
    if (i < 0) return; // already closed
    openModals.splice(i, 1);
    document.removeEventListener('keydown', onKey);
    back.remove();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    // Escape closes only the dialog on top, so a card opened from inside another dialog closes first.
    if (e.key === 'Escape' && openModals[openModals.length - 1] === close) close();
  };
  const box = h('div', { class: `modal ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, h('button', { class: 'modal-x', onclick: close, 'aria-label': 'Close', type: 'button' }, '×'), content);
  const back = h('div', { class: 'modal-back', onclick: (e: MouseEvent) => e.target === back && close() }, box);
  document.body.appendChild(back);
  document.addEventListener('keydown', onKey);
  openModals.push(close);
  return close;
}

/** Close every open dialog. The router calls this so a dialog never outlives the page that opened it. */
export function closeAllModals(): void {
  for (const close of [...openModals].reverse()) close();
}

export const k = (n: number): string => `${n / 1000}k`;
export const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');
