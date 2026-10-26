/**
 * The whole domain: what a battle is, what may happen to it, and who may see what.
 *
 * State is never stored. It is folded from an append-only command log, so the
 * server and both clients derive the same numbers from the same history, and
 * "who may do this" has exactly one implementation — `validate` — used by the
 * server to accept a command and by the UI to decide what to offer.
 *
 * No IO and no framework imports belong in this file.
 */

import { groupBy } from './collections'
import { nicknamedUnit } from './unitNotes'
import { attachedUnitList, attachedHost, attachedUnits } from './attachedUnits'
import { refuse, sameSide, sidePlayers } from './battlePrimitives'
import { isGuestSeat, isPracticeSeat } from './newBattle'
import { appliesInMode, cardsDue, cardsDueFromTheirTurn, finalAwardTotal, type MissionAward } from './scoring'
import type { UnitGroup } from './unitGroups'
import type { RosterPick } from './roster'
import type { RosterReminder } from './reminders'
import { correctStratagemTiming } from './stratagemCorrections'
import { teamDisposition, teamDispositionChoices } from './teamDisposition'
import { teamWarlord, teamWarlordChoices } from './teamWarlord'
import { type Passenger, type PrintedTransport, type TransportLoad, transportLoad, transportRule } from './transport'
import type { CatalogueEdition } from './catalogueEdition'
import type { MissionSelection, MissionSelectionKind } from './missionSelections'
import { applyMissionSelection, missionSelectionRefusal, recordBeaconDestruction, type SavedMissionSelection } from './missionSelections'

/** The phases of a battle round, in the order 11th edition plays them. */
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'end'] as const

export type Phase = (typeof PHASES)[number]

/** Whose turn a stratagem or reminder applies in. */
export const TURN_SCOPES = ['your-turn', 'opponent-turn', 'either'] as const

export type TurnScope = (typeof TURN_SCOPES)[number]

export const BATTLE_ROUNDS = 5

const COMMAND_PHASE_CP = 1

const PLAYERS_PER_BATTLE = 2
const TEAM_BATTLE_PLAYERS = 3
export const ROSTER_NAME_MAX_LENGTH = 80

/** How many detachments one roster may hold whatever its size says, and so how many names a pooled card may name. */
export const DETACHMENTS_MAX = 3

/**
 * The longest label naming where a stratagem came from.
 *
 * An army fielding several detachments names them together, so this is what those
 * names join to. Bounded at one name it would refuse the pool outright, and a
 * refused pool is a side playing with no stratagems at all.
 */
export const STRATAGEM_SOURCE_MAX_LENGTH = DETACHMENTS_MAX * (ROSTER_NAME_MAX_LENGTH + 3)
export const ROSTER_MAX_LENGTH = 20_000

export type PlayerId = string

/**
 * What a player is fielding.
 *
 * `text` is the submitted artefact and is always present — it is what an opponent
 * reads, and it works whether the list was pasted or built. `built` is added when
 * it came from catalogue data, and carries the revision it was validated against
 * so both players can be shown the same legality. Nothing derived is stored here:
 * the points follow from the selections and the revision, and are worked out on
 * read.
 */
export type Roster = {
  name: string
  text: string
  /** The saved list this came from, when it came from one. */ id?: string
  /** The friend who lent the saved list, named as they were when it was fielded. */
  lentBy?: { id: string; name: string }
  /** Player-authored prompts frozen with the army, hidden from the other side. */
  reminders?: RosterReminder[]
  remindersEnabled?: boolean
  built?: BuiltRoster
}

/**
 * What the catalogue said about the list at the moment it was attached.
 *
 * The expansion the price came from is deliberately not here. Nothing reads it —
 * the fold keeps `units`, the opponent reads `text`, and `id` points back at the
 * saved list — and carrying it would make every read of every log parse a
 * selection tree on behalf of no one.
 */
export type BuiltRoster = {
  catalogueId: string
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'>
  /** The catalogue revision this list was priced and validated against. */
  revision: string
  /** The battle size the list was built to, which sets every size-dependent limit. */
  limit: number
  /** A custom points budget the list was priced against; absent means the battle size's own total. */
  pointsBudget?: number
  /** Frozen when reserve-limit facts are known; absent from older snapshots. */
  strategicReserveLimit?: number
  /** Named for display, since an opponent's device may have no catalogue loaded. */
  detachment: string | null
  /** Ordered detachment purchases. */
  detachments?: { name: string; points: number | null }[]
  /** The 11th-edition detachment-point allowance for this battle size. */
  detachmentPointBudget?: number | null
  /** The chosen force disposition; the pair decides the mission. */
  disposition: string | null
  /** Every Force Disposition the list's detachments offered, which a side of allies chooses its one card from; absent from older snapshots. */
  dispositions?: string[]
  /** Frozen selections let a battle roster open the same applied datasheets as a shared roster. */
  detachmentIds?: string[]
  /** The format restrictions the list was built without, so it prices in the battle as it did in the builder. */
  waivedRules?: FormatRuleId[]
  picks?: RosterPick[]
  /**
   * The units as submitted, fixed at the moment the list was attached.
   *
   * This is the one place a derived thing is kept, and deliberately: the command
   * log points at these keys when a unit is marked destroyed, so they cannot be
   * re-derived later without the log meaning something different. It also lets an
   * opponent read the list on an instance that has no catalogue loaded.
   */
  units: SubmittedUnit[]
}

export type SubmittedUnit = {
  key: string
  name: string
  /** Frozen from the saved pick; the note reaches only its owner's view. */
  nickname?: string
  note?: string
  points: number
  models: number
  /**
   * What one model of this unit can take, frozen with the rest of the list.
   *
   * Absent for two reasons, and the difference does not matter to anything reading
   * it: a log written before this was recorded, or a datasheet whose models do not
   * all have the same wounds. A squad of a sergeant and his veterans has no single
   * answer, and a unit is one row here, so the honest reply is to say nothing and
   * let the models be counted instead of naming a number that is wrong for most of
   * them.
   */
  wounds?: number
  /** Frozen roster-card details, absent from battle logs created before snapshots had a full roster view. */
  entryId?: string
  group?: UnitGroup
  warlord?: boolean
  warlordEligible?: boolean
  wargear?: { name: string; count: number }[]
  enhancements?: string[]
  upgrades?: string[]
  joined?: { label: string; name: string }[]
  /**
   * The unit this character joined, by key.
   *
   * `joined` says the same thing in words for a player to read, and two squads of
   * Plague Marines are two units with one name — so the key is what a screen groups
   * an attached unit by. Absent from logs written before it was recorded, which read
   * as an army of units standing alone.
   */
  attachedTo?: string
  formationOptions?: UnitFormation[]
  prebattleRules?: ('infiltrators' | 'scouts')[]
  /** A selected rule says this unit's points do not count towards the starting reserve limit. */
  strategicReserveExempt?: boolean
  /** Whether the frozen datasheet can carry other units. */
  transport?: boolean
  /** The transport's printed rule, frozen with the roster: its text in older logs, a token for it in newer ones. */
  transportRule?: string
  /** What the printed rule states, frozen with the roster since its text is published only as a token; absent from older logs. */
  transportCapacity?: PrintedTransport
  /** The datasheet's keywords, which a transport's rule names to say who may ride; absent from older logs. */
  keywords?: string[]
  /** The transport the list starts this unit in, by key; setup judges it again through `startingEmbarks`. */
  startsEmbarkedIn?: string
  /** While joined to a unit, this one can embark within any transport that unit can. */
  embarksWithBodyguard?: boolean
  /** The space each model takes in a transport it rides by `embarksWithBodyguard`, when its ability fixes one. */
  embarkedSpace?: number
}

export const UNIT_FORMATIONS = ['battlefield', 'strategic-reserves', 'deep-strike', 'embarked'] as const
export type UnitFormation = (typeof UNIT_FORMATIONS)[number]

export const strategicReserveLimit = (pointsLimit: number) => pointsLimit / 2
const startsInStrategicReserves = (formation: UnitFormation) => formation === 'strategic-reserves' || formation === 'deep-strike'

type ReserveUnit = Pick<
  UnitState,
  'key' | 'attachedTo' | 'formation' | 'embarkedIn' | 'points' | 'strategicReserveExempt' | 'postDeploymentReserve'
>

/** Deep Strike changes an ingress move; the unit still starts in Strategic Reserves. */
export function strategicReservePoints(units: readonly ReserveUnit[]): number {
  const byKey = new Map(units.map((unit) => [unit.key, unit]))
  return [...groupBy(units, (unit) => attachedHost(units, unit).key).values()].reduce((total, attached) => {
    const reserved = attached.filter(
      (unit) =>
        startsInStrategicReserves(unit.formation) ||
        (unit.embarkedIn && startsInStrategicReserves(byKey.get(unit.embarkedIn)?.formation ?? 'battlefield')),
    )
    if (reserved.some((unit) => unit.strategicReserveExempt || unit.postDeploymentReserve)) return total
    return total + reserved.reduce((points, unit) => points + unit.points, 0)
  }, 0)
}

export function transportLabel(units: readonly Pick<UnitState, 'key' | 'name' | 'nickname'>[], key: string): string | null {
  const transport = units.find((unit) => unit.key === key)
  if (!transport) return null
  const matching = units.filter((unit) => unit.name === transport.name)
  const name = matching.length > 1 ? `${transport.name} #${matching.findIndex((unit) => unit.key === key) + 1}` : transport.name
  return nicknamedUnit(name, transport.nickname)
}

/** What a transport holds if these passengers ride in it, or why they cannot. */
export function transportLoadOf(
  transport: Pick<UnitState, 'transportRule' | 'transportCapacity' | 'wargear'> | undefined,
  passengers: readonly (Passenger & Partial<Pick<UnitState, 'key' | 'attachedTo' | 'embarksWithBodyguard' | 'embarkedSpace'>>)[],
): TransportLoad | Refusal {
  const rule = transportRule(transport?.transportCapacity ?? transport?.transportRule, transport?.wargear)
  if (!rule) return refuse('transport-capacity-unknown', 'this transport has no known model capacity')
  return transportLoad(
    rule,
    passengers.map((passenger) => {
      const bodyguard = passenger.embarksWithBodyguard && passengers.find((candidate) => candidate.key === passenger.attachedTo)
      if (!bodyguard || !bodyguard.keywords) return passenger
      return { ...passenger, ridesAs: bodyguard.keywords, ...(passenger.embarkedSpace ? { space: passenger.embarkedSpace } : {}) }
    }),
  )
}

/** How full a transport is with these passengers, as a player reads it, or null when its capacity is unknown. */
export function transportAboard(
  transport: Pick<UnitState, 'transportRule' | 'transportCapacity' | 'wargear'> | undefined,
  passengers: readonly Passenger[],
): string | null {
  const load = transportLoadOf(transport, passengers)
  if (!Array.isArray(load)) return null
  return `${load.map((pool) => (load.length === 1 ? `${pool.used}/${pool.capacity}` : `${pool.used}/${pool.capacity} ${pool.carries}`)).join(', ')} models`
}

const loadRefusal = (load: TransportLoad | Refusal): Refusal | null => (Array.isArray(load) ? null : load)

function embarkedCapacityError(units: readonly UnitState[], unit: UnitState, nextAlive: number): Refusal | null {
  if (!unit.embarkedIn || nextAlive <= unit.alive) return null
  const transport = units.find((candidate) => candidate.key === unit.embarkedIn)
  const aboard = units.filter((candidate) => candidate.embarkedIn === unit.embarkedIn)
  return loadRefusal(
    transportLoadOf(
      transport,
      aboard.map((candidate) => (candidate === unit ? { ...unit, alive: nextAlive } : candidate)),
    ),
  )
}

export const canTransport = (unit: Pick<UnitState, 'transport' | 'group'>): boolean => unit.transport === true || unit.group === 'transport'

export function strategicReserveSideTotals(
  armies: readonly { units: readonly ReserveUnit[]; roster: ReserveRoster }[],
): { points: number; limit: number } | null {
  const limits = armies.map((army) => army.roster?.built?.strategicReserveLimit)
  if (limits.some((limit) => limit === undefined)) return null
  return {
    points: armies.reduce((total, army) => total + strategicReservePoints(army.units), 0),
    limit: limits.reduce<number>((total, limit) => total + (limit ?? 0), 0),
  }
}

/** The fields of an army that its formations are judged against, shared by the battle state and its view. */
type FormationArmy = { side: number; units: readonly UnitState[]; roster: ReserveRoster }
type ReserveRoster = { built?: { strategicReserveLimit?: number } | null } | null
type FormationTable = Pick<BattleState, 'status' | 'firstPlayerId'> & { players: readonly FormationArmy[] }

/**
 * Why one of the army's units cannot move to a formation, or null when it can.
 *
 * `validate` refuses `set-unit-formation` with this, and the setup screen asks it of
 * the battle view to disable what the server would refuse.
 */
export function unitFormationRefusal(
  state: FormationTable,
  player: FormationArmy,
  command: Pick<Extract<Command, { kind: 'set-unit-formation' }>, 'unitKey' | 'formation' | 'transportKey'>,
): Refusal | null {
  const attached = attachedUnits(player.units, command.unitKey)
  if (command.formation === 'embarked') {
    if (!command.transportKey) return refuse('invalid-transport', 'choose a transport for the embarked unit')
    const transport = player.units.find((unit) => unit.key === command.transportKey)
    if (!transport || !canTransport(transport) || transport.attachedTo || transport.destroyed || transport.formation === 'embarked')
      return refuse('invalid-transport', 'choose a transport in this army')
    if (attached.some((unit) => unit.key === transport.key || canTransport(unit)))
      return refuse('invalid-transport', 'a transport cannot embark in another transport')
    if (attached.some((unit) => unit.destroyed)) return refuse('invalid-transport', 'a destroyed unit cannot embark')
    const moving = new Set(attached.map((unit) => unit.key))
    const aboard = player.units.filter((unit) => unit.embarkedIn === transport.key && !moving.has(unit.key))
    const refusal = loadRefusal(transportLoadOf(transport, [...aboard, ...attached]))
    if (refusal) return refusal
  } else if (command.transportKey) {
    return refuse('invalid-transport', 'only an embarked unit can name a transport')
  }
  // Asked of the whole attached unit, because a deployment ability needs every
  // model in it: a character who can deep strike cannot take a bodyguard unit
  // that cannot with him.
  if (
    !['battlefield', 'strategic-reserves', 'embarked'].includes(command.formation) &&
    !attached.every((unit) => unit.formationOptions?.includes(command.formation))
  ) {
    return refuse('formation-unsupported', 'the roster data does not support that formation')
  }
  if (state.status !== 'setup') return null
  return movedReserveError(
    state,
    player,
    attached,
    command.formation,
    redeploysToReserves(state, attached, command.formation),
    command.transportKey,
  )
}

/** Whether units deployed at the roll-off are being sent to reserves, which the rules count as redeploying them. */
function redeploysToReserves(
  state: Pick<BattleState, 'status' | 'firstPlayerId'>,
  attached: readonly UnitState[],
  formation: UnitFormation,
) {
  return (
    state.status === 'setup' &&
    Boolean(state.firstPlayerId) &&
    formation === 'strategic-reserves' &&
    attached.every((unit) => unit.deployedAtRollOff && unit.formation === 'battlefield')
  )
}

/** The side's reserve refusal once these units move to a formation. */
function movedReserveError(
  state: FormationTable,
  player: FormationArmy,
  attached: readonly UnitState[],
  formation: UnitFormation,
  redeployed = false,
  transportKey?: string,
): Refusal | null {
  const keys = new Set(attached.map((unit) => unit.key))
  const changed = player.units.map((unit) => (keys.has(unit.key) ? changedFormation(unit, formation, redeployed, transportKey) : unit))
  return strategicReserveSideError(state, player, changed)
}

function strategicReserveSideError(state: FormationTable, player: FormationArmy, changed?: readonly ReserveUnit[]): Refusal | null {
  const armies = sidePlayers(state, player.side)
  const totals = strategicReserveSideTotals(armies)
  if (!totals) return null
  const points = changed ? totals.points - strategicReservePoints(player.units) + strategicReservePoints(changed) : totals.points
  // Old logs may already be over the limit. A change that reduces their total must
  // stay legal so the table can repair the setup one unit at a time.
  if (changed && points <= totals.points) return null
  return points > totals.limit
    ? refuse(
        'reserves-over-limit',
        armies.length > 1 ? `over this side's ${totals.limit} pt reserve limit` : `over the ${totals.limit} pt reserve limit`,
      )
    : null
}

