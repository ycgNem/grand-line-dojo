// The curriculum: rules -> strategy -> deck building -> competing.
// Lesson bodies are trusted, hand-written HTML.

export interface Question {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Lesson {
  id: string;
  track: TrackId;
  title: string;
  summary: string;
  body: string;
  quiz: Question[];
}

export type TrackId = 'rules' | 'strategy' | 'building' | 'competing';

export const TRACKS: { id: TrackId; name: string; blurb: string }[] = [
  { id: 'rules', name: '1 · Learn the rules', blurb: 'Everything you need to play a legal game, in the order you meet it at the table.' },
  { id: 'strategy', name: '2 · Play well', blurb: 'The ideas that separate winning players from players who merely know the rules.' },
  { id: 'building', name: '3 · Build decks', blurb: 'How decks are put together, and how to build and tune your own.' },
  { id: 'competing', name: '4 · Compete', blurb: 'Formats, the metagame, tournament habits and how to keep improving.' },
];

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ RULES
  {
    id: 'r1',
    track: 'rules',
    title: 'The goal and the table',
    summary: 'How you win, and what every zone on the table is for.',
    body: `
<p>Each player has a <b>Leader</b> who is always on the table, a <b>50-card deck</b>, and a separate deck of <b>10 DON!! cards</b>. You win by attacking the opposing Leader.</p>
<h4>How you win</h4>
<ul>
<li>Each Leader starts with a pile of face-down <b>Life</b> cards (4 or 5, printed on the Leader). Every time a Leader takes damage, its owner takes the top Life card into their hand.</li>
<li><b>If a Leader takes damage when it has 0 Life cards left, that player loses.</b> So against a 5-Life Leader you need 6 successful hits; against your 4-Life Luffy &amp; Ace the opponent needs 5.</li>
<li>You also lose if your <b>deck runs out of cards</b>.</li>
</ul>
<h4>The zones</h4>
<ul>
<li><b>Leader area</b> – your Leader. It can attack and be attacked, and can never be K.O.'d or removed.</li>
<li><b>Character area</b> – up to <b>5</b> Characters you have played. They attack, block and use effects.</li>
<li><b>Stage area</b> – at most 1 Stage card (an ongoing location effect).</li>
<li><b>Cost area</b> – your DON!! cards. This is your "mana".</li>
<li><b>Hand</b>, <b>Deck</b>, <b>Trash</b> (discard pile, face-up, anyone may look), <b>Life</b>, and the <b>DON!! deck</b>.</li>
</ul>
<h4>Active and rested</h4>
<p>A card standing upright is <b>active</b>. A card turned sideways is <b>rested</b>. Attacking rests the attacker; paying costs rests DON!!. Rested cards become active again at the start of your next turn. The single most important consequence: <b>only rested Characters can be attacked</b>. A Character that never attacks is safe from battle.</p>
<div class="key">Life cards are not just hit points. Each one you lose goes to your <i>hand</i>, so taking a hit gives you a card. That trade — Life for cards — sits at the heart of the whole game.</div>`,
    quiz: [
      { q: 'Your opponent’s Leader has 5 Life. How many successful attacks on that Leader do you need to win?', options: ['4', '5', '6', '10'], answer: 2, why: 'Five hits remove the five Life cards; the sixth hit lands with 0 Life left and wins the game.' },
      { q: 'Which of your opponent’s Characters can you attack?', options: ['Any of them', 'Only rested ones', 'Only active ones', 'Only ones with less power than your attacker'], answer: 1, why: 'Attacks can target the opposing Leader or a RESTED Character. Active Characters cannot be attacked.' },
      { q: 'What happens to a Life card when your Leader takes damage?', options: ['It goes to the trash', 'It goes to the bottom of your deck', 'It goes to your hand', 'Your opponent takes it'], answer: 2, why: 'It goes to your hand (unless it has a [Trigger] you choose to activate, or the attacker has [Banish]).' },
    ],
  },
  {
    id: 'r2',
    track: 'rules',
    title: 'Reading a card',
    summary: 'Cost, power, counter, colour, attribute, type and effect text.',
    body: `
<p>Every number and word on a card matters. Open any card in the <b>Card Library</b> while you read this.</p>
<ul>
<li><b>Cost</b> (top-left): how many DON!! you must rest to play it. Leaders show their <b>Life</b> here instead.</li>
<li><b>Power</b> (top-right): the number compared in battle. Leaders are usually 5000; Characters run from 0 to 12000+.</li>
<li><b>Counter</b> (side of a Character): +1000 or +2000. You may <i>trash this card from your hand</i> during an opponent’s attack to add that much power to the card being attacked. Some Characters have no counter value.</li>
<li><b>Colour</b>: Red, Green, Blue, Purple, Black or Yellow. Your deck may only contain cards that share a colour with your Leader.</li>
<li><b>Attribute</b>: Strike, Slash, Special, Ranged or Wisdom. Only matters when another card refers to it.</li>
<li><b>Type</b> (bottom): crews and groups such as "Whitebeard Pirates". Many effects search for or reward a type.</li>
<li><b>Card number</b> (e.g. ST30-005): the deck limit is 4 copies <i>per card number</i>, and different numbers with the same name are different cards.</li>
<li><b>Effect text</b>: starts with a timing in [brackets] telling you <i>when</i> it happens.</li>
</ul>
<h4>The four card categories</h4>
<ul>
<li><b>Leader</b> – one per deck, starts in play.</li>
<li><b>Character</b> – stays on the field, attacks and defends.</li>
<li><b>Event</b> – a one-shot effect, then it goes to the trash. [Main] Events are played on your turn; [Counter] Events are played during the opponent’s attack.</li>
<li><b>Stage</b> – stays on the field with an ongoing or repeatable effect; cannot attack or be attacked.</li>
</ul>
<div class="key"><b>Base power</b> means the printed number. <b>Power</b> means the current total after DON!! and effects. Your ST-30 deck cares about the difference: Edward Newgate boosts Characters with 6000 <i>base</i> power, so they still count as 6000-base after they are boosted to 7000.</div>`,
    quiz: [
      { q: 'What does a Character’s Counter value do?', options: ['Adds power when it attacks', 'Lets you trash it from hand to add power to a card being attacked', 'Reduces its cost', 'Counts how many times it can attack'], answer: 1, why: 'Counter is a defensive value used from your hand during the opponent’s attack.' },
      { q: 'You own ST01-012 Monkey.D.Luffy and ST30-012 Monkey.D.Luffy. How many of each may a deck contain?', options: ['4 Luffys in total', '4 of each (8 total)', '2 of each', 'Only one of the two'], answer: 1, why: 'The limit is 4 per card NUMBER. Same name with different numbers are different cards.' },
      { q: 'Edward Newgate gives +1000 to Characters with 6000 base power. Jozu (6000) already has 2 DON!! attached. Does Jozu get the bonus?', options: ['No, Jozu now has 8000 power', 'Yes, base power is the printed number', 'Only on the opponent’s turn', 'Only if Newgate attacks'], answer: 1, why: 'Base power ignores DON!! and effects. Jozu is still a 6000-base Character.' },
    ],
  },
  {
    id: 'r3',
    track: 'rules',
    title: 'Setup and the turn',
    summary: 'Mulligans, Life, the five phases and the first-turn exceptions.',
    body: `
<h4>Setup</h4>
<ol>
<li>Put your Leader face-up. Shuffle your 50-card deck. Decide who goes first.</li>
<li>Each player draws <b>5</b> cards. Each player may <b>mulligan once</b>: shuffle all 5 back and draw 5 new ones. You must keep the new hand.</li>
<li>Each player then puts cards from the top of their deck face-down as <b>Life</b>, equal to the number on their Leader.</li>
</ol>
<h4>A turn has five phases</h4>
<ol>
<li><b>Refresh</b> – DON!! attached to your cards return to your cost area, then all your rested cards become active.</li>
<li><b>Draw</b> – draw 1 card.</li>
<li><b>DON!!</b> – move 2 DON!! from your DON!! deck to your cost area.</li>
<li><b>Main</b> – in any order and as often as you can afford: play cards, attach DON!!, use effects, and attack.</li>
<li><b>End</b> – "until end of turn" effects wear off.</li>
</ol>
<h4>First-turn exceptions</h4>
<ul>
<li>The player going first <b>does not draw</b> on their first turn and gets only <b>1 DON!!</b>.</li>
<li><b>Neither player may attack on their own first turn.</b></li>
</ul>
<h4>The DON!! curve</h4>
<table class="tbl"><tr><th>Your turn #</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>
<tr><td>Going first</td><td>1</td><td>3</td><td>5</td><td>7</td><td>9</td><td>10</td></tr>
<tr><td>Going second</td><td>2</td><td>4</td><td>6</td><td>8</td><td>10</td><td>10</td></tr></table>
<p>Going first you have <i>odd</i> amounts of DON!!; going second, <i>even</i>. That decides which cards you can play on curve, and it is one reason some decks prefer one seat over the other.</p>
<div class="key">The Main Phase has no fixed order. You can attack, then play a Character, then attack again. Good players choose the order on purpose — you will study that in the strategy track.</div>`,
    quiz: [
      { q: 'You go first. How many DON!! do you have on your second turn?', options: ['2', '3', '4', '5'], answer: 1, why: '1 on the first turn, then +2 each turn: 1, 3, 5, 7, 9, 10.' },
      { q: 'Who can attack on their first turn?', options: ['Only the player going first', 'Only the player going second', 'Both', 'Neither'], answer: 3, why: 'Neither player can attack on their own first turn.' },
      { q: 'What happens in the Refresh Phase?', options: ['You draw a card', 'Attached DON!! return to the cost area and your rested cards become active', 'You gain 2 DON!!', 'You discard down to 7 cards'], answer: 1, why: 'Refresh returns DON!! and stands your cards up. There is no maximum hand size in this game.' },
    ],
  },
  {
    id: 'r4',
    track: 'rules',
    title: 'DON!! — the engine of the game',
    summary: 'One resource, two jobs: paying costs and adding power.',
    body: `
<p>DON!! is the cleverest part of the One Piece Card Game. You never miss a "land drop": you gain 2 DON!! every turn, up to 10. What matters is how you <i>use</i> them. Each DON!! can do one of two jobs each turn:</p>
<ol>
<li><b>Pay a cost</b> – rest DON!! equal to a card’s cost to play it (or to pay for an effect).</li>
<li><b>Add power</b> – take an <i>active</i> DON!! and attach it to your Leader or one of your Characters. Each attached DON!! gives <b>+1000 power, during your turn only</b>.</li>
</ol>
<h4>Rules to remember</h4>
<ul>
<li>You may attach DON!! at any time in your Main Phase, including between attacks, but not in the middle of a battle. Attach <i>before</i> you declare the attack.</li>
<li>Attached DON!! give nothing on your opponent’s turn. A 6000 Character with 3 DON!! is still 6000 when it is attacked.</li>
<li>In your Refresh Phase, attached DON!! come back to your cost area. Nothing is lost.</li>
<li>If a Character leaves the field, its attached DON!! return to your cost area <b>rested</b>.</li>
<li><b>[DON!! xN]</b> effects only work while N DON!! are attached to that card.</li>
<li><b>DON!! −N</b> is a cost that returns DON!! to the DON!! deck — you have fewer next turn (Purple’s speciality).</li>
</ul>
<div class="key">Every turn, ask: "Did I use all my DON!!?" Ten DON!! spent on cards and power beats eight every time. Your ST-30 deck has a card built around this idea — <b>Mr.3</b> moves DON!! you already <i>rested to pay costs</i> onto your attackers, so the same DON!! does both jobs.</div>`,
    quiz: [
      { q: 'Your Jozu (6000) has 2 DON!! attached. The opponent attacks it on their turn. What is Jozu’s power?', options: ['8000', '7000', '6000', '4000'], answer: 2, why: 'Attached DON!! only add power during YOUR turn.' },
      { q: 'You have 5 active DON!!. You play a 4-cost Character and attach the rest. What is true?', options: ['You have 1 DON!! to attach for +1000', 'You have 5 DON!! to attach', 'You cannot attach DON!! after playing a card', 'Attaching costs 2 DON!! each'], answer: 0, why: '4 DON!! are rested to pay the cost; the 1 remaining active DON!! can be attached.' },
      { q: 'When can you attach DON!! to a card?', options: ['Only at the start of the turn', 'Any time in your Main Phase, but not during a battle', 'Only during the Counter Step', 'Only before playing cards'], answer: 1, why: 'Any time in your Main Phase outside of a battle — so decide the attack’s size before declaring it.' },
    ],
  },
  {
    id: 'r5',
    track: 'rules',
    title: 'Battle, step by step',
    summary: 'Attack, Block, Counter, Damage — and who wins a tie.',
    body: `
<ol>
<li><b>Attack Step</b> – rest one of your active cards (Leader or Character) and choose a target: the <b>opposing Leader</b> or one of their <b>rested Characters</b>. [When Attacking] effects happen now.</li>
<li><b>Block Step</b> – the defender may rest one active <b>[Blocker]</b> Character; it becomes the new target.</li>
<li><b>Counter Step</b> – the defender may add power to the target for this battle: trash Characters from hand for their Counter value, and/or play [Counter] Events (paying their DON!! cost). Any number, in any order.</li>
<li><b>Damage Step</b> – compare powers. <b>If the attacker’s power is equal or higher, the attack succeeds.</b> Ties go to the attacker.</li>
</ol>
<ul>
<li>Success against a <b>Leader</b>: 1 damage. The defender takes the top Life card into hand (or loses, at 0 Life).</li>
<li>Success against a <b>Character</b>: it is K.O.'d and goes to the trash.</li>
<li>Failure: nothing happens. The attacker is <i>not</i> harmed — there is no "combat damage" back at the attacker.</li>
</ul>
<h4>Things beginners get wrong</h4>
<ul>
<li>A Character cannot attack on the turn it is played (unless it has [Rush]). It <i>can</i> block and be given DON!!.</li>
<li>The attacker’s power is locked in before the defender decides. The defender always answers with full information.</li>
<li>Counter power lasts for that one battle only.</li>
<li>Each card can attack once per turn (attacking rests it).</li>
</ul>
<div class="key"><b>The key number:</b> to stop an attack the defender must make their power <i>higher</i> than the attacker’s. So the counter needed is <code>attack − defence + 1000</code>. A 7000 attack on a 5000 Leader needs 3000 of counter.</div>`,
    quiz: [
      { q: 'A 6000 Character attacks a 6000 Leader with no block or counter. What happens?', options: ['Nothing, it is a tie', 'The attack succeeds', 'Both take damage', 'The attacker is K.O.’d'], answer: 1, why: 'Equal power is enough. Ties go to the attacker.' },
      { q: 'An 8000 attack hits your 5000 Leader. How much counter do you need to stop it?', options: ['2000', '3000', '4000', '8000'], answer: 2, why: '8000 − 5000 + 1000 = 4000. You must get to 9000, strictly higher than 8000.' },
      { q: 'Your 3000 Character attacks a 7000 Character and fails. What happens to your Character?', options: ['It is K.O.’d', 'It loses 1 DON!!', 'Nothing — it is just rested', 'It returns to your hand'], answer: 2, why: 'Failed attacks do not hurt the attacker. But it is now rested, so it can be attacked next turn.' },
    ],
  },
  {
    id: 'r6',
    track: 'rules',
    title: 'Keywords and timings',
    summary: 'The bracketed words that tell you when and how effects work.',
    body: `
<h4>Keyword abilities</h4>
<ul>
<li><b>[Rush]</b> – can attack on the turn it is played.</li>
<li><b>[Blocker]</b> – when another of your cards is attacked, you may rest this Character to make it the target instead.</li>
<li><b>[Double Attack]</b> – deals 2 damage to a Leader instead of 1. It does <i>not</i> win against a Leader on exactly 1 Life: the last Life card is taken and the second damage is lost.</li>
<li><b>[Banish]</b> – Life cards it damages are trashed instead of going to hand (and their [Trigger] cannot be used).</li>
<li><b>[Trigger]</b> – when this card is taken from your Life as damage, you may reveal it and use its Trigger effect for free <i>instead of</i> adding it to your hand. It is then trashed.</li>
</ul>
<h4>Timings</h4>
<ul>
<li><b>[On Play]</b> – when the card is played from hand (or put into play by an effect).</li>
<li><b>[When Attacking]</b> – when it declares an attack, before blocks and counters.</li>
<li><b>[On K.O.]</b> – when it is K.O.'d, by battle or effect.</li>
<li><b>[On Block]</b> – when it blocks.</li>
<li><b>[Activate: Main]</b> – you choose to use it during your Main Phase.</li>
<li><b>[Main]</b> / <b>[Counter]</b> – on Events: when the Event may be played.</li>
<li><b>[Your Turn]</b> / <b>[Opponent’s Turn]</b> – the effect only applies during that turn.</li>
<li><b>[End of Your Turn]</b> – happens in your End Phase.</li>
<li><b>[Once Per Turn]</b> – that effect can be used only once each turn.</li>
<li><b>[DON!! xN]</b> – needs N DON!! attached to this card.</li>
</ul>
<h4>Costs and "may"</h4>
<p>Text shaped like <code>You may [cost]: [effect]</code> means the cost is optional, but you only get the effect if you pay it. A circled number (①) means "rest that many DON!!". "<b>Up to</b> 1" means you may choose zero.</p>
<div class="key">Three words that are <i>not</i> the same: <b>K.O.</b> (sent to trash, triggers [On K.O.]), <b>trash</b> (sent to trash, does <i>not</i> count as a K.O.), and <b>return to hand / deck</b> (not a K.O. either). Effects that say "cannot be K.O.'d" do not stop a bounce.</div>`,
    quiz: [
      { q: 'Marco has [On K.O.]. Your opponent returns Marco to your hand with an effect. Does [On K.O.] trigger?', options: ['Yes', 'No', 'Only on your turn', 'Only if he was rested'], answer: 1, why: 'Returning to hand is not a K.O.' },
      { q: 'You take damage and reveal a Life card with [Trigger]. What are your options?', options: ['You must use the Trigger', 'Use the Trigger (card is trashed) OR add the card to your hand', 'Use the Trigger and also keep the card', 'Shuffle it back'], answer: 1, why: 'It is a choice: the free effect, or the card in hand.' },
      { q: 'A Character with [Blocker] attacked during your turn. Can it block on the opponent’s turn?', options: ['Yes', 'No — it is rested', 'Only against Characters', 'Only once per game'], answer: 1, why: 'Blocking requires resting an ACTIVE Blocker. Attacking with a Blocker gives up its block.' },
    ],
  },
  {
    id: 'r7',
    track: 'rules',
    title: 'The fine print',
    summary: 'Field limits, deck-out, impossible actions and other edge rules.',
    body: `
<ul>
<li><b>Five Characters maximum.</b> To play a sixth you must first trash one of your five. This is not a K.O., so [On K.O.] does not trigger.</li>
<li><b>One Stage.</b> Playing a new one trashes the old one.</li>
<li><b>No maximum hand size.</b></li>
<li><b>Deck-out.</b> If your deck has no cards, you lose. Search-and-draw decks must watch their deck count late in long games.</li>
<li><b>Do as much as you can.</b> If an effect says "draw 2" and you can only draw 1, you draw 1. But a <i>cost</i> must be paid in full or not at all.</li>
<li><b>"Cannot" beats "can".</b> If one effect says something cannot happen and another says it can, it cannot.</li>
<li><b>Simultaneous effects.</b> When several effects trigger together, the turn player’s resolve first.</li>
<li><b>The trash is public.</b> You may look through either trash at any time. Hands, decks and face-down Life are hidden.</li>
<li><b>Looking at the top of your deck.</b> "Place the rest at the bottom in any order" really does mean any order — and those cards are effectively gone for the game, which matters when you count what is left.</li>
<li><b>Replacement effects</b> use the word "instead". Your Little Oars Jr. says: if your 6000-base Character <i>would be</i> removed by an opponent’s effect, trash Little Oars Jr. <i>instead</i>. The removal never happens.</li>
</ul>
<div class="key">When a real game gets confusing, read the card slowly, in order, and do exactly what it says. In this simulator, click any card to see its full text and what each keyword means — and every rule the engine enforces is explained in the log.</div>`,
    quiz: [
      { q: 'You have 5 Characters and play a 6th, trashing your Marco to make room. Does Marco’s [On K.O.] trigger?', options: ['Yes', 'No — trashing for the limit is not a K.O.', 'Only if you have a 6000 Character in hand', 'Only on your turn'], answer: 1, why: 'Trashing to make room is not a K.O.' },
      { q: 'What is the maximum hand size?', options: ['7', '10', 'There is none', '5'], answer: 2, why: 'There is no maximum hand size in the One Piece Card Game.' },
      { q: 'An effect says "trash 2 cards from your hand: draw 3" but you have 1 card in hand. What happens?', options: ['Trash 1, draw 3', 'Trash 1, draw 1', 'You cannot pay, so you get nothing', 'Draw 3 for free'], answer: 2, why: 'Costs must be paid in full. No payment, no effect.' },
    ],
  },

