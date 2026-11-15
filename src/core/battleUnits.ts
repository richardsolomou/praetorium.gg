import { groupBy } from './collections'
import { nicknamedUnit } from './unitNotes'
import { attachedUnitList, attachedHost, attachedUnits } from './attachedUnits'
import { refuse, sidePlayers } from './battlePrimitives'
import { countedIn, type Passenger, type TransportLoad, transportLoad, transportRule } from './transport'
import type { SubmittedUnit, UnitState, Command, Refusal, BattleState } from './battle'

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
  if (load.length === 1) return `${load[0]!.used}/${load[0]!.capacity} ${countedIn(load[0]!)}`
  if (load.some((pool) => pool.units))
    return load.map((pool) => `${pool.used}/${pool.capacity} ${pool.carries} ${countedIn(pool)}`).join(', ')
  return `${load.map((pool) => `${pool.used}/${pool.capacity} ${pool.carries}`).join(', ')} models`
}

const loadRefusal = (load: TransportLoad | Refusal): Refusal | null => (Array.isArray(load) ? null : load)

export function embarkedCapacityError(units: readonly UnitState[], unit: UnitState, nextAlive: number): Refusal | null {
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
    return refuse('formation-unsupported', 'the list data does not support that formation')
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
export function redeploysToReserves(
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
export function movedReserveError(
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

export function strategicReserveSideError(state: FormationTable, player: FormationArmy, changed?: readonly ReserveUnit[]): Refusal | null {
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

export function changedFormation(unit: UnitState, formation: UnitFormation, redeployed = false, transportKey?: string): UnitState {
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

export function disembarkPassengers(units: UnitState[], transport: UnitState): void {
  if (!transport.destroyed || !canTransport(transport)) return
  for (const passenger of units.filter((unit) => unit.embarkedIn === transport.key)) {
    Object.assign(passenger, changedFormation(passenger, 'battlefield'))
  }
}

/** What is left of a unit, in wounds, which is the one number both halves fold to. */
export function unitWoundsLeft(unit: UnitState): number | null {
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
