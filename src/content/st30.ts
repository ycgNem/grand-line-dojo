// Everything about the deck you own: Starter Deck EX "Luffy & Ace" [ST-30].
// Card facts come from the card database; the notes here are how to PLAY them.

export interface CardNote {
  id: string;
  role: string;
  /** One-line verdict. */
  verdict: string;
  how: string[];
  mistakes: string[];
}

export const GAME_PLAN = `
<p><b>In one sentence:</b> flood the board with 6000-power Characters behind a Leader that is hard to hit, attack every turn with an Ace and a Luffy that are almost impossible to K.O. back, and finish with Edward Newgate turning every 6000 into a 7000.</p>
<h4>Why the deck works</h4>
<ul>
<li><b>Your Leader has 6000 power.</b> Most Leaders have 5000. Every enemy 5000 attacker needs an extra DON!! just to touch you, and a 6000 attack only needs 1000 of counter to stop.</li>
<li><b>Ace and Luffy are 9000 on the opponent’s turn.</b> Attack with them freely: resting them is not the risk it is for other Characters.</li>
<li><b>Everything is 6000.</b> 28 of your 50 cards are Characters with exactly 6000 power, and nearly every effect in the deck finds them, feeds on them, protects them or boosts them.</li>
</ul>
<h4>Your price</h4>
<ul>
<li><b>4 Life</b>, not 5. You are one hit closer to losing in every game.</li>
<li><b>No 7000+ base-power Characters</b>, or the Leader shrinks to 4000.</li>
<li><b>Ace and Luffy have no counter value.</b> They are bad cards to be stuck holding.</li>
</ul>
<h4>The three phases of your game</h4>
<ol>
<li><b>Set up (turns 1–2).</b> Play searchers (Inazuma, "Big Trouble") to find Ace or Luffy. Put down Little Oars Jr., Buggy or Mr.3. Take early hits — you want the cards.</li>
<li><b>Take the board (turns 3–4).</b> One 6000 body per turn, ideally Ace or Luffy with [Rush]. Use Jinbe and Ivankov to turn spare 6000s into fresh cards. Start attacking with everything except your Blockers.</li>
<li><b>Close (turn 5+).</b> Edward Newgate makes each 6000 a 7000 on your turn; Mr.3 adds rested DON!!. Three or four attacks at 7000–9000 each turn empties any hand. Keep Marco, Crocodile or Buggy active so you do not die on the swing back.</li>
</ol>`;

export const MULLIGAN = `
<h4>Keep</h4>
<ul>
<li>Any hand with a <b>searcher</b> (Inazuma or "Big Trouble") and one or two Characters costing 4–5.</li>
<li><b>Ace or Luffy</b> plus cheap plays.</li>
<li>A smooth curve: a 1-drop, a 2-drop, a 4- or 5-drop.</li>
</ul>
<h4>Mulligan</h4>
<ul>
<li>Three or more of: Edward Newgate, Crocodile. They cost 8 and 6 — you will do nothing for turns.</li>
<li>Hands that are all Events and 1-drops with no 6000 body and no searcher.</li>
<li>Five cards costing 5+ with nothing to play before turn 3.</li>
</ul>
<h4>What you are looking for</h4>
<p>In order of importance: (1) something to do on turns 1–2, (2) a 6000 body for turn 3, (3) Ace or Luffy, (4) a 2000 counter (Jozu, Mr.3) for later. Edward Newgate is a late-game card — one in the opening hand is fine, two is a burden (but excellent food for Jinbe).</p>`;

export const CURVES = `
<table class="tbl"><tr><th>Turn</th><th>Going first (DON!!)</th><th>Going second (DON!!)</th></tr>
<tr><td>1</td><td><b>1</b> — Inazuma / "Big Trouble" / Little Oars Jr.</td><td><b>2</b> — Mr.3 or Buggy, or two 1-drops</td></tr>
<tr><td>2</td><td><b>3</b> — Mr.3 or Buggy + a 1-drop</td><td><b>4</b> — Mr.2, or Ace / Luffy (no Rush)</td></tr>
<tr><td>3</td><td><b>5</b> — Ace or Luffy <i>with Rush</i>, or Jozu / Jinbe / Marco</td><td><b>6</b> — Crocodile, or Ace / Luffy with Rush + a 1-drop</td></tr>
<tr><td>4</td><td><b>7</b> — Crocodile + 1-drop, or a 5-drop + Buggy/Mr.3</td><td><b>8</b> — Edward Newgate, or Mr.2 + Ace / Luffy (4 + 4)</td></tr>
<tr><td>5</td><td><b>9</b> — Edward Newgate + 1 DON!! for a Counter Event</td><td><b>10</b> — two 5-drops, or Newgate + 2 for power</td></tr></table>
<p>Whenever the numbers leave 1 DON!! spare late in the game, consider ending the turn with it <i>active</i>: both of your [Counter] Events cost exactly 1.</p>`;