  // ------------------------------------------------------------------ STRATEGY
  {
    id: 's1',
    track: 'strategy',
    title: 'Tempo: spend every DON!!',
    summary: 'The player who uses their resources more fully usually wins.',
    body: `
<p><b>Tempo</b> is how much you get done each turn. Both players receive the same DON!!. Whoever converts more of it into board, cards and damage pulls ahead.</p>
<h4>The DON!! checklist (every turn)</h4>
<ol>
<li><b>Plan the whole turn before your first click.</b> How much DON!! for cards? How much for power? Do you need to keep 1 active for a [Counter] Event?</li>
<li><b>Play on curve.</b> With 5 DON!!, a 5-cost Character is usually better than a 2-cost and three wasted DON!!.</li>
<li><b>Leftover DON!! goes on attackers</b> — before they attack.</li>
<li><b>Ending the turn with active DON!! is only right when you plan to use it</b> on a [Counter] Event during the opponent’s turn.</li>
</ol>
<h4>Development vs. power</h4>
<p>Early (turns 1–3), spend DON!! on <b>cards</b>. A Character attacks every turn for the rest of the game; an attached DON!! is +1000 once. Later, once your hand is thin or you are pushing for the win, shift DON!! to <b>power</b>.</p>
<h4>In your ST-30 deck</h4>
<ul>
<li><b>Ace and Luffy</b> cost 4 and may pay 1 more DON!! for [Rush]. With exactly 5 DON!! (your 3rd turn going first), that is a 6000 attacker with immediate impact.</li>
<li><b>Mr.3</b> gives rested DON!! to your 6000-base Characters. Play your cards first (resting DON!!), <i>then</i> activate Mr.3 to turn up to 4 of those spent DON!! into +4000 power.</li>
</ul>
<div class="key">After each game, the review shows your "DON!! left unused". Under 0.5 per turn is the target. This one number improves faster than any other skill.</div>`,
    quiz: [
      { q: 'You have 5 DON!! on turn 3 and hold a 5-cost Jozu and a 2-cost Buggy. Usually best?', options: ['Play Buggy, attach 3 to the Leader', 'Play Jozu', 'Play nothing, save DON!!', 'Play Buggy and pass with 3 DON!!'], answer: 1, why: 'Early on, develop the biggest body you can afford. Jozu attacks every turn from now on.' },
      { q: 'When is it correct to end your turn with active DON!!?', options: ['Always keep 2', 'Never', 'When you intend to play a [Counter] Event on the opponent’s turn', 'When you have 10 DON!!'], answer: 2, why: 'Unspent DON!! is only useful for [Counter] Events (or to bluff one).' },
      { q: 'What is the right order with Mr.3?', options: ['Activate Mr.3, then play cards', 'Play cards (resting DON!!), activate Mr.3, then attack', 'Attack, then activate Mr.3', 'It does not matter'], answer: 1, why: 'Mr.3 moves RESTED DON!!. Rest them by paying for cards first, then give them to attackers before attacking.' },
    ],
  },
  {
    id: 's2',
    track: 'strategy',
    title: 'Counter maths and attack sizing',
    summary: 'Size each attack so that stopping it costs the defender the most.',
    body: `
<p>The defender needs <code>attack − defence + 1000</code> counter. Counter comes mostly in 1000s and 2000s, one card each. So the real question is: <b>how many cards does this attack cost them?</b></p>
<table class="tbl"><tr><th>Your attack vs a 5000 Leader</th><th>Counter needed</th><th>Typical cost to defend</th></tr>
<tr><td>5000</td><td>1000</td><td>1 card (any counter)</td></tr>
<tr><td>6000</td><td>2000</td><td>1 card (a 2000) or 2 cards</td></tr>
<tr><td>7000</td><td>3000</td><td>2 cards</td></tr>
<tr><td>8000</td><td>4000</td><td>2 cards (two 2000s) or 3</td></tr>
<tr><td>9000</td><td>5000</td><td>3 cards</td></tr></table>
<h4>What this tells you</h4>
<ul>
<li><b>+2000 over the defender is the first big breakpoint</b>: it always costs two cards. One extra DON!! on a 6000 attacker (making 7000 into a 5000 Leader) doubles the price of defending.</li>
<li><b>Many medium attacks usually beat one huge attack.</b> Three 7000 swings ask for 6 cards. One 13000 swing asks for 9000 — about 5 cards — or simply 1 Life.</li>
<li><b>But one huge attack is right when the hit itself matters</b>: for lethal, or with [Double Attack].</li>
<li><b>Against your Leader</b> (6000), the opponent’s plain 5000 attackers fail without help. Your Leader taxes every attack by 1 DON!!.</li>
</ul>
<h4>Defending</h4>
<ul>
<li>Use the <b>fewest cards</b> that work, and prefer to spend the cards that are worst on the board.</li>
<li>Do not over-counter. 1000 over is enough; the attacker’s power cannot change during the battle.</li>
<li>Counter value is hidden information. If you always keep cards in hand, opponents must respect them.</li>
</ul>
<div class="key">Try the <b>Counter Maths drill</b> in the Drills tab until the arithmetic is instant. In real games you get no calculator and limited time.</div>`,
    quiz: [
      { q: 'You attack a 5000 Leader. Which attack size first forces at least 2 counter cards?', options: ['5000', '6000', '7000', '9000'], answer: 2, why: '7000 needs 3000 of counter, which no single ordinary Character counter provides.' },
      { q: 'Your 6000 Leader is attacked for 7000. You hold counters of 2000, 1000 and 1000. Cheapest defence?', options: ['2000 + 1000', '1000 + 1000', '2000 only', 'All three'], answer: 2, why: 'You need 7000 − 6000 + 1000 = 2000. The single 2000 does it with one card.' },
      { q: 'You have 3 attackers and 3 spare DON!!. The opponent has 5 cards in hand and 3 Life. Usually best?', options: ['All 3 DON!! on one attacker', '1 DON!! on each attacker', 'Attach none', 'Attack once and pass'], answer: 1, why: 'Spreading makes every attack cost more to stop. Stack power on one attack mainly when that single hit must land.' },
    ],
  },
  {
    id: 's3',
    track: 'strategy',
    title: 'Life is a resource',
    summary: 'When to take a hit, when to defend, and what Life really buys you.',
    body: `
<p>New players defend everything. Strong players often take early hits on purpose. Each hit you take <b>adds a card to your hand</b>; each attack you counter <b>removes cards from your hand</b>. The swing between the two is 2–3 cards.</p>
<h4>A simple policy</h4>
<table class="tbl"><tr><th>Your Life after the hit would be</th><th>Default</th></tr>
<tr><td>3 or more</td><td>Take it. Save your hand.</td></tr>
<tr><td>2</td><td>Defend only if it is cheap (1 card).</td></tr>
<tr><td>1</td><td>Defend if it costs 2 cards or fewer.</td></tr>
<tr><td>0</td><td>Defend seriously — every later attack is lethal.</td></tr>
<tr><td>Dead</td><td>Spend everything.</td></tr></table>
<h4>Exceptions</h4>
<ul>
<li><b>[Double Attack]</b> and <b>[Banish]</b> hits are worth stopping earlier: you lose more and gain less.</li>
<li><b>Protect valuable Characters</b> only when it is cheap. A 1000 counter to save an 8-cost Edward Newgate is a bargain; three cards to save a Jozu is not.</li>
<li><b>4-Life Leaders</b> (like yours) have one fewer hit to give. Start defending one hit earlier than a 5-Life deck would.</li>
</ul>
<h4>The attacker’s side of the same coin</h4>
<p>Every Life you take <i>gives the opponent a card</i> — and maybe a [Trigger]. That is fine when you are racing, but slower decks sometimes leave the Leader alone early, build a board, K.O. Characters, and then take all the Life in two big turns when the opponent’s hand is empty.</p>
<div class="key">Think of your Life pile as cards you have not drawn yet. Losing the first two is usually good for you. Losing the last one is how you die.</div>`,
    quiz: [
      { q: 'You are at 4 Life on turn 3. A 6000 attack hits your 6000 Leader. You hold two 1000 counters. Usually best?', options: ['Counter with both', 'Counter with one', 'Take the hit', 'Concede'], answer: 2, why: 'At 4 Life the hit is not dangerous and it gives you a card. One 1000 counter would stop it, but then you are a card down instead of a card up — save counters for when your Life is low.' },
      { q: 'Why is a [Banish] attack worth stopping sooner?', options: ['It deals 3 damage', 'The Life card is trashed, so you get no card for it', 'It cannot be blocked', 'It K.O.s your Leader'], answer: 1, why: 'With Banish you lose the Life and gain nothing.' },
      { q: 'You are at 1 Life. Which attack matters most to stop?', options: ['The one that would take your last Life', 'None until 0 Life', 'Only attacks on Characters', 'Only the first attack each turn'], answer: 0, why: 'At 0 Life every remaining attack is lethal, so the hit that takes you to 0 is the one to fight over — especially if more attackers are waiting.' },
    ],
  },
  {
    id: 's4',
    track: 'strategy',
    title: 'Attack order',
    summary: 'The order of your attacks changes what the defender can do about them.',
    body: `
<p>You choose the order of everything in your Main Phase. Use that.</p>
<h4>Principles</h4>
<ol>
<li><b>Effects and development first, unless there is a reason not to.</b> Searchers, draw effects and [On Play] abilities give you information before you commit to attacks.</li>
<li><b>Attach DON!! one attack at a time.</b> You may attach between attacks, so do not commit all your DON!! up front. See how the defender reacts to the first attack, then size the next.</li>
<li><b>Bait [Blocker]s with small attacks.</b> If they block the small one, the big one goes through. If they do not block, you took a Life for free.</li>
<li><b>Remove or rest Blockers before the key attack.</b> Your Luffy rests a Blocker when attacking — swing with Luffy first to open the way for everyone else.</li>
<li><b>Attack Characters before the Leader when the K.O. matters</b> — the defender has not yet received Life cards (new counters) from your Leader hits.</li>
<li><b>Attack the Leader first when hand size matters less than damage</b> — e.g. when going for lethal you want them to spend counters early.</li>
<li><b>Keep your Blockers active.</b> A Blocker that attacks cannot block.</li>
</ol>
<h4>The order of defence, too</h4>
<p>When several attacks are coming, decide <i>in advance</i> which ones you will stop. Spending two cards on the first attack and then being unable to stop the lethal third is the classic mistake.</p>
<div class="key">Ask before every attack: "If this is stopped, was it still worth it? If it is not stopped, what do I gain?" An attack that makes the opponent choose between two bad options is a good attack.</div>`,
    quiz: [
      { q: 'The opponent has one active [Blocker]. You have a 5000 and a 9000 attacker. Which first?', options: ['9000 first', '5000 first', 'It does not matter', 'Do not attack'], answer: 1, why: 'Offer the small attack first. If they block it, the 9000 is unblocked; if not, you take a Life with your weak attacker.' },
      { q: 'Why attach DON!! one attack at a time?', options: ['It is required by the rules', 'You learn how the defender reacts before committing more', 'DON!! expire', 'To hide your hand'], answer: 1, why: 'Information. If the first attack is not countered, you may want the remaining DON!! elsewhere.' },
      { q: 'You want to K.O. a rested Character AND hit the Leader. Which first, usually?', options: ['The Character', 'The Leader', 'Whichever is bigger', 'Neither'], answer: 0, why: 'Hitting the Leader hands them a Life card that may be the counter that saves their Character.' },
    ],
  },
  {
    id: 's5',
    track: 'strategy',
    title: 'Board or face?',
    summary: 'When to K.O. Characters and when to go for the Leader.',
    body: `
<p>Every attack goes at the Leader ("face") or at a rested Character ("board"). Choosing well is most of mid-game skill.</p>
<h4>Attack the board when…</h4>
<ul>
<li>the Character will hurt you for many turns (a big attacker, an engine like your Edward Newgate, a card with a strong [Activate: Main]);</li>
<li>you can K.O. it cheaply — it is rested and its power is low;</li>
<li>you are ahead on Life and want to grind the opponent out of resources;</li>
<li>hitting the Leader would feed a hand that is nearly empty.</li>
</ul>
<h4>Attack face when…</h4>
<ul>
<li>you are racing — the opponent’s late game beats yours;</li>
<li>their Characters are not worth an attack (a 2000 searcher that has already done its job);</li>
<li>they are low on Life: every hit forces counters or ends the game;</li>
<li>their hand is large and their board is what protects them — do not let them trade evenly.</li>
</ul>
<h4>Protecting your own board</h4>
<ul>
<li><b>A Character that attacks becomes a target.</b> Before attacking, check what the opponent can swing back with.</li>
<li>With your Leader, <b>Ace and Luffy are 9000 on the opponent’s turn</b>. They are the safest attackers in your deck — attack with them every turn.</li>
<li>Plain 6000s (Jozu, Mr.2, Jinbe) are K.O.'d by any 6000+ attack. Attack with them when the damage is worth the risk, or when the opponent has nothing big enough.</li>
<li>Effects that remove Characters without a battle ignore power. <b>Little Oars Jr.</b> and <b>Buggy</b> are your insurance against those.</li>
</ul>
<div class="key">A useful question: "Who is the beatdown?" In every matchup one deck wins by going faster and the other by lasting longer. If you are the faster deck, go face. If you are the slower deck, control the board first.</div>`,
    quiz: [
      { q: 'The opponent’s 2000-power searcher is rested and has already used its [On Play]. They are at 2 Life. Best target?', options: ['The searcher', 'The Leader', 'Neither', 'Whichever has more DON!!'], answer: 1, why: 'The searcher’s job is done. At 2 Life every Leader hit forces real decisions.' },
      { q: 'Why are Ace and Luffy safe attackers in ST-30?', options: ['They cannot be attacked', 'The Leader gives them +3000 on the opponent’s turn', 'They have [Blocker]', 'They return to hand'], answer: 1, why: 'At 9000 on the opponent’s turn they survive most attacks even when rested.' },
      { q: 'You are far ahead on board but the opponent has 7 cards in hand and 5 Life. A reasonable plan?', options: ['All-in on the Leader immediately', 'Keep K.O.ing their Characters and build, then take Life in big turns', 'Stop attacking', 'Discard your hand'], answer: 1, why: 'You are the control deck here: deny their board, then finish when their counters cannot cover every attack.' },
    ],
  },
  {
    id: 's6',
    track: 'strategy',
    title: 'Card advantage and your hand',
    summary: 'Your hand is your plays, your defence and your information all at once.',
    body: `
<p>In this game a card in hand is three things: a future play, a counter, and a secret. Running out of cards means you cannot develop <i>and</i> cannot defend.</p>
<h4>Where cards come from</h4>
<ul>
<li>1 per turn from the Draw Phase.</li>
<li>Life cards you take as damage.</li>
<li>Card effects: draw, search, and "2-for-1s" (one card that deals with two of theirs, or replaces itself).</li>
</ul>
<h4>Where cards go</h4>
<ul>
<li>Onto the board (good — they keep working).</li>
<li>Into counters (necessary, but each one is gone for a single battle).</li>
<li>Into costs (your Jinbe, Marco and Ivankov trash 6000-power Characters from hand).</li>
</ul>
<h4>Using your hand well</h4>
<ul>
<li><b>Each card has a best job.</b> Jozu is a fine 5-drop early and a 2000 counter late. Ace and Luffy have no counter value — they should be played, never held as defence.</li>
<li><b>Searchers are card advantage.</b> Inazuma and "Big Trouble" replace themselves with exactly the 6000-power Character you need. Play them early.</li>
<li><b>Feed costs with your worst card.</b> A spare Edward Newgate you cannot afford for five turns is ideal Jinbe food early on.</li>
<li><b>Count the opponent’s hand.</b> Five cards is roughly 5000–7000 of possible counter. Zero cards means every attack that is big enough will land.</li>
<li><b>Do not flood the board into a wipe.</b> Against decks with mass removal, holding a Character back keeps you in the game.</li>
</ul>
<div class="key">A quick estimate used by tournament players: assume each unknown card in the opponent’s hand is worth about <b>1000–1500</b> of counter. A 4-card hand probably stops 4000–6000 in total across the whole turn.</div>`,
    quiz: [
      { q: 'Which ST-30 card is the worst to hold as a defensive card?', options: ['Jozu', 'Mr.3', 'Portgas.D.Ace', 'Marco'], answer: 2, why: 'Ace has no counter value. Jozu and Mr.3 are 2000 counters; Marco is 1000.' },
      { q: 'The opponent has 1 card in hand and no active DON!!. You attack their Leader for exactly their power + 2000. What is likely?', options: ['They stop it easily', 'It lands — one ordinary counter card cannot provide 3000', 'They gain Life', 'You lose a Character'], answer: 1, why: '+2000 over needs 3000 of counter. One Character card gives at most 2000, and with no active DON!! a Counter Event is impossible.' },
      { q: 'Jinbe says "trash 1 Character with 6000 power from your hand: draw 2". On turn 3, which is the best card to trash, usually?', options: ['Your only Ace', 'A second Edward Newgate you cannot play for many turns', 'Jozu, your only 2000 counter', 'You should never use it'], answer: 1, why: 'Turn the card that is doing the least right now into two fresh cards.' },
    ],
  },
  {
    id: 's7',
    track: 'strategy',
    title: 'Calculating lethal — and not dying',
    summary: 'Count hits, blockers and counters before you commit.',
    body: `
<h4>Can I win this turn?</h4>
<ol>
<li><b>Hits needed</b> = their Life + 1.</li>
<li><b>Add their active [Blocker]s</b>: each one absorbs one attack.</li>
<li><b>Count your attackers</b> (active Leader and Characters, plus anything with [Rush] you can play).</li>
<li><b>Estimate their counter</b>: cards in hand × ~1000–1500, plus [Counter] Events if they left DON!! active.</li>
<li><b>Distribute DON!!</b> so that the total counter needed across your attacks exceeds what they can have.</li>
</ol>
<p>If you have more attackers than (Life + 1 + Blockers), the surplus attacks are spare — the defender must stop <i>those many</i> attacks, and you decide how expensive each one is.</p>
<h4>Worked example</h4>
<p>They have 1 Life, no Blockers, 3 cards in hand, a 5000 Leader. You have 3 attackers at 6000 and 3 spare DON!!. You need 2 hits, so they must stop 2 of your 3 attacks. With one DON!! on each (7000 each) every stop costs 3000: two stops = 6000 from 3 cards, which needs 2000 + 2000 + 2000. Unlikely. That is a strong lethal attempt.</p>
<h4>Can I die next turn?</h4>
<p>Run the same sum from the other side before you end your turn:</p>
<ul>
<li>Their possible attackers next turn (including [Rush]) vs. your Life + 1 + your <i>active</i> Blockers.</li>
<li>Your counter in hand after this turn’s plays.</li>
<li>If the answer is "yes, I can die": keep Blockers active, keep counters in hand, leave 1 DON!! for a [Counter] Event, or K.O. their attackers now.</li>
</ul>
<div class="key">Lethal is the most common place games are thrown away — by missing a win that was there, or by going all-in and losing to the swing back. Use the <b>Lethal drill</b>: it generates positions and checks your answer with a full search.</div>`,
    quiz: [
      { q: 'The opponent has 2 Life and 1 active Blocker. Minimum number of attacks you need to win this turn?', options: ['2', '3', '4', '5'], answer: 2, why: '2 Life + 1 = 3 hits, plus 1 attack absorbed by the Blocker = 4 attacks.' },
      { q: 'You have exactly lethal only if the opponent has no counters, and they hold 4 cards. Their board would kill you next turn if you rest everything. Best?', options: ['Go all-in', 'Attack in a way that keeps your Blockers active and your hand intact', 'Pass without attacking', 'Trash your hand'], answer: 1, why: 'A 4-card hand almost always has counters. Apply pressure without removing your own defence.' },
      { q: 'What is a rough value for each unknown card in the opponent’s hand?', options: ['0', '1000–1500 counter', '3000 counter', '5000 counter'], answer: 1, why: 'Most decks average a little over 1000 counter per card.' },
    ],
  },
  {
    id: 's8',
    track: 'strategy',
    title: 'Mulligans, and first or second?',
    summary: 'Start the game with a plan for turns 1–3.',
    body: `
<h4>The mulligan</h4>
<p>You see 5 cards and may swap them all once. A keepable hand <b>does something on turns 1–3</b> and has a path to your key card.</p>
<ul>
<li><b>Keep</b>: two or more cheap plays (cost 1–4), especially a searcher. With ST-30: Inazuma, "Big Trouble", Ivankov or Little Oars Jr. plus a 4- or 5-cost Character is ideal.</li>
<li><b>Mulligan</b>: hands of all expensive cards (three or more cards costing 5+ and nothing cheap), or hands with no Characters at all.</li>
<li>Do not mulligan a decent hand hoping for a perfect one. The new hand is random and you must keep it.</li>
</ul>
<h4>First or second?</h4>
<table class="tbl"><tr><th></th><th>Going first</th><th>Going second</th></tr>
<tr><td>DON!! per turn</td><td>1, 3, 5, 7, 9, 10</td><td>2, 4, 6, 8, 10</td></tr>
<tr><td>Cards</td><td>No draw on turn 1</td><td>Draws every turn — one card ahead</td></tr>
<tr><td>Attacks</td><td>Attacks first (your turn 2)</td><td>Attacks second, but with more DON!!</td></tr></table>
<ul>
<li><b>First</b> suits aggressive decks and decks whose key cards cost 1, 3, 5, 7 or 9.</li>
<li><b>Second</b> suits decks with strong 2-, 4-, 6-, 8- and 10-cost plays, and decks that want the extra card.</li>
</ul>
<h4>ST-30 on each curve</h4>
<ul>
<li><b>First:</b> T1 searcher (1) → T2 Mr.3 or Buggy + a 1-drop (3) → T3 Ace or Luffy <i>with Rush</i>, or Jozu/Jinbe/Marco (5) → T4 Crocodile + 1-drop (7) → T5 Edward Newgate + 1 DON!! spare (9).</li>
<li><b>Second:</b> T1 Mr.3/Buggy or two 1-drops (2) → T2 Mr.2, Ace or Luffy (4) → T3 Crocodile, or Ace/Luffy with Rush + a 1-drop (6) → T4 Edward Newgate (8) → T5 two 5-drops (10).</li>
</ul>
<div class="key">Your deck has many 5-cost Characters (12) and Rush for exactly 5, so it is comfortable going first. Going second you reach Edward Newgate’s 8 a full turn-cycle earlier in DON!! terms. Both seats are playable — know your curve for each.</div>`,
    quiz: [
      { q: 'Opening hand: Edward Newgate, Edward Newgate, Crocodile, Jozu, Marco. Keep?', options: ['Keep — strong cards', 'Mulligan — nothing to do until turn 3 at best', 'Keep if going second', 'It does not matter'], answer: 1, why: 'Five expensive cards means two or three empty turns. This is the classic mulligan.' },
      { q: 'Going first, on which turn do you first have exactly 5 DON!!?', options: ['Turn 2', 'Turn 3', 'Turn 4', 'Turn 5'], answer: 1, why: '1, 3, 5 — your third turn.' },
      { q: 'What does the player going second get as compensation?', options: ['An extra Life', 'A card on turn 1 and 2 DON!! instead of 1', 'A free mulligan', 'Nothing'], answer: 1, why: 'They draw on their first turn and start with 2 DON!!.' },
    ],
  },