function changedFormation(unit: UnitState, formation: UnitFormation, redeployed = false, transportKey?: string): UnitState {
  const remainsInReserves = startsInStrategicReserves(unit.formation) && startsInStrategicReserves(formation)
  return {
    ...unit,
    formation,
    embarkedIn: formation === 'embarked' ? transportKey : undefined,
    startingEmbarkRefused: undefined,
    deployed: formation === 'battlefield',
    postDeploymentReserve: startsInStrategicReserves(formation) && (redeployed || (remainsInReserves && unit.postDeploymentReserve)),
  }
}

/** A frozen list's units as they stand when it is attached: on the battlefield, unhurt. */
export const fieldedUnits = (submitted: readonly SubmittedUnit[]): UnitState[] =>
  submitted.map((unit) =>
    Object.assign({ destroyed: false, deployed: true, formation: 'battlefield' as const, alive: unit.models, damage: 0 }, unit),
  )

/**
 * The army with every unit its list starts embarked put in its transport, in list order.
 * A unit `unitFormationRefusal` would not let in stays where it was, with the reason.
 *
 * Judged against the frozen army rather than trusted from the builder: the rules
 * version, a transport's wargear or an attached character can change what fits.
 * The builder names the units an edit just changed in `edited`; their attached units
 * are judged last, so the unit that grew is the one left out rather than another passenger.
 */
export function startingEmbarks(fielded: readonly UnitState[], edited: readonly string[] = []): UnitState[] {
  const units = fielded.map((unit) => ({ ...unit }))
  const table = settingUp(units)
  const changed = new Set(edited)
  const wasEdited = ({ host, joined }: { host: UnitState; joined: readonly UnitState[] }) =>
    [host, ...joined].some((unit) => changed.has(unit.key))
  const attached = attachedUnitList(units)
  for (const { host } of [...attached.filter((unit) => !wasEdited(unit)), ...attached.filter(wasEdited)]) {
    const transportKey = host.startsEmbarkedIn
    if (!transportKey) continue
    const refusal = unitFormationRefusal(table, table.players[0], { unitKey: host.key, formation: 'embarked', transportKey })
    if (refusal) host.startingEmbarkRefused = refusal.message
    else for (const unit of attachedUnits(units, host.key)) Object.assign(unit, changedFormation(unit, 'embarked', false, transportKey))
  }
  return units
}

/** Why this unit cannot start in that transport alongside what the rest of the list starts in it. */
export function startingEmbarkRefusal(fielded: readonly UnitState[], unitKey: string, transportKey: string): Refusal | null {
  const moving = new Set(attachedUnits(fielded, unitKey).map((unit) => unit.key))
  const units = startingEmbarks(fielded.map((unit) => (moving.has(unit.key) ? { ...unit, startsEmbarkedIn: undefined } : unit)))
  const table = settingUp(units)
  return unitFormationRefusal(table, table.players[0], { unitKey, formation: 'embarked', transportKey })
}

/** One army alone at a table being set, with no reserve limit to judge since embarking in a deployed transport adds none. */
const settingUp = (units: readonly UnitState[]) =>
  ({ status: 'setup', firstPlayerId: null, players: [{ side: 0, units, roster: null }] }) as const satisfies FormationTable

function disembarkPassengers(units: UnitState[], transport: UnitState): void {
  if (!transport.destroyed || !canTransport(transport)) return
  for (const passenger of units.filter((unit) => unit.embarkedIn === transport.key)) {
    Object.assign(passenger, changedFormation(passenger, 'battlefield'))
  }
}

/** A unit's standing in the battle. Attached rosters begin on the battlefield. */
export type UnitState = SubmittedUnit & {
  destroyed: boolean
  deployed: boolean
  formation: UnitFormation
  /** The key of this unit's transport when embarked. */
  embarkedIn?: string
  /** Why setup could not start this unit where its list said, until the table moves it. */
  startingEmbarkRefused?: string
  /** Whether the unit was on the battlefield when the first-turn roll was recorded. */
  deployedAtRollOff?: boolean
  /** The unit entered reserves after deployment, when the mission rules exempt it from the starting cap. */
  postDeploymentReserve?: boolean
  /**
   * Models still standing in the unit. A unit is destroyed when this reaches zero,
   * so losing the last model and losing the unit are the same event rather than two
   * things that can disagree.
   */
  alive: number
  /**
   * Wounds already suffered by the model currently taking them, below `wounds`.
   *
   * Damage lands on one model at a time, so this is the front model's alone and the
   * ones behind it are whole. Always zero for a unit whose wounds the log does not
   * know: there is nothing for a wound to be counted against.
   */
  damage: number
}

/** What is left of a unit, in wounds, which is the one number both halves fold to. */
function unitWoundsLeft(unit: UnitState): number | null {
  return unit.wounds ? unit.alive * unit.wounds - unit.damage : null
}

type CasualtyCommand = Extract<Command, { kind: 'set-unit' | 'wound-unit' | 'damage-unit' }>

/** What is left of a unit after one casualty command, which the fold and the roster's pending presses both read. */
export function casualtyOutcome(unit: UnitState, command: CasualtyCommand): Pick<UnitState, 'alive' | 'damage' | 'destroyed'> {
  switch (command.kind) {
    // The three stay in step in both directions: a unit brought back is whole again,
    // and a unit that is gone has nothing left standing to be carrying a wound.
    case 'set-unit':
      return { destroyed: command.destroyed, alive: command.destroyed ? 0 : unit.models, damage: 0 }
    // The model that was carrying the damage is the one that just left, and a model
    // returning to the unit arrives whole, so either way nothing is still wounded.
    // Losing the last model is losing the unit: one event, not two states that could
    // contradict each other.
    case 'wound-unit': {
      const alive = unit.alive + command.delta
      return { alive, damage: 0, destroyed: alive === 0 }
    }
    case 'damage-unit': {
      const left = unitWoundsLeft(unit)
      if (left === null || !unit.wounds) return unit
      /*
       * Wounds are the whole of it, and the models fall out of the arithmetic.
       *
       * Damage lands on one model until that model is gone and then moves to the next,
       * so what a unit has left is a single number of wounds and where the model line
       * falls inside it is division. Keeping the two as separate counters to be nudged
       * in step is how they end up disagreeing.
       */
      const remaining = left + command.delta
      const alive = Math.ceil(remaining / unit.wounds)
      return { alive, damage: alive * unit.wounds - remaining, destroyed: alive === 0 }
    }
  }
}

/**
 * A stratagem from the verified rules sources, with the cost, timing and usage limit
 * needed to validate its use during a battle.
 */
export type Stratagem = {
  key: string
  name: string
  cp: number
  limit: StratagemLimit
  phases?: Phase[]
  turn?: TurnScope
  /**
   * The detachment that prints it, where one does. Recorded because a side of allies
   * pools two detachments and their rules do not pool with them — each ally's
   * detachment affects their own army and the enemy, never their ally's — so the
   * pool has to be able to say which of them a card came from. Absent on a core
   * stratagem, and on every pool written before this was recorded.
   */
  detachment?: string
}

/** How often a stratagem may be used. Every limit except `battle` resets at its named boundary. */
export const STRATAGEM_LIMITS = ['phase', 'turn', 'battle-round', 'battle', 'unlimited'] as const
export type StratagemLimit = (typeof STRATAGEM_LIMITS)[number]

/**
 * The last section of setup, which is what a `set-setup-step` may name.
 *
 * The sections themselves are the interface's, not the domain's — this only bounds
 * the number so a command cannot point at nothing.
 */
export const SETUP_STEP_MAX = 9

/**
 * How many stratagems one side may hold.
 *
 * A side's pool is every detachment its armies field plus the core cards, so a 2v1
 * pools two armies rather than one and the ceiling has to hold both.
 */
export const STRATAGEMS_MAX = 48
export const STRATAGEM_CP_MAX = 6

/** A secondary mission, named by the player because the deck is not in the data either. */
export type Secondary = { key: string; name: string; awards?: MissionAward[]; selection?: MissionSelectionKind }

/** A card as a `set-prep` command carries it, without whatever else its reference holds. */
export const asSecondary = ({ key, name, awards }: Pick<Secondary, 'key' | 'name' | 'awards'>): Secondary => ({ key, name, awards })
export type SecondaryStatus = 'active' | 'achieved' | 'discarded' | 'returned'

/**
 * How many secondaries a side playing fixed takes.
 *
 * The mission pack says two, in the prose of its own setup sequence: "If using Fixed
 * Missions, they also note down which two Fixed Missions they will use." At most,
 * not exactly, because a player picking them sends each choice as it is made.
 *
 * This is the rule, so `validate` is where it is held. It is deliberately not the
 * schema's bound: a log written when this app allowed six still has six in it, and
 * a rule that tightened would make those battles unreadable rather than illegal.
 */
export const FIXED_SECONDARIES = 2

/**
 * How many a stored `set-prep` may carry, which is not the same question.
 *
 * The command schema is the storage contract as well as the wire one, so it has to
 * keep reading whatever was written. Loosening the rule is a rule change; loosening
 * this is not, and tightening it is a migration.
 */
export const SECONDARIES_MAX = 6
export const SECONDARY_DECK_MAX = 60
const SECONDARY_HISTORY_MAX = 30
/** One primary score plus every secondary the bounded battle history can hold. */
export const SCORE_SETTLEMENT_MAX = SECONDARY_HISTORY_MAX + 1

/**
 * Fixed secondaries are chosen once and scored all game; tactical ones are drawn as
 * play goes on. A card's payouts differ between the two, so the battle records which
 * is being played.
 */
export type SecondaryMode = 'fixed' | 'tactical'

export const SECONDARY_MODES: SecondaryMode[] = ['tactical', 'fixed']
/** How many tactical cards a side draws at the top of each of its own turns. Unresolved cards from earlier turns are kept alongside them, not replaced. */
export const TACTICAL_HAND_SIZE = 2

type BattlePrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  secondaryDeck?: Secondary[]
  primary: Secondary | null
  secondaryMode: SecondaryMode
}

export type BattleEndReason = 'completed' | 'finished-early' | 'conceded'

export type BattleSettings = {
  limit: number | null
  sizeFromRosters?: boolean
  missionPackId: string | null
  terrainLayoutId: string | null
  twistId: string | null
  teamBattle: boolean
  playerCount: 2 | 3 | 4
  /** What each army on a side may spend in a team battle, by side; absent splits the battle size evenly. */
  armyPoints?: number[]
  /** The table keeps its own score: no mission pack, cards, caps, automatic CP or battle ready bonus. */
  manual?: boolean
}

const DEFAULT_SETTINGS: BattleSettings = {
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  teamBattle: false,
  playerCount: PLAYERS_PER_BATTLE,
}

/**
 * The conventional matched-play ceilings, shown as guidance and never enforced.
 *
 * Refusing a score on a number this file is not certain of would stop a real game
 * at a real table, which is far worse than displaying a total that has gone past
 * what the mission allows.
 */
export const PRIMARY_GUIDE = 50
export const SECONDARY_GUIDE = 40
export const PAINTED_ARMY_POINTS = 10

/**
 * What the battle ready bonus pays a side, which is the same for one army or two.
 *
 * A side of allies fields one army between them, so it claims the bonus once and only
 * when all of it is painted — an ally who brought an unpainted half costs the side the
 * whole bonus, exactly as an unpainted half of one player's army would.
 */
export function sidePaintedPoints(state: BattleState, side: number): number {
  if (state.settings.manual) return 0
  const seated = sidePlayers(state, side)
  return seated.length && seated.every((player) => player.painted) ? PAINTED_ARMY_POINTS : 0
}

const KOTC_LIMITS = [600] as const
/**
 * Sizes King of the Colosseum was offered at before and is no longer built at.
 *
 * A size that stops being offered does not stop being played: rosters saved at it and
 * battles already running on it keep their construction rules, their datasheet caps and
 * their tactical-only secondaries, because dropping them would quietly rewrite a list
 * its owner cannot rebuild.
 */
const RETIRED_KOTC_LIMITS = [500] as const
export const DEFAULT_GAME_LIMIT = 2000

/** The matched-play game sizes, smallest first; saved rosters and battle commands store these limits, so mission-pack size records never replace them. */
export const GAME_SIZES = [
  ...KOTC_LIMITS.map((limit) => ({ name: 'King of the Colosseum', limit, detachmentPoints: null })),
  { name: 'Incursion', limit: 1000, detachmentPoints: 2 },
  { name: 'Strike Force', limit: 2000, detachmentPoints: 3 },
  { name: 'Onslaught', limit: 3000, detachmentPoints: null },
] as const

export const isGameSize = (limit: number | null) => GAME_SIZES.some((size) => size.limit === limit)
export const detachmentPointBudget = (limit: number) => GAME_SIZES.find((size) => size.limit === limit)?.detachmentPoints ?? null
export const isKotcLimit = (limit: number | null): boolean =>
  limit !== null && [...KOTC_LIMITS, ...RETIRED_KOTC_LIMITS].some((candidate) => candidate === limit)

/**
 * Bounds of a points budget agreed in place of a battle size's points total.
 *
 * The game system data offers this override inside its battle size with a 500-point
 * minimum and no maximum; the maximum is the saved roster contract's own bound.
 */
export const POINTS_BUDGET_MIN = 500
export const POINTS_BUDGET_MAX = 10_000

/** Points for one army in a team battle: any whole number up to the roster contract's bound. */
export const validArmyPoints = (points: number) => Number.isInteger(points) && points >= 1 && points <= POINTS_BUDGET_MAX
export const ARMY_POINTS_ERROR = `choose between 1 and ${POINTS_BUDGET_MAX.toLocaleString('en')} points per army`

/** King of the Colosseum fixes its points total, so only the core battle sizes take a custom budget. */
export const allowsPointsBudget = (limit: number | null): boolean => limit !== null && !isKotcLimit(limit) && isGameSize(limit)

export function pointsBudgetError(limit: number, requested: number | null | undefined): string | null {
  const budget = customPointsBudget(limit, requested)
  if (budget === null) return null
  if (!allowsPointsBudget(limit)) return 'This battle size has a fixed points total.'
  if (!Number.isInteger(budget)) return 'Enter a whole number of points.'
  if (budget < POINTS_BUDGET_MIN || budget > POINTS_BUDGET_MAX)
    return `Choose between ${POINTS_BUDGET_MIN} and ${POINTS_BUDGET_MAX.toLocaleString('en')} points.`
  return null
}

/** A budget equal to the battle size's own total is no custom budget at all. */
export const customPointsBudget = (limit: number, budget: number | null | undefined): number | null =>
  budget === null || budget === undefined || budget === limit ? null : budget

/** What a roster may spend: its custom budget, or else its battle size's points total. */
export const pointsBudgetOf = (roster: { limit: number; pointsBudget?: number | null }): number => roster.pointsBudget ?? roster.limit

export const pointsLabel = (points: number): string => `${points.toLocaleString('en')} points`

/** "2,000-point", as in a 2,000-point army. */
export const pointsSize = (points: number): string => `${points.toLocaleString('en')}-point`

export const battleSizeName = (limit: number): string => GAME_SIZES.find((size) => size.limit === limit)?.name ?? pointsLabel(limit)

export const battleSizeOptionLabel = (size: { name: string; limit: number }): string => `${size.name} · ${pointsLabel(size.limit)}`

/** The battle size whose limits apply, and beside it any custom points budget. */
export const battleSizeLabel = (limit: number, pointsBudget?: number | null): string =>
  pointsBudget === null || pointsBudget === undefined
    ? battleSizeName(limit)
    : `${battleSizeName(limit)} · ${pointsSize(pointsBudget)} budget`

/** Name every waivable format restriction here so legality and picker filtering read the same roster waiver. */
export const FORMAT_RULE_IDS = [
  'points-limit',
  'detachments',
  'detachment-points',
  'warlord',
  'kotc-infantry',
  'kotc-warlord',
  'kotc-epic-heroes',
  'kotc-toughness',
  'kotc-datasheet-copies',
] as const

export type FormatRuleId = (typeof FORMAT_RULE_IDS)[number]
export type FormatRule = { id: FormatRuleId; label: string; hint: string }

/** Whether a rule still applies, given what the roster has waived. */
export const enforces = (waived: readonly string[] | null | undefined, rule: FormatRuleId) => !waived?.includes(rule)

export const detachmentLimit = (limit: number, waived: readonly string[] = []) =>
  isKotcLimit(limit) && enforces(waived, 'detachments') ? 1 : DETACHMENTS_MAX

