// Core data types for the One Piece Card Game rules engine.
// Game state is plain data (no functions, no classes) so it can be cloned
// with structuredClone for AI look-ahead and replayed deterministically.

export type PlayerId = 0 | 1;
export type Color = 'Red' | 'Green' | 'Blue' | 'Purple' | 'Black' | 'Yellow';
export type Category = 'Leader' | 'Character' | 'Event' | 'Stage';
export type Attribute = 'Strike' | 'Slash' | 'Special' | 'Ranged' | 'Wisdom';
export type Keyword = 'Rush' | 'Blocker' | 'Double Attack' | 'Banish' | 'Unblockable' | 'Rush: Character';
/** Temporary or continuous states a card on the field can be in. */
export type Status = 'NoKO' | 'NoKOBattle' | 'NoKOEffect' | 'NoRemove' | 'CantAttack' | 'CantBlock' | 'CantRest' | 'Negated' | 'AttackActive';
export type Flag = Keyword | Status;
export type Until = 'battle' | 'turn';
/**
 * How long an effect lasts: this battle, this turn, through the opponent's next turn, until the opponent's next End Phase
 * (the one of the current turn, when used on their turn), until your next turn starts, or through your next turn.
 */
export type Span = 'battle' | 'turn' | 'oppTurn' | 'oppEnd' | 'myStart' | 'myTurn';
export type Timing =
  | 'onPlay'
  | 'whenAttacking'
  | 'onKO'
  | 'onBlock'
  | 'activateMain'
  | 'main'
  | 'counter'
  | 'trigger'
  | 'endOfTurn'
  | 'onOppAttack'
  | 'afterBattleChar'
  /** "When <something happens>, ..." — see EffectDef.event. */
  | 'event';

export interface Mod {
  /** 'base' replaces the printed power ("base power becomes N"). */
  stat: 'power' | 'cost' | 'base';
  amount: number;
  until: Until;
  /** Global turn number through which this lasts (unset = ends with the current turn). */
  exp?: number;
}
export interface FlagInst {
  flag: Flag;
  until: Until;
  exp?: number;
}

/** A rule that applies to a player for a while ("you cannot play Character cards during this turn"). */
export interface PlayerRule {
  kind: 'noPlayChar' | 'endUntapDon' | 'endTrash' | 'noLifeToHand' | 'endActive' | 'endGainLife';
  /** noPlayChar: minimum base cost that is forbidden (0 = all). endUntapDon: how many. endTrash: uid. */
  n: number;
  exp: number;
}

/** Things that happen in a game which cards can react to ("When ...,"). */
export type EventType =
  | 'donReturned'
  | 'ko'
  | 'removed'
  | 'playChar'
  | 'useEvent'
  | 'useBlocker'
  | 'lifeLost'
  | 'lifeToHand'
  | 'damage'
  | 'rested'
  | 'donGiven'
  | 'trigger'
  | 'drawFx'
  | 'handTrashed'
  | 'attack';

export interface GameEvent {
  type: EventType;
  /** The player the event is about (the card's owner, or whoever did the thing). */
  player: PlayerId;
  /** Main card involved (0 when there is none). */
  uid: number;
  n: number;
  /** The player whose action or effect caused it. */
  by: PlayerId;
  /** Detail: 'battle' | 'effect' for K.O.s, the removal mode, the zone a card was played from... */
  how: string;
  /** A second card: the attacker that won the battle, the attack target... */
  other: number;
}

/** A card that is on the field (Leader, Character or Stage). */
export interface FieldCard {
  uid: number;
  id: string;
  rested: boolean;
  /** DON!! cards attached to this card. */
  don: number;
  /** Global turn number on which this card entered the field. */
  playedTurn: number;
  mods: Mod[];
  flags: FlagInst[];
  /** Keys of [Once Per Turn] effects already used this turn. */
  used: string[];
  /** Will not become active during its owner's next Refresh Phase. */
  frozen: boolean;
}

export interface LifeCard {
  uid: number;
  faceUp: boolean;
}

export interface PlayerState {
  name: string;
  leader: FieldCard;
  chars: FieldCard[];
  stage: FieldCard | null;
  hand: number[];
  /** Index 0 is the top of the deck. */
  deck: number[];
  trash: number[];
  /** Index 0 is the top of the Life pile. */
  life: LifeCard[];
  donDeck: number;
  donActive: number;
  donRested: number;
  /** Number of turns this player has started. */
  turns: number;
  /** "None of your Characters can be K.O.'d during this turn." */
  noKO: boolean;
  rules?: PlayerRule[];
}

