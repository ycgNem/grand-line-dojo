// Behaviour tests for cards the text compiler turns into rules: each test plays a real card
// and checks the outcome the printed text promises.

import { describe, expect, it } from 'vitest';
import { card } from '../src/data/db';
import { P, apply, attackTargets, canPay, costOf, findField, hasKw, playCost, powerOf, totalDon, whyCantAttack, whyCantPlay } from '../src/engine/game';
import type { Game } from '../src/engine/types';
import { A, deck, drive, endTurn, give, options, pass1, put, setDon, start, take, toTurn } from './helpers';

/** Both players on the ST-01 Luffy Leader (5000 power, 5 Life, no continuous effect). */
const duel = (): Game => start(deck('st01'), deck('st01'));
const simulated = (...ids: string[]): void => {
  for (const id of ids) expect(card(id).sim, `${id} should be playable`).not.toBe('none');
};
const defend = (g: Game): void => {
  while (g.pending?.kind === 'block' || g.pending?.kind === 'counter') pass1(g);
};

describe('compiled cards — costs', () => {
  it('a card in your hand gets cheaper while its condition holds (EB04-061 Luffy)', () => {
    simulated('EB04-061');
    const g = duel();
    toTurn(g, 0, 2);
    const me = P(g, 0);
    const luffy = give(g, 0, 'EB04-061');
    expect(playCost(g, 0, luffy)).toBe(10);
    me.trash.push(...me.life.splice(1).map((l) => l.uid)); // down to 1 Life
    expect(playCost(g, 0, luffy)).toBe(9);
    setDon(g, 0, 9);
    expect(whyCantPlay(g, luffy)).toBeNull();
    apply(g, { type: 'play', uid: luffy });
    expect(me.donActive).toBe(0);
    expect(g.pending?.kind).toBe('confirm'); // "You may trash 1 card from your hand:"
    drive(g);
    endTurn(g);
    expect(powerOf(g, me.leader)).toBe(7000); // until the end of the opponent's next End Phase
    expect(hasKw(g, findField(g, luffy)!, 'Blocker')).toBe(true);
    endTurn(g);
    expect(powerOf(g, me.leader)).toBe(5000);
    expect(hasKw(g, findField(g, luffy)!, 'Blocker')).toBe(false);
  });

  it('DON!! −2 plus a hand cost: both are paid before the effect (OP09-072 Franky)', () => {
    simulated('OP09-072');
    const g = duel();
    toTurn(g, 0, 3);
    const me = P(g, 0);
    setDon(g, 0, 6);
    const franky = give(g, 0, 'OP09-072');
    const hand = me.hand.length;
    apply(g, { type: 'play', uid: franky });
    expect(g.pending?.kind).toBe('confirm');
    drive(g);
    expect(me.donDeck).toBe(6); // 4 in the DON!! deck + the 2 returned
    expect(totalDon(me)).toBe(4);
    expect(me.hand.length).toBe(hand - 1 - 1 + 2); // played Franky, trashed 1, drew 2
  });

  it('declining an optional cost skips the effect (OP09-072 Franky)', () => {
    const g = duel();
    toTurn(g, 0, 3);
    const me = P(g, 0);
    setDon(g, 0, 6);
    const franky = give(g, 0, 'OP09-072');
    const hand = me.hand.length;
    apply(g, { type: 'play', uid: franky });
    A(g, { kind: 'confirm', yes: false });
    expect(g.pending).toBeNull();
    expect(totalDon(me)).toBe(6);
    expect(me.hand.length).toBe(hand - 1);
  });

  it('"You may turn your top Life card face-up:" is a cost, and the condition is checked after it (EB04-059)', () => {
    simulated('EB04-059');
    const g = duel();
    toTurn(g, 0, 3);
    const me = P(g, 0);
    setDon(g, 0, 6);
    const franky = put(g, 1, 'ST01-010'); // cost 4
    const robin = put(g, 1, 'ST01-008'); // cost 3
    const twister = give(g, 0, 'EB04-059');
    apply(g, { type: 'play', uid: twister });
    drive(g, [franky.uid, robin.uid]);
    expect(me.life[0].faceUp).toBe(true);
    expect(findField(g, franky.uid)).toBeNull();
    expect(findField(g, robin.uid)).toBeNull();
  });

  it('a second "K.O. … and up to 1 …" target is its own pick with its own limit (OP01-096 King)', () => {
    simulated('OP01-096');
    const g = duel();
    toTurn(g, 0, 4);
    setDon(g, 0, 9);
    const robin = put(g, 1, 'ST01-008'); // cost 3
    const chopper = put(g, 1, 'ST01-006'); // cost 1
    const franky = put(g, 1, 'ST01-010'); // cost 4: too big for either pick
    const king = give(g, 0, 'OP01-096');
    apply(g, { type: 'play', uid: king });
    expect(g.pending?.kind).toBe('confirm'); // DON!! −2
    A(g, { kind: 'confirm', yes: true });
    expect(options(g)).not.toContain(franky.uid);
    drive(g, [robin.uid, chopper.uid]);
    expect(findField(g, robin.uid)).toBeNull();
    expect(findField(g, chopper.uid)).toBeNull();
    expect(findField(g, franky.uid)).not.toBeNull();
    expect(P(g, 0).donDeck).toBe(3);
  });
});