/** The format-specific cap for copies of one datasheet, before catalogue limits are applied. */
export const formatDatasheetLimit = (limit: number, repeatable: boolean, waived: readonly string[] = []) =>
  isKotcLimit(limit) && enforces(waived, 'kotc-datasheet-copies') ? (repeatable ? 2 : 1) : null

const hasUnitKeyword = (keywords: readonly string[], wanted: string) =>
  keywords.some((keyword) => keyword.trim().toLocaleLowerCase() === wanted)

export const kotcDatasheetRepeatable = (keywords: readonly string[]) =>
  hasUnitKeyword(keywords, 'battleline') || hasUnitKeyword(keywords, 'dedicated transport')

/** What this battle size restricts, in the order a player reads it. */
export function formatRules(limit: number | null, pointsBudget?: number | null): FormatRule[] {
  if (limit === null) return []
  const pointsLimit: FormatRule = {
    id: 'points-limit',
    label: 'Points limit',
    hint: `The roster costs at most ${pointsLabel(pointsBudget ?? limit)}`,
  }
  if (isKotcLimit(limit)) {
    return [
      pointsLimit,
      { id: 'detachments', label: 'One detachment', hint: 'The roster is built from exactly one detachment' },
      { id: 'kotc-infantry', label: 'Two Infantry units', hint: 'The roster holds at least two Infantry units' },
      { id: 'kotc-warlord', label: 'Character Warlord', hint: 'Exactly one Character unit is named as the Warlord' },
      { id: 'kotc-epic-heroes', label: 'No Epic Heroes', hint: 'Datasheets with the Epic Hero keyword may not be taken' },
      { id: 'kotc-toughness', label: 'Toughness cap', hint: 'Nothing above Toughness 9, and at most one Toughness 9 unit' },
      {
        id: 'kotc-datasheet-copies',
        label: 'Datasheet copies',
        hint: `At most ${formatDatasheetLimit(limit, false)} of each datasheet, or ${formatDatasheetLimit(limit, true)} for Battleline and Dedicated Transports`,
      },
    ]
  }
  const warlord: FormatRule = { id: 'warlord', label: 'Warlord', hint: 'Exactly one Character unit is named as the Warlord' }
  const budget = detachmentPointBudget(limit)
  return budget === null
    ? [pointsLimit, warlord]
    : [
        pointsLimit,
        { id: 'detachment-points', label: 'Detachment points', hint: `Detachments cost at most ${budget} DP together` },
        warlord,
      ]
}

/**
 * The restrictions a roster's own battle size imposes that it is not playing.
 *
 * The one answer to "is this list built to its format?", so the builder, the roster
 * chooser, a league's sealing dialog and the opponent's view of an attached army all
 * say the same thing about the same list. Waivers a size does not impose are not
 * counted: an id kept from another size restricts nothing here.
 */
export const waivedFormatRules = (
  limit: number | null,
  waived: readonly string[] | undefined,
  pointsBudget?: number | null,
): FormatRule[] => formatRules(limit, pointsBudget).filter((rule) => !enforces(waived, rule.id))

export function kotcUnitExclusions(
  unit: { keywords: readonly string[]; toughness: number | null },
  waived: readonly string[] = [],
): string[] {
  return [
    ...(enforces(waived, 'kotc-epic-heroes') && hasUnitKeyword(unit.keywords, 'epic hero') ? ['does not allow Epic Heroes'] : []),
    ...(enforces(waived, 'kotc-toughness') && unit.toughness !== null && unit.toughness > 9
      ? [`does not allow Toughness ${unit.toughness}`]
      : []),
  ]
}

/**
 * The detachment points the borrowed-disposition optional rule gives a roster to spend.
 *
 * Homebrew, and deliberately not the format's own economy. King of the Colosseum sets no
 * detachment point limit at all — a roster takes any one detachment at any cost — and
 * spends detachment points instead as the bid that decides who picks the twist. This
 * budget exists only inside the optional rule, so a roster whose detachment already costs
 * this much has nothing to borrow with and is told so rather than shown an empty choice.
 */
export const BORROWED_DISPOSITION_BUDGET = 3

/**
 * The homebrew a battle size can be played with, and the mirror of `FORMAT_RULE_IDS`.
 *
 * A format rule is played until a roster waives it; a optional rule is not played until a
 * roster picks it. Neither is ever inferred from the list in front of it, so nobody is
 * handed a rule their group did not agree to play, and a size that offers no homebrew
 * offers nothing to switch on.
 */
export const OPTIONAL_RULE_IDS = ['kotc-borrowed-disposition'] as const

export type OptionalRuleId = (typeof OPTIONAL_RULE_IDS)[number]
export type OptionalRule = { id: OptionalRuleId; label: string; hint: string }

/** Whether a roster picked a optional rule, which is the only way one is played. */
export const plays = (picked: readonly string[] | undefined, rule: OptionalRuleId) => Boolean(picked?.includes(rule))

/** What homebrew this battle size offers, in the order a player reads it. */
export function optionalRules(limit: number | null): OptionalRule[] {
  if (!isKotcLimit(limit)) return []
  return [
    {
      id: 'kotc-borrowed-disposition',
      label: 'Borrowed disposition',
      hint: `Spend what your detachment leaves unspent, out of a house allowance of ${BORROWED_DISPOSITION_BUDGET} DP, to play another detachment's Force Disposition`,
    },
  ]
}

/** The homebrew a roster is playing that its own battle size offers. */
export const pickedOptionalRules = (limit: number | null, picked: readonly string[] | undefined): OptionalRule[] =>
  optionalRules(limit).filter((rule) => plays(picked, rule.id))

/** A borrowed disposition requires an explicit optional-rule choice and a known price; it grants no rules, enhancements, or stratagems from that detachment. */
export function borrowedDispositionError(
  limit: number | null,
  picked: readonly string[] | undefined,
  own: { points: number | null } | null,
  borrowed: { points: number | null } | null,
): string | null {
  if (!borrowed) return null
  if (!isKotcLimit(limit)) return 'Only a King of the Colosseum roster may borrow another detachment’s Force Disposition.'
  if (!plays(picked, 'kotc-borrowed-disposition')) return 'This roster is not playing the borrowed disposition optional rule.'
  if (!own || own.points === null || borrowed.points === null)
    return 'One of these detachments has no points value, so the borrowed disposition cannot be paid for.'
  const spent = own.points + borrowed.points
  return spent > BORROWED_DISPOSITION_BUDGET
    ? `This combination costs ${spent} DP; the borrowed disposition rule allows ${BORROWED_DISPOSITION_BUDGET} DP.`
    : null
}

export function detachmentPointsError(
  detachments: readonly { points: number | null }[],
  allowance: number | null,
  waived: readonly string[] = [],
): string | null {
  if (detachments.length <= 1 || allowance === null || !enforces(waived, 'detachment-points')) return null
  const spent = detachments.reduce((total, detachment) => total + (detachment.points ?? 0), 0)
  return spent > allowance
    ? `This combination costs ${spent} DP; multiple detachments at this battle size may cost at most ${allowance} DP.`
    : null
}

type OnBehalfOf = { playerId?: PlayerId }

/** A moment of play: the battle round, the phase, and a player whose side was taking that turn. */
export type BattleMoment = { round: number; phase: Phase; turn: PlayerId }
/** The earlier moment an action recorded late belongs to; absent means the moment being played. */
type Missed = { missed?: BattleMoment }

export type Command =
  | {
      kind: 'configure-battle'
      limit: number | null
      missionPackId: string | null
      terrainLayoutId: string | null
      twistId: string | null
      teamBattle?: boolean
      playerCount?: 2 | 3 | 4
      /** A team battle's points per army, by side; absent or null splits the battle size evenly. */
      armyPoints?: number[] | null
      clockLimitMinutes: number | null
      manual?: boolean
    }
  | { kind: 'reset-setup' }
  /** Only older logs carry it; setup progress is otherwise derived from the log. */
  | { kind: 'set-setup-step'; step: number }
  | { kind: 'set-attacker'; attackerId: PlayerId }
  | { kind: 'set-first-turn'; firstPlayerId: PlayerId }
  | { kind: 'set-side-disposition'; side: number; disposition: string }
  | { kind: 'set-side-warlord'; side: number; playerId: PlayerId }
  | ({ kind: 'attach-roster'; roster: Roster; prep?: BattlePrep | null; painted?: boolean } & OnBehalfOf)
  | ({ kind: 'detach-roster' } & OnBehalfOf)
  /** The club whose table this battle counts on, by internal id since every battle is public and a club's token is its invite. */
  | { kind: 'set-battle-club'; clubId: string | null }
  | {
      kind: 'lock-league-rosters'
      leagueToken: string
      eventToken?: string
      /** Each allied side's card, sealed with the event's rosters so it cannot be chosen after seeing the opponent's list. */
      dispositions?: { side: number; disposition: string }[]
      /** Each allied side's Warlord, by player, sealed with the event's rosters for the same reason. */
      warlords?: { side: number; playerId: PlayerId }[]
    }
  | ({ kind: 'set-unit'; unitKey: string; destroyed: boolean } & OnBehalfOf)
  | ({ kind: 'wound-unit'; unitKey: string; delta: number } & OnBehalfOf)
  /** `delta` is the change in wounds left, so a unit taking damage is negative, like models. */
  | ({ kind: 'damage-unit'; unitKey: string; delta: number } & OnBehalfOf)
  | ({ kind: 'deploy-unit'; unitKey: string; deployed: boolean } & OnBehalfOf)
  | ({ kind: 'set-unit-formation'; unitKey: string; formation: UnitFormation; transportKey?: string } & OnBehalfOf)
  | ({ kind: 'set-painted'; painted: boolean } & OnBehalfOf)
  | { kind: 'set-deployment'; patternId: string | null }
  | { kind: 'set-battlefield'; patternId: string; terrainLayoutId: string }
  | ({
      kind: 'set-prep'
      stratagems: Stratagem[]
      secondaries: Secondary[]
      secondaryDeck?: Secondary[]
      primary: Secondary | null
      secondaryMode: SecondaryMode
    } & OnBehalfOf)
  /** `cp` overrides the printed cost, for the stratagems whose price depends on the board. */
  | ({ kind: 'use-stratagem'; key: string; cp?: number } & OnBehalfOf & Missed)
  | ({ kind: 'use-new-orders'; stratagemKey: string; secondaryKey: string; secondary: Secondary; cp?: number } & OnBehalfOf)
  | ({ kind: 'score-secondary'; key: string; delta: number } & OnBehalfOf)
  | ({
      kind: 'score-settlement'
      scores: (
        | { category: 'primary'; delta: number; final?: { claims: number[]; delta: number } }
        | { category: 'secondary'; key: string; delta: number; status?: 'achieved' }
      )[]
      /**
       * The battle round these points belong to, when a turn that has already ended
       * owed them. Absent means the round being played, which is what the settlement
       * of the current turn always means and what every log written before this
       * field existed meant.
       */
      round?: number
    } & OnBehalfOf &
      Missed)
  | ({ kind: 'set-secondary-status'; key: string; status: SecondaryStatus } & OnBehalfOf)
  | ({ kind: 'draw-secondary'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'draw-secondaries'; secondaries: Secondary[]; selected?: true } & OnBehalfOf)
  | ({ kind: 'select-mission'; cardKey: string; occurrence: number; selection: MissionSelection } & OnBehalfOf)
  | ({ kind: 'acknowledge-draw' } & OnBehalfOf)
  | ({ kind: 'acknowledge-scoring' } & OnBehalfOf)
  | ({ kind: 'select-secret'; secondary: Secondary } & OnBehalfOf)
  | ({ kind: 'reveal-secret' } & OnBehalfOf)
  | { kind: 'begin-battle'; firstPlayerId: PlayerId; attackerId?: PlayerId }
  | ({ kind: 'adjust-cp'; delta: number } & OnBehalfOf & Missed)
  | ({ kind: 'resolve-tactical-hand'; keys?: string[]; gainCp?: boolean } & OnBehalfOf)
  | ({ kind: 'score'; category: 'primary' | 'secondary'; delta: number } & OnBehalfOf)
  | { kind: 'correct-player'; playerId: PlayerId; resource: 'cp' | 'primary' | 'secondary'; delta: number }
  | { kind: 'settle-opponent-turn' }
  | ({ kind: 'request-advance' } & OnBehalfOf)
  | ({ kind: 'cancel-advance' } & OnBehalfOf)
  | ({ kind: 'advance' } & OnBehalfOf)
  | { kind: 'pause-clock' }
  | { kind: 'resume-clock' }
  | { kind: 'end-battle'; reason?: BattleEndReason; concededBy?: PlayerId }
  | { kind: 'reopen-battle' }
  | { kind: 'add-note'; text: string }
  | { kind: 'undo'; target: number }

/** The longest battle note, which joins the report every reader of the battle sees. */
export const NOTE_MAX_LENGTH = 500

/** Mission, card and stratagem automation that a manually tracked battle does not play. */
const GUIDED_COMMANDS: ReadonlySet<Command['kind']> = new Set([
  'select-mission',
  'set-attacker',
  'set-side-disposition',
  'set-deployment',
  'set-battlefield',
  'set-prep',
  'use-stratagem',
  'use-new-orders',
  'score-secondary',
  'score-settlement',
  'set-secondary-status',
  'draw-secondary',
  'draw-secondaries',
  'acknowledge-draw',
  'acknowledge-scoring',
  'select-secret',
  'reveal-secret',
  'resolve-tactical-hand',
  'settle-opponent-turn',
  'request-advance',
  'cancel-advance',
])

/**
 * Why a command was refused, as a stable name that carries no unit, card, number, or player text.
 *
 * Telemetry and agents may read it where the message may not travel. `unclassified`
 * is a product database refusal this release's rules do not reproduce.
 */
export type RefusalCode =
  | 'advance-not-requested'
  | 'advance-requested'
  | 'battle-not-over'
  | 'battle-not-running'
  | 'battle-not-started'
  | 'battle-over'
  | 'battle-started'
  | 'below-zero'
  | 'card-already-drawn'
  | 'card-not-in-deck'
  | 'cards-owed'
  | 'cards-settled'
  | 'clock-unchanged'
  | 'club-ineligible'
  | 'club-members-only'
  | 'concession-required'
  | 'cp-gain-limit'
  | 'deployment-mismatch'
  | 'disposition-not-brought'
  | 'warlord-not-brought'
  | 'draw-limit'
  | 'draw-unreviewed'
  | 'formation-unsupported'
  | 'mission-selection-invalid'
  | 'mission-selection-timing'
  | 'mission-selection-owner'
  | 'mission-selection-recorded'
  | 'mission-selection-unit'
  | 'mission-selection-count'
  | 'mission-selection-facts'
  | 'mission-selection-objective'
  | 'missed-moment'
  | 'missed-unsupported'
  | 'hand-acknowledged'
  | 'invalid-amount'
  | 'invalid-detachments'
  | 'invalid-draw'
  | 'invalid-note'
  | 'invalid-prep'
  | 'invalid-roster'
  | 'invalid-settlement'
  | 'invalid-sides'
  | 'invalid-transport'
  | 'league-sealed'
  | 'manual-tracking'
  | 'matchup-not-in-pack'
  | 'missing-deployment'
  | 'missing-disposition'
  | 'missing-warlord'
  | 'missing-player'
  | 'missing-roster'
  | 'missing-terrain'
  | 'mission-cards-mismatch'
  | 'mission-cards-unprepared'
  | 'no-active-secondaries'
  | 'no-roster'
  | 'no-secret'
  | 'not-end-of-turn'
  | 'not-enough-cp'
  | 'not-seated'
  | 'not-tactical'
  | 'not-your-turn'
  | 'nothing-discarded'
  | 'nothing-to-acknowledge'
  | 'nothing-to-settle'
  | 'nothing-to-undo'
  | 'out-of-range'
  | 'practice-concession'
  | 'reserves-over-limit'
  | 'roster-format-mismatch'
  | 'invalid-army-points'
  | 'over-army-points'
  | 'allies-mismatch'
  | 'roster-size-mismatch'
  | 'score-by-name'
  | 'score-cap-battle'
  | 'score-cap-card'
  | 'score-cap-round'
  | 'scoring-reviewed'
  | 'scoring-unreviewed'
  | 'seat-count-mismatch'
  | 'secondary-history-full'
  | 'secondary-not-active'
  | 'secret-chosen'
  | 'secret-owed'
  | 'secret-revealed'
  | 'secret-unrevealed'
  | 'settlement-owed'
  | 'stratagem-limit'
  | 'stratagem-wrong-phase'
  | 'stratagem-wrong-turn'
  | 'tactical-hand-unreviewed'
  | 'terrain-geometry-missing'
  | 'terrain-mismatch'
  | 'too-few-seats'
  | 'too-many-players'
  | 'transport-capacity-unknown'
  | 'transport-full'
  | 'transport-ineligible'
  | 'undo-not-latest'
  | 'unit-unchanged'
  | 'unknown-command'
  | 'unknown-deployment'
  | 'unknown-player'
  | 'unknown-secondary'
  | 'unknown-setup-step'
  | 'unknown-stratagem'
  | 'unknown-terrain'
  | 'unknown-unit'
  | 'unnamed-card'
  | 'unsupported-battle-size'
  | 'unsupported-player-count'
  | 'wounds-unknown'
  | 'wrong-settlement-turn'
  | 'unclassified'

