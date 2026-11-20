# Grand Line Dojo

An unofficial, fan-made trainer for the One Piece Card Game. Single player, against a CPU.

- **Play** the ST-30 "Luffy & Ace" starter deck against six CPU starter decks, with a coach that explains every decision.
- **Learn** the rules, strategy, deckbuilding and tournament play in 24 lessons with quizzes and drills.
- **Card Library** of every card as text, with notes on how each is used.
- **Deck Lab** to build, check and test-play your own lists.

## Run it

```
npm install
npm run dev
```

`npm test` runs the rules, card-effect, CPU and content tests. `npm run build` type-checks and builds the site into `dist/`.
Pushing to `main` builds and publishes the site to GitHub Pages (see `.github/workflows/deploy.yml`).

## What this is and is not

- About 93% of cards (2,759 of 2,980 in this snapshot) can be played in matches. Most are read automatically from
  their printed text by a small grammar (`src/engine/grammar.ts`, `actions.ts`, `compile.ts`); if any sentence on a
  card is not understood, the whole card stays out of matches rather than being guessed at.
- The remaining cards use one-off mechanics the engine does not model yet (swapping base power, activating an
  Event from the hand through another card, deck-building rules, "the next time you play…" discounts and the
  like). They are still in the Library and the Deck Lab, marked REF.
- Known simplifications: a mandatory "instead" replacement is offered as a choice; "return 1 or more DON!!" returns
  exactly 1; "draw up to N" draws N; a power bonus used in the Counter Step goes on the card under attack; and
  "until the end of your opponent's next End Phase", used on the opponent's own turn, ends with that turn (the
  comprehensive rules do not spell that case out).
- The CPU is rule-based: a sparring partner for fundamentals, not a tournament opponent.
- Card data is a snapshot. Check the official card list and banned list before an event.

## Your own card pictures (local only)

Put photos or scans of your cards in `local-art/`, named by card number (`ST30-001.png`), and the app shows them
on those cards when you run it on your computer. The folder is ignored by git, so the pictures are never
committed and never reach the published site. Details are in `local-art/README.md`.

## Developer tools

- `npx vite-node scripts/coverage.ts report.txt` — how many cards compile, and which wordings still block cards.
- `npx vite-node scripts/show.ts OP01-016 ST30-007` — how the engine understands the given cards.
- `npx vite-node scripts/diag.ts 500` — CPU-vs-CPU games on random decks; reports any that never finish.
- `FUZZ_N=3000 AI_N=800 npm test` — the same test suite with thousands of extra random games.

## Credits and rights

ONE PIECE CARD GAME and all card names and card text belong to their respective owners. This project is not
affiliated with or endorsed by them. Every picture on the site is an original drawing made for this project;
no official card artwork is included or downloaded. Each card links out to its printed version instead.