describe('compiled cards — choices', () => {
  it('"choose one" behind a condition (OP06-093 Perona)', () => {
    simulated('OP06-093');
    const g = duel();
    toTurn(g, 0, 3);
    const foe = P(g, 1);
    setDon(g, 0, 8);
    const luffy = put(g, 1, 'ST01-012'); // cost 5
    expect(foe.hand.length).toBeGreaterThanOrEqual(5);
    apply(g, { type: 'play', uid: give(g, 0, 'OP06-093') });
    expect(g.pending?.kind).toBe('option');
    A(g, { kind: 'option', index: 0 }); // "Your opponent trashes 1 card from their hand."
    expect(g.pending?.kind).toBe('select');
    expect(g.pending?.player).toBe(1); // the opponent picks their own discard
    const before = foe.hand.length;
    drive(g);
    expect(foe.hand.length).toBe(before - 1);

    apply(g, { type: 'play', uid: give(g, 0, 'OP06-093') });
    A(g, { kind: 'option', index: 1 }); // "Give up to 1 of your opponent's Characters −3 cost during this turn."
    drive(g, [luffy.uid]);
    expect(costOf(g, luffy)).toBe(2);
    endTurn(g);
    expect(costOf(g, luffy)).toBe(5);
  });

  it('the condition failing means no choice at all (OP06-093 Perona)', () => {
    const g = duel();
    toTurn(g, 0, 3);
    const foe = P(g, 1);
    setDon(g, 0, 4);
    foe.deck.push(...foe.hand.splice(4)); // 4 cards in hand
    apply(g, { type: 'play', uid: give(g, 0, 'OP06-093') });
    expect(g.pending).toBeNull();
  });

  it('a [Main] Event with two modes (EB02-051)', () => {
    simulated('EB02-051');
    const g = duel();
    toTurn(g, 0, 3);
    setDon(g, 0, 6);
    const chopper = put(g, 1, 'ST01-006'); // cost 1
    const luffy = put(g, 1, 'ST01-012'); // cost 5
    apply(g, { type: 'play', uid: give(g, 0, 'EB02-051') });
    expect(g.pending?.kind).toBe('option');
    A(g, { kind: 'option', index: 0 });
    expect(options(g)).toEqual([chopper.uid]); // only cost 2 or less
    drive(g, [chopper.uid]);
    expect(findField(g, chopper.uid)).toBeNull();
    apply(g, { type: 'play', uid: give(g, 0, 'EB02-051') });
    A(g, { kind: 'option', index: 1 });
    drive(g, [luffy.uid]);
    expect(costOf(g, luffy)).toBe(1);
  });

  it('guess the cost of the top card of the opponent deck (OP11-066 Charlotte Oven)', () => {
    simulated('OP11-066');
    for (const right of [true, false]) {
      const g = duel();
      toTurn(g, 0, 3);
      const me = P(g, 0);
      const foe = P(g, 1);
      setDon(g, 0, 3);
      const oven = put(g, 0, 'OP11-066');
      const chopper = put(g, 1, 'ST01-006');
      const top = foe.deck[0];
      const cost = card(g.ids[top]).cost;
      apply(g, { type: 'activate', uid: oven.uid, idx: 0 });
      expect(oven.rested).toBe(true);
      expect(g.pending?.kind).toBe('option');
      A(g, { kind: 'option', index: right ? cost : (cost + 1) % 11 });
      drive(g, [chopper.uid]);
      expect(findField(g, chopper.uid) === null).toBe(right);
      expect(foe.deck[0]).toBe(top); // revealed, not moved
      expect(me.donRested).toBe(1); // "Then, add up to 1 DON!! card … and rest it" happens either way
      expect(me.donDeck).toBe(6);
    }
  });

  it('the opponent chooses which of their Characters is returned (OP06-051 Tsuru)', () => {
    simulated('OP06-051');
    const g = duel();
    toTurn(g, 0, 3);
    setDon(g, 0, 5);
    const robin = put(g, 1, 'ST01-008');
    const franky = put(g, 1, 'ST01-010');
    apply(g, { type: 'play', uid: give(g, 0, 'OP06-051') });
    A(g, { kind: 'confirm', yes: true });
    expect(g.pending?.kind).toBe('select');
    A(g, { kind: 'select', uids: options(g).slice(0, 2) }); // trash 2 cards
    expect(g.pending?.kind).toBe('select');
    expect(g.pending?.player).toBe(1);
    expect([...options(g)].sort()).toEqual([robin.uid, franky.uid].sort());
    A(g, { kind: 'select', uids: [franky.uid] });
    expect(findField(g, franky.uid)).toBeNull();
    expect(P(g, 1).hand).toContain(franky.uid);
    expect(findField(g, robin.uid)).not.toBeNull();
  });

  it('look at all your Life cards and put them back in any order (OP13-105 Momonosuke)', () => {
    simulated('OP13-105');
    const g = duel();
    toTurn(g, 0, 3);
    const me = P(g, 0);
    setDon(g, 0, 3);
    const order = me.life.map((l) => l.uid);
    apply(g, { type: 'play', uid: give(g, 0, 'OP13-105') });
    expect(g.pending?.kind).toBe('select');
    expect([...options(g)].sort()).toEqual([...order].sort());
    A(g, { kind: 'select', uids: [...order].reverse() });
    expect(me.life.map((l) => l.uid)).toEqual([...order].reverse());
  });
});