export type Refusal = { code: RefusalCode; message: string }

/** `stale` carries the sequence the caller should have had; `refused` carries the domain reason as a code and a message. */
export type SubmitResult =
  | { outcome: 'appended'; seq: number }
  | { outcome: 'stale'; seq: number }
  | { outcome: 'refused'; code: RefusalCode; reason: string }

export type LoggedCommand = { operationId?: string; seq: number; by: PlayerId; at: number; command: Command }

export type PlayerState = {
  id: PlayerId
  side: number
  automated: boolean
  cp: number
  cpGained: number
  cpSpent: number
  cpByRound: number[]
  /** Additional rules-limited gains, excluding the command-phase grant and corrections. */
  bonusCpByRound: number[]
  /**
   * The fewest CP held during each moment played and the CP it closed with, keyed by
   * `momentOrder`, so a missed spend placed at the end of its moment cannot overdraw any moment since.
   */
  cpByMoment: Record<number, { fewest: number; last: number }>
  primary: number
  secondary: number
  roster: Roster | null
  rosterSeq: number | null
  /** Empty for a pasted list: nothing there names the units. */
  units: UnitState[]
  stratagems: Stratagem[]
  /** Every use, with when it happened, so a limit can be judged against the log. */
  uses: StratagemUse[]
  secondaries: Secondary[]
  /**
   * The cards this side's current turn has dealt, in the order they came off the deck.
   *
   * The keys and not a tally, because a card may only be put back the moment it is
   * drawn: a hand carries unscored cards from turn to turn, and a count cannot tell
   * the two apart. It is also what says which draw a card put back was using, so
   * putting one back frees the slot it took rather than any slot at all.
   */
  secondariesDrawnThisTurn: string[]
  additionalSecondaryDrawsThisTurn: number
  secondariesToReview: string[]
  secondaryDrawSeq: Record<string, number>
  /** The moment each drawn card arrived, so a missed score cannot predate the card. */
  secondaryDrawnAt: Record<string, number>
  missionSelections: SavedMissionSelection[]
  /** This side's primary mission for its ordered disposition matchup. */
  primaryCard: Secondary | null
  secondaryMode: SecondaryMode
  secondaryDeck: Secondary[] | null
  /** What each named secondary has scored, keyed the same way. */
  scored: Record<string, number>
  /** Per-round ledgers are folded from score commands, never stored separately. */
  primaryByRound: number[]
  finalPrimary: number
  secondaryByRound: number[]
  scoredByRound: Record<string, number[]>
  secondaryStatus: Record<string, SecondaryStatus>
  secretSecondary: string | null
  secretRevealed: boolean
  painted: boolean
  corrections: { cp: number; primary: number; secondary: number }
  correctionByRound: { primary: number[]; secondary: number[] }
}

/** `name` and `cp` are what the use said at the time, so a later pool or price change cannot rewrite it. */
type StratagemUse = { key: string; name: string; cp: number; round: number; phase: Phase; turn: PlayerId | null }

export type BattleState = {
  status: 'setup' | 'playing' | 'finished'
  /** The shared setup section shown on every seated device. */
  setupStep: number
  /** 0 during setup, then 1 through `BATTLE_ROUNDS`. */
  round: number
  phase: Phase
  activePlayerId: PlayerId | null
  turnSeq: number
  firstPlayerId: PlayerId | null
  attackerId: PlayerId | null
  /**
   * The Force Disposition each side plays, where its armies offered more than one.
   *
   * A side of allies fields one army between them and plays one card, chosen from
   * those either list's detachments offered. A lone army plays its list's own card,
   * which is why this is empty for every duel.
   */
  sideDispositions: Record<number, string>
  /** Set when a league lock sealed every side's card, which setup can then no longer change. */
  dispositionsSealed: boolean
  /**
   * The army whose Warlord leads each side of allies, by player.
   *
   * Every list names its own Warlord so it can be played alone or alongside another,
   * and allies who combine theirs field one Warlord between them.
   */
  sideWarlords: Record<number, PlayerId>
  /** Set when a league lock sealed every side's Warlord, which setup can then no longer change. */
  warlordsSealed: boolean
  resumePlayerId: PlayerId | null
  pendingSettlement: { playerId: PlayerId; round: number } | null
  completionPending: boolean
  advanceRequested: boolean
  scoringAcknowledged: boolean
  drawAcknowledged: boolean
  /** The battlefield both players are using. Shared, so either may set it. */
  deploymentId: string | null
  leagueToken: string | null
  leagueEventToken: string | null
  clubId: string | null
  settings: BattleSettings
  result: { reason: BattleEndReason; concededBy: PlayerId | null } | null
  players: PlayerState[]
  /** Shared by the table, so a break counts against nobody's turn. */
  clockPaused: boolean
  /**
   * The newest command still standing. Undo reaches only this one, which keeps
   * the log linear: there is never a hole in the middle to reason about.
   */
  undoable: { seq: number; by: PlayerId; kind: Command['kind'] } | null
  /** The highest seq in the log, undone commands included. The concurrency token. */
  seq: number
}

/**
 * How many players a battle seats.
 *
 * Its own settings decide it, and only here, so a third player following the link
 * is refused by the same rule the interface reads rather than by a separate one
 * that could come to disagree.
 */
export function battleCapacity(settings: { teamBattle?: boolean; playerCount?: 2 | 3 | 4 }) {
  return settings.playerCount ?? (settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE)
}

/**
 * Folds the log into current state. Undo is itself a command, so history is only
 * ever appended to; a command it names is skipped by the fold rather than removed.
 */
export function reduceBattle(
  playerIds: readonly PlayerId[],
  log: readonly LoggedCommand[],
  playerSides?: readonly number[],
  automatedPlayerIds: readonly PlayerId[] = [],
): BattleState {
  const state = emptyBattle(playerIds, playerSides, automatedPlayerIds)
  for (const _step of replay(state, log)) {
    // The fold is the point; every step is already applied to `state`.
  }
  return state
}

/** One command as it actually happened, and what the fold knew either side of it. */
type BattleStep = {
  entry: LoggedCommand
  before: { round: number; phase: Phase; active: PlayerId | null }
  /** The army the command changed, which is not always the one that sent it. */
  army: PlayerState | undefined
}

/**
 * Replays the log into `state`, one standing command at a time.
 *
 * Undo is itself a command, so a command it names is skipped rather than removed —
 * which is why replaying is the only way to know what actually happened. The state
 * yielded through is the live fold, so a caller reads it during its own step and
 * never keeps it.
 */
export function* replay(state: BattleState, log: readonly LoggedCommand[]): Generator<BattleStep> {
  const undone = new Set<number>()
  for (const entry of log) {
    if (entry.command.kind === 'undo') undone.add(entry.command.target)
    state.seq = Math.max(state.seq, entry.seq)
  }

  for (const entry of log) {
    if (entry.command.kind === 'undo' || undone.has(entry.seq)) continue
    const before = { round: state.round, phase: state.phase, active: state.activePlayerId }
    applyEntry(state, entry)
    const actor = state.players.find((candidate) => candidate.id === entry.by)
    const targetId = commandTarget(entry.command, entry.by)
    yield {
      entry,
      before,
      army: actor ? targetArmy(state, actor, entry.command) : state.players.find((candidate) => candidate.id === targetId),
    }
  }
}

/** Commands that change what is left of a unit, which the table corrects by pressing the opposite control. */
const CASUALTY_COMMANDS: readonly Command['kind'][] = ['set-unit', 'wound-unit', 'damage-unit']

/** Applies one command that is standing when it is folded, and records whether undo may name it. */
export function applyEntry(state: BattleState, entry: LoggedCommand) {
  apply(state, entry.by, entry.command, entry.seq)
  recordBeaconDestruction(state)
  const now = playedMoment(state)
  if (now) {
    const order = momentOrder(state, now)
    for (const player of state.players) {
      const fewest = Math.min(player.cpByMoment[order]?.fewest ?? player.cp, player.cp)
      player.cpByMoment[order] = { fewest, last: player.cp }
    }
  }
  if (entry.command.kind === 'begin-battle' || entry.command.kind === 'lock-league-rosters') state.undoable = null
  else if (
    ![
      'settle-opponent-turn',
      'request-advance',
      'cancel-advance',
      'acknowledge-draw',
      'acknowledge-scoring',
      'pause-clock',
      'resume-clock',
      // Casualties are corrected through their own counters, so tapping one never takes Undo away from the last action.
      ...CASUALTY_COMMANDS,
    ].includes(entry.command.kind)
  ) {
    state.undoable = { seq: entry.seq, by: entry.by, kind: entry.command.kind }
  }
}

/** A seat before anything has happened to it. */
function freshPlayer(id: PlayerId, side: number, automated: boolean): PlayerState {
  return {
    id,
    side,
    automated,
    cp: 0,
    cpGained: 0,
    cpSpent: 0,
    cpByRound: Array(BATTLE_ROUNDS).fill(0),
    bonusCpByRound: Array(BATTLE_ROUNDS).fill(0),
    cpByMoment: {},
    primary: 0,
    secondary: 0,
    roster: null,
    rosterSeq: null,
    units: [],
    stratagems: [],
    uses: [],
    secondaries: [],
    secondariesDrawnThisTurn: [],
    additionalSecondaryDrawsThisTurn: 0,
    secondariesToReview: [],
    secondaryDrawSeq: {},
    secondaryDrawnAt: {},
    missionSelections: [],
    primaryCard: null,
    secondaryMode: 'tactical',
    secondaryDeck: null,
    scored: {},
    primaryByRound: Array(BATTLE_ROUNDS).fill(0),
    finalPrimary: 0,
    secondaryByRound: Array(BATTLE_ROUNDS).fill(0),
    scoredByRound: {},
    secondaryStatus: {},
    secretSecondary: null,
    secretRevealed: false,
    painted: false,
    corrections: { cp: 0, primary: 0, secondary: 0 },
    correctionByRound: { primary: Array(BATTLE_ROUNDS).fill(0), secondary: Array(BATTLE_ROUNDS).fill(0) },
  }
}

/** A battle before anything has happened in it, which is what a replay folds into. */
export function emptyBattle(
  playerIds: readonly PlayerId[],
  playerSides?: readonly number[],
  automatedPlayerIds: readonly PlayerId[] = [],
): BattleState {
  return {
    status: 'setup',
    setupStep: 0,
    round: 0,
    phase: 'command',
    activePlayerId: null,
    turnSeq: 0,
    firstPlayerId: null,
    attackerId: null,
    sideDispositions: {},
    dispositionsSealed: false,
    sideWarlords: {},
    warlordsSealed: false,
    resumePlayerId: null,
    pendingSettlement: null,
    completionPending: false,
    advanceRequested: false,
    scoringAcknowledged: false,
    drawAcknowledged: false,
    deploymentId: null,
    leagueToken: null,
    leagueEventToken: null,
    clubId: null,
    settings: { ...DEFAULT_SETTINGS },
    result: null,
    players: playerIds.map((id, index) => freshPlayer(id, playerSides?.[index] ?? index, automatedPlayerIds.includes(id))),
    undoable: null,
    seq: 0,
    clockPaused: false,
  }
}

/** Why `by` may not run `command` against `state`, as the message a player reads, or null when they may. */
export function validate(state: BattleState, by: PlayerId, command: Command): string | null {
  return commandRefusal(state, by, command)?.message ?? null
}

/**
 * Why `by` may not run `command` against `state`, or null when they may.
 *
 * Every rule about turn order, ownership and legality lives here. The server
 * calls it before appending; the UI calls it to decide what to render enabled.
 */