export const COMBOS: { name: string; text: string }[] = [
  { name: 'Rush for five', text: 'With 5 DON!!: play Ace or Luffy (4) and rest the 5th DON!! for [Rush]. A 6000 attacker the turn it lands — and at 9000 on the opponent’s turn, it will almost always survive to attack again.' },
  { name: 'Luffy opens the door', text: 'Attack with Luffy FIRST. His [When Attacking] rests an enemy [Blocker], so every attack after his goes through unblocked — and the rested Blocker is now a legal target for your other attackers.' },
  { name: 'Ace sets up the K.O.', text: 'Ace’s [When Attacking] gives −1000 to an enemy Character for the whole turn. Attack with Ace first, shrink a rested 7000 to 6000, then K.O. it with a plain 6000 attacker.' },
  { name: 'Mr.3 double-spend', text: 'Pay for your Characters first, then activate Mr.3: up to two of your 6000-base Characters each get up to 2 of the DON!! you just rested. That is up to +4000 power from DON!! you had already spent.' },
  { name: 'Newgate’s wall of 7000s', text: 'On your turn every 6000-base Character has 7000. Against a 5000 Leader each attack now needs 3000 of counter — two cards per attack. With four attackers that is eight cards. Nobody has eight cards.' },
  { name: 'Jinbe / Ivankov feed', text: 'Extra copies of Edward Newgate or a 6000 you cannot afford yet are fuel: Jinbe trashes one to draw 2; Ivankov reveals two (they stay in hand) to draw 3 then trash 2.' },
  { name: 'Marco never dies', text: 'When Marco is K.O.’d, trash a 6000-power Character from hand and he returns rested. He comes back ready to become active next turn as a Blocker again. Hold a spare 6000 for him when the opponent has to go through him.' },
  { name: 'Insurance', text: 'Little Oars Jr. and Buggy turn an enemy removal effect aimed at a 6000-base Character into nothing. Against Black, Blue and Purple decks, keep one of them on the board before you commit Edward Newgate.' },
  { name: 'One DON!! open', text: '"The Name of This Era Is Whitebeard!!" is +4000 for 1 DON!! if you control two 6000-base Characters. "Can You Still Fight, Luffy?!" is +3000 for 1 DON!! and draws a card if both Ace and Luffy are on your field. Ending a late turn with 1 DON!! active makes every attack on you a gamble.' },
];