describe('compiled cards — Life', () => {
  it('adds to your Life, then sends an enemy Character to the top or bottom of theirs face-up (OP08-069 Linlin)', () => {
    simulated('OP08-069');
    const g = duel();
    toTurn(g, 0, 5);
    const me = P(g, 0);
    const foe = P(g, 1);
    setDon(g, 0, 10);
    const franky = put(g, 1, 'ST01-010'); // cost 4
    const linlin = give(g, 0, 'OP08-069');
    apply(g, { type: 'play', uid: linlin });
    A(g, { kind: 'confirm', yes: true }); // DON!! −1 and trash 1 card
    const myLife = me.life.length;
    const foeLife = foe.life.length;
    const top = me.deck[0];
    drive(g, [franky.uid], { lifeSpot: 1 }); // bottom
    expect(me.life.length).toBe(myLife + 1);
    expect(me.life[0].uid).toBe(top);
    expect(findField(g, franky.uid)).toBeNull();
    expect(foe.life.length).toBe(foeLife + 1);
    expect(foe.life[foe.life.length - 1]).toEqual({ uid: franky.uid, faceUp: true });
  });

  it('"deal 1 damage to your opponent" when K.O.\'d on their turn (EB03-055 Nico Robin)', () => {
    simulated('EB03-055');
    const g = duel();
    toTurn(g, 0, 2);
    const robin = put(g, 0, 'EB03-055', true);
    endTurn(g);
    const foe = P(g, 1);
    const newgate = put(g, 1, 'OP02-004'); // 10000 power
    const life = foe.life.length;
    const hand = foe.hand.length;
    apply(g, { type: 'attack', attacker: newgate.uid, target: robin.uid });
    defend(g);
    expect(g.pending?.kind).toBe('confirm');
    expect(g.pending?.player).toBe(0);
    A(g, { kind: 'confirm', yes: true });
    if (g.pending?.kind === 'trigger') A(g, { kind: 'trigger', activate: false });
    expect(findField(g, robin.uid)).toBeNull();
    expect(foe.life.length).toBe(life - 1);
    expect(foe.hand.length).toBe(hand + 1); // damage puts the Life card in the hand
  });

  it('effect damage at 0 Life wins the game (EB03-055 Nico Robin)', () => {
    const g = duel();
    toTurn(g, 0, 2);
    const robin = put(g, 0, 'EB03-055', true);
    endTurn(g);
    const foe = P(g, 1);
    foe.trash.push(...foe.life.splice(0).map((l) => l.uid));
    const newgate = put(g, 1, 'OP02-004');
    apply(g, { type: 'attack', attacker: newgate.uid, target: robin.uid });
    defend(g);
    A(g, { kind: 'confirm', yes: true });
    expect(g.winner).toBe(0);
  });

  it('"you cannot add Life cards to your hand using your own effects during this turn" (OP02-004 Edward.Newgate)', () => {
    simulated('OP02-004');
    const g = duel();
    toTurn(g, 0, 5);
    const me = P(g, 0);
    setDon(g, 0, 9);
    const newgate = give(g, 0, 'OP02-004');
    expect(canPay(g, 0, newgate, { lifeToHand: true })).toBe(true);
    apply(g, { type: 'play', uid: newgate });
    drive(g);
    expect(powerOf(g, me.leader)).toBe(7000);
    expect(canPay(g, 0, newgate, { lifeToHand: true })).toBe(false);
    endTurn(g);
    expect(powerOf(g, me.leader)).toBe(7000); // until the start of your next turn
    endTurn(g);
    expect(powerOf(g, me.leader)).toBe(5000);
    expect(canPay(g, 0, newgate, { lifeToHand: true })).toBe(true);
  });
});