export function commandRefusal(state: BattleState, by: PlayerId, command: Command): Refusal | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return refuse('not-seated', 'you are not in this battle')
  if ('playerId' in command && command.playerId && !state.players.some((candidate) => candidate.id === command.playerId)) {
    return refuse('unknown-player', 'that player is not in this battle')
  }
  const player = targetArmy(state, actor, command)
  if (state.settings.manual && GUIDED_COMMANDS.has(command.kind))
    return refuse('manual-tracking', 'this battle is tracked manually, without missions or stratagems')

  switch (command.kind) {
    case 'select-mission':
      return missionSelectionRefusal(state, by, player, command)
    case 'configure-battle': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (command.manual && state.leagueToken) return refuse('league-sealed', 'this battle plays its event’s mission pack')
      if (command.manual && state.clubId) return refuse('club-ineligible', 'a battle counting for a club keeps its missions and scoring')
      if (command.manual && (command.missionPackId || command.twistId || command.terrainLayoutId))
        return refuse('manual-tracking', 'a manually tracked battle has no mission pack')
      if (state.leagueToken && command.limit !== state.settings.limit) return refuse('league-sealed', 'this battle’s size is sealed')
      if (state.leagueToken && (command.teamBattle ?? false) !== state.settings.teamBattle)
        return refuse('league-sealed', 'this battle’s sides are sealed')
      if (state.leagueToken && battleCapacity(command) !== battleCapacity(state.settings))
        return refuse('league-sealed', 'this battle’s seats are sealed')
      if (command.playerCount !== undefined && command.playerCount !== 2 && command.playerCount !== 3 && command.playerCount !== 4)
        return refuse('unsupported-player-count', 'choose a supported player count')
      if (battleCapacity(command) > PLAYERS_PER_BATTLE !== Boolean(command.teamBattle))
        return refuse('seat-count-mismatch', 'choose matching battle sides and seats')
      if (battleCapacity(command) < state.players.length) return refuse('too-few-seats', 'choose enough seats for every player')
      if (command.limit !== null && !isGameSize(command.limit)) return refuse('unsupported-battle-size', 'choose a supported battle size')
      if (command.teamBattle && isKotcLimit(command.limit)) return refuse('unsupported-battle-size', 'choose a supported battle size')
      if (state.leagueToken && JSON.stringify(command.armyPoints ?? null) !== JSON.stringify(state.settings.armyPoints ?? null))
        return refuse('league-sealed', 'this battle’s points are sealed')
      if (command.armyPoints) {
        if (!command.teamBattle) return refuse('invalid-army-points', 'only a team battle sets points per army')
        if (command.armyPoints.length !== 2 || !command.armyPoints.every(validArmyPoints))
          return refuse('invalid-army-points', ARMY_POINTS_ERROR)
      }
      return null
    }
    case 'reset-setup':
      if (state.leagueToken) return refuse('league-sealed', 'these rosters are sealed')
      return state.status === 'setup' ? null : refuse('battle-started', 'the battle has started')
    case 'set-setup-step':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return Number.isInteger(command.step) && command.step >= 0 && command.step <= SETUP_STEP_MAX
        ? null
        : refuse('unknown-setup-step', 'choose a setup section')
    case 'set-attacker':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return state.players.some((candidate) => candidate.id === command.attackerId)
        ? null
        : refuse('unknown-player', 'that attacker is not in this battle')
    case 'set-first-turn':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return state.players.some((candidate) => candidate.id === command.firstPlayerId)
        ? null
        : refuse('unknown-player', 'that player is not in this battle')
    case 'set-side-disposition': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.dispositionsSealed) return refuse('league-sealed', 'each side’s force disposition is sealed')
      return sideDispositionChoices(state, command.side).includes(command.disposition)
        ? null
        : refuse('disposition-not-brought', 'that force disposition is not one this side brought')
    }
    case 'set-side-warlord': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.warlordsSealed) return refuse('league-sealed', 'each side’s Warlord is sealed')
      return sideWarlordChoices(state, command.side).includes(command.playerId)
        ? null
        : refuse('warlord-not-brought', 'that army is not on this side or names no Warlord')
    }
    case 'attach-roster': {
      if (state.leagueToken) return refuse('league-sealed', 'these rosters are sealed')
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      // Correcting a list mid-battle stays allowed; bringing a different set of cards with it does not.
      if (state.status === 'playing' && command.prep) return refuse('cards-settled', 'cards are settled before the battle begins')
      const name = command.roster.name.trim()
      if (!name) return refuse('invalid-roster', 'name your army')
      if (name.length > ROSTER_NAME_MAX_LENGTH) return refuse('invalid-roster', 'that name is too long')
      if (!command.roster.text.trim()) return refuse('invalid-roster', 'paste your list')
      if (command.roster.text.length > ROSTER_MAX_LENGTH) return refuse('invalid-roster', 'that list is too long')
      const built = command.roster.built
      if ((state.status !== 'setup' || !state.settings.sizeFromRosters) && built && !fitsBattleSize(state.settings, built))
        return refuse('roster-size-mismatch', 'that roster does not match the battle size')
      if (built?.detachmentPointBudget !== undefined) {
        const detachmentError = detachmentPointsError(built.detachments ?? [], built.detachmentPointBudget)
        if (detachmentError) return refuse('invalid-detachments', 'invalid detachment combination')
      }
      if (command.prep) {
        const prepError = validatePrep(command.prep)
        if (prepError) return prepError
      }
      return null
    }
    case 'detach-roster': {
      if (state.leagueToken) return refuse('league-sealed', 'these rosters are sealed')
      // Correcting a list mid-battle stays allowed, because a corrected list is still
      // an army. Taking one away is not: the units on the table would have nothing
      // behind them, so a seat is only emptied while the table is being set.
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (!player.roster) return refuse('no-roster', 'that seat has no army')
      return null
    }
    case 'set-battle-club':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (command.clubId === null) return null
      if (state.leagueToken) return refuse('club-ineligible', 'this battle already counts for its event')
      if (state.settings.manual) return refuse('club-ineligible', 'a manually tracked battle cannot count for a club')
      if (state.players.some((candidate) => isGuestSeat(candidate.id) || isPracticeSeat(candidate)))
        return refuse('club-ineligible', 'only members playing each other can count for a club')
      return null
    case 'lock-league-rosters':
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      if (state.leagueToken) return refuse('league-sealed', 'the rosters are already sealed')
      if (!state.players.every((candidate) => candidate.roster)) return refuse('missing-roster', 'every player needs a sealed roster')
      if (command.dispositions?.every(({ side, disposition }) => sideDispositionChoices(state, side).includes(disposition)) === false)
        return refuse('disposition-not-brought', 'that force disposition is not one this side brought')
      return command.warlords?.every(({ side, playerId }) => sideWarlordChoices(state, side).includes(playerId)) === false
        ? refuse('warlord-not-brought', 'that army is not on this side or names no Warlord')
        : null
    case 'begin-battle': {
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      const requiredPlayers = battleCapacity(state.settings)
      if (state.players.length < requiredPlayers) return refuse('missing-player', 'waiting for an opponent')
      if (state.players.length > requiredPlayers) return refuse('too-many-players', 'too many players are seated')
      const sideSizes = [...new Set(state.players.map((candidate) => candidate.side))].map((side) => sidePlayers(state, side).length)
      if (
        sideSizes.length !== 2 ||
        (requiredPlayers === 2 && sideSizes.some((size) => size !== 1)) ||
        (requiredPlayers === 3 && sideSizes.toSorted((left, right) => left - right).join(',') !== '1,2') ||
        (requiredPlayers === 4 && sideSizes.some((size) => size !== 2))
      )
        return refuse('invalid-sides', 'players must be seated on two valid sides')
      if (state.players.some((candidate) => !candidate.roster))
        return state.settings.teamBattle
          ? refuse('missing-roster', 'every army needs a list')
          : refuse('missing-roster', 'both armies need a list')
      if (state.settings.sizeFromRosters && state.settings.limit === null)
        return refuse('roster-format-mismatch', 'choose matching roster formats for each side')
      if (!state.players.some((candidate) => candidate.id === command.firstPlayerId))
        return refuse('unknown-player', 'that player is not in this battle')
      // A side of allies plays one Force Disposition, and it decides the primary each
      // side is set. Starting without it would hand the answer to whichever seat is first.
      if (
        state.players.some(
          (candidate) => sideDispositionChoices(state, candidate.side).length > 1 && !sideDisposition(state, candidate.side),
        )
      )
        return refuse('missing-disposition', 'each side must choose the force disposition it plays')
      if (state.players.some((candidate) => sideWarlordChoices(state, candidate.side).length > 1 && !sideWarlord(state, candidate.side)))
        return refuse('missing-warlord', 'each side of allies must choose whose Warlord leads it')
      if (command.attackerId && !state.players.some((candidate) => candidate.id === command.attackerId))
        return refuse('unknown-player', 'that attacker is not in this battle')
      if (state.players.some((candidate) => candidate.roster?.built && !fitsBattleSize(state.settings, candidate.roster.built))) {
        return refuse('roster-size-mismatch', 'every roster must match the battle size')
      }
      if (!state.settings.teamBattle && !pointsBudgetsAgree(state))
        return refuse('roster-format-mismatch', 'choose matching points budgets for each side')
      const armyProblem = teamArmyProblems(state)[0]
      if (armyProblem) return refuse(armyProblem.code, armyProblem.message)
      for (const candidate of state.players) {
        const reserveError = strategicReserveSideError(state, candidate)
        if (reserveError) return reserveError
      }
      return null
    }
    case 'adjust-cp': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'command points move in whole steps')
      if (command.missed) {
        if (state.settings.manual) return refuse('manual-tracking', 'a manually tracked battle records command points as they change')
        const refusal = missedMomentRefusal(state, command.missed)
        if (refusal) return refusal
        if (command.delta < 0) return refuse('missed-unsupported', 'only a missed command point gain can be recorded late')
      }
      if (player.cp + command.delta < 0) return refuse('not-enough-cp', 'not enough command points')
      if (state.settings.manual) return null
      return command.delta > 0 ? bonusCpRefusal(player, command.missed?.round ?? state.round, command.delta) : null
    }
    case 'resolve-tactical-hand': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (state.phase !== 'end' || !sameSide(state, state.activePlayerId, player.id))
        return refuse('not-end-of-turn', 'resolve tactical missions at the end of your turn')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical secondaries are resolved each turn')
      const active = activeTacticalSecondaries(player)
      if (!active.length) return refuse('no-active-secondaries', 'there are no active tactical secondaries to resolve')
      const keys = command.keys ?? []
      if (keys.some((key) => !active.some((secondary) => secondary.key === key)))
        return refuse('secondary-not-active', 'that secondary is not active')
      if (command.gainCp && !keys.length) return refuse('nothing-discarded', 'discard a secondary to gain a command point')
      return command.gainCp ? bonusCpRefusal(player, state.round, 1) : null
    }
    case 'score': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'victory points move in whole steps')
      if (player[command.category] + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      // Once secondaries are named, they are scored by name: two ways of adding to
      // the same total is how a breakdown stops adding up.
      if (command.category === 'secondary' && player.secondaries.length) return refuse('score-by-name', 'score the secondary by name')
      return null
    }
    case 'correct-player': {
      if (state.status === 'setup') return refuse('battle-not-started', 'the battle has not started')
      const namedTarget = state.players.find((candidate) => candidate.id === command.playerId)
      if (!namedTarget) return refuse('unknown-player', 'that player is not in this battle')
      const target = sideCaptain(state, namedTarget.side)
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'corrections move in whole steps')
      if (target[command.resource] + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      return null
    }
    case 'settle-opponent-turn': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!state.pendingSettlement) return refuse('nothing-to-settle', 'there is no previous turn to settle')
      if (secretSettlementActionPlayerId(state))
        return refuse('secret-unrevealed', 'reveal the secret mission before settling the previous turn')
      return null
    }
    case 'request-advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (state.completionPending) return refuse('settlement-owed', 'settle the final turn before completing the battle')
      const owed = sideOwes(state, player)
      if (owed === 'settlement') return refuse('settlement-owed', 'settle the previous turn before ending the command phase')
      if (owed === 'cards') return refuse('cards-owed', 'draw every card owed before ending the command phase')
      if (state.phase === 'command' && player.secondariesToReview.length && !state.drawAcknowledged) {
        return refuse('draw-unreviewed', 'review the new secondary missions before ending the command phase')
      }
      if (state.advanceRequested) return refuse('advance-requested', 'the phase is already waiting to advance')
      return null
    }
    case 'cancel-advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (!state.advanceRequested) return refuse('advance-not-requested', 'the phase is not waiting to advance')
      return null
    }
    case 'acknowledge-scoring': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (!state.advanceRequested) return refuse('advance-not-requested', 'the phase is not waiting for scoring')
      if (state.scoringAcknowledged) return refuse('scoring-reviewed', 'scoring has already been reviewed')
      return null
    }
    case 'advance': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      const owed = sideOwes(state, player)
      if (owed === 'settlement') return refuse('settlement-owed', 'settle the previous turn before ending the command phase')
      if (owed === 'cards') return refuse('cards-owed', 'draw every card owed before ending the command phase')
      if (owed === 'secret') return refuse('secret-owed', 'reveal or discard the secret mission before ending the turn')
      if (state.phase === 'command' && player.secondariesToReview.length && !state.drawAcknowledged) {
        return refuse('draw-unreviewed', 'review the new secondary missions before ending the command phase')
      }
      const due = scoringDue(state, player)
      if (due.length && !state.advanceRequested) return refuse('scoring-unreviewed', 'review mission scoring before ending the phase')
      if (due.length && !state.scoringAcknowledged) return refuse('scoring-unreviewed', 'finish mission scoring before ending the phase')
      const unresolvedTactical =
        state.phase === 'end' && player.secondaryMode === 'tactical' && activeTacticalSecondaries(player).length > 0
      if (unresolvedTactical && !state.advanceRequested)
        return refuse('tactical-hand-unreviewed', 'review the tactical hand before ending the turn')
      return null
    }
    case 'end-battle': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      // Older logs also hold battles called early; replay still applies them, but a new one only ends by concession.
      if (command.reason !== 'conceded') return refuse('concession-required', 'a battle ends after its last turn or by concession')
      if (!command.concededBy) return refuse('concession-required', 'choose who conceded')
      const concedingPlayer = state.players.find((candidate) => candidate.id === command.concededBy)
      if (!concedingPlayer) return refuse('unknown-player', 'that player is not in this battle')
      if (isPracticeSeat(concedingPlayer)) return refuse('practice-concession', 'a practice opponent cannot concede')
      return null
    }
    case 'reopen-battle':
      return state.status === 'finished' ? null : refuse('battle-not-over', 'the battle is not over')
    case 'add-note': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!command.text.trim()) return refuse('invalid-note', 'write the note first')
      return command.text.length > NOTE_MAX_LENGTH ? refuse('invalid-note', 'that note is too long') : null
    }
    case 'set-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      if (unit.destroyed === command.destroyed)
        return command.destroyed
          ? refuse('unit-unchanged', 'the unit is already lost')
          : refuse('unit-unchanged', 'the unit is already standing')
      return command.destroyed ? null : embarkedCapacityError(player.units, unit, unit.models)
    }
    case 'deploy-unit': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      const attached = attachedUnits(player.units, command.unitKey)
      if (!attached.length) return refuse('unknown-unit', 'that is not one of your units')
      return state.status === 'setup' && !command.deployed ? movedReserveError(state, player, attached, 'strategic-reserves') : null
    }
    case 'set-unit-formation': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      if (!attachedUnits(player.units, command.unitKey).length)
        return namesAnotherArmy(command, actor)
          ? refuse('unknown-unit', 'that is not one of their units')
          : refuse('unknown-unit', 'that is not one of your units')
      return unitFormationRefusal(state, player, command)
    }
    // The bonus is for a painted army, settled before the battle and paid as it begins.
    case 'set-painted':
      return state.status === 'setup' ? null : refuse('battle-started', 'the battle ready bonus is set before the battle begins')
    case 'wound-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'models come off in whole numbers')
      if (unit.alive + command.delta < 0) return refuse('out-of-range', 'there are not that many models left')
      if (unit.alive + command.delta > unit.models) return refuse('out-of-range', 'that is more models than the unit has')
      return embarkedCapacityError(player.units, unit, unit.alive + command.delta)
    }
    case 'damage-unit': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return refuse('unknown-unit', 'that is not one of your units')
      // Refused rather than guessed at: a unit whose models do not share a wounds
      // characteristic has no single number to count against, and inventing one
      // would put a squad's sergeant and his veterans on the same track.
      const left = unitWoundsLeft(unit)
      if (left === null || !unit.wounds)
        return refuse('wounds-unknown', 'the datasheet does not give this unit a single wounds characteristic')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'wounds come off in whole numbers')
      if (left + command.delta < 0) return refuse('out-of-range', 'there are not that many wounds left')
      if (left + command.delta > unit.models * unit.wounds) return refuse('out-of-range', 'that is more wounds than the unit has')
      return embarkedCapacityError(player.units, unit, Math.ceil((left + command.delta) / unit.wounds))
    }
    case 'set-deployment':
    case 'set-battlefield': {
      // The battlefield is shared, so either player may set it, and only before the
      // first turn — moving the deployment zones mid-battle is not a thing.
      if (state.status !== 'setup') return refuse('battle-started', 'the battle has started')
      return null
    }
    case 'set-prep': {
      if (state.status === 'finished') return refuse('battle-over', 'the battle is over')
      if (state.status === 'playing' && !canRepairPlayingPrep(player, command))
        return refuse('cards-settled', 'cards are settled before the battle begins')
      if (isKotcLimit(state.settings.limit) && command.secondaryMode !== 'tactical')
        return refuse('not-tactical', 'King of the Colosseum requires tactical secondaries')
      return validatePrep(command)
    }
    case 'use-stratagem': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return refuse('unknown-stratagem', 'that is not one of your stratagems')
      if (command.missed) {
        const refusal = missedMomentRefusal(state, command.missed)
        if (refusal) return refusal
        if (isNewOrders(stratagem))
          return refuse('missed-unsupported', 'New Orders draws a replacement card, so it cannot be recorded late')
      }
      return stratagemRefusal(state, player, stratagem, command.cp, command.missed)
    }
    case 'use-new-orders': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.stratagemKey)
      if (!stratagem || !isNewOrders(stratagem)) return refuse('unknown-stratagem', 'New Orders is not in your stratagems')
      const refusal = stratagemRefusal(state, player, stratagem, command.cp)
      if (refusal) return refusal
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'New Orders requires tactical secondary missions')
      if (
        !player.secondaries.some(
          (secondary) => secondary.key === command.secondaryKey && player.secondaryStatus[secondary.key] === 'active',
        )
      ) {
        return refuse('secondary-not-active', 'choose an active secondary mission')
      }
      if (!command.secondary.name.trim()) return refuse('unnamed-card', 'name the replacement secondary')
      if (!player.secondaryDeck?.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-not-in-deck', 'that secondary is not in your deck')
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-already-drawn', 'that secondary has already been drawn')
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'score-secondary': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!mayNameSecondary(state, by, player, command.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      if (!Number.isInteger(command.delta) || command.delta === 0) return refuse('invalid-amount', 'victory points move in whole steps')
      if ((player.scored[command.key] ?? 0) + command.delta < 0) return refuse('below-zero', 'that would go below zero')
      return null
    }
    case 'score-settlement': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!command.scores.length) return refuse('invalid-settlement', 'record at least one score')
      if (command.missed) {
        const refusal = missedScoreRefusal(state, by, player, command, command.missed)
        if (refusal) return refusal
      } else if (command.round !== undefined && command.round !== state.round) {
        // Naming a round is only ever answering the turn that is waiting to be settled.
        // Anything else is a second way to say which round a score belongs to.
        const pending = state.pendingSettlement
        if (!pending || pending.playerId !== player.id || pending.round !== command.round) {
          return refuse('wrong-settlement-turn', 'that is not the turn waiting to be settled')
        }
      }
      const keys = new Set<string>()
      for (const score of command.scores) {
        if (!Number.isInteger(score.delta) || score.delta <= 0)
          return refuse('invalid-amount', 'victory points move in positive whole steps')
        if (score.category === 'primary') {
          if (score.final) {
            const claimed = finalAwardTotal(
              player.primaryCard?.awards ?? [],
              score.final.claims,
              { phase: state.phase, round: state.round, rounds: BATTLE_ROUNDS, endOfBattle: atBattleEnd(state) },
              sameSide(state, player.id, state.activePlayerId ?? ''),
              player.secondaryMode,
            )
            const finalSide = state.completionPending ? state.pendingSettlement?.playerId : state.activePlayerId
            if (
              !atBattleEnd(state) ||
              !sameSide(state, player.id, finalSide ?? '') ||
              player.finalPrimary > 0 ||
              claimed === null ||
              !Number.isInteger(score.final.delta) ||
              score.final.delta <= 0 ||
              score.final.delta > score.delta ||
              score.final.delta > claimed
            )
              return refuse('invalid-settlement', 'those are not available end-of-battle points')
          }
          if (keys.has('primary')) return refuse('invalid-settlement', 'record primary scoring once per settlement')
          keys.add('primary')
          continue
        }
        if (keys.has(score.key)) return refuse('invalid-settlement', 'record each secondary once per settlement')
        keys.add(score.key)
        if (!mayNameSecondary(state, by, player, score.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      }
      return null
    }
    case 'set-secondary-status': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!mayNameSecondary(state, by, player, command.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
      return null
    }
    case 'draw-secondary': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical missions are drawn')
      if (player.secondariesDrawnThisTurn.length >= secondaryDrawTarget(player)) {
        return refuse('draw-limit', 'you have already drawn your secondaries this turn')
      }
      if (!command.secondary.name.trim()) return refuse('unnamed-card', 'name the secondary')
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return refuse('card-not-in-deck', 'that secondary is not in your deck')
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-already-drawn', 'that secondary has already been drawn')
      if (player.secondaries.length >= SECONDARY_HISTORY_MAX) return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'draw-secondaries': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (player.secondaryMode !== 'tactical') return refuse('not-tactical', 'only tactical missions are drawn')
      const refill = Math.min(
        secondaryDrawTarget(player) - player.secondariesDrawnThisTurn.length,
        undrawnSecondaries(player).length,
        SECONDARY_HISTORY_MAX - player.secondaries.length,
      )
      if (!command.secondaries.length || command.secondaries.length !== refill)
        return refuse('invalid-draw', 'draw every card owed for this turn together')
      const keys = new Set<string>()
      for (const secondary of command.secondaries) {
        if (!secondary.name.trim()) return refuse('unnamed-card', 'name the secondary')
        if (keys.has(secondary.key)) return refuse('invalid-draw', 'draw each secondary once')
        keys.add(secondary.key)
        if (player.secondaryDeck && !player.secondaryDeck.some((candidate) => candidate.key === secondary.key)) {
          return refuse('card-not-in-deck', 'that secondary is not in your deck')
        }
        if (player.secondaries.some((candidate) => candidate.key === secondary.key))
          return refuse('card-already-drawn', 'that secondary has already been drawn')
      }
      if (player.secondaries.length + command.secondaries.length > SECONDARY_HISTORY_MAX)
        return refuse('secondary-history-full', 'the secondary history is full')
      return null
    }
    case 'acknowledge-draw': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!sameSide(state, state.activePlayerId, player.id)) return refuse('not-your-turn', 'it is not your turn')
      if (sideOwes(state, player) === 'cards') return refuse('cards-owed', 'draw every card owed before taking the turn')
      if (!player.secondariesToReview.length) return refuse('nothing-to-acknowledge', 'there is no new hand to acknowledge')
      if (state.drawAcknowledged) return refuse('hand-acknowledged', 'the hand has already been acknowledged')
      return null
    }
    case 'select-secret': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (player.secretSecondary) return refuse('secret-chosen', 'you already have a secret mission')
      if (!command.secondary.name.trim()) return refuse('unnamed-card', 'name the secret mission')
      if (player.secondaryDeck && !player.secondaryDeck.some((secondary) => secondary.key === command.secondary.key)) {
        return refuse('card-not-in-deck', 'that secondary is not in your deck')
      }
      if (player.secondaries.some((secondary) => secondary.key === command.secondary.key))
        return refuse('card-already-drawn', 'that secondary has already been selected')
      return null
    }
    case 'reveal-secret': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!player.secretSecondary) return refuse('no-secret', 'you have no secret mission')
      if (player.secretRevealed) return refuse('secret-revealed', 'the secret mission is already revealed')
      return null
    }
    case 'pause-clock': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (state.clockPaused) return refuse('clock-unchanged', 'the timer is already paused')
      return null
    }
    case 'resume-clock': {
      if (state.status !== 'playing') return refuse('battle-not-running', 'the battle is not running')
      if (!state.clockPaused) return refuse('clock-unchanged', 'the timer is already running')
      return null
    }
    case 'undo': {
      if (!state.undoable) return refuse('nothing-to-undo', 'there is nothing to undo')
      if (state.undoable.seq !== command.target) return refuse('undo-not-latest', 'only the last action can be undone')
      return null
    }
    // A new command kind breaks this assignment rather than being quietly allowed.
    default: {
      const unhandled: never = command
      return refuse('unknown-command', `unknown command ${JSON.stringify(unhandled)}`)
    }
  }
}