export const NOTES: CardNote[] = [
  {
    id: 'ST30-001',
    role: 'Leader',
    verdict: 'A sturdy 6000 Leader that makes two specific Characters nearly unkillable.',
    how: [
      'Attack with the Leader every turn from turn 2. Leaders cannot be K.O.’d, so it is a free attack; add DON!! to make it cost the opponent cards.',
      'The +3000 applies to every card you control named Portgas.D.Ace or Monkey.D.Luffy during the opponent’s turn — rested or active.',
      'At 6000, enemy 5000 attackers fail without a DON!!, and a 6000 attack is stopped by any single counter card.',
    ],
    mistakes: [
      'Forgetting you have 4 Life and taking one hit too many. Start defending at 2 Life, not 1.',
      'Adding a 7000+ base-power Character when upgrading. The Leader drops to 4000.',
    ],
  },
  {
    id: 'ST30-002',
    role: 'Searcher',
    verdict: 'Your best turn-1 play: a body that finds a 6000.',
    how: [
      'Play on turn 1 or 2. Look at 5, take any Character with exactly 6000 power.',
      'Default pick: Ace or Luffy. If you already hold one, take what your curve is missing (a 5-drop for next turn, or Newgate late).',
      'Afterwards it is a 2000-power attacker for baiting counters, or a 1000 counter in hand.',
    ],
    mistakes: ['Holding it for later. Searchers are best early, when the card they find has the most turns to work.', 'Forgetting the other 4 cards go to the BOTTOM — they are gone for this game. Do not bottom your last Newgate if you need him.'],
  },
  {
    id: 'ST30-003',
    role: 'Finisher / engine',
    verdict: 'The reason every other card has 6000 power.',
    how: [
      'Costs 8. On your turn, ALL your 6000-base Characters get +1000 — including Newgate himself, Ace, Luffy and Characters played that turn.',
      'Play him when you already have 2–3 other 6000s on the board, so the boost is felt immediately.',
      'He has no protection of his own. Little Oars Jr. or Buggy on the field first makes him far harder to answer.',
    ],
    mistakes: ['Keeping two in your opening hand. Feed the extra to Jinbe or Marco.', 'Attacking with him into a board that can swing back 6000+ at him. He is 6000 on the opponent’s turn — consider keeping him active.'],
  },
  {
    id: 'ST30-004',
    role: 'Card filter',
    verdict: 'A 1-drop that turns a clunky hand into a good one.',
    how: [
      'Reveal two 6000-power Characters from your hand (they stay in hand) to draw 3, then trash 2 cards.',
      'You end with one more card than you started, and better ones. Trash what you cannot use soon.',
      'Without two 6000s in hand it is just a 2000 body with a 1000 counter — still a fine turn-1 play.',
    ],
    mistakes: ['Trashing 2000-counter cards (Jozu, Mr.3) late in the game when you need defence.', 'Playing it turn 1 when you could wait a turn and get the draw — if you hold other 1-drops, play those first.'],
  },
  {
    id: 'ST30-005',
    role: 'Body / 2000 counter',
    verdict: 'Plain 6000 for 5 — but one of only six 2000 counters in the deck.',
    how: ['Early: a 6000 attacker on turn 3.', 'Late: usually better kept in hand as a 2000 counter.', 'Good food for Jinbe/Marco only when your hand has other defence.'],
    mistakes: ['Playing your last Jozu onto a full board at 1 Life. Count your counters first.'],
  },
  {
    id: 'ST30-006',
    role: 'Card draw',
    verdict: 'A 6000 body that refills your hand.',
    how: ['[On Play]: trash a 6000-power Character from hand to draw 2. Net +1 card and a body on board.', 'Best fuel: a spare Edward Newgate early, a second Crocodile, or an Ace/Luffy you cannot protect.', 'The cost is optional. With no good fuel, just play him as a 6000.'],
    mistakes: ['Trashing Ace or Luffy when you have none on the board. They are the cards your Leader is built around.'],
  },
  {
    id: 'ST30-007',
    role: 'Rush attacker',
    verdict: 'One of your two star cards. Attacks immediately and survives.',
    how: [
      '4 cost, +1 DON!! for [Rush] that turn. Five DON!! total for an immediate 6000 attack.',
      '[When Attacking]: −1000 to an enemy Character for the turn. Use it to bring a rested Character into K.O. range for a later attacker, or to weaken a Blocker.',
      'On the opponent’s turn he is 9000. Attack with him every single turn.',
    ],
    mistakes: ['Holding him as a "counter" — he has none.', 'Attacking with Ace last. His −1000 lasts the whole turn, so he should usually attack first.'],
  },
  {
    id: 'ST30-008',
    role: 'Blocker / recursion',
    verdict: 'A 6000 Blocker that comes back from the trash.',
    how: [
      'Keep him active on the opponent’s turn. A 6000 Blocker stops most single attacks without spending a card.',
      '[On K.O.]: trash a 6000-power Character from hand to return him to the field rested.',
      'Returning rested means he cannot block again that turn, but he is active (and a Blocker) again on the next one.',
    ],
    mistakes: ['Attacking with him when you are low on Life. A rested Blocker blocks nothing.', 'Forgetting [On K.O.] does not trigger if he is bounced to hand or sent to the deck.'],
  },
  {
    id: 'ST30-009',
    role: 'Protection',
    verdict: 'A 1-drop bodyguard that replaces itself.',
    how: [
      'If an opponent’s EFFECT would remove one of your 6000-base Characters (K.O., bounce, deck-bottom, trash), trash Little Oars Jr. instead and draw 1.',
      'It does not stop K.O. by battle. It answers removal effects only.',
      'Four copies: play one early and keep one on the board before committing Newgate.',
    ],
    mistakes: ['Attacking with it into a board that can K.O. it. It is worth more alive than the 2000 attack is.', 'Expecting it to save a Character from losing a battle.'],
  },
  {
    id: 'ST30-010',
    role: 'Blocker / tempo',
    verdict: 'A 6000 Blocker that locks an enemy Character down for a turn.',
    how: [
      '[On Play]: choose an enemy RESTED Character. It will not become active in their next Refresh Phase.',
      'That Character cannot attack or block next turn, and stays a legal target for your attackers for two turns running.',
      'Best on their biggest attacker right after it attacked you.',
    ],
    mistakes: ['Playing him when the opponent has no rested Characters. The freeze needs a rested target — play him after they have attacked.'],
  },
  {
    id: 'ST30-011',
    role: 'Blocker / protection',
    verdict: 'Cheap Blocker and reusable insurance.',
    how: [
      '2-cost [Blocker] with 1000 power: it will lose the battle, but it eats one attack.',
      'If an enemy effect would remove your 6000-base Character, you may REST Buggy instead. Unlike Little Oars Jr. he stays on the field and can do it again next turn.',
      'He must be active to use the protection — so there is a real choice between blocking with him and saving him for removal.',
    ],
    mistakes: ['Blocking a small attack with Buggy when the opponent’s deck is full of removal effects.'],
  },
  {
    id: 'ST30-012',
    role: 'Rush attacker',
    verdict: 'Your other star. Shuts off a Blocker every time he attacks.',
    how: [
      '4 cost, +1 DON!! for [Rush]. Same deal as Ace.',
      '[When Attacking]: rest an enemy [Blocker]. That attack and all later attacks this turn cannot be blocked by it, and it becomes a target.',
      '9000 on the opponent’s turn. Attack every turn, and attack first when they have a Blocker.',
    ],
    mistakes: ['Attacking with other Characters before Luffy when the opponent has an active Blocker.'],
  },
  {
    id: 'ST30-013',
    role: 'Body',
    verdict: 'A plain 6000 for 4 — your best-rate body.',
    how: ['Turn 2 going second, or alongside a 1-drop on 5 DON!!.', 'A Green 6000, so every 6000 synergy applies.', '1000 counter in hand.'],
    mistakes: ['None in particular — it is simply efficient. It is also the first card to consider replacing when you upgrade.'],
  },
  {
    id: 'ST30-014',
    role: 'DON!! engine / 2000 counter',
    verdict: 'Lets the same DON!! pay for cards and power attacks.',
    how: [
      '[Activate: Main]: rest Mr.3 to give up to 2 of your 6000-base Characters up to 2 RESTED DON!! each.',
      'Sequence: play your cards first (that rests DON!!), then activate Mr.3, then attack.',
      'Up to +4000 power per turn for free. Also a 2000 counter if you draw him late.',
    ],
    mistakes: ['Activating him before spending DON!! (there are no rested DON!! to move yet).', 'Attacking with him. A 3000 attack is rarely worth losing the engine.'],
  },
  {
    id: 'ST30-015',
    role: 'Counter Event / Trigger',
    verdict: 'Your biggest defensive swing: +4000 for 1 DON!!.',
    how: [
      '[Counter]: needs 2+ Characters with 6000 base power on your field. +4000 to your Leader or a Character for the battle.',
      'You must have 1 DON!! ACTIVE on the opponent’s turn. Plan for it when you spend DON!!.',
      '[Trigger]: K.O. an enemy Character with 6000 power or less — free removal when it flips from Life.',
    ],
    mistakes: ['Tapping out with this in hand at low Life.', 'Counting on it with fewer than two 6000-base Characters on the board — it will do nothing.'],
  },
  {
    id: 'ST30-016',
    role: 'Counter Event',
    verdict: '+3000 for 1 DON!!, and it replaces itself with Ace and Luffy out.',
    how: ['[Counter]: +3000 to your Leader or a Character. No condition for the power.', 'If you control both an Ace and a Luffy Character (6000 base), draw 1 afterwards.', 'Works even when your board is empty, unlike the Whitebeard Event.'],
    mistakes: ['Forgetting it has no [Trigger] and no [Main]: it is a pure reactive card and useless without an active DON!!.'],
  },
  {
    id: 'ST30-017',
    role: 'Searcher (Event)',
    verdict: 'A second set of Inazumas, with a Trigger.',
    how: ['[Main]: look at 5, take a Character with exactly 6000 power.', '[Trigger]: does the same thing for free when it flips from Life.', 'With 4 of these and 2 Inazuma you see a searcher in most opening hands.'],
    mistakes: ['Playing it on a turn when the DON!! would have developed a body AND you already hold what you need.'],
  },
];