describe('compiled cards — continuous effects and reactions', () => {
  it('an aura on the opponent side, with an "only … on your field" condition (OP05-084 Saint Charlos)', () => {
    simulated('OP05-084');
    const g = duel();
    toTurn(g, 0, 2);
    put(g, 0, 'OP05-084');
    const luffy = put(g, 1, 'ST01-012'); // cost 5
    expect(costOf(g, luffy)).toBe(1);
    endTurn(g);
    expect(costOf(g, luffy)).toBe(5); // [Your Turn] only
    endTurn(g);
    expect(costOf(g, luffy)).toBe(1);
    put(g, 0, 'ST01-006'); // a non-Celestial Dragons Character breaks the condition
    expect(costOf(g, luffy)).toBe(5);
  });

  it("[Opponent's Turn] power bonus (OP10-086 Shiryu)", () => {
    simulated('OP10-086');
    const g = duel();
    toTurn(g, 0, 2);
    const shiryu = put(g, 0, 'OP10-086');
    expect(powerOf(g, shiryu)).toBe(5000);
    endTurn(g);
    expect(powerOf(g, shiryu)).toBe(7000);
  });

  it("\"If this Character would be K.O.'d, you may trash … from your hand instead\" (OP15-003 Alvida)", () => {
    simulated('OP15-003');
    const g = duel();
    toTurn(g, 0, 2);
    const me = P(g, 0);
    const alvida = put(g, 0, 'OP15-003');
    me.deck.push(...me.hand.splice(0)); // empty hand: nothing to pay with
    endTurn(g);
    setDon(g, 1, 10);
    const robin = give(g, 0, 'ST01-008'); // a 5000-power Character card
    apply(g, { type: 'play', uid: give(g, 1, 'ST01-015') }); // K.O. a Character with 6000 power or less
    A(g, { kind: 'select', uids: [alvida.uid] });
    expect(g.pending?.player).toBe(0);
    drive(g, [alvida.uid, robin]);
    expect(findField(g, alvida.uid)).not.toBeNull();
    expect(me.trash).toContain(robin);
    // With no Character card left in hand, the second K.O. goes through.
    apply(g, { type: 'play', uid: give(g, 1, 'ST01-015') });
    A(g, { kind: 'select', uids: [alvida.uid] });
    drive(g);
    expect(findField(g, alvida.uid)).toBeNull();
  });

  it('"cannot attack until the end of your opponent\'s next End Phase", and returning from the trash when K.O.\'d (OP14-120 Crocodile)', () => {
    simulated('OP14-120');
    const g = duel();
    toTurn(g, 0, 5);
    setDon(g, 0, 8);
    const robin = put(g, 1, 'ST01-008');
    const croc = give(g, 0, 'OP14-120');
    apply(g, { type: 'play', uid: croc });
    drive(g, [robin.uid]);
    endTurn(g);
    expect(whyCantAttack(g, robin.uid)).not.toBeNull();
    // Newgate (10000) attacks the rested Crocodile (10000) and K.O.s it.
    findField(g, croc)!.rested = true;
    const newgate = put(g, 1, 'OP02-004');
    apply(g, { type: 'attack', attacker: newgate.uid, target: croc });
    defend(g);
    expect(g.pending?.kind).toBe('confirm'); // "You may trash 1 card from your hand:"
    drive(g);
    expect(findField(g, croc)).not.toBeNull(); // played again from the trash
    expect(P(g, 0).trash).not.toContain(croc);
    endTurn(g);
    endTurn(g);
    expect(whyCantAttack(g, robin.uid)).toBeNull();
  });

  it('"can attack Characters on the turn in which it is played" (OP11-031 Jinbe)', () => {
    simulated('OP11-031');
    const g = duel();
    toTurn(g, 0, 4);
    setDon(g, 0, 6);
    const robin = put(g, 1, 'ST01-008', true);
    const jinbe = give(g, 0, 'OP11-031');
    apply(g, { type: 'play', uid: jinbe });
    drive(g);
    expect(whyCantAttack(g, jinbe)).not.toBeNull();
    apply(g, { type: 'activate', uid: jinbe, idx: 1 });
    drive(g, [jinbe]);
    expect(whyCantAttack(g, jinbe)).toBeNull();
    expect(attackTargets(g, jinbe)).toEqual([robin.uid]); // Characters only, not the Leader
  });

  it('"that card gains an additional +2000" follows the first pick ([Counter] EB03-020)', () => {
    simulated('EB03-020');
    for (const film of [true, false]) {
      const g = duel();
      toTurn(g, 1, 2);
      const me = P(g, 0);
      const foe = P(g, 1);
      setDon(g, 0, 1);
      if (film) {
        put(g, 0, 'EB03-002'); // two {FILM} Characters
        put(g, 0, 'OP02-028');
      }
      setDon(g, 1, 6);
      apply(g, { type: 'don', target: foe.leader.uid, n: 6 }); // 11000: the Counter Step stays open either way
      const event = give(g, 0, 'EB03-020');
      apply(g, { type: 'attack', attacker: foe.leader.uid, target: me.leader.uid });
      while (g.pending?.kind === 'block') pass1(g);
      expect(g.pending?.kind).toBe('counter');
      A(g, { kind: 'counter', use: event });
      if (g.pending?.kind === 'select') A(g, { kind: 'select', uids: [me.leader.uid] });
      expect(powerOf(g, me.leader)).toBe(film ? 9000 : 7000);
    }
  });

  it('a "When a DON!! card is returned" reaction, once per turn (EB04-035 Kamazo + OP09-072 Franky)', () => {
    simulated('EB04-035');
    const g = start(deck('st01'), deck('st02')); // Kid Leader: {Kid Pirates}
    toTurn(g, 0, 3);
    const me = P(g, 0);
    put(g, 0, 'EB04-035');
    setDon(g, 0, 6);
    apply(g, { type: 'play', uid: give(g, 0, 'OP09-072') });
    drive(g);
    expect(totalDon(me)).toBe(5); // 6 − 2 returned + 1 added by Kamazo
    expect(me.donDeck).toBe(5);
  });
});