  // ------------------------------------------------------------------ BUILDING
  {
    id: 'b1',
    track: 'building',
    title: 'The rules of deck building, and the six colours',
    summary: 'What is legal, and what each colour is good at.',
    body: `
<h4>Construction rules</h4>
<ul>
<li>Exactly <b>1 Leader</b>, exactly <b>50</b> cards in the deck, and <b>10 DON!!</b> cards.</li>
<li>Every card must <b>share a colour with your Leader</b>. A Red/Green Leader may use Red cards, Green cards and Red/Green cards.</li>
<li>At most <b>4 copies of any one card number</b>.</li>
<li>The card must be legal in the format you are playing (see the Compete track).</li>
</ul>
<h4>What each colour does</h4>
<ul>
<li><span class="c-red">Red</span> – aggression. Power boosts, giving the opponent’s cards −power, K.O.ing small Characters, [Rush].</li>
<li><span class="c-green">Green</span> – tempo. Resting the opponent’s Characters, setting your own cards and DON!! active again, sturdy bodies.</li>
<li><span class="c-blue">Blue</span> – control. Returning Characters to hand or deck, drawing and arranging the top of the deck, strong Events.</li>
<li><span class="c-purple">Purple</span> – ramp. Adding extra DON!! early, then paying DON!! −N for powerful effects.</li>
<li><span class="c-black">Black</span> – removal and recursion. Lowering cost then K.O.ing by cost, and playing Characters back from the trash.</li>
<li><span class="c-yellow">Yellow</span> – Life. Adding, looking at and rearranging Life cards; lots of [Trigger]s.</li>
</ul>
<p>The six CPU decks in this simulator are one of each colour for exactly this reason: beat all six and you have met every colour’s core trick.</p>
<h4>Two-colour Leaders</h4>
<p>Leaders like your <b>Luffy &amp; Ace (Red/Green)</b> draw from two card pools. The usual price is 4 Life instead of 5. Your Leader pays that price but has 6000 power instead of 5000.</p>
<div class="key">Open <b>Deck Lab</b>, pick any Leader, and the card pool is filtered to what that Leader may legally use. Legality mistakes are flagged as you build.</div>`,
    quiz: [
      { q: 'Your Leader is Red/Green. Which card can NOT go in the deck?', options: ['A Red card', 'A Green card', 'A Green/Blue card', 'A Blue card'], answer: 3, why: 'A card needs at least one colour in common with the Leader. Green/Blue shares Green; pure Blue shares nothing.' },
      { q: 'Which colour is known for adding extra DON!! and DON!! −N costs?', options: ['Red', 'Blue', 'Purple', 'Yellow'], answer: 2, why: 'Purple ramps DON!! and spends it back for big effects.' },
      { q: 'How many cards are in the main deck?', options: ['40', '50', '60', 'Any number above 50'], answer: 1, why: 'Exactly 50, plus the Leader and 10 DON!!.' },
    ],
  },
  {
    id: 'b2',
    track: 'building',
    title: 'Anatomy of a deck',
    summary: 'The ratios competitive lists share: counters, curve, searchers, finishers.',
    body: `
<p>Open any tournament list and you will find the same skeleton. These are guidelines, not rules — but break them on purpose, not by accident.</p>
<table class="tbl"><tr><th>Part</th><th>Typical count</th><th>Why</th></tr>
<tr><td>2000-counter cards</td><td>8–12</td><td>The most efficient defence. Decks without them bleed cards.</td></tr>
<tr><td>Cards with no counter</td><td>≤ 14–16</td><td>Events, Stages, big Characters. Too many and your hand cannot defend.</td></tr>
<tr><td>Cheap plays (cost ≤ 2)</td><td>10–16</td><td>So turns 1–2 are not blank, and so you have small attackers to bait with.</td></tr>
<tr><td>Searchers / draw</td><td>8–12</td><td>Consistency: see your key cards every game.</td></tr>
<tr><td>Mid-game bodies (cost 3–6)</td><td>12–18</td><td>Your attackers and Blockers.</td></tr>
<tr><td>Finishers (cost 7+)</td><td>4–8</td><td>Game-ending threats. Too many clog your hand.</td></tr>
<tr><td>Events</td><td>6–12</td><td>Removal and counters. They do not stay on board.</td></tr>
<tr><td>[Blocker]s</td><td>4–8</td><td>Free defence that does not cost cards from hand.</td></tr></table>
<h4>How many copies?</h4>
<ul>
<li><b>4</b> – you want it every game, as early as possible (searchers, your engine).</li>
<li><b>3</b> – you want it most games, but a second copy is awkward.</li>
<li><b>2</b> – situational, or expensive, or you can search for it.</li>
<li><b>1</b> – a "tech" card for one matchup, findable by a searcher.</li>
</ul>
<h4>Read your own ST-30 through this lens</h4>
<p>Open <b>My Deck</b> and look at the analysis: only 6 cards with a 2000 counter, 18 one-cost cards, a jump straight from cost 2 to cost 4, and 12 five-drops. It is a themed starter — strong synergy, but with obvious room to tune. Spotting those gaps is exactly the skill this track teaches.</p>
<div class="key">Deck Lab runs these checks live as you add cards, and shows the curve and counter spread. Use it on other people’s lists too — it is the fastest way to learn why they are built the way they are.</div>`,
    quiz: [
      { q: 'How many 2000-counter cards do competitive decks usually run?', options: ['0–2', '4–6', '8–12', '20+'], answer: 2, why: '8–12 is the common range.' },
      { q: 'You want to see a card in most games but drawing two is awkward. How many copies?', options: ['1', '2', '3', '4'], answer: 2, why: 'Three copies is the "usually, but not twice" number.' },
      { q: 'What is the main job of searchers?', options: ['Dealing damage', 'Consistency — finding key cards', 'Adding Life', 'Countering'], answer: 1, why: 'They make the deck do the same strong thing every game.' },
    ],
  },
  {
    id: 'b3',
    track: 'building',
    title: 'Building around a Leader',
    summary: 'Start from what the Leader rewards, then build the engine.',
    body: `
<p>The Leader is the one card you always have. A good deck is built to make the Leader’s text matter every single turn.</p>
<h4>A method</h4>
<ol>
<li><b>Read the Leader and write its plan in one sentence.</b> Luffy &amp; Ace: "My Ace and Luffy Characters are nearly unkillable on the opponent’s turn; my Leader is harder to hit than most; I must not play 7000+ base-power Characters."</li>
<li><b>List the cards the Leader rewards.</b> Use the Card Library filters: colour, type, name, power. For your Leader, search the names <i>Portgas.D.Ace</i> and <i>Monkey.D.Luffy</i> in Red and Green.</li>
<li><b>Find the engine.</b> Which cards draw, search and generate value together? In ST-30: Inazuma / "Big Trouble" find 6000-power Characters; Jinbe, Ivankov and Marco turn extra 6000s into cards and board.</li>
<li><b>Add interaction.</b> Removal, rest effects, power reduction — whatever your colours offer for dealing with the opponent’s board.</li>
<li><b>Add defence.</b> 2000 counters, Blockers, [Counter] Events.</li>
<li><b>Choose finishers.</b> How does the deck actually end the game?</li>
<li><b>Check the skeleton</b> from the previous lesson, then test.</li>
</ol>
<h4>Restrictions are part of the design</h4>
<p>Your Leader loses 2000 power if you control a Character with 7000 or more base power. So the usual "big finisher" is off the table — the deck goes wide with 6000s and boosts them with Edward Newgate instead. Many Leaders have such a line; the deck must respect it.</p>
<h4>Synergy vs. raw power</h4>
<p>A synergy deck is strong when its pieces are together and weak when they are not. The cure is redundancy (several cards that do the same job) and searchers. If your deck needs cards A + B + C at once to function, it is too fragile.</p>
<div class="key">Before adding a card, finish this sentence: "This card is in my deck because…". If the answer is only "it is strong", check it works with your Leader and your curve first.</div>`,
    quiz: [
      { q: 'Why does a Luffy & Ace deck avoid Characters with 7000+ base power?', options: ['They are illegal', 'The Leader gets −2000 power while you control one', 'They cost too much DON!!', 'They cannot attack'], answer: 1, why: 'It is printed on the Leader. A 4000-power Leader with 4 Life gets run over.' },
      { q: 'What is the cure for a synergy deck that sometimes "does nothing"?', options: ['More finishers', 'Redundancy and searchers', 'Fewer Characters', 'More Stages'], answer: 1, why: 'Multiple cards for each job, and ways to find them.' },
      { q: 'What should you write down first when building around a Leader?', options: ['The most expensive cards', 'The Leader’s plan in one sentence', 'The sideboard', 'The DON!! art'], answer: 1, why: 'Everything else in the list should serve that sentence.' },
    ],
  },
  {
    id: 'b4',
    track: 'building',
    title: 'Testing and tuning',
    summary: 'Change a little, play a lot, and write down what happened.',
    body: `
<h4>A testing loop that works</h4>
<ol>
<li><b>Play at least 5–10 games before changing anything.</b> One bad draw is not evidence.</li>
<li><b>Track the same things every game</b>: did I have a play on turns 1, 2, 3? Which cards sat dead in my hand? What did I lose to? The post-game review here records DON!! efficiency, idle attackers and hit rate for you.</li>
<li><b>Change 2–4 cards at a time.</b> If you change twelve, you will not know which change helped.</li>
<li><b>Test against different opponents.</b> A change that beats aggro may lose to control. Use all six CPU decks.</li>
<li><b>Swap seats.</b> Play your deck going first and second.</li>
</ol>
<h4>Reading the symptoms</h4>
<table class="tbl"><tr><th>Symptom</th><th>Likely cause</th><th>Try</th></tr>
<tr><td>Nothing to do early</td><td>Curve too high</td><td>More 1–3 cost plays, fewer 7+</td></tr>
<tr><td>Empty hand by turn 5</td><td>No card flow, curve too low</td><td>Searchers, draw, a few bigger threats</td></tr>
<tr><td>Cannot defend at low Life</td><td>Too few counters / Blockers</td><td>More 2000 counters, Blockers, a Counter Event</td></tr>
<tr><td>Board keeps getting removed</td><td>Over-committing, no protection</td><td>Hold a Character back; protection effects</td></tr>
<tr><td>Cannot close games</td><td>Not enough reach</td><td>[Rush], power boosts, Blocker removal</td></tr>
<tr><td>Draws the same dead card</td><td>Too many copies</td><td>Go from 4 to 2–3</td></tr></table>
<div class="key">Deck Lab can save several versions of a list. Name them (v1, v2 "+Rush", …), test each against the same opponent, and compare your results on the Progress page.</div>`,
    quiz: [
      { q: 'How many cards should you change between test sessions?', options: ['As many as possible', '2–4', 'Exactly 10', 'None, ever'], answer: 1, why: 'Small changes let you see cause and effect.' },
      { q: 'You keep running out of cards by turn 5. What does the deck most likely need?', options: ['More 1-cost vanillas', 'Card draw and searchers', 'More Stages', 'Fewer counters'], answer: 1, why: 'An empty hand means not enough card flow.' },
      { q: 'One game you drew all four copies of your 8-cost card and lost. What should you do?', options: ['Cut the card', 'Note it and keep testing — one game is not evidence', 'Add more 8-cost cards', 'Quit'], answer: 1, why: 'Look for patterns across many games before changing the list.' },
    ],
  },
  {
    id: 'b5',
    track: 'building',
    title: 'Upgrading ST-30 step by step',
    summary: 'Turn the boxed deck into your own without losing what makes it work.',
    body: `
<p>The best first deck-building project is the deck you already own. Here is the process — the specific card candidates are on the <b>My Deck</b> page, pulled live from the full card database.</p>
<h4>1 · Know what must stay</h4>
<ul>
<li>The <b>6000-power core</b>: your searchers only find Characters with exactly 6000 power, and Jinbe, Ivankov, Marco, Mr.3, Newgate, Little Oars Jr. and Buggy all refer to it. Keep roughly 26–30 such Characters.</li>
<li><b>Ace and Luffy</b>: the Leader’s +3000 only helps Characters with those names. More copies of them (other card numbers with the same names, in Red or Green, base power under 7000) is the most natural upgrade.</li>
</ul>
<h4>2 · Find the weak spots</h4>
<ul>
<li>Only two copies each of Ace and Luffy in the box.</li>
<li>Only 6 cards with a 2000 counter.</li>
<li>No way to K.O. or shrink a problem Character except Ace’s −1000 and the Whitebeard [Trigger].</li>
<li>Vanillas (Jozu, Mr.2) are honest but do nothing special.</li>
</ul>
<h4>3 · Make swaps, a few at a time</h4>
<ul>
<li><b>Second box.</b> The simplest upgrade: a second ST-30 lets you run 4 Ace and 4 Luffy.</li>
<li><b>Other Ace / Luffy cards.</b> Any Red or Green <i>Portgas.D.Ace</i> or <i>Monkey.D.Luffy</i> Character gets the +3000 on defence. If its power is exactly 6000, every 6000 synergy applies too. Example already in the database: <b>ST01-012 Monkey.D.Luffy</b> — 5 cost, 6000, [Rush] built in.</li>
<li><b>Removal and counters.</b> Red has cheap Events that K.O. small Characters or add power on defence. Trade a few vanillas for them.</li>
</ul>
<h4>4 · Respect the restriction</h4>
<p>Do not add Characters with 7000+ <i>base</i> power. Your Leader drops to 4000 while one is on your field.</p>
<h4>5 · Check legality</h4>
<p>Older cards may have rotated out of the Standard format. Before buying, check the official card list for the format you play (see the Compete track).</p>
<div class="key">Build your upgraded list in <b>Deck Lab</b> (it starts from "ST-30 as boxed"), then test it against all six CPU decks. If every card in it is simulated, you can play it right here.</div>`,
    quiz: [
      { q: 'Which Characters get +3000 from your Leader on the opponent’s turn?', options: ['All 6000-power Characters', 'Only cards named Portgas.D.Ace or Monkey.D.Luffy', 'Only Whitebeard Pirates', 'Only Blockers'], answer: 1, why: 'The Leader names those two cards specifically.' },
      { q: 'Why keep the 6000-power count high when upgrading?', options: ['Tournament rule', 'Most of the deck’s effects only work with 6000-power Characters', 'They are cheaper to buy', 'They have Rush'], answer: 1, why: 'Searchers, draw costs, protection and Newgate’s boost all key off 6000.' },
      { q: 'You find a great Red 9000-power finisher. Should it go in?', options: ['Yes, always', 'No — 7000+ base power gives your Leader −2000', 'Only one copy', 'Only if it has Blocker'], answer: 1, why: 'It breaks the Leader’s condition.' },
    ],
  },