export const MATCHUPS: Record<string, { plan: string; watch: string[] }> = {
  st01: {
    plan: 'You are the control deck. Red starter is fast and hits hard with DON!!-boosted attackers, but its Characters are small. Stabilise behind your 6000 Leader and Blockers, K.O. what attacks you, then take over with bigger bodies.',
    watch: ['Their Luffy Leader hands out extra DON!!, so expect bigger attacks than their board suggests.', 'They have cheap K.O. Events for small Characters — do not rely on Buggy as your only Blocker.', 'Take early hits, but defend from 2 Life: they can produce several attacks a turn.'],
  },
  st02: {
    plan: 'A tempo fight. Green rests your Characters so they become targets, and stands its own back up to attack twice. Your Ace and Luffy shrug this off at 9000; your plain 6000s do not.',
    watch: ['Any Character of yours can be rested by their effects, so anything can be attacked. Keep 6000s that matter behind Ace/Luffy.', 'Kid readying himself means two Leader attacks in one turn. Count attacks before deciding you are safe.', 'Crocodile’s freeze is excellent here: lock their best attacker.'],
  },
  st03: {
    plan: 'You are the aggressor. Blue wins by returning your expensive Characters to hand, making you pay twice. Do not give them good targets, and keep pressure on their Life so their answers cost them tempo.',
    watch: ['Little Oars Jr. and Buggy stop bounce effects on 6000-base Characters. Have one out before you play Newgate.', 'Cheap Characters are bad bounce targets — bouncing your 1-drop barely hurts.', 'They draw a lot; do not try to out-card them. Win on the board.'],
  },
  st04: {
    plan: 'Race. Purple is weak for the first few turns while it ramps DON!!, then lands huge Characters with K.O. effects. Hit their Life early and often; make them use DON!! on defence instead of ramp.',
    watch: ['Kaido’s Leader ability (DON!! −7) trashes one of your Life cards outright — no card for you, no counter possible. With 4 Life, that clock is short.', 'Their big bodies outclass your 6000s one-for-one. Do not trade evenly — go around them at the Leader.', 'K.O. effects are "removed by an effect": Little Oars Jr. and Buggy protect your 6000s.', 'If the game reaches turn 6+ with them at 3+ Life, you are losing. Push.'],
  },
  st06: {
    plan: 'The removal test. Black lowers your Characters’ cost and K.O.s by cost, ignoring power completely. This is the matchup your protection cards were made for.',
    watch: ['Never commit Edward Newgate without Little Oars Jr. or an active Buggy alongside.', 'Spread your threats: several 6000s are harder to remove than one key card.', 'They have fewer ways to gain card advantage — if your board survives, you win the long game.'],
  },
  st07: {
    plan: 'Careful aggression. Yellow has Triggers in its Life and attackers with [Double Attack] and [Banish]. Every Life card you hit might fire a free effect at you.',
    watch: ['Assume every Life card is a Trigger: attack the Leader with your least valuable attacker first.', 'Their [Double Attack] takes 2 of your 4 Life at once. Defend those hits even early.', '[Banish] gives you no card for the Life you lose. Stop it if it is cheap.'],
  },
};

export const WEAKNESSES: string[] = [
  '4 Life. You cannot afford to take hits as casually as 5-Life decks.',
  'Only 6 cards with a 2000 counter (Jozu ×4, Mr.3 ×2). Defence from hand is expensive.',
  'Ace and Luffy (4 cards) have no counter value at all; 10 Events have none either.',
  'Almost no removal: only Ace’s −1000 and the Whitebeard [Trigger].',
  'A gap at 3 cost and a pile of 5-drops: with 3 or 7 DON!! you often have an awkward leftover DON!!.',
  'Synergy-dependent: without 6000-power Characters in hand, Jinbe, Ivankov and Marco are just bodies.',
];