describe('compiled cards — more mechanics', () => {
  it('a Stage that makes matching Characters in your hand cheaper on your turn (OP05-097 Mary Geoise)', () => {
    simulated('OP05-097');
    const g = duel();
    toTurn(g, 0, 2);
    const uid = take(g, 0, 'OP05-097');
    P(g, 0).stage = { uid, id: 'OP05-097', rested: false, don: 0, playedTurn: 0, mods: [], flags: [], used: [], frozen: false };
    const charlos = give(g, 0, 'OP05-084'); // {Celestial Dragons}, cost 3
    const robin = give(g, 0, 'ST01-008'); // cost 3, wrong type
    expect(playCost(g, 0, charlos)).toBe(2);
    expect(playCost(g, 0, robin)).toBe(3);
    setDon(g, 0, 2);
    expect(whyCantPlay(g, charlos)).toBeNull();
    apply(g, { type: 'play', uid: charlos });
    expect(P(g, 0).donActive).toBe(0);
    expect(findField(g, charlos)).not.toBeNull();
  });

  it('"set up to 1 of your DON!! cards as active at the end of this turn", and a freeze (EB02-015 Bonney)', () => {
    simulated('EB02-015');
    const g = duel();
    toTurn(g, 0, 4);
    const me = P(g, 0);
    setDon(g, 0, 7);
    const robin = put(g, 1, 'ST01-008', true);
    apply(g, { type: 'play', uid: give(g, 0, 'EB02-015') });
    drive(g, [robin.uid]);
    expect(me.donActive).toBe(0);
    endTurn(g);
    expect(me.donActive).toBe(1); // ready for a Counter Event on the opponent's turn
    expect(me.donRested).toBe(6);
    expect(robin.rested).toBe(true); // skipped its Refresh Phase
    endTurn(g);
    endTurn(g);
    expect(robin.rested).toBe(false);
  });

  it('[End of Your Turn] trash down to 5 cards (OP14-054 Fisher Tiger)', () => {
    simulated('OP14-054');
    const g = duel();
    toTurn(g, 0, 2);
    const me = P(g, 0);
    put(g, 0, 'OP14-054');
    while (me.hand.length < 8) me.hand.push(me.deck.shift()!);
    endTurn(g);
    drive(g);
    expect(me.hand.length).toBe(5);
    expect(g.active).toBe(1);
  });

  it('a reaction to the opponent activating an Event (OP06-044 Gion)', () => {
    simulated('OP06-044');
    const g = duel();
    toTurn(g, 0, 2);
    const foe = P(g, 1);
    put(g, 0, 'OP06-044');
    setDon(g, 1, 1);
    const guard = give(g, 1, 'ST01-014'); // [Counter] +3000
    const hand = foe.hand.length;
    const deckSize = foe.deck.length;
    apply(g, { type: 'attack', attacker: P(g, 0).leader.uid, target: foe.leader.uid });
    while (g.pending?.kind === 'block') pass1(g);
    A(g, { kind: 'counter', use: guard });
    drive(g);
    expect(foe.hand.length).toBe(hand - 2); // the Event, and 1 card to the bottom of the deck
    expect(foe.deck.length).toBe(deckSize + 1);
  });

  it('freezing a rested Leader as well as Characters (OP04-031 Doflamingo)', () => {
    simulated('OP04-031');
    const g = duel();
    toTurn(g, 0, 6);
    const foe = P(g, 1);
    setDon(g, 0, 10);
    foe.leader.rested = true;
    const robin = put(g, 1, 'ST01-008', true);
    apply(g, { type: 'play', uid: give(g, 0, 'OP04-031') });
    expect([...options(g)].sort()).toEqual([foe.leader.uid, robin.uid].sort());
    A(g, { kind: 'select', uids: [foe.leader.uid, robin.uid] });
    endTurn(g);
    expect(foe.leader.rested).toBe(true);
    expect(robin.rested).toBe(true);
    endTurn(g);
    endTurn(g);
    expect(foe.leader.rested).toBe(false);
  });

  it("\"Your {Navy} type Leader's base power becomes 7000\" on the opponent's turn (EB04-003)", () => {
    simulated('EB04-003');
    const g = start(deck('st01'), deck('st06')); // Sakazuki: {Navy}, 5000
    toTurn(g, 0, 2);
    const me = P(g, 0);
    put(g, 0, 'EB04-003');
    expect(powerOf(g, me.leader)).toBe(5000);
    endTurn(g);
    expect(powerOf(g, me.leader)).toBe(7000);
    const other = duel(); // a non-Navy Leader gets nothing
    toTurn(other, 0, 2);
    put(other, 0, 'EB04-003');
    endTurn(other);
    expect(powerOf(other, P(other, 0).leader)).toBe(5000);
  });

  it('a face-up Life card as a condition, then all Life face-down (EB03-051 Smoothie)', () => {
    simulated('EB03-051');
    for (const faceUp of [true, false]) {
      const g = duel();
      toTurn(g, 0, 2);
      const me = P(g, 0);
      setDon(g, 0, 3);
      me.life[1].faceUp = faceUp;
      const chopper = put(g, 1, 'ST01-006');
      apply(g, { type: 'play', uid: give(g, 0, 'EB03-051') });
      drive(g, [chopper.uid]);
      expect(findField(g, chopper.uid) === null).toBe(faceUp);
      expect(me.life.every((l) => !l.faceUp)).toBe(true);
    }
  });

  it('"rest up to a total of 2 of your opponent\'s Characters or DON!! cards" (OP06-035 Hody Jones)', () => {
    simulated('OP06-035');
    const g = duel();
    toTurn(g, 0, 4);
    const me = P(g, 0);
    const foe = P(g, 1);
    setDon(g, 0, 7);
    setDon(g, 1, 3);
    const robin = put(g, 1, 'ST01-008');
    const life = me.life.length;
    const hand = me.hand.length;
    apply(g, { type: 'play', uid: give(g, 0, 'OP06-035') });
    drive(g, [robin.uid]);
    expect(robin.rested).toBe(true);
    expect(foe.donRested).toBe(1); // 1 Character + 1 DON!! = a total of 2
    expect(foe.donActive).toBe(2);
    expect(me.life.length).toBe(life - 1);
    expect(me.hand.length).toBe(hand + 1); // Hody left the hand, a Life card joined it
  });

  it("look at the opponent's Life cards and reorder them (EB01-052 Viola)", () => {
    simulated('EB01-052');
    const g = duel();
    toTurn(g, 0, 2);
    const foe = P(g, 1);
    setDon(g, 0, 2);
    const order = foe.life.map((l) => l.uid);
    apply(g, { type: 'play', uid: give(g, 0, 'EB01-052') });
    expect(g.pending?.kind).toBe('option');
    A(g, { kind: 'option', index: 0 });
    expect(g.pending?.kind).toBe('select');
    expect(g.pending?.player).toBe(0);
    A(g, { kind: 'select', uids: [...order].reverse() });
    expect(foe.life.map((l) => l.uid)).toEqual([...order].reverse());
  });
});
