// Original artwork for the site, drawn as vector graphics: the emblem, the icon set, and the
// harbour scene on the home page. Nothing here is taken from the card game's own art.

import type { CardDef } from '../engine/types';

const NS = 'http://www.w3.org/2000/svg';

/** One icon per shape, on a 48×48 grid, filled with the current text colour. */
const SYMBOLS: Record<string, string> = {
  // Card attributes
  slash: '<path d="M43 5l-2 7-20 20-4-4 20-20z"/><path d="M12 24l12 12-2.5 2.5-12-12z"/><path d="M14 31l3 3-7 7-3-3z"/><circle cx="7.5" cy="40.5" r="3"/>',
  strike:
    '<path d="M11 22a4.2 4.2 0 0 1 8.4 0a4.2 4.2 0 0 1 8.4 0a4.2 4.2 0 0 1 8.4 0a3.6 3.6 0 0 1 5.3 3.2V34c0 6-5 10-12 10h-7c-7 0-11.500-4-11.500-10z"/><path d="M11.500 31h14a3.200 3.200 0 0 0 0-6.400" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="2.200" stroke-linecap="round"/>',
  ranged:
    '<circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 3v11M24 34v11M3 24h11M34 24h11" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="3.500"/>',
  special: '<path d="M24 2l4.500 17.500L46 24l-17.500 4.500L24 46l-4.500-17.500L2 24l17.500-4.500z"/><path d="M38 6l1.300 4.700L44 12l-4.700 1.300L38 18l-1.300-4.700L32 12l4.700-1.300zM10 32l1 3.500 3.500 1-3.500 1-1 3.500-1-3.500-3.500-1 3.500-1z"/>',
  wisdom:
    '<path d="M23 12C18 8 10 8 5 10.500V37c5-2 13-2 18 2z"/><path d="M25 12c5-4 13-4 18-1.500V37c-5-2-13-2-18 2z"/><path d="M9 17c3-1 7-1 10 .500M9 23c3-1 7-1 10 .500M29 17.500c3-1.500 7-1.500 10-.500M29 23.500c3-1.500 7-1.500 10-.500" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.800" stroke-linecap="round"/>',
  // Card categories
  event:
    '<rect x="12" y="9" width="24" height="30" rx="1"/><rect x="7" y="5" width="34" height="8" rx="4"/><rect x="7" y="35" width="34" height="8" rx="4"/><path d="M17 19h14M17 24h14M17 29h9" stroke="#000" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>',
  stage: '<path d="M3 42q9-15 21-11 13-6 21 11z"/><path d="M21 31V7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M22.500 7l15 5-15 6z"/>',
  crown: '<path d="M6 35L4 13l11 10 9-16 9 16 11-10-2 22z"/><path d="M7 38h34v5H7z"/>',
  // Navigation
  wheel:
    '<circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="3.500"/><circle cx="24" cy="24" r="3.500"/><path d="M24 3v42M3 24h42M9.200 9.200l29.600 29.600M38.800 9.200L9.200 38.800" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  swords: '<use href="#i-slash"/><use href="#i-slash" transform="translate(48 0) scale(-1 1)"/>',
  cards: '<rect x="7" y="9" width="21" height="30" rx="3" transform="rotate(-12 17.500 24)"/><rect x="20" y="9" width="21" height="30" rx="3" transform="rotate(9 30.500 24)" stroke="#000" stroke-opacity=".45" stroke-width="1.500"/>',
  spyglass: '<g transform="rotate(-35 24 24)"><rect x="2" y="20" width="15" height="8" rx="1.500"/><rect x="17" y="17.500" width="13" height="13" rx="1.500"/><rect x="30" y="14" width="16" height="20" rx="2.500"/></g>',
  anchor:
    '<circle cx="24" cy="9" r="4.500" fill="none" stroke="currentColor" stroke-width="3.500"/><path d="M24 13.500V43M14 20h20M7 28c1 9 7 15 17 15s16-6 17-15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 31l4-7 5 6zM45 31l-4-7-5 6z"/>',
  flag: '<path d="M10 4v41" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M13 7c7-4 12 4 18 1.500S41 6 44 8v19c-4-3-8-1-13 1s-11-5-18 0z"/>',
  scroll: '<use href="#i-event"/>',
  coin: '<circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="14" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2.500"/>',
};

let installed = false;

