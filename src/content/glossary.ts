// Every bracketed term a card can print, explained once. Used by card detail panels.

export interface Term {
  term: string;
  /** Matches the term inside rules text. */
  re: RegExp;
  text: string;
}

export const GLOSSARY: Term[] = [
  { term: '[Rush]', re: /\[Rush\]/, text: 'This card can attack on the turn it is played.' },
  { term: '[Rush: Character]', re: /\[Rush: Character\]/, text: 'On the turn it is played, this card can attack Characters (but not the Leader).' },
  { term: '[Blocker]', re: /\[Blocker\]/, text: 'When your opponent attacks another of your cards, you may rest this card to make it the target of the attack instead.' },
  { term: '[Double Attack]', re: /\[Double Attack\]/, text: 'This card deals 2 damage to a Leader instead of 1. It cannot finish a Leader that has exactly 1 Life: the hit takes that last Life card and the second damage is lost.' },
  { term: '[Banish]', re: /\[Banish\]/, text: 'When this card deals damage, the Life card is trashed instead of going to the owner’s hand, and its [Trigger] cannot be used.' },
  { term: '[Unblockable]', re: /\[Unblockable\]/, text: 'The opponent cannot activate [Blocker] against this card’s attacks.' },
  { term: '[Trigger]', re: /\[Trigger\]/, text: 'When this card leaves your Life as damage, you may reveal it and use this effect for free instead of adding the card to your hand. The card is then trashed.' },
  { term: '[On Play]', re: /\[On Play\]/, text: 'Happens when this card is played (from hand or by an effect).' },
  { term: '[When Attacking]', re: /\[When Attacking\]/, text: 'Happens when this card declares an attack, before the opponent can block or counter.' },
  { term: '[On K.O.]', re: /\[On K\.O\.\]/, text: 'Happens when this card is K.O.’d by battle or by an effect. Being returned to hand, trashed, or sent to the deck is not a K.O.' },
  { term: '[On Block]', re: /\[On Block\]/, text: 'Happens when this card blocks an attack.' },
  { term: '[On Your Opponent’s Attack]', re: /\[On Your Opponent's Attack\]/, text: 'Can be used when your opponent declares an attack.' },
  { term: '[Activate: Main]', re: /\[Activate: Main\]/, text: 'An ability you may choose to use during your own Main Phase (not during a battle).' },
  { term: '[Main]', re: /\[Main\]/, text: 'On an Event: you may play it during your own Main Phase.' },
  { term: '[Counter]', re: /\[Counter\]/, text: 'On an Event: you may play it during the Counter Step of your opponent’s attack, paying its DON!! cost.' },
  { term: '[Your Turn]', re: /\[Your Turn\]/, text: 'This effect only applies during your turn.' },
  { term: '[Opponent’s Turn]', re: /\[Opponent's Turn\]/, text: 'This effect only applies during your opponent’s turn.' },
  { term: '[End of Your Turn]', re: /\[End of Your Turn\]/, text: 'Happens during the End Phase of your turn.' },
  { term: '[Once Per Turn]', re: /\[Once Per Turn\]/, text: 'This effect can be used only once each turn.' },
  { term: '[DON!! xN]', re: /\[DON!! x\d+\]/, text: 'This effect only works while this card has at least N DON!! cards attached to it.' },
  { term: 'DON!! −N', re: /DON!! -\d+/, text: 'A cost: return N DON!! cards from your field to your DON!! deck.' },
  { term: '①②③ (circled numbers)', re: /[①②③④⑤⑥⑦⑧⑨⑩]/, text: 'A cost: rest that many of your active DON!! cards.' },
  { term: 'K.O.', re: /K\.O\./, text: 'Send a Character from the field to its owner’s trash. Triggers [On K.O.]. Not the same as "trash" or "return to hand".' },
  { term: 'Rest / Active', re: /\b[Rr]est(ed)?\b|\bactive\b/, text: 'Rested cards are turned sideways: they cannot attack or block, and rested Characters can be attacked. Active cards are upright.' },
  { term: 'Base power', re: /base power/, text: 'The power printed on the card, ignoring DON!! and effects.' },
  { term: 'Up to', re: /[Uu]p to \d/, text: 'You may choose any number from zero to that many.' },
  { term: 'Life cards', re: /Life cards?/, text: 'The face-down pile that acts as your Leader’s hit points. Damage moves the top Life card to your hand.' },
  { term: 'Counter value', re: /$^/, text: 'The +1000 / +2000 printed on the side of a Character. Trash the card from your hand during an opponent’s attack to add that power to the card being attacked, for that battle.' },
];

export const termsIn = (text: string): Term[] => GLOSSARY.filter((t) => t.re.test(text));
