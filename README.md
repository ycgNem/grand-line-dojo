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

`npm test` runs the rules, CPU and content tests. `npm run build` type-checks and builds the site into `dist/`.
Pushing to `main` builds and publishes the site to GitHub Pages (see `.github/workflows/deploy.yml`).

## What this is and is not

- About 41% of cards can be played in matches; the rest are reference-only because their effects are too complex for the engine.
- The CPU is rule-based: a sparring partner for fundamentals, not a tournament opponent.
- Card data is a snapshot. Check the official card list and banned list before an event.

## Credits and rights

ONE PIECE CARD GAME and all card names and card text belong to their respective owners. This project is not
affiliated with or endorsed by them. Every picture on the site is an original drawing made for this project;
no official card artwork is included. Each card links out to its printed version instead.
