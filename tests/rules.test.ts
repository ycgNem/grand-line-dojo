import { describe, expect, it } from 'vitest';
import { P, apply, attackTargets, findField, hasKw, powerOf, whyCantAttack, whyCantPlay } from '../src/engine/game';
import { D } from '../src/engine/registry';
import { A, deck, endTurn, give, options, pass, pass1, put, setDon, start, toTurn } from './helpers';

describe('core rules', () => {
  it('sets up Life from the Leader, 5-card hands, and the first-turn exceptions', () => {
    const g = start();
    expect(P(g, 0).life.length).toBe(4); // Luffy & Ace has 4 Life
    expect(P(g, 0).hand.length).toBe(5); // the first player does not draw on turn 1
    expect(P(g, 0).donActive).toBe(1); // and gets only 1 DON!!
    expect(whyCantAttack(g, P(g, 0).leader.uid)).toMatch(/first turn/);
    endTurn(g);
    expect(P(g, 1).hand.length).toBe(6);
    expect(P(g, 1).donActive).toBe(2);
    expect(whyCantAttack(g, P(g, 1).leader.uid)).toMatch(/first turn/);
    endTurn(g);
    expect(P(g, 0).donActive).toBe(3);
    expect(whyCantAttack(g, P(g, 0).leader.uid)).toBeNull();
  });

  it('gives +1000 per attached DON!! on your own turn only, and returns DON!! on Refresh', () => {
    const g = start();
    toTurn(g, 0, 2);
    const L = P(g, 0).leader;
    apply(g, { type: 'don', target: L.uid, n: 2 });
    expect(powerOf(g, L)).toBe(8000);
    endTurn(g);
    expect(powerOf(g, L)).toBe(6000); // attached DON!! do nothing on the opponent's turn
    expect(L.don).toBe(2);
    endTurn(g);
    expect(L.don).toBe(0);
    expect(P(g, 0).donActive).toBe(5);
  });

  it('an attack succeeds on equal or higher power; counters change the maths for one battle', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const me = P(g, 0);
    const o = P(g, 1);
    apply(g, { type: 'attack', attacker: me.leader.uid, target: o.leader.uid }); // 6000 into 5000
    pass(g);
    expect(o.life.length).toBe(4);
    const mr2 = put(g, 0, 'ST30-013');
    const c1 = give(g, 1, 'ST01-008'); // Nico Robin, +1000 counter
    const c2 = give(g, 1, 'ST01-008');
    apply(g, { type: 'attack', attacker: mr2.uid, target: o.leader.uid });
    expect(g.pending?.kind).toBe('counter');
    A(g, { kind: 'counter', use: c1 });
    expect(powerOf(g, o.leader)).toBe(6000); // 6000 vs 6000 still hits
    expect(g.pending?.kind).toBe('counter');
    A(g, { kind: 'counter', use: c2 }); // 7000 beats 6000, so the Counter Step closes by itself
    expect(g.battle).toBeNull();
    expect(o.life.length).toBe(4); // defended
    expect(powerOf(g, o.leader)).toBe(5000); // battle bonuses are gone
    expect(o.trash).toEqual(expect.arrayContaining([c1, c2]));
  });

  it('[Blocker] redirects the attack; only rested Characters can be attacked', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const chopper = put(g, 1, 'ST01-006'); // 1000-power Blocker
    const robin = put(g, 1, 'ST01-008');
    const mr2 = put(g, 0, 'ST30-013');
    expect(attackTargets(g, mr2.uid)).toEqual([P(g, 1).leader.uid]);
    robin.rested = true;
    expect(attackTargets(g, mr2.uid)).toContain(robin.uid);
    apply(g, { type: 'attack', attacker: mr2.uid, target: P(g, 1).leader.uid });
    expect(g.pending?.kind).toBe('block');
    A(g, { kind: 'block', uid: chopper.uid });
    pass(g);
    expect(findField(g, chopper.uid)).toBeNull();
    expect(P(g, 1).life.length).toBe(5);
  });

  it('[Trigger] can be activated instead of drawing the Life card; damage at 0 Life loses', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const o = P(g, 1);
    const jp = o.deck.find((u) => g.ids[u] === 'ST01-015')!; // Gum-Gum Jet Pistol
    o.deck.splice(o.deck.indexOf(jp), 1);
    o.deck.push(o.life[0].uid);
    o.life[0] = { uid: jp, faceUp: false };
    const mr2 = put(g, 0, 'ST30-013');
    apply(g, { type: 'attack', attacker: P(g, 0).leader.uid, target: o.leader.uid });
    if (g.pending?.kind === 'counter') A(g, { kind: 'counter', use: null });
    expect(g.pending?.kind).toBe('trigger');
    A(g, { kind: 'trigger', activate: true });
    expect(g.pending?.kind).toBe('select');
    A(g, { kind: 'select', uids: [mr2.uid] });
    expect(findField(g, mr2.uid)).toBeNull();
    expect(o.trash).toContain(jp); // a used Trigger card is trashed, not kept
    o.trash.push(...o.life.map((l) => l.uid));
    o.life = [];
    const jozu = put(g, 0, 'ST30-005');
    apply(g, { type: 'attack', attacker: jozu.uid, target: o.leader.uid });
    pass(g);
    expect(g.winner).toBe(0);
  });

  it('a player with no cards left in their deck loses', () => {
    const g = start();
    toTurn(g, 0, 2);
    const o = P(g, 1);
    o.trash.push(...o.deck.splice(1));
    endTurn(g); // the opponent draws their last card
    expect(g.winner).toBe(0);
  });

  it('a sixth Character forces a trash; Characters cannot attack the turn they are played', () => {
    const g = start();
    toTurn(g, 0, 3);
    for (let i = 0; i < 4; i++) put(g, 0, 'ST30-009');
    put(g, 0, 'ST30-013');
    setDon(g, 0, 5);
    const jozu = give(g, 0, 'ST30-005');
    apply(g, { type: 'play', uid: jozu });
    expect(g.pending?.kind).toBe('select');
    A(g, { kind: 'select', uids: [options(g)[0]] });
    expect(P(g, 0).chars.length).toBe(5);
    expect(findField(g, jozu)).not.toBeNull();
    expect(whyCantAttack(g, jozu)).toMatch(/turn it is played/);
  });

  it('explains why a card cannot be played', () => {
    const g = start();
    const newgate = give(g, 0, 'ST30-003');
    expect(whyCantPlay(g, newgate)).toMatch(/costs 8/);
    const counterEvent = give(g, 0, 'ST30-016');
    expect(whyCantPlay(g, counterEvent)).toMatch(/Counter/);
  });
});