export type Intent =
  | 'ko'
  | 'bounce'
  | 'bottomDeck'
  | 'rest'
  | 'freeze'
  | 'debuff'
  | 'buff'
  | 'giveDon'
  | 'untap'
  | 'discard'
  | 'search'
  | 'recover'
  | 'protect'
  | 'play'
  | 'overflow'
  | 'toLife'
  | 'deckOrder'
  /** Giving up one of your own cards (as a cost, or because an effect says so). */
  | 'sacrifice'
  | 'order';

export type Choice =
  | { kind: 'mulligan'; player: PlayerId }
  | {
      kind: 'select';
      player: PlayerId;
      prompt: string;
      /** uids that may be picked. */
      options: number[];
      /** uids to display (superset of options) when the cards are not otherwise visible. */
      shown?: number[];
      min: number;
      max: number;
      intent: Intent;
      source?: string;
    }
  | { kind: 'confirm'; player: PlayerId; prompt: string; source?: string; effectKey?: string }
  | { kind: 'option'; player: PlayerId; prompt: string; labels: string[]; tag: string; source?: string; reveal?: number }
  | { kind: 'block'; player: PlayerId; options: number[] }
  | { kind: 'counter'; player: PlayerId }
  | { kind: 'trigger'; player: PlayerId; uid: number };

export type Answer =
  | { kind: 'mulligan'; redraw: boolean }
  | { kind: 'select'; uids: number[] }
  | { kind: 'confirm'; yes: boolean }
  | { kind: 'option'; index: number }
  | { kind: 'block'; uid: number | null }
  | { kind: 'counter'; use: number | null }
  | { kind: 'trigger'; activate: boolean };

export type Action =
  | { type: 'play'; uid: number }
  | { type: 'don'; target: number; n: number }
  | { type: 'attack'; attacker: number; target: number }
  | { type: 'activate'; uid: number; idx: number }
  | { type: 'end' }
  | { type: 'answer'; answer: Answer };

/** Serializable context an effect carries between its steps. */
export interface Ctx {
  player: PlayerId;
  /** uid of the card whose effect this is (0 for system frames). */
  src: number;
  cardId: string;
  /** The cards the effect's last choice picked ("that Character", "it"). */
  those?: number[];
  /** Last 'select' answer. */
  sel: number[];
  /** Last 'confirm' / 'trigger' answer. */
  yes: boolean;
  /** Last 'option' answer. */
  idx: number;
  v: Record<string, number>;
  list: number[];
  /** Set by a step to jump to another step index (-1 = continue). */
  jump: number;
}

export interface Frame {
  key: string;
  step: number;
  ctx: Ctx;
}

export type StepResult = void | 'stop' | Choice;
export type Step = (g: Game, c: Ctx) => StepResult;

export interface CostSpec {
  /** Rest this many active DON!! in the cost area (the circled-number cost). */
  don?: number;
  /** DON!! −N: return this many DON!! from the field to the DON!! deck. */
  donMinus?: number;
  restSelf?: boolean;
  trashHand?: number;
  trashFilter?: (d: CardDef) => boolean;
  trashDesc?: string;
  /** Reveal N cards matching revealFilter from hand (they stay in hand). */
  reveal?: number;
  revealFilter?: (d: CardDef) => boolean;
  /** Add 1 card from the top or bottom of your Life to your hand. */
  lifeToHand?: boolean;
  /** Any other cost, compiled from card text ("rest 2 of your Characters", "trash this Character"...). */
  extra?: CostPart[];
}

export interface CostPart {
  text: string;
  can: (g: Game, c: Ctx) => boolean;
  steps: Step[];
}

export interface EffectDef {
  timing: Timing;
  /** Rules text of this effect (shown in prompts and the log). */
  text: string;
  /** [DON!! xN] — this card needs N attached DON!!. */
  don?: number;
  /** [Once Per Turn]. */
  opt?: boolean;
  /** "You may <cost>: <effect>". */
  cost?: CostSpec;
  /** Availability gate (also re-checked on resolution). */
  when?: (g: Game, c: Ctx) => boolean;
  /** For [Counter] events: how much power the battle target gains (AI + coach maths). */
  boost?: number;
  /** What the effect does, for the AI and the encyclopedia: 'ko', 'draw', 'search', 'rest', 'bounce', 'buff', 'debuff', 'ramp', 'play'... */
  tags?: string[];
  /** AI desirability: > 0 means "use it". Undefined = always use. */
  ai?: (g: Game, c: Ctx) => number;
  /** timing 'event': which game event this reacts to, and whether a given occurrence counts. */
  event?: EventType;
  match?: (g: Game, self: FieldCard, ev: GameEvent) => boolean;
  steps: Step[];
}

/** Why a card is about to leave the field. */
export interface RemovalCause {
  mode: 'ko' | 'hand' | 'bottom' | 'top' | 'trash' | 'life' | 'lifeBottom';
  battle: boolean;
  /** Caused by the opponent (their attack or their effect). */
  byOpp: boolean;
}

