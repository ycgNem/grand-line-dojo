// Hand-written card behaviour.
//
// Every ST-30 card is scripted here by hand (and covered by tests) so your own deck plays exactly
// as printed. The other entries are classic starter-deck cards whose wording the automatic text
// compiler cannot express. Stats and printed text always come from the card database.

import * as fx from '../engine/fx';
import { P, addFlag, addMod, costOf, draw, findField, hasKw, leaveField, log, opp, ownerOf, playCharacter, powerOf, shuffle } from '../engine/game';
import { D } from '../engine/registry';
import type { CardDef, FieldCard, Game, PlayerId } from '../engine/types';

type Script = Partial<Pick<CardDef, 'keywords' | 'effects' | 'powerAura' | 'dynKeyword' | 'cantBeKoByEffect' | 'replaceRemoval' | 'aiPlay' | 'costAura'>>;

const is6kCard = (d: CardDef): boolean => d.category === 'Character' && d.power === 6000;
const base6k = (t: FieldCard): boolean => D(t.id).power === 6000;
const named = (t: FieldCard, name: string): boolean => D(t.id).name === name;
const SIX = 'Character card with 6000 power';
const count6k = (g: Game, p: PlayerId): number => P(g, p).chars.filter(base6k).length;
const hand6k = (g: Game, p: PlayerId, except = 0): number => P(g, p).hand.filter((u) => u !== except && is6kCard(D(g.ids[u]))).length;