describe('ST-30 Luffy & Ace — every card', () => {
  it('Leader: Ace and Luffy get +3000 on the opponent turn only; −2000 with a 7000-base Character', () => {
    const g = start();
    toTurn(g, 0, 2);
    const ace = put(g, 0, 'ST30-007');
    const luffy = put(g, 0, 'ST30-012');
    const jozu = put(g, 0, 'ST30-005');
    expect(powerOf(g, ace)).toBe(6000);
    endTurn(g);
    expect(powerOf(g, ace)).toBe(9000);
    expect(powerOf(g, luffy)).toBe(9000);
    expect(powerOf(g, jozu)).toBe(6000);
    expect(powerOf(g, P(g, 0).leader)).toBe(6000);
    // A 7000-base Character (Kid, ST02-013) on your side shrinks the Leader.
    g.ids[999] = 'ST02-013';
    P(g, 0).chars.push({ uid: 999, id: 'ST02-013', rested: false, don: 0, playedTurn: 0, mods: [], flags: [], used: [], frozen: false });
    expect(powerOf(g, P(g, 0).leader)).toBe(4000);
  });

  it('Edward Newgate: +1000 to your 6000-base Characters on your turn (himself included)', () => {
    const g = start();
    toTurn(g, 0, 2);
    const wb = put(g, 0, 'ST30-003');
    const jozu = put(g, 0, 'ST30-005');
    const mr3 = put(g, 0, 'ST30-014');
    expect(powerOf(g, wb)).toBe(7000);
    expect(powerOf(g, jozu)).toBe(7000);
    expect(powerOf(g, mr3)).toBe(3000);
    expect(powerOf(g, P(g, 0).leader)).toBe(6000); // 6000 BASE power, so no Leader penalty
    endTurn(g);
    expect(powerOf(g, jozu)).toBe(6000);
  });

  it('Ace: pay 1 DON!! for [Rush]; −1000 when attacking', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 3);
    setDon(g, 0, 5);
    const robin = put(g, 1, 'ST01-008', true);
    const ace = give(g, 0, 'ST30-007');
    apply(g, { type: 'play', uid: ace });
    expect(g.pending?.kind).toBe('confirm');
    A(g, { kind: 'confirm', yes: true });
    expect(P(g, 0).donActive).toBe(0);
    expect(hasKw(g, findField(g, ace)!, 'Rush')).toBe(true);
    expect(whyCantAttack(g, ace)).toBeNull();
    apply(g, { type: 'attack', attacker: ace, target: robin.uid });
    A(g, { kind: 'select', uids: [robin.uid] });
    expect(powerOf(g, robin)).toBe(4000);
    pass(g);
    expect(findField(g, robin.uid)).toBeNull();
    endTurn(g);
    expect(hasKw(g, findField(g, ace)!, 'Rush')).toBe(false);
  });

  it('Luffy: rests an enemy Blocker when attacking, so it cannot block', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const chopper = put(g, 1, 'ST01-006');
    const luffy = put(g, 0, 'ST30-012');
    apply(g, { type: 'attack', attacker: luffy.uid, target: P(g, 1).leader.uid });
    A(g, { kind: 'select', uids: [chopper.uid] });
    expect(chopper.rested).toBe(true);
    expect(g.pending?.kind).not.toBe('block');
    pass(g);
    expect(P(g, 1).life.length).toBe(4);
  });

  it('Marco: returns from the trash rested when K.O.d, if you trash a 6000-power Character', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const marco = put(g, 0, 'ST30-008', true);
    const jozu = give(g, 0, 'ST30-005');
    endTurn(g);
    const franky = put(g, 1, 'ST01-010');
    apply(g, { type: 'attack', attacker: franky.uid, target: marco.uid });
    while (g.pending?.kind === 'block' || g.pending?.kind === 'counter') pass1(g);
    expect(g.pending?.kind).toBe('confirm');
    A(g, { kind: 'confirm', yes: true });
    expect(options(g)).toContain(jozu);
    A(g, { kind: 'select', uids: [jozu] });
    const back = findField(g, marco.uid);
    expect(back).not.toBeNull();
    expect(back!.rested).toBe(true);
    expect(P(g, 0).trash).toContain(jozu);
  });

  it('Little Oars Jr. and Buggy replace removal of a 6000-base Character by an enemy effect', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const jozu = put(g, 0, 'ST30-005');
    const loj = put(g, 0, 'ST30-009');
    const buggy = put(g, 0, 'ST30-011');
    endTurn(g);
    setDon(g, 1, 10);
    const hand = P(g, 0).hand.length;
    const pistol = give(g, 1, 'ST01-015'); // K.O. up to 1 Character with 6000 power or less
    apply(g, { type: 'play', uid: pistol });
    A(g, { kind: 'select', uids: [jozu.uid] });
    expect(g.pending?.kind).toBe('select');
    expect([...options(g)].sort()).toEqual([loj.uid, buggy.uid].sort());
    A(g, { kind: 'select', uids: [loj.uid] });
    expect(findField(g, jozu.uid)).not.toBeNull();
    expect(findField(g, loj.uid)).toBeNull();
    expect(P(g, 0).hand.length).toBe(hand + 1);
    const pistol2 = give(g, 1, 'ST01-015');
    apply(g, { type: 'play', uid: pistol2 });
    A(g, { kind: 'select', uids: [jozu.uid] });
    A(g, { kind: 'select', uids: [buggy.uid] });
    expect(findField(g, jozu.uid)).not.toBeNull();
    expect(buggy.rested).toBe(true);
    // A rested Buggy cannot rest again, so the third removal goes through.
    const pistol3 = give(g, 1, 'ST01-015');
    P(g, 1).donActive = 4;
    P(g, 1).donRested = 6;
    apply(g, { type: 'play', uid: pistol3 });
    A(g, { kind: 'select', uids: [jozu.uid] });
    expect(findField(g, jozu.uid)).toBeNull();
  });

  it('Crocodile: a rested enemy Character stays rested through its next Refresh Phase', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 3);
    setDon(g, 0, 6);
    const robin = put(g, 1, 'ST01-008', true);
    const croc = give(g, 0, 'ST30-010');
    apply(g, { type: 'play', uid: croc });
    A(g, { kind: 'select', uids: [robin.uid] });
    endTurn(g);
    expect(robin.rested).toBe(true);
    endTurn(g);
    endTurn(g);
    expect(robin.rested).toBe(false);
  });

  it('Mr.3: rest him to move rested DON!! onto 6000-base Characters', () => {
    const g = start();
    toTurn(g, 0, 3);
    const mr3 = put(g, 0, 'ST30-014');
    const jozu = put(g, 0, 'ST30-005');
    const mr2 = put(g, 0, 'ST30-013');
    setDon(g, 0, 0, 3);
    apply(g, { type: 'activate', uid: mr3.uid, idx: 0 });
    A(g, { kind: 'select', uids: [jozu.uid, mr2.uid] });
    expect(mr3.rested).toBe(true);
    expect(jozu.don + mr2.don).toBe(3);
    expect(powerOf(g, jozu)).toBe(6000 + jozu.don * 1000);
  });

  it('Jinbe, Ivankov, Inazuma and "Big Trouble" turn 6000-power Characters into cards', () => {
    const g = start();
    toTurn(g, 0, 3);
    setDon(g, 0, 10);
    const p = P(g, 0);
    p.deck.push(...p.hand.splice(0));
    const jozu = give(g, 0, 'ST30-005');
    give(g, 0, 'ST30-013');
    const jinbe = give(g, 0, 'ST30-006');
    apply(g, { type: 'play', uid: jinbe });
    A(g, { kind: 'confirm', yes: true });
    A(g, { kind: 'select', uids: [jozu] });
    expect(p.hand.length).toBe(1 + 2);
    give(g, 0, 'ST30-013');
    give(g, 0, 'ST30-008');
    const before = p.hand.length;
    const iva = give(g, 0, 'ST30-004');
    apply(g, { type: 'play', uid: iva });
    A(g, { kind: 'confirm', yes: true });
    A(g, { kind: 'select', uids: options(g).slice(0, 2) });
    expect(p.hand.length).toBe(before + 3 - 2);
    const marco = p.deck.find((u) => g.ids[u] === 'ST30-008')!;
    p.deck.splice(p.deck.indexOf(marco), 1);
    p.deck.unshift(marco);
    const ina = give(g, 0, 'ST30-002');
    apply(g, { type: 'play', uid: ina });
    const ch = g.pending as { options: number[]; shown: number[] };
    expect(ch.shown.length).toBe(5);
    expect(ch.options.every((u) => D(g.ids[u]).power === 6000 && D(g.ids[u]).category === 'Character')).toBe(true);
    const deckSize = p.deck.length;
    A(g, { kind: 'select', uids: [marco] });
    expect(p.hand).toContain(marco);
    expect(p.deck.length).toBe(deckSize - 1);
    const big = give(g, 0, 'ST30-017');
    apply(g, { type: 'play', uid: big });
    A(g, { kind: 'select', uids: [] });
    expect(p.trash).toContain(big);
  });

  it('counter Events: Whitebeard needs two 6000-base Characters; "Can You Still Fight" draws with Ace + Luffy', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const wbEvent = give(g, 0, 'ST30-015');
    const fight = give(g, 0, 'ST30-016');
    put(g, 0, 'ST30-007');
    endTurn(g);
    setDon(g, 0, 2);
    const franky = put(g, 1, 'ST01-010');
    franky.don = 5; // a big swing, so one counter is not enough and the Counter Step stays open
    apply(g, { type: 'attack', attacker: franky.uid, target: P(g, 0).leader.uid });
    expect(g.pending?.kind).toBe('counter');
    expect(() => A(g, { kind: 'counter', use: wbEvent })).toThrow(); // only one 6000-base Character
    expect(g.pending?.kind).toBe('counter'); // an illegal answer leaves the question open
    put(g, 0, 'ST30-012');
    const hand = P(g, 0).hand.length;
    A(g, { kind: 'counter', use: fight });
    expect(powerOf(g, P(g, 0).leader)).toBe(9000);
    expect(P(g, 0).hand.length).toBe(hand); // spent the Event, drew 1 for having Ace + Luffy
    expect(P(g, 0).donActive).toBe(1);
    pass(g);
    expect(P(g, 0).life.length).toBe(3); // 9000 was still short of the boosted Franky
    expect(powerOf(g, P(g, 0).leader)).toBe(6000);
  });
});

