// Rebuilds src/data/cards.json (every card in the game) and src/data/starters.json
// (starter-deck lists) from the public Limitless One Piece card database.
//
//   node scripts/fetch-cards.ts
//
// Re-run it whenever a new set releases. Only card text and numbers are stored — no images.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RawCard {
  id: string;
  name: string;
  category: string;
  colors: string[];
  cost: number;
  life: number;
  power: number;
  counter: number;
  attribute: string[];
  types: string[];
  text: string;
  set: string;
}

const BASE = 'https://onepiece.limitlesstcg.com';
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/data');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + path, { headers: { 'User-Agent': 'Mozilla/5.0 (card-data-sync)' } });
      if (res.ok) return await res.text();
      console.warn(`  ${path}: HTTP ${res.status}, retrying`);
    } catch (err) {
      console.warn(`  ${path}: ${(err as Error).message}, retrying`);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`Failed to fetch ${path}`);
}

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&minus;|−/g, '-')
    .replace(/&nbsp;/g, ' ');

const strip = (s: string): string =>
  decode(
    s
      .replace(/<span class="reminder-text">[\s\S]*?<\/span>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

function parseCards(html: string, set: string): RawCard[] {
  const out: RawCard[] = [];
  const seen = new Set<string>();
  for (const b of html.split('<div class="card-text">').slice(1)) {
    const id = /card-text-id">([^<]+)</.exec(b)?.[1]?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = strip(/card-text-name">([\s\S]*?)<\/span>/.exec(b)?.[1] ?? '');
    const typeLine = strip(/card-text-type">([\s\S]*?)<\/p>/.exec(b)?.[1] ?? '').replace(/\n/g, ' ');
    const category = /data-tooltip="Category">([^<]+)</.exec(b)?.[1]?.trim() ?? '';
    const colors = (/data-tooltip="Color">([^<]+)</.exec(b)?.[1] ?? '').split('/').map((c) => c.trim()).filter(Boolean);
    const attribute = (/data-tooltip="Attribute">([^<]+)</.exec(b)?.[1] ?? '').split('/').map((c) => c.trim()).filter(Boolean);
    const types = decode(/data-tooltip="Type">([^<]+)</.exec(b)?.[1] ?? '').split('/').map((c) => c.trim()).filter(Boolean);
    const sections = [...b.matchAll(/<(p|div) class="card-text-section">([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    const flat = strip(b);
    const text = sections
      .slice(1)
      .filter((s) => !s.includes('data-tooltip="Type"') && !/^\s*\d+ Power/.test(strip(s)))
      .map(strip)
      .filter(Boolean)
      .join('\n');
    out.push({
      id,
      name,
      category,
      colors,
      cost: Number(/(\d+) Cost/.exec(typeLine)?.[1] ?? 0),
      life: Number(/(\d+) Life/.exec(typeLine)?.[1] ?? 0),
      power: Number(/(\d+) Power/.exec(flat)?.[1] ?? 0),
      counter: Number(/\+(\d+) Counter/.exec(flat)?.[1] ?? 0),
      attribute,
      types,
      text,
      set,
    });
  }
  return out;
}

/** Decodes the "Decklist" link on a starter-deck page into [cardId, copies] pairs. */
function parseDecklist(html: string): [string, number][] | null {
  const code = /imggen\?c=([A-Z0-9]+)/.exec(html)?.[1];
  if (!code) return null;
  return [...code.slice(1).matchAll(/(\d)4\d([A-Z]{1,3}\d{5})0/g)].map((m) => {
    const raw = m[2];
    return [`${raw.slice(0, raw.length - 3)}-${raw.slice(-3)}`, Number(m[1])] as [string, number];
  });
}

async function main(): Promise<void> {
  const index = await get('/cards');
  const slugs = [...new Set([...index.matchAll(/href="\/cards\/([a-zA-Z0-9-]+)"/g)].map((m) => m[1]))].filter(
    (s) => s !== 'advanced' && /^(op|st|eb|prb|promos)/i.test(s),
  );
  console.log(`Found ${slugs.length} sets.`);
  const cards = new Map<string, RawCard>();
  const starters: Record<string, [string, number][]> = {};
  for (const slug of slugs) {
    const html = await get(`/cards/${slug}?display=text`);
    const code = slug.split('-')[0].toUpperCase();
    const parsed = parseCards(html, code);
    let added = 0;
    for (const c of parsed) {
      // A card keeps the first printing we see whose set matches its own number (reprints are skipped).
      if (!cards.has(c.id)) {
        cards.set(c.id, c);
        added++;
      }
    }
    const list = /^ST/.test(code) ? parseDecklist(html) : null;
    if (list) starters[code] = list;
    console.log(`  ${code.padEnd(7)} ${String(parsed.length).padStart(4)} cards (${added} new)${list ? ' + decklist' : ''}`);
    await sleep(350);
  }
  // Promo cards live on many small pack pages linked from /cards/promos.
  const promoIndex = await get('/cards/promos');
  const promoSlugs = [...new Set([...promoIndex.matchAll(/href="\/cards\/([a-zA-Z0-9-]+)"/g)].map((m) => m[1]))].filter(
    (s) => s !== 'advanced' && s !== 'promos' && !slugs.includes(s),
  );
  let promoAdded = 0;
  for (const slug of promoSlugs) {
    const parsed = parseCards(await get(`/cards/${slug}?display=text`), 'P');
    for (const c of parsed) {
      if (!cards.has(c.id)) {
        cards.set(c.id, c);
        promoAdded++;
      }
    }
    await sleep(300);
  }
  console.log(`  Promo packs: ${promoSlugs.length} pages, ${promoAdded} new cards`);
  const all = [...cards.values()].sort((a, b) => a.id.localeCompare(b.id));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'cards.json'), JSON.stringify(all));
  writeFileSync(resolve(outDir, 'starters.json'), JSON.stringify(starters, null, 1));
  console.log(`Wrote ${all.length} cards and ${Object.keys(starters).length} starter lists.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