function apply(state: BattleState, by: PlayerId, command: Command, seq: number) {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return
  const player = targetArmy(state, actor, command)

  switch (command.kind) {
    case 'select-mission':
      applyMissionSelection(state, player, command, seq)
      return
    case 'configure-battle': {
      const missionPackChanged = state.settings.missionPackId !== command.missionPackId
      state.settings = {
        limit: command.limit,
        ...(command.limit === null ? { sizeFromRosters: true } : {}),
        missionPackId: command.missionPackId,
        terrainLayoutId: command.terrainLayoutId,
        twistId: command.twistId,
        teamBattle: command.teamBattle ?? false,
        playerCount: battleCapacity(command),
        ...(command.armyPoints ? { armyPoints: command.armyPoints } : {}),
        ...(command.manual ? { manual: true } : {}),
      }
      if (missionPackChanged) {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
      }
      if (command.manual) {
        state.deploymentId = null
        state.attackerId = null
        state.sideDispositions = {}
        for (const candidate of state.players) applyPrep(candidate, null)
      }
      for (const candidate of state.players) {
        if (!state.settings.sizeFromRosters && candidate.roster?.built && !fitsBattleSize(state.settings, candidate.roster.built))
          detachRoster(state, candidate)
      }
      inferBattleSize(state)
      return
    }
    case 'reset-setup': {
      state.setupStep = 0
      state.attackerId = null
      state.firstPlayerId = null
      state.sideDispositions = {}
      state.sideWarlords = {}
      state.deploymentId = null
      state.settings = { ...state.settings, terrainLayoutId: null, twistId: null }
      for (const seat of state.players) Object.assign(seat, freshPlayer(seat.id, seat.side, seat.automated))
      inferBattleSize(state)
      return
    }
    case 'set-setup-step': {
      state.setupStep = command.step
      return
    }
    case 'set-attacker': {
      state.attackerId = command.attackerId
      return
    }
    /**
     * The roll-off both sides watched, recorded before the battle begins.
     *
     * Logged rather than held on the device that saw it, because the section that
     * asks for it and the section that starts the battle are two steps apart: a
     * private answer would let two devices show the table different ones.
     */
    case 'set-first-turn': {
      if (!state.firstPlayerId) {
        for (const candidate of state.players) {
          for (const unit of candidate.units) unit.deployedAtRollOff = unit.formation === 'battlefield'
        }
      }
      state.firstPlayerId = command.firstPlayerId
      return
    }
    case 'set-side-disposition': {
      state.sideDispositions[command.side] = command.disposition
      return
    }
    case 'set-side-warlord': {
      state.sideWarlords[command.side] = command.playerId
      return
    }
    case 'attach-roster': {
      if (state.status === 'setup') state.firstPlayerId = null
      player.roster = { ...command.roster, name: command.roster.name.trim() }
      player.rosterSeq = seq
      // A replaced list is a different army, so nothing about the old one survives.
      const fielded = fieldedUnits(command.roster.built?.units ?? [])
      // A list corrected mid-battle has already deployed, so where it starts no longer applies.
      player.units = state.status === 'setup' ? startingEmbarks(fielded) : fielded
      if (command.prep !== undefined && !state.settings.manual) applyPrep(player, command.prep)
      // Most armies on a table are painted, so a list arrives claiming the bonus and
      // the few that are not turn it off. Only when the command says so: a log from
      // before this carries no claim, and folding one must not invent it a bonus.
      if (command.painted !== undefined) player.painted = command.painted
      if (state.status === 'setup') {
        state.deploymentId = null
        state.settings.terrainLayoutId = null
        inferBattleSize(state)
      }
      return
    }
    case 'detach-roster': {
      detachRoster(state, player)
      inferBattleSize(state)
      return
    }
    case 'set-battle-club':
      state.clubId = command.clubId
      return
    case 'lock-league-rosters': {
      state.leagueToken = command.leagueToken
      state.leagueEventToken = command.eventToken ?? null
      if (command.dispositions) {
        for (const { side, disposition } of command.dispositions) state.sideDispositions[side] = disposition
        state.dispositionsSealed = true
      }
      if (command.warlords) {
        for (const { side, playerId } of command.warlords) state.sideWarlords[side] = playerId
        state.warlordsSealed = true
      }
      return
    }
    case 'set-unit':
    case 'wound-unit':
    case 'damage-unit': {
      const unit = player.units.find((candidate) => candidate.key === command.unitKey)
      if (!unit) return
      Object.assign(unit, casualtyOutcome(unit, command))
      disembarkPassengers(player.units, unit)
      return
    }
    case 'deploy-unit': {
      for (const unit of attachedUnits(player.units, command.unitKey)) {
        Object.assign(unit, changedFormation(unit, command.deployed ? 'battlefield' : 'strategic-reserves'))
      }
      return
    }
    case 'set-unit-formation': {
      // The character and the unit he joined start together, so one press moves both.
      const attached = attachedUnits(player.units, command.unitKey)
      const redeployed = redeploysToReserves(state, attached, command.formation)
      for (const unit of attached) {
        Object.assign(unit, changedFormation(unit, command.formation, redeployed, command.transportKey))
      }
      return
    }
    case 'set-painted': {
      player.painted = command.painted
      return
    }
    case 'set-deployment': {
      if (state.deploymentId !== command.patternId) state.settings.terrainLayoutId = null
      state.deploymentId = command.patternId
      return
    }
    case 'set-battlefield': {
      state.deploymentId = command.patternId
      state.settings.terrainLayoutId = command.terrainLayoutId
      return
    }
    case 'set-prep': {
      if (state.status === 'playing' && canRepairPlayingPrep(player, command)) repairPrep(player, command)
      else applyPrep(player, command)
      if (state.status === 'playing' && sameSide(state, state.activePlayerId, player.id)) state.drawAcknowledged = false
      return
    }
    case 'use-stratagem': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.key)
      if (!stratagem) return
      applyStratagemUse(state, player, stratagem, command.cp, command.missed)
      return
    }
    case 'use-new-orders': {
      const stratagem = player.stratagems.find((candidate) => candidate.key === command.stratagemKey)
      if (!stratagem) return
      applyStratagemUse(state, player, stratagem, command.cp)
      if (!player.secondariesDrawnThisTurn.includes(command.secondaryKey)) player.additionalSecondaryDrawsThisTurn += 1
      player.secondaryStatus = { ...player.secondaryStatus, [command.secondaryKey]: 'discarded' }
      player.secondariesDrawnThisTurn = player.secondariesDrawnThisTurn.filter((key) => key !== command.secondaryKey)
      player.secondariesToReview = player.secondariesToReview.filter((key) => key !== command.secondaryKey)
      const key = drawCard(state, player, command.secondary, seq)
      player.secondariesDrawnThisTurn.push(key)
      player.secondariesToReview.push(key)
      state.drawAcknowledged = false
      return
    }
    case 'score-secondary': {
      applySecondaryScore(player, command.key, command.delta, state.round)
      return
    }
    case 'score-settlement': {
      // A payout the previous turn owed belongs to the round that turn was in, which
      // the second player passing the turn has already moved the battle out of.
      const round = pointsRound(state, command)
      for (const score of command.scores) {
        if (score.category === 'primary') {
          player.primary += score.delta
          player.finalPrimary += score.final?.delta ?? 0
          player.primaryByRound[round - 1] = (player.primaryByRound[round - 1] ?? 0) + score.delta
          continue
        }
        applySecondaryScore(player, score.key, score.delta, round)
        if (score.status) {
          player.secondaryStatus = { ...player.secondaryStatus, [score.key]: score.status }
          if (score.key === player.secretSecondary) player.secretRevealed = true
        }
      }
      if (state.advanceRequested && !command.missed) state.scoringAcknowledged = true
      return
    }
    case 'set-secondary-status': {
      // A card put back or discarded the moment it is drawn is replaced, not spent: it
      // never occupied one of this turn's two draws, so the count backs off to let the
      // replacement in.
      const wasActive = (player.secondaryStatus[command.key] ?? 'active') === 'active'
      player.secondaryStatus = { ...player.secondaryStatus, [command.key]: command.status }
      if (command.key === player.secretSecondary && command.status !== 'active') player.secretRevealed = true
      if (wasActive && command.status !== 'active') {
        player.secondariesDrawnThisTurn = player.secondariesDrawnThisTurn.filter((key) => key !== command.key)
        player.secondariesToReview = player.secondariesToReview.filter((key) => key !== command.key)
      }
      return
    }
    case 'draw-secondary': {
      const key = drawCard(state, player, command.secondary, seq)
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, key]
      player.secondariesToReview = [...player.secondariesToReview, key]
      state.drawAcknowledged = false
      return
    }
    case 'draw-secondaries': {
      for (const drawn of command.secondaries) drawCard(state, player, drawn, seq)
      player.secondariesDrawnThisTurn = [...player.secondariesDrawnThisTurn, ...command.secondaries.map((drawn) => drawn.key)]
      player.secondariesToReview = [...player.secondariesToReview, ...command.secondaries.map((drawn) => drawn.key)]
      state.drawAcknowledged = false
      return
    }
    case 'acknowledge-draw': {
      state.drawAcknowledged = true
      player.secondariesToReview = []
      return
    }
    case 'acknowledge-scoring': {
      state.scoringAcknowledged = true
      return
    }
    case 'select-secret': {
      player.secretSecondary = drawCard(state, player, command.secondary, seq)
      player.secretRevealed = false
      return
    }
    case 'reveal-secret': {
      player.secretRevealed = true
      return
    }
    case 'begin-battle': {
      state.status = 'playing'
      state.round = 1
      state.firstPlayerId = command.firstPlayerId
      state.attackerId = command.attackerId ?? state.attackerId ?? command.firstPlayerId
      state.result = null
      enterTurn(state, command.firstPlayerId, null, seq)
      return
    }
    case 'adjust-cp': {
      adjustCp(state, player, command.delta, command.missed)
      return
    }
    case 'resolve-tactical-hand': {
      const keys = command.keys ?? []
      player.secondaryStatus = {
        ...player.secondaryStatus,
        ...Object.fromEntries(keys.map((key) => [key, 'discarded' as const])),
      }
      if (command.gainCp) adjustCp(state, player, 1)
      return
    }
    case 'score': {
      player[command.category] += command.delta
      const ledger = command.category === 'primary' ? player.primaryByRound : player.secondaryByRound
      ledger[state.round - 1] = (ledger[state.round - 1] ?? 0) + command.delta
      return
    }
    case 'correct-player': {
      const namedTarget = state.players.find((candidate) => candidate.id === command.playerId)
      if (!namedTarget) return
      const target = sideCaptain(state, namedTarget.side)
      target[command.resource] += command.delta
      target.corrections[command.resource] += command.delta
      if (command.resource === 'cp') {
        if (state.round) target.cpByRound[state.round - 1] = target.cp
      } else {
        const ledger = command.resource === 'primary' ? target.primaryByRound : target.secondaryByRound
        const round = Math.max(0, state.round - 1)
        ledger[round] = (ledger[round] ?? 0) + command.delta
        const corrections = command.resource === 'primary' ? target.correctionByRound.primary : target.correctionByRound.secondary
        corrections[round] = (corrections[round] ?? 0) + command.delta
      }
      return
    }
    case 'settle-opponent-turn': {
      state.pendingSettlement = null
      if (state.completionPending) {
        state.completionPending = false
        finishBattle(state, { reason: 'completed', concededBy: null })
      }
      return
    }
    case 'request-advance': {
      state.advanceRequested = true
      state.scoringAcknowledged = false
      return
    }
    case 'cancel-advance': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      return
    }
    case 'advance': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      const next = PHASES.indexOf(state.phase) + 1
      if (next < PHASES.length) {
        if (state.phase === 'command' && state.pendingSettlement?.playerId === player.id) state.pendingSettlement = null
        state.phase = PHASES[next]!
        return
      }
      const advancingPlayer = command.playerId ? player.id : by
      const opponent = state.players.find((candidate) => !sameSide(state, candidate.id, advancingPlayer))
      const endsFirstTurn = command.playerId
        ? sameSide(state, advancingPlayer, state.firstPlayerId ?? '')
        : advancingPlayer === state.firstPlayerId
      if (endsFirstTurn && opponent) {
        enterTurn(state, opponent.id, state.round, seq)
        return
      }
      if (state.round === BATTLE_ROUNDS) {
        if ((endsFirstTurn && !opponent) || state.settings.manual) {
          finishBattle(state, { reason: 'completed', concededBy: null })
          return
        }
        const firstPlayer = state.players.find((candidate) => sameSide(state, candidate.id, state.firstPlayerId ?? ''))
        if (firstPlayer) state.pendingSettlement = { playerId: sideCaptain(state, firstPlayer.side).id, round: state.round }
        state.completionPending = true
        return
      }
      const endedRound = state.round
      state.round++
      if (state.firstPlayerId) {
        enterTurn(state, state.firstPlayerId, endedRound, seq)
      }
      return
    }
    case 'end-battle': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      state.completionPending = false
      finishBattle(state, { reason: command.reason ?? 'finished-early', concededBy: command.concededBy ?? null })
      return
    }
    case 'add-note':
      return
    case 'reopen-battle': {
      state.advanceRequested = false
      state.scoringAcknowledged = false
      state.completionPending = false
      state.status = 'playing'
      state.result = null
      state.activePlayerId = state.resumePlayerId ?? state.firstPlayerId
      state.clockPaused = false
      return
    }
    case 'pause-clock': {
      state.clockPaused = true
      return
    }
    case 'resume-clock': {
      state.clockPaused = false
      return
    }
    case 'undo': {
      // Never applied: the fold skips what an undo names.
      return
    }
    default: {
      const unhandled: never = command
      throw new Error(`unknown command ${JSON.stringify(unhandled)}`)
    }
  }
}

