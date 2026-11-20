# Your own card pictures (this computer only)

Put pictures in this folder and the app shows them on the matching cards when you run it on this computer
(`npm run dev`). Nothing in this folder except this file is committed to git, so pictures here are never
uploaded and never appear on the published site.

## How to name the files

Use the card number, exactly as printed in the bottom corner of the card and shown in the Card Library:

```
ST30-001.png
OP01-016.jpg
EB03-055.webp
```

- PNG, JPG, WEBP, AVIF and GIF all work. Upper or lower case does not matter.
- A full-card photo or scan works best (portrait, roughly 5:7). The small cards zoom in on the top part,
  where the artwork is; the card's detail page shows your whole picture.
- If you have several versions of a card, `ST30-001.png` is used first; otherwise the first file that starts
  with the card number (for example `ST30-001_p1.png`) is used.
- Restart `npm run dev` (or reload the page) after adding files.

Cards without a picture here keep the app's own drawn scene.

Photos or scans of cards you own are the intended use. The official artwork belongs to its publisher; this
project does not include it or fetch it.