  // ------------------------------------------------------------------ COMPETING
  {
    id: 'c1',
    track: 'competing',
    title: 'Formats, legality and banned cards',
    summary: 'What you are allowed to play, and where to check.',
    body: `
<p>Tournaments are played in a <b>format</b>: a set of rules about which cards are legal.</p>
<h4>Standard and block rotation</h4>
<ul>
<li>Cards carry a small <b>block icon</b> (a number near the bottom of the card). Since <b>April 2026</b>, the Standard format uses these icons to rotate the oldest block out of legality.</li>
<li>Block 1 — the cards from the game’s first year, around OP-01 to OP-04 and the first starter decks — is the block that rotated. A card that was <i>reprinted</i> later with a newer block icon is legal through its newer printing.</li>
<li>Your <b>ST-30</b> is a recent product and is Standard-legal.</li>
</ul>
<h4>Extra Regulation</h4>
<p>An "everything is legal" format in which rotated cards may still be used. It is offered at some events alongside Standard.</p>
<h4>Banned and restricted cards</h4>
<p>Bandai publishes a list of <b>banned</b> cards (0 copies), <b>restricted</b> cards (fewer than 4) and sometimes banned <i>pairs</i> (two cards that may not be in the same deck). The list changes a few times a year.</p>
<div class="key warn"><b>Check the official site before an event.</b> Rotation dates, block boundaries and the banned list change, and this simulator’s card database is a snapshot. The official One Piece Card Game website has the current card list, the banned/restricted list and the tournament rules. The Card Library here flags card numbers from the earliest sets so you know to double-check them.</div>
<h4>What you need on the day</h4>
<ul>
<li>A legal 50-card deck, Leader and 10 DON!!, all in matching opaque sleeves.</li>
<li>A registered decklist if the event asks for one — write card numbers, not just names.</li>
<li>Something to mark Life and rested DON!! clearly; dice or counters for power changes.</li>
</ul>`,
    quiz: [
      { q: 'What decides whether an older card is legal in Standard?', options: ['Its rarity', 'Its block icon (and whether a newer printing exists)', 'Its colour', 'Its price'], answer: 1, why: 'Standard rotates by block icon.' },
      { q: 'Where should you check the current banned list?', options: ['Any old forum post', 'The official One Piece Card Game website', 'It never changes', 'The back of the card'], answer: 1, why: 'The official list is the only authority and it changes over time.' },
      { q: 'On a decklist you should write…', options: ['Only card names', 'Card numbers (and names)', 'Only the Leader', 'Nothing'], answer: 1, why: 'Many cards share a name. The number identifies the exact card.' },
    ],
  },
  {
    id: 'c2',
    track: 'competing',
    title: 'The metagame and choosing a deck',
    summary: 'You do not play against "the game" — you play against the decks people bring.',
    body: `
<p>The <b>metagame</b> ("meta") is the mix of decks you can expect at an event. It shifts with every new set and banned-list update.</p>
<h4>How to read a meta</h4>
<ul>
<li>Look at recent tournament results (sites such as Limitless publish top lists and win rates). Note the 4–6 most played Leaders.</li>
<li>For each: what is its plan? What does it lose to? Which turn does it take over the game?</li>
<li>Sort them into <b>aggro</b> (wins fast), <b>midrange</b> (efficient bodies and removal), <b>control</b> (answers everything, wins late) and <b>combo/ramp</b> (builds to one overwhelming turn).</li>
</ul>
<h4>Choosing what to play</h4>
<ol>
<li><b>Play what you know.</b> A deck you have 50 games with beats a "better" deck you picked up yesterday.</li>
<li><b>Know your bad matchups</b> and decide in advance how you will try to steal them.</li>
<li><b>Tech with restraint.</b> One or two cards for the most common opponent, not eight cards for every possibility.</li>
</ol>
<h4>Learning matchups</h4>
<p>For each popular Leader, write three lines: <i>their key turns</i>, <i>the card I must play around</i>, and <i>my plan</i> (race or control?). The six CPU decks here are simple versions of the six colour archetypes — practise writing those three lines for each of them first.</p>
<div class="key">Your ST-30 deck is a midrange deck: efficient 6000 bodies, a sturdy Leader, some card flow. Against aggro you are the control deck (stabilise, then win on board). Against ramp and control you are the aggressor (pressure before they set up).</div>`,
    quiz: [
      { q: 'What is the "metagame"?', options: ['The rulebook', 'The mix of decks you expect to face', 'A special format', 'The banned list'], answer: 1, why: 'It is the field of decks at a given time and place.' },
      { q: 'You have one week before a tournament. Which is usually wiser?', options: ['Switch to the newest top deck', 'Play the deck you know best and tune it slightly', 'Build a deck with no Characters', 'Play a random deck'], answer: 1, why: 'Familiarity wins more games than marginal deck strength.' },
      { q: 'Against a fast aggro deck, your midrange deck should usually…', options: ['Race them', 'Stabilise first: defend, remove their attackers, then win', 'Never block', 'Mulligan every hand'], answer: 1, why: 'You have the stronger late game, so you play the control role.' },
    ],
  },
  {
    id: 'c3',
    track: 'competing',
    title: 'Tournament habits',
    summary: 'Clean, clear play — and how not to lose to the clock or to yourself.',
    body: `
<h4>How events work</h4>
<p>Most events are <b>Swiss</b>: everyone plays every round against someone with a similar record, and the best records advance to a top cut. Rounds are timed. Exact round lengths and match structure vary by event — read the event’s rules and ask the organiser.</p>
<h4>Clean play</h4>
<ul>
<li><b>Announce everything.</b> "Rest 5, play Jozu." "Attach 2 to Leader, Leader attacks your Leader for 8000." Clear words prevent disputes.</li>
<li><b>Keep the board readable.</b> Rested cards clearly sideways, attached DON!! under the card, Life in a tidy stack.</li>
<li><b>Ask before you assume.</b> "How many cards in hand?" "How many DON!! active?" Public information is yours to ask for.</li>
<li><b>Wait for responses.</b> After declaring an attack, give the opponent time to block and counter before you move on.</li>
<li><b>Call a judge</b> when something goes wrong. It is not rude; it is what judges are for. Do not "fix" it yourselves.</li>
</ul>
<h4>The clock</h4>
<ul>
<li>Plan your turn during the opponent’s turn.</li>
<li>Make routine plays quickly; save time for the two or three decisions that decide the game.</li>
<li>If a game is clearly lost, concede and move on. Do not let one loss tilt the next round.</li>
</ul>
<h4>Your head</h4>
<ul>
<li>Eat, drink water, and take a breath between rounds. Long events are an endurance test.</li>
<li>After a loss, write down <i>one</i> thing you would do differently, then let it go.</li>
<li>Variance is real: sometimes the Life cards are all Triggers. Judge your play by your decisions, not by the result.</li>
</ul>
<div class="key">Practise here the way you will play there: decide before you click, say the numbers to yourself ("7000 into 5000, they need 3000"), and use Hints only <i>after</i> you have chosen your own move.</div>`,
    quiz: [
      { q: 'Something goes wrong with the game state in a tournament. What do you do?', options: ['Fix it quietly yourselves', 'Call a judge', 'Concede', 'Ignore it'], answer: 1, why: 'Judges exist for this. Self-fixes often make things worse.' },
      { q: 'When is the best time to plan your turn?', options: ['After you draw', 'During the opponent’s turn', 'After the round', 'While shuffling'], answer: 1, why: 'Use their time, so your own turn is mostly execution.' },
      { q: 'How should you evaluate your play after an event?', options: ['By win/loss only', 'By the quality of your decisions', 'By your opponent’s mood', 'By how rare your cards are'], answer: 1, why: 'Results include luck. Decisions are what you control.' },
    ],
  },
  {
    id: 'c4',
    track: 'competing',
    title: 'How to keep getting better',
    summary: 'A practice routine that takes you from "knows the rules" to "wins rounds".',
    body: `
<h4>A weekly routine</h4>
<ol>
<li><b>Drills (10 minutes).</b> Counter maths and lethal until they are automatic.</li>
<li><b>Focused games (3–5).</b> Pick <i>one</i> skill per session — "use every DON!!", or "never leave an attacker idle" — and judge the game only on that.</li>
<li><b>Review.</b> Read the post-game review. Find the turn where the game turned. Use <i>Take back</i> to replay that turn differently and see what changes.</li>
<li><b>Study one unfamiliar card pool.</b> Filter the Card Library to one Leader’s colours and read 20 cards. You cannot play around cards you have never read.</li>
<li><b>Build.</b> Change 2–4 cards in Deck Lab and test.</li>
</ol>
<h4>The ladder in this simulator</h4>
<ul>
<li><b>Step 1</b> – Finish the Rules track. Beat each CPU deck on Easy with Full coaching.</li>
<li><b>Step 2</b> – Finish the Strategy track. Beat each deck on Normal with hints on request only.</li>
<li><b>Step 3</b> – Beat each deck on Hard with coaching <i>off</i>. Average under 0.5 unused DON!! per turn.</li>
<li><b>Step 4</b> – Build your own list in Deck Lab and beat all six on Hard with it.</li>
<li><b>Step 5</b> – Play real people. The CPU is a consistent sparring partner, but humans bluff, adapt and punish habits. Local store events are the next step.</li>
</ul>
<h4>Beyond this simulator</h4>
<ul>
<li>Read the official comprehensive rules once you are comfortable — they settle every edge case.</li>
<li>Watch tournament matches and pause before each attack to predict the play.</li>
<li>Play both sides of a matchup. Nothing teaches you how to beat a deck like piloting it.</li>
</ul>
<div class="key">The Progress page tracks every step of this ladder. The honest limit: the CPU here plays a sound, rule-based game, not a world-class one. When you beat Hard consistently with coaching off, you are ready for — and need — human opponents.</div>`,
    quiz: [
      { q: 'What makes a practice session "focused"?', options: ['Playing as many games as possible', 'Choosing one skill and judging the game on it', 'Only playing your best matchup', 'Never reviewing'], answer: 1, why: 'Deliberate practice targets one thing at a time.' },
      { q: 'Why play the other side of a matchup?', options: ['It is required', 'You learn what that deck fears', 'To copy their sleeves', 'It is not useful'], answer: 1, why: 'Piloting a deck shows you its weak points.' },
      { q: 'What is the next step after consistently beating the Hard CPU with coaching off?', options: ['Stop playing', 'Play human opponents', 'Delete your deck', 'Only do drills'], answer: 1, why: 'Humans adapt and bluff; that is the next level of practice.' },
    ],
  },
];

export const lessonsOf = (t: TrackId): Lesson[] => LESSONS.filter((l) => l.track === t);
export const lesson = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);