export const SCRIPTS: Record<string, Script> = {
  // ================================================================ ST-30  Luffy & Ace
  'ST30-001': {
    // -2000 while you control a 7000+ base power Character; Ace/Luffy Characters +3000 on the opponent's turn.
    powerAura: (g, self, t) => {
      const owner = ownerOf(self.uid);
      if (t.uid === self.uid) return P(g, owner).chars.some((c) => D(c.id).power >= 7000) ? -2000 : 0;
      return g.active !== owner && (named(t, 'Portgas.D.Ace') || named(t, 'Monkey.D.Luffy')) ? 3000 : 0;
    },
  },
  'ST30-002': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] Look at 5 cards from the top of your deck; reveal up to 1 Character card with 6000 power and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
        tags: ['search'],
        steps: fx.searchTop(5, is6kCard, SIX),
      },
    ],
  },
  'ST30-003': {
    // [Your Turn] All of your Characters with 6000 base power gain +1000 power (including himself).
    powerAura: (g, self, t) => {
      const owner = ownerOf(self.uid);
      return g.active === owner && ownerOf(t.uid) === owner && t.uid !== P(g, owner).leader.uid && base6k(t) ? 1000 : 0;
    },
    aiPlay: (g, me) => count6k(g, me) * 0.6,
  },
  'ST30-004': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] You may reveal 2 Character cards with 6000 power from your hand: Draw 3 cards and trash 2 cards from your hand.',
        tags: ['draw'],
        cost: { reveal: 2, revealFilter: is6kCard },
        steps: [fx.drawN(3), ...fx.discard(2)],
      },
    ],
    aiPlay: (g, me) => (hand6k(g, me) >= 2 ? 2 : -3),
  },
  'ST30-005': {},
  'ST30-006': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] You may trash 1 Character card with 6000 power from your hand: Draw 2 cards.',
        tags: ['draw'],
        cost: { trashHand: 1, trashFilter: is6kCard, trashDesc: SIX },
        steps: [fx.drawN(2)],
      },
    ],
    aiPlay: (g, me) => (hand6k(g, me) >= 2 ? 1 : 0),
  },
  'ST30-007': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] You may rest 1 of your DON!! cards: This Character gains [Rush] during this turn.',
        tags: ['rush'],
        cost: { don: 1 },
        ai: (g, c) => (P(g, c.player).turns > 1 ? 1 : -1),
        steps: [fx.flagSelf('Rush', 'turn')],
      },
      {
        timing: 'whenAttacking',
        text: "[When Attacking] Give up to 1 of your opponent's Characters −1000 power during this turn.",
        tags: ['debuff'],
        steps: fx.statOpp('power', -1000, 'turn', "Give up to 1 of your opponent's Characters −1000 power during this turn."),
      },
    ],
  },
  'ST30-008': {
    keywords: ['Blocker'],
    effects: [
      {
        timing: 'onKO',
        text: '[On K.O.] You may trash 1 Character card with 6000 power from your hand: Play this Character card from your trash rested.',
        tags: ['play'],
        cost: { trashHand: 1, trashFilter: is6kCard, trashDesc: SIX },
        ai: (g, c) => (P(g, c.player).hand.length >= 2 ? 1 : -1),
        steps: [
          (g, c) => {
            const p = P(g, c.player);
            const i = p.trash.indexOf(c.src);
            if (i < 0) return;
            p.trash.splice(i, 1);
            playCharacter(g, c.player, c.src, true);
          },
        ],
      },
    ],
  },
  'ST30-009': {
    replaceRemoval: {
      text: 'trash this Character and draw 1 card instead.',
      can: (_g, _self, victim) => base6k(victim),
      apply: (g, self) => {
        const owner = ownerOf(self.uid);
        leaveField(g, self.uid, 'trash');
        draw(g, owner, 1);
      },
    },
  },
  'ST30-010': {
    keywords: ['Blocker'],
    effects: [
      {
        timing: 'onPlay',
        text: "[On Play] Up to 1 of your opponent's rested Characters will not become active in your opponent's next Refresh Phase.",
        tags: ['rest'],
        steps: [
          fx.pickOpp(1, "Choose up to 1 of your opponent's rested Characters: it will not become active in their next Refresh Phase.", 'freeze', (_g, t) => t.rested && !t.frozen),
          fx.each((g, c, u) => {
            const t = findField(g, u);
            if (!t) return;
            t.frozen = true;
            log(g, c.player, `Crocodile: ${D(t.id).name} will not become active in its owner's next Refresh Phase.`, 'effect');
          }),
        ],
      },
    ],
  },
  'ST30-011': {
    keywords: ['Blocker'],
    replaceRemoval: {
      text: 'rest this Character instead.',
      can: (_g, self, victim) => !self.rested && base6k(victim),
      apply: (_g, self) => {
        self.rested = true;
      },
    },
  },
  'ST30-012': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] You may rest 1 of your DON!! cards: This Character gains [Rush] during this turn.',
        tags: ['rush'],
        cost: { don: 1 },
        ai: (g, c) => (P(g, c.player).turns > 1 ? 1 : -1),
        steps: [fx.flagSelf('Rush', 'turn')],
      },
      {
        timing: 'whenAttacking',
        text: "[When Attacking] Rest up to 1 of your opponent's [Blocker] Characters.",
        tags: ['rest'],
        steps: fx.restOpp("Rest up to 1 of your opponent's [Blocker] Characters.", (g, t) => hasKw(g, t, 'Blocker')),
      },
    ],
  },
  'ST30-013': {},
  'ST30-014': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] You may rest this Character: Give up to 2 of your Characters with 6000 base power up to 2 rested DON!! cards each.',
        tags: ['don'],
        cost: { restSelf: true },
        when: (g, c) => P(g, c.player).donRested > 0 && count6k(g, c.player) > 0,
        ai: (g, c) => (P(g, c.player).chars.some((t) => base6k(t) && !t.rested) ? 2 : -1),
        steps: fx.giveRestedDon(2, 'Choose up to 2 of your Characters with 6000 base power: each gets up to 2 rested DON!!.', { leader: false, f: (_g, t) => base6k(t), max: 2 }),
      },
    ],
  },
  'ST30-015': {
    effects: [
      {
        timing: 'counter',
        text: '[Counter] If you have 2 or more Characters with 6000 base power, up to 1 of your Leader or Character cards gains +4000 power during this battle.',
        tags: ['buff'],
        boost: 4000,
        when: (g, c) => count6k(g, c.player) >= 2,
        steps: [fx.buffBattle(4000)],
      },
      {
        timing: 'trigger',
        text: "[Trigger] K.O. up to 1 of your opponent's Characters with 6000 power or less.",
        tags: ['ko'],
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with 6000 power or less.", (g, t) => powerOf(g, t) <= 6000),
      },
    ],
  },
  'ST30-016': {
    effects: [
      {
        timing: 'counter',
        text: '[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, if you have [Portgas.D.Ace] and [Monkey.D.Luffy] Characters with 6000 base power, draw 1 card.',
        tags: ['buff', 'draw'],
        boost: 3000,
        steps: [
          fx.buffBattle(3000),
          (g, c) => {
            const cs = P(g, c.player).chars.filter(base6k);
            if (cs.some((t) => named(t, 'Portgas.D.Ace')) && cs.some((t) => named(t, 'Monkey.D.Luffy'))) fx.drawN(1)(g, c);
          },
        ],
      },
    ],
  },
  'ST30-017': {
    effects: [
      {
        timing: 'main',
        text: '[Main] Look at 5 cards from the top of your deck; reveal up to 1 Character card with 6000 power and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
        tags: ['search'],
        steps: fx.searchTop(5, is6kCard, SIX),
      },
      {
        timing: 'trigger',
        text: "[Trigger] Activate this card's [Main] effect.",
        tags: ['search'],
        steps: fx.searchTop(5, is6kCard, SIX),
      },
    ],
  },

  // ================================================================ ST-01  Straw Hat Crew (red)
  'ST01-002': {
    effects: [
      {
        timing: 'whenAttacking',
        don: 2,
        text: '[DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.',
        tags: ['evasion'],
        steps: [fx.noBlocker(5000)],
      },
      { timing: 'trigger', text: '[Trigger] Play this card.', tags: ['play'], steps: [fx.playSelf] },
    ],
  },
  'ST01-005': {
    effects: [
      {
        timing: 'whenAttacking',
        don: 1,
        text: '[DON!! x1] [When Attacking] Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.',
        tags: ['buff'],
        steps: fx.buffOwn(1000, 'turn', 'Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.', { leader: true, f: (_g, t, c) => t.uid !== c.src }),
      },
    ],
  },
  'ST01-007': {
    effects: [
      {
        timing: 'activateMain',
        opt: true,
        text: '[Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.',
        tags: ['don'],
        when: (g, c) => P(g, c.player).donRested > 0,
        steps: fx.giveRestedDon(1, 'Give up to 1 rested DON!! card to your Leader or 1 of your Characters.'),
      },
    ],
  },
  'ST01-012': {
    keywords: ['Rush'],
    effects: [
      {
        timing: 'whenAttacking',
        don: 2,
        text: '[DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.',
        tags: ['evasion'],
        steps: [fx.noBlocker()],
      },
    ],
  },
  'ST01-016': {
    effects: [
      {
        timing: 'main',
        text: '[Main] Select up to 1 of your {Straw Hat Crew} type Leader or Character cards. Your opponent cannot activate [Blocker] if that Leader or Character attacks during this turn.',
        tags: ['evasion'],
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => !t.rested && hasKw(g, t, 'Blocker')),
        steps: fx.flagOwn('Unblockable', 'turn', 'Select up to 1 of your {Straw Hat Crew} Leader or Character cards: it cannot be blocked this turn.', {
          leader: true,
          f: (_g, t) => D(t.id).types.includes('Straw Hat Crew') && !t.rested,
        }),
      },
      {
        timing: 'trigger',
        text: "[Trigger] K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.",
        tags: ['ko'],
        steps: fx.koOpp("K.O. up to 1 of your opponent's [Blocker] Characters with a cost of 3 or less.", (g, t) => hasKw(g, t, 'Blocker') && costOf(g, t) <= 3),
      },
    ],
  },
  'ST01-017': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] You may rest this Stage: Up to 1 {Straw Hat Crew} type Leader or Character card on your field gains +1000 power during this turn.',
        tags: ['buff'],
        cost: { restSelf: true },
        steps: fx.buffOwn(1000, 'turn', 'Up to 1 {Straw Hat Crew} type Leader or Character card on your field gains +1000 power during this turn.', {
          leader: true,
          f: (_g, t) => D(t.id).types.includes('Straw Hat Crew'),
        }),
      },
    ],
  },

  // ================================================================ ST-02  Worst Generation (green)
  'ST02-001': {
    effects: [
      {
        timing: 'activateMain',
        opt: true,
        text: '[Activate: Main] [Once Per Turn] ③ You may trash 1 card from your hand: Set this Leader as active.',
        tags: ['untap'],
        cost: { don: 3, trashHand: 1 },
        when: (g, c) => P(g, c.player).leader.rested,
        ai: (g, c) => (P(g, c.player).hand.length >= 3 ? 1 : -1),
        steps: [fx.setActiveSelf],
      },
    ],
  },
  'ST02-003': {
    powerAura: (g, self, t) => (t.uid === self.uid && self.don >= 1 && P(g, ownerOf(self.uid)).chars.length >= 3 ? 2000 : 0),
  },
  'ST02-007': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] ➀ You may rest this Character: Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.',
        tags: ['search'],
        cost: { don: 1, restSelf: true },
        steps: fx.searchTop(5, (d) => d.types.includes('Supernovas'), '{Supernovas} type card'),
      },
    ],
  },
  'ST02-009': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] Set up to 1 of your {Supernovas} or {Heart Pirates} type rested Characters with a cost of 5 or less as active.',
        tags: ['untap'],
        steps: fx.untapOwn('Set up to 1 of your {Supernovas} or {Heart Pirates} type rested Characters with a cost of 5 or less as active.', (g, t) => {
          const d = D(t.id);
          return costOf(g, t) <= 5 && (d.types.includes('Supernovas') || d.types.includes('Heart Pirates'));
        }),
      },
    ],
  },
  'ST02-010': {
    effects: [
      {
        timing: 'afterBattleChar',
        don: 1,
        opt: true,
        text: "[DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.",
        tags: ['untap'],
        when: (g, c) => g.active === c.player,
        steps: [fx.setActiveSelf],
      },
    ],
  },
  'ST02-013': {
    keywords: ['Blocker'],
    effects: [{ timing: 'endOfTurn', don: 1, text: '[DON!! x1] [End of Your Turn] Set this card as active.', tags: ['untap'], steps: [fx.setActiveSelf] }],
  },
  'ST02-014': {
    powerAura: (g, self, t) => {
      const owner = ownerOf(self.uid);
      const d = D(t.id);
      return self.don >= 1 && g.active === owner && self.rested && (d.types.includes('Supernovas') || d.types.includes('Navy')) ? 1000 : 0;
    },
  },
  'ST02-017': {
    effects: [
      {
        timing: 'main',
        text: "[Main] Rest up to 1 of your opponent's Characters.",
        tags: ['rest'],
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => !t.rested),
        steps: fx.restOpp("Rest up to 1 of your opponent's Characters."),
      },
      {
        timing: 'trigger',
        text: '[Trigger] Play up to 1 {Supernovas} type card with a cost of 2 or less from your hand.',
        tags: ['play'],
        steps: fx.playFrom('hand', (d) => d.types.includes('Supernovas') && d.cost <= 2, '{Supernovas} type Character with a cost of 2 or less'),
      },
    ],
  },

  // ================================================================ ST-03  The Seven Warlords of the Sea (blue)
  'ST03-003': {
    keywords: ['Blocker'],
    effects: [
      {
        timing: 'onBlock',
        don: 1,
        text: "[DON!! x1] [On Block] Place up to 1 Character with a cost of 2 or less at the bottom of the owner's deck.",
        tags: ['bounce'],
        steps: fx.removeAny("Place up to 1 Character with a cost of 2 or less at the bottom of the owner's deck.", 'bottom', (g, t) => costOf(g, t) <= 2),
      },
    ],
  },
  'ST03-004': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] Add up to 1 {The Seven Warlords of the Sea} or {Thriller Bark Pirates} type Character with a cost of 4 or less other than [Gecko Moria] from your trash to your hand.',
        tags: ['recover'],
        steps: fx.recover(
          (d) => d.category === 'Character' && d.cost <= 4 && d.name !== 'Gecko Moria' && (d.types.includes('The Seven Warlords of the Sea') || d.types.includes('Thriller Bark Pirates')),
          'Warlord / Thriller Bark Character with a cost of 4 or less',
        ),
      },
    ],
  },
  'ST03-007': {
    effects: [
      {
        timing: 'activateMain',
        don: 1,
        opt: true,
        text: '[DON!! x1] [Activate: Main] [Once Per Turn] ➁: Play up to 1 [Pacifista] with a cost of 4 or less from your deck, then shuffle your deck.',
        tags: ['play'],
        cost: { don: 2 },
        when: (g, c) => P(g, c.player).deck.some((u) => D(g.ids[u]).name === 'Pacifista'),
        steps: [
          (g, c) => {
            const p = P(g, c.player);
            const i = p.deck.findIndex((u) => D(g.ids[u]).name === 'Pacifista' && D(g.ids[u]).cost <= 4);
            if (i >= 0) playCharacter(g, c.player, p.deck.splice(i, 1)[0], false);
            shuffle(g, p.deck);
          },
        ],
      },
    ],
  },
  'ST03-010': {
    effects: [
      { timing: 'onPlay', text: '[On Play] Look at 3 cards from the top of your deck and return them to the top or bottom of the deck in any order.', tags: ['filter'], steps: fx.scry(3) },
      { timing: 'trigger', text: '[Trigger] Play this card.', tags: ['play'], steps: [fx.playSelf] },
    ],
  },
  'ST03-016': {
    effects: [
      {
        timing: 'counter',
        text: "[Counter] Return up to 1 Character with a cost of 3 or less to the owner's hand.",
        tags: ['bounce'],
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => costOf(g, t) <= 3),
        // Bouncing the attacker ends the battle outright.
        ai: (g, c) => {
          const a = g.battle ? findField(g, g.battle.attacker) : null;
          return a && ownerOf(a.uid) !== c.player && P(g, ownerOf(a.uid)).leader.uid !== a.uid && costOf(g, a) <= 3 ? 3 : -1;
        },
        steps: fx.removeAny("Return up to 1 Character with a cost of 3 or less to the owner's hand.", 'hand', (g, t) => costOf(g, t) <= 3),
      },
      {
        timing: 'trigger',
        text: "[Trigger] Activate this card's [Counter] effect.",
        tags: ['bounce'],
        steps: fx.removeAny("Return up to 1 Character with a cost of 3 or less to the owner's hand.", 'hand', (g, t) => costOf(g, t) <= 3),
      },
    ],
  },
  'ST03-017': {
    effects: [
      {
        timing: 'counter',
        text: '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, draw 1 card if you have 3 or less cards in your hand.',
        tags: ['buff', 'draw'],
        boost: 4000,
        steps: [
          fx.buffBattle(4000),
          (g, c) => {
            if (P(g, c.player).hand.length <= 3) fx.drawN(1)(g, c);
          },
        ],
      },
    ],
  },

  // ================================================================ ST-04  Animal Kingdom Pirates (purple)
  'ST04-001': {
    effects: [
      {
        timing: 'activateMain',
        opt: true,
        text: "[Activate: Main] [Once Per Turn] DON!! −7: Trash up to 1 of your opponent's Life cards.",
        tags: ['life'],
        cost: { donMinus: 7 },
        when: (g, c) => P(g, opp(c.player)).life.length > 0,
        ai: (g, c) => (P(g, opp(c.player)).life.length <= 2 ? 2 : -1),
        steps: [fx.trashOppLife(1)],
      },
    ],
  },
  'ST04-002': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] DON!! −1: Play up to 1 [Page One] card with a cost of 4 or less from your hand.',
        tags: ['play'],
        cost: { donMinus: 1 },
        when: (g, c) => P(g, c.player).hand.some((u) => D(g.ids[u]).name === 'Page One'),
        steps: fx.playFrom('hand', (d) => d.name === 'Page One' && d.cost <= 4, '[Page One] with a cost of 4 or less'),
      },
    ],
  },
  'ST04-008': {
    effects: [
      {
        timing: 'onPlay',
        text: '[On Play] You may trash 1 card from your hand: Add up to 1 DON!! card from your DON!! deck and set it as active.',
        tags: ['ramp'],
        cost: { trashHand: 1 },
        when: (g, c) => P(g, c.player).donDeck > 0,
        ai: (g, c) => (P(g, c.player).hand.length >= 2 ? 1 : -1),
        steps: [fx.addDon(1, true)],
      },
    ],
  },
  'ST04-017': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] You may rest this Stage: If your Leader has the {Animal Kingdom Pirates} type, add up to 1 DON!! card from your DON!! deck and rest it.',
        tags: ['ramp'],
        cost: { restSelf: true },
        when: (g, c) => P(g, c.player).donDeck > 0 && D(P(g, c.player).leader.id).types.includes('Animal Kingdom Pirates'),
        steps: [fx.addDon(1, false)],
      },
    ],
  },

  // ================================================================ ST-06  Absolute Justice (black)
  'ST06-001': {
    effects: [
      {
        timing: 'activateMain',
        opt: true,
        text: "[Activate: Main] [Once Per Turn] ③ You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.",
        tags: ['ko'],
        cost: { don: 3, trashHand: 1 },
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => costOf(g, t) === 0),
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with a cost of 0.", (g, t) => costOf(g, t) === 0),
      },
    ],
  },
  'ST06-002': {
    effects: [
      {
        timing: 'onPlay',
        text: "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 0.",
        tags: ['ko'],
        cost: { trashHand: 1 },
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => costOf(g, t) === 0),
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with a cost of 0.", (g, t) => costOf(g, t) === 0),
      },
    ],
  },
  'ST06-004': {
    cantBeKoByEffect: true,
    dynKeyword: (g, self, kw) => kw === 'Double Attack' && self.don >= 1 && ([0, 1] as PlayerId[]).some((p) => P(g, p).chars.some((t) => costOf(g, t) === 0)),
  },
  'ST06-012': {
    effects: [
      {
        timing: 'activateMain',
        text: "[Activate: Main] You may trash 1 card from your hand and rest this Character: K.O. up to 1 of your opponent's Characters with a cost of 4 or less.",
        tags: ['ko'],
        cost: { trashHand: 1, restSelf: true },
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => costOf(g, t) <= 4),
        ai: (g, c) => (P(g, opp(c.player)).chars.some((t) => costOf(g, t) <= 4 && D(t.id).cost >= 3) ? 2 : -1),
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with a cost of 4 or less.", (g, t) => costOf(g, t) <= 4),
      },
    ],
  },
  'ST06-014': {
    effects: [
      {
        timing: 'counter',
        text: "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, K.O. up to 1 of your opponent's active Characters with a cost of 3 or less.",
        tags: ['buff', 'ko'],
        boost: 4000,
        steps: [fx.buffBattle(4000), ...fx.koOpp("K.O. up to 1 of your opponent's active Characters with a cost of 3 or less.", (g, t) => !t.rested && costOf(g, t) <= 3)],
      },
      {
        timing: 'trigger',
        text: "[Trigger] K.O. up to 1 of your opponent's Characters with a cost of 4 or less.",
        tags: ['ko'],
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with a cost of 4 or less.", (g, t) => costOf(g, t) <= 4),
      },
    ],
  },
  'ST06-015': {
    effects: [
      {
        timing: 'main',
        text: "[Main] Draw 1 card. Then, give up to 1 of your opponent's Characters −2 cost during this turn.",
        tags: ['draw', 'debuff'],
        steps: [fx.drawN(1), ...fx.statOpp('cost', -2, 'turn', "Give up to 1 of your opponent's Characters −2 cost during this turn.")],
      },
      { timing: 'trigger', text: '[Trigger] Your opponent chooses 1 card from their hand and trashes it.', tags: ['disrupt'], steps: fx.oppDiscard(1) },
    ],
  },
  'ST06-016': {
    effects: [
      { timing: 'counter', text: '[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle.', tags: ['buff'], boost: 2000, steps: [fx.buffBattle(2000)] },
      {
        timing: 'trigger',
        text: "[Trigger] Draw 1 card and none of your Characters can be K.O.'d during this turn.",
        tags: ['draw'],
        steps: [
          fx.drawN(1),
          (g, c) => {
            P(g, c.player).noKO = true;
            log(g, c.player, "White Out: none of that player's Characters can be K.O.'d this turn.", 'effect');
          },
        ],
      },
    ],
  },
  'ST06-017': {
    effects: [
      {
        timing: 'onPlay',
        text: "[On Play] Give up to 1 of your opponent's Characters −1 cost during this turn.",
        tags: ['debuff'],
        steps: fx.statOpp('cost', -1, 'turn', "Give up to 1 of your opponent's Characters −1 cost during this turn."),
      },
      {
        timing: 'activateMain',
        text: "[Activate: Main] You may rest this Stage: If your Leader has the {Navy} type, give up to 1 of your opponent's Characters −1 cost during this turn.",
        tags: ['debuff'],
        cost: { restSelf: true },
        when: (g, c) => D(P(g, c.player).leader.id).types.includes('Navy') && P(g, opp(c.player)).chars.length > 0,
        steps: fx.statOpp('cost', -1, 'turn', "Give up to 1 of your opponent's Characters −1 cost during this turn."),
      },
    ],
  },

  // ================================================================ ST-07  Big Mom Pirates (yellow)
  'ST07-001': {
    effects: [
      {
        timing: 'whenAttacking',
        don: 2,
        text: '[DON!! x2] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: If you have 2 or less Life cards, add up to 1 card from your hand to the top of your Life cards.',
        tags: ['life'],
        cost: { lifeToHand: true },
        ai: (g, c) => (P(g, c.player).life.length <= 3 && P(g, c.player).life.length >= 1 ? 1 : -1),
        steps: [fx.onlyIf((g, c) => P(g, c.player).life.length <= 2), ...fx.handToLife],
      },
    ],
  },
  'ST07-003': {
    effects: [
      {
        timing: 'onPlay',
        text: "[On Play] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, if you have less Life cards than your opponent, this Character gains [Rush] during this turn.",
        tags: ['life', 'rush'],
        steps: [
          ...fx.lifeLook,
          (g, c) => {
            const t = findField(g, c.src);
            if (t && P(g, c.player).life.length < P(g, opp(c.player)).life.length) {
              addFlag(t, 'Rush', 'turn');
              log(g, c.player, 'Charlotte Katakuri gains [Rush].', 'effect');
            }
          },
        ],
      },
    ],
  },
  'ST07-004': {
    effects: [
      {
        timing: 'whenAttacking',
        don: 1,
        text: '[DON!! x1] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: This Character gains [Banish] and +1000 power during this battle.',
        tags: ['buff'],
        cost: { lifeToHand: true },
        ai: (g, c) => (P(g, c.player).life.length >= 3 ? 1 : -1),
        steps: [
          (g, c) => {
            const t = findField(g, c.src);
            if (!t) return;
            addFlag(t, 'Banish', 'battle');
            addMod(t, 'power', 1000, 'battle');
            log(g, c.player, `Charlotte Snack gains [Banish] and +1000 power (now ${powerOf(g, t)}).`, 'effect');
          },
        ],
      },
    ],
  },
  'ST07-005': {
    effects: [
      {
        timing: 'whenAttacking',
        don: 1,
        text: '[DON!! x1] [When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 card from the top of your deck to the top of your Life cards.',
        tags: ['life'],
        cost: { lifeToHand: true },
        steps: [fx.gainLife(1)],
      },
    ],
  },
  'ST07-009': {
    effects: [
      {
        timing: 'activateMain',
        text: "[Activate: Main] You may rest this Character and add 1 card from the top or bottom of your Life cards to your hand: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
        tags: ['ko'],
        cost: { restSelf: true, lifeToHand: true },
        when: (g, c) => P(g, opp(c.player)).chars.some((t) => costOf(g, t) <= 3),
        ai: (g, c) => (P(g, c.player).life.length >= 3 ? 1 : -1),
        steps: fx.koOpp("K.O. up to 1 of your opponent's Characters with a cost of 3 or less.", (g, t) => costOf(g, t) <= 3),
      },
      { timing: 'trigger', text: '[Trigger] You may trash 1 card from your hand: Play this card.', tags: ['play'], cost: { trashHand: 1 }, steps: [fx.playSelf] },
    ],
  },
  'ST07-010': {
    effects: [
      {
        timing: 'onPlay',
        text: "[On Play] Your opponent chooses one: Trash 1 card from the top of your opponent's Life cards — or — add 1 card from the top of your deck to the top of your Life cards.",
        tags: ['life'],
        steps: fx.linlinChoice,
      },
    ],
  },
  'ST07-011': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] You may rest this Character: Up to 1 of your [Charlotte Linlin] cards gains [Banish] during this turn.',
        tags: ['buff'],
        cost: { restSelf: true },
        when: (g, c) => fx.P(g, c.player).turns > 1 && [P(g, c.player).leader, ...P(g, c.player).chars].some((t) => named(t, 'Charlotte Linlin') && !t.rested),
        steps: fx.flagOwn('Banish', 'turn', 'Up to 1 of your [Charlotte Linlin] cards gains [Banish] during this turn.', { leader: true, f: (_g, t) => named(t, 'Charlotte Linlin') }),
      },
      { timing: 'trigger', text: '[Trigger] Play this card.', tags: ['play'], steps: [fx.playSelf] },
    ],
  },
  'ST07-013': {
    effects: [
      {
        timing: 'activateMain',
        text: '[Activate: Main] You may rest this Character: Up to 1 of your [Charlotte Linlin] cards gains [Double Attack] during this turn.',
        tags: ['buff'],
        cost: { restSelf: true },
        when: (g, c) => P(g, c.player).turns > 1 && [P(g, c.player).leader, ...P(g, c.player).chars].some((t) => named(t, 'Charlotte Linlin') && !t.rested),
        steps: fx.flagOwn('Double Attack', 'turn', 'Up to 1 of your [Charlotte Linlin] cards gains [Double Attack] during this turn.', { leader: true, f: (_g, t) => named(t, 'Charlotte Linlin') }),
      },
      { timing: 'trigger', text: '[Trigger] Play this card.', tags: ['play'], steps: [fx.playSelf] },
    ],
  },
  'ST07-015': {
    effects: [
      {
        timing: 'main',
        text: "[Main] Your opponent chooses one: Trash 1 card from the top of your opponent's Life cards — or — add 1 card from the top of your deck to the top of your Life cards.",
        tags: ['life'],
        steps: fx.linlinChoice,
      },
      { timing: 'trigger', text: "[Trigger] Activate this card's [Main] effect.", tags: ['life'], steps: fx.linlinChoice },
    ],
  },
  'ST07-016': {
    effects: [
      {
        timing: 'counter',
        text: "[Counter] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, up to 1 of your Leader or Character cards gains +2000 power during this battle.",
        tags: ['buff', 'life'],
        boost: 2000,
        steps: [...fx.lifeLook, fx.buffBattle(2000)],
      },
      {
        timing: 'trigger',
        text: "[Trigger] Draw 1 card, look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards.",
        tags: ['draw', 'life'],
        steps: [fx.drawN(1), ...fx.lifeLook],
      },
    ],
  },
  'ST07-017': {
    effects: [
      {
        timing: 'activateMain',
        text: "[Activate: Main] You may rest this Stage and add 1 card from the top or bottom of your Life cards to your hand: Add up to 1 of your Characters with a cost of 3 to the top of the owner's Life cards face-up.",
        tags: ['life'],
        cost: { restSelf: true, lifeToHand: true },
        when: (g, c) => P(g, c.player).chars.some((t) => costOf(g, t) === 3),
        ai: () => -1,
        steps: [
          fx.pickOwn(1, "Add up to 1 of your Characters with a cost of 3 to the top of your Life cards face-up.", 'toLife', { f: (g, t) => costOf(g, t) === 3 }),
          fx.each((g, c, u) => {
            const name = D(g.ids[u]).name;
            if (leaveField(g, u, 'lifeTop')) log(g, c.player, `${name} is placed on top of Life face-up.`, 'effect');
          }),
        ],
      },
      { timing: 'trigger', text: '[Trigger] Play this card.', tags: ['play'], steps: [fx.playSelf] },
    ],
  },
};