function applySecondaryScore(player: PlayerState, key: string, delta: number, round: number) {
  player.scored = { ...player.scored, [key]: (player.scored[key] ?? 0) + delta }
  player.secondary = Object.values(player.scored).reduce((total, points) => total + points, player.corrections.secondary)
  const rounds = [...(player.scoredByRound[key] ?? Array(BATTLE_ROUNDS).fill(0))]
  rounds[round - 1] = (rounds[round - 1] ?? 0) + delta
  player.scoredByRound = { ...player.scoredByRound, [key]: rounds }
  player.secondaryByRound[round - 1] = (player.secondaryByRound[round - 1] ?? 0) + delta
}

function detachRoster(state: BattleState, player: PlayerState) {
  state.firstPlayerId = null
  state.deploymentId = null
  state.settings.terrainLayoutId = null
  delete state.sideDispositions[player.side]
  delete state.sideWarlords[player.side]
  player.roster = null
  player.units = []
  player.painted = false
  applyPrep(player, null)
}

function applyPrep(player: PlayerState, prep: BattlePrep | null | undefined) {
  const chosen = prep ?? { stratagems: [], secondaries: [], primary: null, secondaryMode: 'tactical' as const }
  const deck = chosen.secondaryDeck?.map((secondary) => ({ ...secondary, name: secondary.name.trim() })) ?? null
  const unnamedSecondary =
    player.secondary - Object.values(player.scored).reduce((total, points) => total + points, 0) - player.corrections.secondary
  const unnamedByRound = Array.from(
    { length: BATTLE_ROUNDS },
    (_, round) =>
      (player.secondaryByRound[round] ?? 0) -
      Object.values(player.scoredByRound).reduce((total, scores) => total + (scores[round] ?? 0), 0) -
      (player.correctionByRound.secondary[round] ?? 0),
  )
  player.stratagems = chosen.stratagems.map((stratagem) => correctStratagemTiming({ ...stratagem, name: stratagem.name.trim() }))
  player.secondaries = chosen.secondaries.map((secondary) => ({
    ...(deck?.find((candidate) => candidate.key === secondary.key) ?? secondary),
    name: (deck?.find((candidate) => candidate.key === secondary.key)?.name ?? secondary.name).trim(),
  }))
  player.primaryCard = chosen.primary ? { ...chosen.primary, name: chosen.primary.name.trim() } : null
  player.secondaryMode = chosen.secondaryMode
  player.secondaryDeck = deck
  player.secondaryStatus = Object.fromEntries(player.secondaries.map((secondary) => [secondary.key, 'active']))
  player.secretSecondary = null
  player.secretRevealed = false
  const kept = Object.fromEntries(
    Object.entries(player.scored).filter(([key]) => player.secondaries.some((secondary) => secondary.key === key)),
  )
  player.scored = kept
  player.secondary = Object.values(kept).reduce((total, points) => total + points, player.corrections.secondary + unnamedSecondary)
  player.scoredByRound = Object.fromEntries(
    Object.entries(player.scoredByRound).filter(([key]) => player.secondaries.some((secondary) => secondary.key === key)),
  )
  player.secondaryByRound = Array.from(
    { length: BATTLE_ROUNDS },
    (_, round) =>
      Object.values(player.scoredByRound).reduce((total, scores) => total + (scores[round] ?? 0), 0) +
      (player.correctionByRound.secondary[round] ?? 0) +
      (unnamedByRound[round] ?? 0),
  )
}

function repairPrep(player: PlayerState, prep: BattlePrep) {
  const deck = prep.secondaryDeck?.map((secondary) => ({ ...secondary, name: secondary.name.trim() })) ?? null
  player.secondaryDeck = deck
  if (!player.primaryCard && prep.primary) player.primaryCard = { ...prep.primary, name: prep.primary.name.trim() }
  if (player.secondaryMode === 'fixed' && deck) {
    player.secondaries = player.secondaries.map((secondary) => {
      const restored = deck.find((candidate) => candidate.key === secondary.key)
      return restored ? { ...secondary, ...restored } : secondary
    })
  }
}

function canRepairPlayingPrep(player: PlayerState, prep: BattlePrep) {
  const sameKeys = (left: readonly { key: string }[], right: readonly { key: string }[]) =>
    left.length === right.length && left.every((entry, index) => entry.key === right[index]?.key)
  if (player.secondaryDeck?.length || !prep.secondaryDeck?.length) return false
  if (player.secondaryMode !== prep.secondaryMode || !sameKeys(prep.stratagems, player.stratagems)) return false
  if (player.primaryCard && prep.primary?.key !== player.primaryCard.key) return false
  if (player.secondaryMode === 'tactical') return player.secondaries.length === 0 && prep.secondaries.length === 0
  const fixedSecondaries = player.secondaries.filter((secondary) => secondary.key !== player.secretSecondary)
  return sameKeys(prep.secondaries, fixedSecondaries)
}

/** Whether a stratagem's allowance is spent at a moment. `turn` and `phase` reset as play moves on. */
function limitReached(state: BattleState, player: PlayerState, stratagem: Stratagem, moment: BattleMoment): boolean {
  if (stratagem.limit === 'unlimited') return false
  const uses = player.uses.filter((use) => use.key === stratagem.key)
  if (stratagem.limit === 'battle') return uses.length > 0
  if (stratagem.limit === 'battle-round') return uses.some((use) => use.round === moment.round)
  const thatTurn = uses.filter((use) => use.round === moment.round && sameSide(state, use.turn, moment.turn))
  return stratagem.limit === 'turn' ? thatTurn.length > 0 : thatTurn.some((use) => use.phase === moment.phase)
}

export const isNewOrders = (stratagem: Pick<Stratagem, 'name'>) => stratagem.name.trim().toLocaleLowerCase() === 'new orders'

function stratagemRefusal(
  state: BattleState,
  player: PlayerState,
  stratagem: Stratagem,
  overriddenCost?: number,
  missed?: BattleMoment,
): Refusal | null {
  const moment = missed ?? { round: state.round, phase: state.phase, turn: state.activePlayerId ?? '' }
  const when = missed ? 'that' : 'this'
  if (stratagem.phases?.length && !stratagem.phases.includes(moment.phase))
    return refuse('stratagem-wrong-phase', `${stratagem.name} cannot be used in ${when} phase`)
  if (stratagem.turn === 'your-turn' && !sameSide(state, moment.turn, player.id))
    return refuse('stratagem-wrong-turn', `${stratagem.name} is used on your turn`)
  if (stratagem.turn === 'opponent-turn' && sameSide(state, moment.turn, player.id)) {
    return refuse('stratagem-wrong-turn', `${stratagem.name} is used on your opponent’s turn`)
  }
  const cost = overriddenCost ?? stratagem.cp
  if (!Number.isInteger(cost) || cost < 0 || cost > STRATAGEM_CP_MAX) return refuse('invalid-amount', 'that is not a possible cost')
  if (player.cp < cost) return refuse('not-enough-cp', 'not enough command points')
  if (missed && fewestCpSince(state, player, missed) < cost)
    return refuse('not-enough-cp', 'that would leave too few command points at a later moment')
  if (limitReached(state, player, stratagem, moment))
    return refuse(
      'stratagem-limit',
      `${stratagem.name} has been used ${stratagem.limit === 'battle' ? 'this' : when} ${stratagem.limit.replace('-', ' ')}`,
    )
  return null
}

function applyStratagemUse(state: BattleState, player: PlayerState, stratagem: Stratagem, overriddenCost?: number, missed?: BattleMoment) {
  const spent = overriddenCost ?? stratagem.cp
  player.cp -= spent
  player.cpSpent += spent
  recordCpChange(state, player, -spent, missed)
  const moment = missed ?? { round: state.round, phase: state.phase, turn: state.activePlayerId }
  player.uses.push({ key: stratagem.key, name: stratagem.name, cp: spent, round: moment.round, phase: moment.phase, turn: moment.turn })
}

/**
 * The moment being played, or null outside play.
 *
 * Moments are ordered by `momentOrder`, so an action recorded late can be placed
 * against the moments since without storing a second clock.
 */
function playedMoment(state: BattleState): BattleMoment | null {
  return state.status === 'playing' && state.round > 0 && state.activePlayerId
    ? { round: state.round, phase: state.phase, turn: state.activePlayerId }
    : null
}

function momentOrder(state: BattleState, moment: BattleMoment): number {
  const turn = sameSide(state, moment.turn, state.firstPlayerId ?? '') ? 0 : 1
  return ((moment.round - 1) * 2 + turn) * PHASES.length + PHASES.indexOf(moment.phase)
}

/**
 * The earlier moments a missed action may name: this battle round and the one before.
 *
 * Bounded so a correction stays within what the table can still remember, and so the
 * usage limits, CP and card holdings it is judged against stay those of a recent turn.
 */
export function missedMoments(state: BattleState): BattleMoment[] {
  const now = playedMoment(state)
  if (!now || !state.firstPlayerId) return []
  const second = state.players.find((player) => !sameSide(state, player.id, state.firstPlayerId ?? ''))?.id
  const turns = [state.firstPlayerId, ...(second ? [second] : [])]
  const latest = momentOrder(state, now)
  return [...new Set([Math.max(1, state.round - 1), state.round])]
    .flatMap((round) => turns.flatMap((turn) => PHASES.map((phase) => ({ round, phase, turn }))))
    .filter((moment) => momentOrder(state, moment) < latest)
}

function missedMomentRefusal(state: BattleState, moment: BattleMoment): Refusal | null {
  return missedMoments(state).some(
    (candidate) => candidate.round === moment.round && candidate.phase === moment.phase && sameSide(state, candidate.turn, moment.turn),
  )
    ? null
    : refuse('missed-moment', 'a missed action belongs to an earlier phase of this battle round or the previous one')
}

function missedScoreRefusal(
  state: BattleState,
  by: PlayerId,
  player: PlayerState,
  command: Extract<Command, { kind: 'score-settlement' }>,
  moment: BattleMoment,
): Refusal | null {
  const refusal = missedMomentRefusal(state, moment)
  if (refusal) return refusal
  if (command.round !== undefined) return refuse('missed-unsupported', 'a missed score names its moment rather than a settlement round')
  for (const score of command.scores) {
    if (score.category === 'primary') {
      if (score.final) return refuse('missed-unsupported', 'end-of-battle points cannot be recorded late')
      continue
    }
    if (!mayNameSecondary(state, by, player, score.key)) return refuse('unknown-secondary', 'that is not one of your secondaries')
    if (player.secondaryStatus[score.key] !== 'active')
      return refuse('missed-unsupported', 'only a secondary mission still held can be scored late')
    if ((player.secondaryDrawnAt[score.key] ?? -1) > momentOrder(state, moment))
      return refuse('missed-unsupported', 'that secondary mission had not been drawn yet')
  }
  return null
}

/** The fewest CP the side held from the end of a moment until now, which a missed spend may not exceed. */
function fewestCpSince(state: BattleState, player: PlayerState, moment: BattleMoment): number {
  const from = momentOrder(state, moment)
  return Object.entries(player.cpByMoment).reduce((fewest, [key, cp]) => {
    const order = Number(key)
    return order < from ? fewest : Math.min(fewest, order === from ? cp.last : cp.fewest)
  }, player.cp)
}

/** Carries a CP change through every moment since the one it belongs to. */
/** A gain beyond the side's own Command phase, which the rules cap at one a battle round. */
function bonusCpRefusal(player: PlayerState, round: number, delta: number): Refusal | null {
  return (player.bonusCpByRound[round - 1] ?? 0) + delta > 1
    ? refuse('cp-gain-limit', 'a side can gain at most 1 additional command point per battle round')
    : null
}

function adjustCp(state: BattleState, player: PlayerState, delta: number, missed?: BattleMoment) {
  const round = missed?.round ?? state.round
  player.cp += delta
  if (delta > 0) {
    player.cpGained += delta
    player.bonusCpByRound[round - 1] = (player.bonusCpByRound[round - 1] ?? 0) + delta
  } else player.cpSpent += Math.abs(delta)
  recordCpChange(state, player, delta, missed)
}

function recordCpChange(state: BattleState, player: PlayerState, delta: number, missed?: BattleMoment) {
  if (missed) {
    const from = momentOrder(state, missed)
    for (const [key, cp] of Object.entries(player.cpByMoment)) {
      if (Number(key) >= from) player.cpByMoment[Number(key)] = { fewest: cp.fewest + delta, last: cp.last + delta }
    }
    for (let round = missed.round; round < state.round; round++) player.cpByRound[round - 1]! += delta
  }
  player.cpByRound[state.round - 1] = player.cp
}

/** The round a settlement's points belong to. */
export function pointsRound(state: BattleState, command: Extract<Command, { kind: 'score-settlement' }>): number {
  return command.missed?.round ?? command.round ?? state.round
}

/** Ends the battle, remembering whose turn it was so reopening it resumes there. */
function finishBattle(state: BattleState, result: NonNullable<BattleState['result']>) {
  state.status = 'finished'
  state.result = result
  state.resumePlayerId = state.activePlayerId
  state.activePlayerId = null
}

/** Puts a card into the hand as the side's own deck holds it, and returns its key. */
function drawCard(state: BattleState, player: PlayerState, card: Secondary, seq: number): string {
  const secondary = { ...(player.secondaryDeck?.find((candidate) => candidate.key === card.key) ?? card) }
  player.secondaries.push(secondary)
  player.secondaryDrawSeq[secondary.key] = seq
  const now = playedMoment(state)
  if (now) player.secondaryDrawnAt[secondary.key] = momentOrder(state, now)
  player.secondaryStatus = { ...player.secondaryStatus, [secondary.key]: 'active' }
  return secondary.key
}

function enterTurn(state: BattleState, playerId: PlayerId, settlementRound: number | null, seq: number) {
  state.activePlayerId = playerId
  state.turnSeq = seq
  state.phase = 'command'
  const activeSide = state.players.find((candidate) => candidate.id === playerId)?.side
  const player = activeSide === undefined ? undefined : sideCaptain(state, activeSide)
  if (player) {
    for (const saved of player.missionSelections) {
      if (saved.selection.kind === 'punishment' || saved.selection.kind === 'guards') saved.expired = true
    }
    state.pendingSettlement = settlementRound === null || state.settings.manual ? null : { playerId: player.id, round: settlementRound }
    state.drawAcknowledged = false
    for (const side of state.settings.manual ? [] : new Set(state.players.map((candidate) => candidate.side))) {
      const resources = sideCaptain(state, side)
      resources.cp += COMMAND_PHASE_CP
      resources.cpGained += COMMAND_PHASE_CP
      resources.cpByRound[state.round - 1] = resources.cp
    }
    player.secondariesDrawnThisTurn = []
    player.additionalSecondaryDrawsThisTurn = 0
    player.secondariesToReview = []
  }
}