export interface ReplaceDef {
  text: string;
  can: (g: Game, self: FieldCard, victim: FieldCard, cause: RemovalCause) => boolean;
  /** Hand-written replacements: applied at once. They only cover removal by an opponent's effect. */
  apply?: (g: Game, self: FieldCard) => void;
  /** Compiled replacements: what you do "instead", run as its own effect (may ask for choices). */
  steps?: Step[];
  opt?: boolean;
}

export interface CardDef {
  id: string;
  name: string;
  category: Category;
  colors: Color[];
  cost: number;
  /** Leaders only. */
  life?: number;
  power: number;
  counter: number;
  attribute: Attribute[];
  types: string[];
  /** Printed rules text. */
  text: string;
  /** "Also treat this card's name as [X] according to the rules." */
  aliases?: string[];
  keywords?: Keyword[];
  effects?: EffectDef[];
  /** Continuous power change this card gives to `target` (may be itself). */
  powerAura?: (g: Game, self: FieldCard, target: FieldCard) => number;
  /** Conditional keywords, e.g. "[DON!! x2] This Character gains [Rush]". */
  dynKeyword?: (g: Game, self: FieldCard, kw: Keyword) => boolean;
  /** Continuous cost change this card gives to `target` (may be itself). */
  costAura?: (g: Game, self: FieldCard, target: FieldCard) => number;
  /** "Give this card in your hand -1 cost" — change to its own cost while it is in `pid`'s hand. */
  handCost?: (g: Game, pid: PlayerId) => number;
  /** Cost change this card (on the field) gives to cards in its owner's hand. */
  handAura?: (g: Game, self: FieldCard, uid: number) => number;
  /** Continuous keywords / states this card gives to `target` ("all of your {X} type Characters gain [Blocker]"). */
  flagAura?: (g: Game, self: FieldCard, target: FieldCard, flag: Flag) => boolean;
  /** True when one of the auras above also reaches the opponent's cards. */
  auraFoe?: boolean;
  /** "If ... would be K.O.'d / removed, you may ... instead." (compiled from text) */
  replaces?: ReplaceDef[];
  cantBeKoByEffect?: boolean;
  /** "This Leader/Character cannot attack." */
  cantAttack?: boolean;
  /** "You may have any number of this card in your deck." */
  anyCopies?: boolean;
  /** "If your Character would be removed by your opponent's effect, you may ... instead." */
  replaceRemoval?: ReplaceDef;
  /** How faithfully the simulator plays this card: hand-scripted, compiled from its text, no text at all, or not playable. */
  sim: 'scripted' | 'auto' | 'vanilla' | 'none';
  /** Set code the card number belongs to (e.g. 'ST30', 'OP05'). */
  set: string;
  /** Extra AI score for playing this card from hand right now (negative = hold it). */
  aiPlay?: (g: Game, me: PlayerId) => number;
}

export interface Battle {
  attacker: number;
  target: number;
  step: 'declared' | 'block' | 'counter' | 'damage' | 'end';
  /** Defender cannot activate [Blocker] this battle. */
  noBlock: boolean;
  /** Defender cannot activate [Blocker] with this much power or more (0 = no limit). */
  noBlockMin: number;
  /** Defender cannot activate [Blocker] with this much power or less. */
  noBlockMax?: number;
  /** [Blocker] Characters with this cost or less cannot block. */
  noBlockCostMax?: number;
  blocked: boolean;
  /** Total counter power the defender has added this battle. */
  counterAdded: number;
}

export type LogKind = 'info' | 'turn' | 'play' | 'attack' | 'effect' | 'damage' | 'ko' | 'win';
export interface LogEntry {
  turn: number;
  p: PlayerId | null;
  msg: string;
  kind: LogKind;
}

export interface PlayerStats {
  donUnused: number;
  donSpent: number;
  attacks: number;
  hits: number;
  kos: number;
  counterPower: number;
  cardsPlayed: number;
  readyNoAttack: number;
}

export type Phase = 'setup' | 'main' | 'end' | 'over';

export interface Game {
  rng: number;
  turn: number;
  active: PlayerId;
  first: PlayerId;
  phase: Phase;
  players: [PlayerState, PlayerState];
  /** uid -> card id, for every card in the game. */
  ids: Record<number, string>;
  battle: Battle | null;
  pending: Choice | null;
  pendingFrom: 'frame' | 'battle' | 'setup' | null;
  frames: Frame[];
  queue: Frame[];
  /** Cards that are mid-resolution (an Event being played, a Trigger being activated). */
  limbo: number[];
  winner: PlayerId | null;
  winReason: string;
  log: LogEntry[];
  stats: [PlayerStats, PlayerStats];
}

export interface DeckList {
  key: string;
  name: string;
  leader: string;
  cards: [string, number][];
}