describe('rules found wrong in review', () => {
  it('[Double Attack] into exactly 1 Life takes that Life card but does not win; a hit at 0 Life does', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const o = P(g, 1);
    o.trash.push(...o.life.splice(1).map((l) => l.uid));
    expect(o.life.length).toBe(1);
    const doberman = put(g, 0, 'OP18-106'); // 7000 power, [Double Attack]
    expect(hasKw(g, doberman, 'Double Attack')).toBe(true);
    apply(g, { type: 'attack', attacker: doberman.uid, target: o.leader.uid });
    pass(g);
    expect(o.life.length).toBe(0);
    expect(g.winner).toBeNull(); // the second point of damage is lost
    // (The Leader is at 4000 here: Doberman is a 7000-base Character, so Luffy & Ace's own penalty applies.)
    const jozu = put(g, 0, 'ST30-005');
    apply(g, { type: 'attack', attacker: jozu.uid, target: o.leader.uid });
    pass(g);
    expect(g.winner).toBe(0);
  });

  it('[DON!! xN] [On K.O.] counts the DON!! the Character had when it was K.O.d', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 2);
    const hatchan = put(g, 0, 'OP14-051', true); // [DON!! x2] [On K.O.] Draw 1 card.
    hatchan.don = 2;
    endTurn(g);
    const franky = put(g, 1, 'ST01-010');
    const hand = P(g, 0).hand.length;
    apply(g, { type: 'attack', attacker: franky.uid, target: hatchan.uid });
    pass(g);
    expect(findField(g, hatchan.uid)).toBeNull();
    expect(P(g, 0).hand.length).toBe(hand + 1);
  });

  it('writes the log in the second person for you and the third person for the CPU', () => {
    const g = start(deck('st01'));
    toTurn(g, 0, 3);
    const text = g.log.map((l) => l.msg).join('\n');
    expect(text).not.toMatch(/\bYou (keeps|draws|plays|adds|trashes|attacks)\b|You's|\bCPU (keep|draw|play|add|trash|attack)\b/);
  });
});