/** Put the icon definitions in the page once, so every icon is a one-line reference. */
export function installArt(): void {
  if (installed) return;
  installed = true;
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = `<svg xmlns="${NS}" aria-hidden="true">${Object.entries(SYMBOLS)
    .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 48 48" fill="currentColor">${body}</symbol>`)
    .join('')}</svg>`;
  document.body.appendChild(holder);
}

export type IconName = keyof typeof SYMBOLS;

export function icon(name: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', `ico ${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${SYMBOLS[name] ? name : 'special'}`);
  svg.appendChild(use);
  return svg;
}

/** Which icon stands for a card: its first attribute, or its category when it has none. */
export function crestOf(d: CardDef): string {
  if (d.category === 'Event') return 'event';
  if (d.category === 'Stage') return 'stage';
  const a = (d.attribute[0] ?? '').toLowerCase();
  if (a === 'slash' || a === 'strike' || a === 'ranged' || a === 'special' || a === 'wisdom') return a;
  return d.category === 'Leader' ? 'crown' : 'special';
}

/** A small, stable number from a card id — used to vary each card's picture a little. */
export function hash(id: string): number {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
  return x >>> 0;
}

/** The site emblem: a skull in a dojo headband over crossed bones. */
export const EMBLEM = `<svg xmlns="${NS}" viewBox="0 0 64 64" class="emblem" aria-hidden="true">
<g stroke="#f3e7c9" stroke-width="6" stroke-linecap="round"><path d="M11 13l42 40M53 13L11 53"/></g>
<g fill="#f3e7c9"><circle cx="8" cy="15" r="4.500"/><circle cx="13" cy="9.500" r="4.500"/><circle cx="56" cy="15" r="4.500"/><circle cx="51" cy="9.500" r="4.500"/><circle cx="8" cy="51" r="4.500"/><circle cx="13" cy="56.500" r="4.500"/><circle cx="56" cy="51" r="4.500"/><circle cx="51" cy="56.500" r="4.500"/></g>
<path d="M32 9c-11 0-19 7.800-19 18 0 6 2.800 11 7 14v6.500c0 2.200 1.800 4 4 4h16c2.200 0 4-1.800 4-4V41c4.200-3 7-8 7-14 0-10.200-8-18-19-18z" fill="#f3e7c9" stroke="#1d110a" stroke-width="1.500"/>
<circle cx="25" cy="31" r="5" fill="#1d110a"/><circle cx="39" cy="31" r="5" fill="#1d110a"/>
<path d="M32 36l-3 6h6z" fill="#1d110a"/>
<path d="M26 45.500v6M32 45.500v6M38 45.500v6" stroke="#1d110a" stroke-width="1.800"/>
<path d="M13.400 21.500Q32 12.500 50.600 21.500l.4 6Q32 18.500 13 27.500z" fill="#c5352a" stroke="#1d110a" stroke-width="1.200"/>
<path d="M50 21l11-5-3.500 6.500L63 26l-12 1z" fill="#c5352a" stroke="#1d110a" stroke-width="1.200" stroke-linejoin="round"/>
</svg>`;

/** One row of waves, 120 units per swell and wider than the picture so it can drift sideways forever. */
const wave = (y: number, swell: number, depth: number): string => `M-120 ${y}q30-${swell} 60 0${'t60 0'.repeat(21)}v${depth}H-120z`;

/** The picture across the top of the home page: a ship leaving harbour at sunset. */
export const HARBOUR = `<svg xmlns="${NS}" viewBox="0 0 980 300" preserveAspectRatio="xMaxYMid slice" class="harbour" aria-hidden="true">
<defs>
<linearGradient id="hSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1c33"/><stop offset=".38" stop-color="#3b2b55"/><stop offset=".62" stop-color="#b9483a"/><stop offset=".8" stop-color="#f09a3e"/><stop offset="1" stop-color="#ffd98a"/></linearGradient>
<radialGradient id="hSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="hSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8643a"/><stop offset=".25" stop-color="#3c3a63"/><stop offset="1" stop-color="#081726"/></linearGradient>
<linearGradient id="hSail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0cf"/><stop offset="1" stop-color="#d6a56c"/></linearGradient>
</defs>
<rect width="980" height="212" fill="url(#hSky)"/>
<g fill="#fff" opacity=".8"><circle cx="70" cy="30" r="1.200"/><circle cx="160" cy="62" r="1"/><circle cx="250" cy="24" r="1.400"/><circle cx="340" cy="48" r=".9"/><circle cx="455" cy="18" r="1.200"/><circle cx="820" cy="34" r="1.300"/><circle cx="905" cy="66" r="1"/><circle cx="930" cy="20" r="1.100"/><circle cx="610" cy="40" r=".9"/></g>
<circle cx="640" cy="208" r="150" fill="url(#hSun)"/>
<circle cx="640" cy="208" r="46" fill="#fff0c2"/>
<g fill="#2a2145" opacity=".55"><path d="M40 118c20-14 50-14 68-4 14-10 40-8 50 6 18-2 30 8 30 8H30s2-8 10-10z"/><path d="M700 92c16-12 42-12 58-2 16-8 36-4 44 8 14 0 22 8 22 8H690s2-10 10-14z"/><path d="M360 70c12-8 30-8 42 0 10-4 24-2 30 6H350s4-4 10-6z"/></g>
<path d="M0 212V178c30-4 46-26 80-30 26-3 40 14 62 20 30 8 50 6 78 24 10 6 22 12 30 20z" fill="#1a1530"/>
<g stroke="#1a1530" stroke-width="5" stroke-linecap="round" fill="none"><path d="M92 150c2-22 8-40 18-54"/><path d="M150 168c0-18 6-34 16-46"/></g>
<g fill="#1a1530"><path d="M110 96c-16-10-34-6-42 4 14-4 28 0 42-4zM110 96c16-14 36-12 46-2-16-2-30 4-46 2zM110 96c-4-18-20-26-34-24 14 4 26 14 34 24zM110 96c8-18 26-24 40-20-16 4-30 10-40 20z"/><path d="M166 122c-14-8-28-4-34 4 12-4 22-2 34-4zM166 122c12-12 30-10 38-2-14-2-24 4-38 2zM166 122c-2-16-16-22-28-20 12 4 22 10 28 20zM166 122c8-14 22-20 34-16-14 2-26 8-34 16z"/></g>
<path d="M980 212v-28c-24-2-40-18-66-20-22-2-34 10-52 16-22 8-40 8-58 22-6 4-10 8-12 10z" fill="#1a1530" opacity=".85"/>
<g stroke="#f7d9a0" stroke-width="2" stroke-linecap="round" fill="none" opacity=".75"><path d="M300 60q8-7 15 0q8-7 15 0"/><path d="M840 96q6-6 12 0q6-6 12 0"/><path d="M780 58q5-5 10 0q5-5 10 0"/></g>
<rect y="210" width="980" height="90" fill="url(#hSea)"/>
<path d="M560 214h160l-22 6h-116z" fill="#ffe6a6" opacity=".55"/>
<path d="M584 232h112l-16 6h-80zM606 250h68l-10 5h-48z" fill="#ffd98a" opacity=".3"/>
<g transform="translate(150 14)"><g class="ship">
<g stroke="#120c1a" stroke-width="1.200" opacity=".7" fill="none"><path d="M505 46L398 196M505 46L472 196M505 46l92 150M575 74L522 196M575 74l80 96M435 80l-40 116M435 80l56 116"/></g>
<g stroke="#120c1a" stroke-width="5" stroke-linecap="round"><path d="M505 198V40M575 198V68M435 198V74"/><path d="M618 186l52-26" stroke-width="4"/></g>
<g fill="url(#hSail)" stroke="#120c1a" stroke-width="1.500" stroke-linejoin="round">
<path d="M470 56h70q5 26-2 50-33 9-66 0-7-24-2-50z"/><path d="M464 114h82q7 36-3 68-38 10-76 0-10-32-3-68z"/>
<path d="M548 82h54q4 21-2 40-25 7-50 0-6-19-2-40z"/><path d="M544 130h62q6 28-3 54-28 8-56 0-9-26-3-54z"/>
<path d="M410 90h50q4 20-2 38-23 7-46 0-6-18-2-38z"/><path d="M406 136h58q5 24-3 46-26 7-52 0-8-22-3-46z"/>
<path d="M579 72l88 90h-82z" opacity=".92"/>
</g>
<g stroke="#b3261e" stroke-width="5" opacity=".85"><path d="M467 142q38 9 76 0M546 154q28 7 57 0M408 157q26 6 53 0"/></g>
<path d="M505 40V22l30 5-9 6 9 7z" fill="#120c1a"/>
<path d="M392 186h22v-14h44v14h168l44-22-10 30q-10 26-34 30H438q-34-4-46-38z" fill="#1c1220" stroke="#120c1a" stroke-width="1.500"/>
<path d="M398 194h256" stroke="#e9b949" stroke-width="2.500" opacity=".85"/>
<g fill="#ffcf6b"><rect x="424" y="178" width="6" height="6" rx="1"/><rect x="438" y="178" width="6" height="6" rx="1"/><circle cx="486" cy="206" r="2.600"/><circle cx="516" cy="206" r="2.600"/><circle cx="546" cy="206" r="2.600"/><circle cx="576" cy="206" r="2.600"/><circle cx="606" cy="206" r="2.600"/></g>
</g></g>
<g class="waves">
<path class="w1" d="${wave(236, 10, 70)}" fill="#2b3566" opacity=".78"/>
<path class="w2" d="${wave(254, 9, 52)}" fill="#172a4f" opacity=".92"/>
<path class="w3" d="${wave(272, 8, 32)}" fill="#0b1b30"/>
</g>
</svg>`;

/** A compass rose, used large and faint behind the pages. */
export const COMPASS = `<svg xmlns="${NS}" viewBox="0 0 200 200" class="compass" aria-hidden="true">
<g fill="none" stroke="currentColor"><circle cx="100" cy="100" r="92" stroke-width="2"/><circle cx="100" cy="100" r="84" stroke-width=".8"/><circle cx="100" cy="100" r="56" stroke-width=".8"/>
<path stroke-width=".6" d="M100 8v184M8 100h184M35 35l130 130M165 35L35 165"/></g>
<g fill="currentColor"><path d="M100 6l9 85-9 9-9-9zM100 194l-9-85 9-9 9 9zM6 100l85-9 9 9-9 9zM194 100l-85 9-9-9 9-9z"/>
<path opacity=".55" d="M40 40l55 47 5 13-13-5zM160 40l-47 55-13 5 5-13zM160 160l-55-47-5-13 13 5zM40 160l47-55 13-5-5 13z"/><circle cx="100" cy="100" r="5"/></g>
</svg>`;
