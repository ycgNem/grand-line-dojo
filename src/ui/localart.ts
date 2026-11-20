// Your own card pictures, read from the local-art/ folder next to package.json.
// That folder is ignored by git, so pictures in it exist only on this computer: the published site never gets them.
// Name each file by card number — ST30-001.png, OP01-016.jpg — and the card shows it instead of the drawn scene.

const files = import.meta.glob('/local-art/*.{png,jpg,jpeg,webp,avif,gif,PNG,JPG,JPEG,WEBP}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const PICS = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path
    .slice(path.lastIndexOf('/') + 1)
    .replace(/\.[^.]+$/, '')
    .toUpperCase();
  const base = /^[A-Z0-9]+-\d+/.exec(name)?.[0];
  if (!base) continue;
  // A file named exactly by the card number wins over variants such as ST30-001_p1.
  if (name === base || !PICS.has(base)) PICS.set(base, url);
}

/** The local picture for this card number, if there is one. */
export const localPicture = (id: string): string | undefined => PICS.get(id.toUpperCase());

/** How many cards have a local picture. */
export const localPictureCount = PICS.size;