/**
 * The Force Disposition a side plays, which decides the primary it is set.
 *
 * Where two allies' lists chose different cards and the side has not said which it
 * plays, the answer is nothing at all — taking the first seat's card would have
 * played one ally's choice for both of them without ever saying so.
 */
export function sideDisposition(state: BattleState, side: number): string | null {
  const disposition = teamDisposition(
    sidePlayers(state, side).map((player) => player.roster),
    state.sideDispositions[side] ?? null,
  )
  // A battle already being played is never left without a mission. Setup refuses to
  // start one until each side has said, so this only answers for battles begun before
  // the question was asked — and it answers what they were already being played on.
  if (disposition || state.status === 'setup') return disposition
  return sideCaptain(state, side).roster?.built?.disposition ?? null
}

/** The cards a side could play, which is what it is asked to choose between. */
export function sideDispositionChoices(state: BattleState, side: number): string[] {
  return teamDispositionChoices(sidePlayers(state, side).map((player) => player.roster))
}

/** The player whose Warlord leads a side; null while allies have not said which of their Warlords it is. */
export function sideWarlord(state: BattleState, side: number): PlayerId | null {
  return teamWarlord(sidePlayers(state, side), state.sideWarlords[side] ?? null)
}

/** The players on a side whose lists name a Warlord, which allies choose between. */
export function sideWarlordChoices(state: BattleState, side: number): PlayerId[] {
  return teamWarlordChoices(sidePlayers(state, side))
}

export function sideCaptain(state: BattleState, side: number): PlayerState {
  return state.players.find((player) => player.side === side)!
}

/** Whether the command names an army other than the one recording it. */
function namesAnotherArmy(command: Command, actor: PlayerState): boolean {
  return 'playerId' in command && Boolean(command.playerId) && command.playerId !== actor.id
}

function armyCommand(command: Command): boolean {
  return [
    'attach-roster',
    'detach-roster',
    'set-unit',
    'wound-unit',
    'damage-unit',
    'deploy-unit',
    'set-unit-formation',
    'set-painted',
  ].includes(command.kind)
}

/**
 * The army a command acts on, resolved for a caller outside this file.
 *
 * The server has to know which deck a draw comes off before it chooses the cards,
 * and that is this question: asking it a second way there would let the cards come
 * off one deck and be recorded against another.
 */
/** The player a command names, or whoever sent it. */
export function commandTarget(command: Command, by: PlayerId): PlayerId {
  return 'playerId' in command && command.playerId ? command.playerId : by
}

export function commandArmy(state: BattleState, by: PlayerId, command: Command): PlayerState | undefined {
  const actor = state.players.find((candidate) => candidate.id === by)
  return actor ? targetArmy(state, actor, command) : undefined
}

/**
 * The army a command acts on.
 *
 * Live actions may name another player, while commands without a target retain the
 * actor-based meaning used by existing log entries.
 */
function targetArmy(state: BattleState, actor: PlayerState, command: Command): PlayerState {
  const named = 'playerId' in command && command.playerId ? command.playerId : null
  const target = (named ? state.players.find((candidate) => candidate.id === named) : undefined) ?? actor
  return armyCommand(command) ? target : sideCaptain(state, target.side)
}

/**
 * The side a score command would credit, resolved the same way `validate` does.
 *
 * Exported for the score-cap check, which needs the mission pack and so cannot live
 * in this IO-free file: resolving the target stays made in one place even so.
 */
export function scoringTarget(
  state: BattleState,
  by: PlayerId,
  command: Command,
):
  | (Pick<
      PlayerState,
      'side' | 'primary' | 'secondary' | 'primaryByRound' | 'secondaryByRound' | 'finalPrimary' | 'secondaryMode' | 'scored'
    > & {
      disposition: string | null
    })
  | null {
  const actor = state.players.find((candidate) => candidate.id === by)
  if (!actor) return null
  const target = targetArmy(state, actor, command)
  return {
    side: target.side,
    disposition: sideDisposition(state, target.side),
    primary: target.primary,
    secondary: target.secondary,
    primaryByRound: target.primaryByRound,
    finalPrimary: target.finalPrimary,
    secondaryByRound: target.secondaryByRound,
    secondaryMode: target.secondaryMode,
    scored: target.scored,
  }
}

function mayNameSecondary(state: BattleState, by: PlayerId, player: PlayerState, key: string): boolean {
  if (!player.secondaries.some((secondary) => secondary.key === key)) return false
  return mayNameCard(state, by, player, key)
}

/**
 * What the active side still owes before the turn moves on, or null.
 *
 * The same answer whoever asks: drawing, putting a card back and discarding one are
 * all named in the log to both sides, so the only thing held back is a card played
 * face down, an opt-in card in fixed play that only its own side can answer.
 */
export function sideOwes(state: BattleState, player: PlayerState): 'settlement' | 'cards' | 'secret' | null {
  if (state.phase === 'command' && state.pendingSettlement?.playerId === player.id) return 'settlement'
  if (
    state.phase === 'command' &&
    player.secondaryMode === 'tactical' &&
    player.secondariesDrawnThisTurn.length < secondaryDrawTarget(player) &&
    undrawnSecondaries(player).length
  ) {
    return 'cards'
  }
  if (state.phase === 'end' && player.secretSecondary && !player.secretRevealed) return 'secret'
  return null
}

export function secondaryDrawTarget(player: PlayerState): number {
  return TACTICAL_HAND_SIZE + player.additionalSecondaryDrawsThisTurn
}

/** The cards still in a side's deck. */
export function undrawnSecondaries(player: Pick<PlayerState, 'secondaryDeck' | 'secondaries'>): Secondary[] {
  return (player.secondaryDeck ?? []).filter((candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key))
}

/** The cards in hand still in play, apart from a secret mission. */
function activeTacticalSecondaries(player: PlayerState): Secondary[] {
  return player.secondaries.filter(
    (secondary) => secondary.key !== player.secretSecondary && player.secondaryStatus[secondary.key] === 'active',
  )
}

/** A secondary as scoring reads it: only the awards its side's way of playing pays. */
function dueSecondary(player: PlayerState, secondary: Secondary, awards: MissionAward[]) {
  return { ...secondary, category: 'secondary' as const, awards: awards.filter((award) => appliesInMode(award, player.secondaryMode)) }
}

export function scoringDue(state: BattleState, player: PlayerState) {
  const primary = player.primaryCard?.awards
    ? [{ ...player.primaryCard, category: 'primary' as const, awards: player.primaryCard.awards }]
    : []
  const secondaries = player.secondaries.flatMap((secondary) => {
    if (player.secondaryStatus[secondary.key] !== 'active' || !secondary.awards) return []
    return [dueSecondary(player, secondary, secondary.awards)]
  })
  return cardsDue(
    {
      phase: state.phase,
      round: state.round,
      rounds: BATTLE_ROUNDS,
      endOfBattle: atBattleEnd(state) && player.finalPrimary === 0,
    },
    true,
    [...primary, ...secondaries],
    [],
    player.secondaryMode,
  )
}

export function atBattleEnd(state: BattleState): boolean {
  return (
    state.status === 'playing' &&
    state.phase === 'end' &&
    state.round === BATTLE_ROUNDS &&
    (state.completionPending ||
      (state.pendingSettlement === null &&
        state.activePlayerId !== null &&
        !sameSide(state, state.activePlayerId, state.firstPlayerId ?? '')))
  )
}

export function secretSettlementActionPlayerId(state: BattleState): PlayerId | null {
  const pending = state.pendingSettlement
  const player = pending ? state.players.find((candidate) => candidate.id === pending.playerId) : undefined
  const key = player?.secretSecondary
  if (!pending || !player || !key || player.secretRevealed || player.secondaryStatus[key] !== 'active') return null
  const secondary = player.secondaries.find((candidate) => candidate.key === key)
  if (!secondary?.awards) return player.id
  const due = cardsDueFromTheirTurn(pending.round, BATTLE_ROUNDS, [dueSecondary(player, secondary, secondary.awards)], [key])
  return due.length ? player.id : null
}

/** Whether a card may be named to this viewer, or is being held face down from them. */
export function mayNameCard(state: BattleState, viewerId: PlayerId | null, player: PlayerState, key: string): boolean {
  return player.secretSecondary !== key || player.secretRevealed || sameSide(state, viewerId, player.id)
}

type TableBuilt = {
  limit: number
  pointsBudget?: number | null
  waivedRules?: readonly string[] | null
  units?: readonly { points: number }[]
}
/** `units` is the army as fielded, which a battle view carries beside a list whose own units it leaves out. */
type TableArmies = { players: readonly { side: number; roster: { built?: TableBuilt } | null; units?: readonly { points: number }[] }[] }

/**
 * Whether a built list may sit at this battle.
 *
 * A duel's lists are built at its size. A team battle's size is a ceiling instead, so an ally brings an Incursion list
 * to a Strike Force table, and only a list that waives its points limit may be built bigger.
 */
export function fitsBattleSize(settings: Pick<BattleSettings, 'limit' | 'teamBattle'>, built: TableBuilt): boolean {
  const { limit, teamBattle } = settings
  if (limit === null) return true
  if (!teamBattle) return built.limit === limit
  return built.limit <= limit || !enforces(built.waivedRules, 'points-limit')
}

/** An even share of the battle size for each army on a side, which a team battle plays unless the table sets its own. */
export function evenArmyPoints(state: TableArmies & { settings: BattleSettings }, side: number): number | null {
  const armies = sidePlayers(state, side).length
  return state.settings.limit === null ? null : state.settings.limit / Math.max(1, armies)
}

/** What each army on a side may spend in a team battle. */
export const armyPointsFor = (state: TableArmies & { settings: BattleSettings }, side: number): number | null =>
  state.settings.armyPoints?.[side] ?? evenArmyPoints(state, side)

const pointsSpent = (built: Pick<TableBuilt, 'units'>) => built.units?.reduce((total, unit) => total + unit.points, 0) ?? 0

/** Whether a list spends no more than the points its army may, unless it waives its points limit. */
export const withinArmyPoints = (built: Pick<TableBuilt, 'units' | 'waivedRules'>, points: number) =>
  !enforces(built.waivedRules, 'points-limit') || pointsSpent(built) <= points

type TeamArmyProblem = { code: 'over-army-points' | 'allies-mismatch'; side: number; message: string }

/**
 * What stops a team battle's armies from playing, side by side.
 *
 * Each army spends no more than its side's points per army, unless it waives its points limit, and allies bring lists
 * saved to the same points total so neither half of a side is the bigger one.
 */
export function teamArmyProblems(state: TableArmies & { settings: BattleSettings }): TeamArmyProblem[] {
  if (!state.settings.teamBattle || state.settings.limit === null) return []
  return [0, 1].flatMap((side) => {
    const armies = state.players.flatMap((player) =>
      player.side === side && player.roster?.built ? [{ ...player.roster.built, units: player.units ?? player.roster.built.units }] : [],
    )
    const points = armyPointsFor(state, side)
    const problems: TeamArmyProblem[] = []
    if (points !== null && armies.some((army) => !withinArmyPoints(army, points)))
      problems.push({ code: 'over-army-points', side, message: `an army spends more than its ${pointsLabel(points)}` })
    if (new Set(armies.map(pointsBudgetOf)).size > 1)
      problems.push({ code: 'allies-mismatch', side, message: 'allies bring lists saved to the same points total' })
    return problems
  })
}

/** Each built army's points allowance, which a duel's two lists agree on. */
const sideAllowances = (state: TableArmies): number[] =>
  state.players.flatMap((player) => (player.roster?.built ? [pointsBudgetOf(player.roster.built)] : []))

/** The battle size the armies' formats make; custom budgets never change it, they only have to agree. */
export function rosterBattleFormat(state: TableArmies & { settings: BattleSettings }): {
  limit: number | null
  problem: 'missing' | 'manual' | 'mismatch' | 'budget-mismatch' | 'unsupported' | null
} {
  if (state.players.length !== battleCapacity(state.settings) || state.players.some((player) => !player.roster))
    return { limit: null, problem: 'missing' }
  if (state.players.some((player) => !player.roster?.built)) return { limit: null, problem: 'manual' }
  const limits = state.players.map((player) => player.roster!.built!.limit)
  if (state.settings.teamBattle) {
    // The biggest list sets a team battle's size, which every other list may be built at or below.
    const limit = Math.max(...limits)
    return isKotcLimit(limit) ? { limit: null, problem: 'unsupported' } : { limit, problem: null }
  }
  const limit = limits[0]
  if (!limits.every((value) => value === limit)) return { limit: null, problem: 'mismatch' }
  const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
  if (!size) return { limit: null, problem: 'unsupported' }
  return pointsBudgetsAgree(state) ? { limit: size.limit, problem: null } : { limit: null, problem: 'budget-mismatch' }
}

/** Whether every built army at the table brings the same points allowance per side. */
export const pointsBudgetsAgree = (state: TableArmies): boolean => new Set(sideAllowances(state)).size <= 1

/** The points budget every built army at the table agrees on, when it is not the battle size's own total. */
export function battlePointsBudget(state: TableArmies & { settings: BattleSettings }): number | null {
  const allowances = sideAllowances(state)
  if (state.settings.limit === null || state.settings.teamBattle || !allowances.length || !pointsBudgetsAgree(state)) return null
  return customPointsBudget(state.settings.limit, allowances[0])
}

/** A team battle's points per army as a table says them, side by side: "1,750 vs 800 + 800". */
export function armyPointsText(state: TableArmies & { settings: BattleSettings }): string {
  return [0, 1]
    .map((side) => {
      const points = armyPointsFor(state, side)?.toLocaleString('en') ?? '?'
      const armies = Math.max(1, sidePlayers(state, side).length)
      return Array.from({ length: armies }, () => points).join(' + ')
    })
    .join(' vs ')
}

/** A battle's size as its screens name it: its points, or its size beside the custom budget its armies agree on. */
export function battleSizeText(state: TableArmies & { settings: BattleSettings }): string | null {
  if (!state.settings.limit) return null
  if (state.settings.teamBattle) return `${battleSizeName(state.settings.limit)} · ${armyPointsText(state)}`
  const budget = battlePointsBudget(state)
  return budget === null ? pointsLabel(state.settings.limit) : battleSizeLabel(state.settings.limit, budget)
}

function inferBattleSize(state: BattleState) {
  if (!state.settings.sizeFromRosters || state.status !== 'setup') return
  state.settings.limit = rosterBattleFormat(state).limit
}

function validatePrep(prep: BattlePrep): Refusal | null {
  if (prep.stratagems.length > STRATAGEMS_MAX) return refuse('invalid-prep', `that is more than ${STRATAGEMS_MAX} stratagems`)
  if (prep.stratagems.some((stratagem) => !stratagem.name.trim())) return refuse('invalid-prep', 'name every stratagem')
  if (prep.stratagems.some((stratagem) => stratagem.cp < 0 || stratagem.cp > STRATAGEM_CP_MAX)) {
    return refuse('invalid-prep', `a stratagem costs between 0 and ${STRATAGEM_CP_MAX} command points`)
  }
  if (prep.secondaries.length > FIXED_SECONDARIES) return refuse('invalid-prep', `that is more than ${FIXED_SECONDARIES} secondaries`)
  if (prep.secondaries.some((secondary) => !secondary.name.trim())) return refuse('invalid-prep', 'name every secondary')
  if (new Set(prep.secondaries.map((secondary) => secondary.key)).size !== prep.secondaries.length) {
    return refuse('invalid-prep', 'the selected secondaries contain duplicates')
  }
  if ((prep.secondaryDeck?.length ?? 0) > SECONDARY_DECK_MAX) return refuse('invalid-prep', 'that secondary deck is too large')
  if (prep.secondaryDeck?.some((secondary) => !secondary.name.trim())) return refuse('invalid-prep', 'name every secondary in the deck')
  if (prep.secondaryDeck && new Set(prep.secondaryDeck.map((secondary) => secondary.key)).size !== prep.secondaryDeck.length) {
    return refuse('invalid-prep', 'the secondary deck contains duplicates')
  }
  if (prep.secondaryMode === 'tactical' && !prep.secondaryDeck?.length) return refuse('invalid-prep', 'choose a tactical secondary deck')
  if (
    prep.secondaryDeck &&
    prep.secondaries.some((secondary) => !prep.secondaryDeck?.some((candidate) => candidate.key === secondary.key))
  ) {
    return refuse('invalid-prep', 'a selected secondary is not in the deck')
  }
  if (prep.primary && !prep.primary.name.trim()) return refuse('invalid-prep', 'name the primary mission')
  return null
}
