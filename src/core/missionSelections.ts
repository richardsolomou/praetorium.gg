import { attachedUnits, attachedUnitList } from './attachedUnits'
import type { BattleState, Command, PlayerState, Secondary } from './battle'
import { opposingSide, playsSide, refuse, sameSide } from './battlePrimitives'

export const MISSION_SELECTION_KINDS = [
  'punishment',
  'guards',
  'tempting-target',
  'beacon',
  'locate-and-deny',
  'sensor-sweep',
  'consecrate',
] as const
export type MissionSelectionKind = (typeof MISSION_SELECTION_KINDS)[number]
/** Choices that stay open across a turn or more, so the board offers them without asking. */
export const isManualSelection = (kind: MissionSelectionKind) => kind === 'beacon' || kind === 'sensor-sweep'
export type MissionUnitRef = { playerId: string; unitKey: string; rosterSeq: number }
export type MissionObjectiveRef = { key: string; name: string }
type MissionMarkerRef = { playerId: string; key: string; name: string }
export type MissionSelection =
  | { kind: 'punishment'; units: MissionUnitRef[]; fallback: boolean; qualified: boolean; unavailable?: true }
  | { kind: 'guards'; guards: { objective: MissionObjectiveRef; unit: MissionUnitRef }[] }
  | { kind: 'tempting-target'; objective: MissionObjectiveRef }
  | { kind: 'beacon'; unit: MissionUnitRef | null; note: string }
  | { kind: 'locate-and-deny'; areas: MissionObjectiveRef[]; outsideZone: boolean; allEligible: boolean }
  | { kind: 'sensor-sweep'; marker: MissionMarkerRef; controlled: boolean }
  | {
      kind: 'consecrate'
      consecrations: { objective: MissionObjectiveRef; unit: MissionUnitRef }[]
      qualified: boolean
      notHome: boolean
    }

export type SavedMissionUnit = MissionUnitRef & { name: string; memberKeys: string[] }
export type SavedMissionSelection = {
  cardKey: string
  cardName: string
  occurrence: number
  seq: number
  round: number
  turnSeq: number
  expired: boolean
  beaconDestroyed?: true
  /** Locate and Deny marker keys removed by a Sensor Sweep, with the round of removal. */
  removedMarkers?: Record<string, number>
  selection: MissionSelection
  units: SavedMissionUnit[]
}

export type MissionSelectionPrompt = {
  cardKey: string
  cardName: string
  kind: MissionSelectionKind
  occurrence: number
  chooserSide: number
}

export type OperationMarker = MissionMarkerRef & { removedRound: number | null }

type SelectionCommand = Extract<Command, { kind: 'select-mission' }>

function selectionCard(player: PlayerState, key: string): Secondary | undefined {
  return player.primaryCard?.key === key
    ? player.primaryCard
    : player.secondaryStatus[key] === 'active'
      ? player.secondaries.find((card) => card.key === key)
      : undefined
}

const sameOccurrence = (saved: SavedMissionSelection, prompt: Pick<MissionSelectionPrompt, 'cardKey' | 'occurrence' | 'kind'>) =>
  saved.cardKey === prompt.cardKey && saved.occurrence === prompt.occurrence && saved.selection.kind === prompt.kind

function missionSelectionPrompts(state: BattleState, player: PlayerState, card: Secondary): MissionSelectionPrompt[] {
  const capability = card.selection
  if (!capability || state.status !== 'playing') return []
  const primary = player.primaryCard?.key === card.key
  if (!primary && (player.secondaryMode !== 'tactical' || player.secondaryStatus[card.key] !== 'active')) return []
  const ownTurn = sameSide(state, state.activePlayerId, player.id)
  const drawn = player.secondaryDrawSeq[card.key] ?? 0
  const prompt = (kind: MissionSelectionKind, occurrence: number, chooserSide: number | undefined = player.side) =>
    occurrence && chooserSide !== undefined ? [{ cardKey: card.key, cardName: card.name, kind, occurrence, chooserSide }] : []
  const startOfTurn = ownTurn && state.phase === 'command'
  const endOfTurn = ownTurn && state.phase === 'end'
  switch (capability) {
    case 'beacon':
      return prompt('beacon', drawn)
    case 'punishment':
      return primary && startOfTurn ? prompt('punishment', state.turnSeq) : []
    case 'guards':
      return startOfTurn ? prompt('guards', Math.max(state.turnSeq, drawn)) : []
    case 'tempting-target':
      return startOfTurn ? prompt('tempting-target', drawn, opposingSide(state, player.side)) : []
    case 'consecrate':
      return primary && endOfTurn ? prompt('consecrate', state.turnSeq) : []
    case 'sensor-sweep':
      return primary && endOfTurn ? prompt('sensor-sweep', state.turnSeq) : []
    case 'locate-and-deny': {
      if (!primary) return []
      const battleStart = state.round === 1 && state.phase === 'command' && sameSide(state, state.activePlayerId, state.firstPlayerId ?? '')
      return [...(battleStart ? prompt('locate-and-deny', state.turnSeq) : []), ...(endOfTurn ? prompt('sensor-sweep', state.turnSeq) : [])]
    }
  }
}

/** Choices a side can record now. Each is optional table tracking, so none holds up the turn. */
export function openMissionSelections(state: BattleState, player: PlayerState): MissionSelectionPrompt[] {
  if (state.pendingSettlement) return []
  const cards = [...(player.primaryCard ? [player.primaryCard] : []), ...player.secondaries]
  return cards.flatMap((card) => missionSelectionPrompts(state, player, card).filter((prompt) => selectionOpen(state, player, prompt)))
}

function selectionOpen(state: BattleState, player: PlayerState, prompt: MissionSelectionPrompt) {
  const previous = player.missionSelections.find((saved) => sameOccurrence(saved, prompt))
  if (prompt.kind === 'beacon') return !previous?.beaconDestroyed
  if (prompt.kind === 'sensor-sweep') return !previous && remainingOperationMarkers(state).length > 1
  return !previous
}

export function operationMarkers(state: BattleState): OperationMarker[] {
  return state.players.flatMap((player) =>
    player.missionSelections.flatMap((saved) =>
      saved.selection.kind === 'locate-and-deny'
        ? saved.selection.areas.map((area) => ({
            playerId: player.id,
            key: area.key,
            name: area.name,
            removedRound: saved.removedMarkers?.[area.key] ?? null,
          }))
        : [],
    ),
  )
}

export const remainingOperationMarkers = (state: BattleState) => operationMarkers(state).filter((marker) => marker.removedRound === null)

export function consecratedObjectives(player: PlayerState, cardKey: string): MissionObjectiveRef[] {
  return player.missionSelections.flatMap((saved) =>
    saved.cardKey === cardKey && saved.selection.kind === 'consecrate'
      ? saved.selection.consecrations.map((consecration) => consecration.objective)
      : [],
  )
}

export function missionUnitCandidates(state: BattleState, side: number, battlefieldOnly = true): SavedMissionUnit[] {
  return state.players.flatMap((player) =>
    player.side !== side || player.rosterSeq === null
      ? []
      : attachedUnitList(player.units).flatMap(({ host, joined }) => {
          const members = [host, ...joined]
          if (battlefieldOnly && !members.some((unit) => !unit.destroyed && unit.formation === 'battlefield')) return []
          return [
            {
              playerId: player.id,
              unitKey: host.key,
              rosterSeq: player.rosterSeq!,
              name: host.name,
              memberKeys: members.map((unit) => unit.key),
            },
          ]
        }),
  )
}

export function savedMissionUnitStatus(state: BattleState, saved: SavedMissionUnit): 'battlefield' | 'away' | 'destroyed' | 'replaced' {
  const player = state.players.find((candidate) => candidate.id === saved.playerId)
  if (!player || player.rosterSeq !== saved.rosterSeq) return 'replaced'
  const members = player.units.filter((unit) => saved.memberKeys.includes(unit.key))
  const standing = members.filter((unit) => !unit.destroyed)
  return !standing.length ? 'destroyed' : standing.some((unit) => unit.formation === 'battlefield') ? 'battlefield' : 'away'
}

export function recordBeaconDestruction(state: BattleState) {
  for (const player of state.players)
    for (const saved of player.missionSelections)
      if (saved.selection.kind === 'beacon' && saved.units.some((unit) => savedMissionUnitStatus(state, unit) === 'destroyed'))
        saved.beaconDestroyed = true
}

const refsIn = (selection: MissionSelection): MissionUnitRef[] =>
  selection.kind === 'punishment'
    ? selection.units
    : selection.kind === 'guards'
      ? selection.guards.map((guard) => guard.unit)
      : selection.kind === 'consecrate'
        ? selection.consecrations.map((consecration) => consecration.unit)
        : selection.kind === 'beacon' && selection.unit
          ? [selection.unit]
          : []

function savedUnit(state: BattleState, ref: MissionUnitRef): SavedMissionUnit | null {
  const player = state.players.find((candidate) => candidate.id === ref.playerId)
  if (!player || player.rosterSeq !== ref.rosterSeq) return null
  const members = attachedUnits(player.units, ref.unitKey)
  const host = members[0]
  return host?.key === ref.unitKey ? { ...ref, name: host.name, memberKeys: members.map((unit) => unit.key) } : null
}

const validObjective = (objective: MissionObjectiveRef) =>
  objective.key.trim().length > 0 && objective.key.length <= 128 && objective.name.trim().length > 0 && objective.name.length <= 80

const unitIdentity = (unit: MissionUnitRef) => `${unit.playerId}|${unit.rosterSeq}|${unit.unitKey}`

export function missionSelectionRefusal(state: BattleState, by: string, player: PlayerState, command: SelectionCommand) {
  const card = selectionCard(player, command.cardKey)
  const kind = command.selection.kind
  if (!card?.selection || (card.selection !== kind && !(card.selection === 'locate-and-deny' && kind === 'sensor-sweep')))
    return refuse('mission-selection-invalid', 'choose a selection supported by this active mission')
  const prompt = missionSelectionPrompts(state, player, card).find((candidate) => candidate.kind === kind)
  if (!prompt || prompt.occurrence !== command.occurrence)
    return refuse('mission-selection-timing', 'that mission selection is not due now')
  if (!playsSide(state, by, prompt.chooserSide)) return refuse('mission-selection-owner', 'that mission choice belongs to the other side')
  if (state.pendingSettlement) return refuse('mission-selection-timing', 'settle the previous turn before choosing mission targets')
  const previous = player.missionSelections.find((saved) => sameOccurrence(saved, prompt))
  if (previous && kind !== 'beacon')
    return refuse('mission-selection-recorded', 'that mission choice is already recorded; undo it to correct it')
  const refs = refsIn(command.selection)
  const expectedSide = kind === 'punishment' ? opposingSide(state, player.side) : player.side
  for (const ref of refs) {
    const army = state.players.find((candidate) => candidate.id === ref.playerId)
    const unit = savedUnit(state, ref)
    if (!unit || army?.side !== expectedSide) return refuse('mission-selection-unit', 'choose a unit from the required army and roster')
    if (kind !== 'beacon' && savedMissionUnitStatus(state, unit) !== 'battlefield')
      return refuse('mission-selection-unit', 'choose a standing unit on the battlefield')
  }
  const selection = command.selection
  if (selection.kind === 'punishment') {
    const unique = new Set(refs.map((unit) => `${unit.playerId}|${unit.unitKey}`))
    if (selection.unavailable)
      return refs.length === 0 && missionUnitCandidates(state, expectedSide ?? -1).length === 0
        ? null
        : refuse('mission-selection-unit', 'enemy units on the battlefield still need a choice')
    if (unique.size !== refs.length || refs.length < 1 || refs.length > (selection.fallback ? 1 : 3))
      return refuse(
        'mission-selection-count',
        selection.fallback ? 'choose exactly one enemy unit for the fallback' : 'choose one to three distinct enemy units',
      )
    if (!selection.qualified)
      return refuse(
        'mission-selection-facts',
        selection.fallback
          ? 'confirm that no enemy units qualify before using the fallback'
          : 'confirm that each chosen unit is within objective range or destroyed a friendly unit last turn',
      )
  }
  if (selection.kind === 'guards') {
    if (selection.guards.length > 20 || selection.guards.some((guard) => !validObjective(guard.objective)))
      return refuse('mission-selection-objective', 'name each guarded objective')
    if (new Set(selection.guards.map((guard) => guard.objective.key)).size !== selection.guards.length)
      return refuse('mission-selection-objective', 'choose at most one guard for each objective')
  }
  if (selection.kind === 'tempting-target' && !validObjective(selection.objective))
    return refuse('mission-selection-objective', 'choose one objective')
  if (selection.kind === 'beacon' && previous?.beaconDestroyed)
    return refuse('mission-selection-recorded', 'a destroyed Beacon cannot be replaced; undo the original choice to correct it')
  if (selection.kind === 'locate-and-deny') {
    if (selection.areas.length > 5 || selection.areas.some((area) => !validObjective(area)))
      return refuse('mission-selection-objective', 'name up to five terrain areas')
    if (new Set(selection.areas.map((area) => area.key)).size !== selection.areas.length)
      return refuse('mission-selection-objective', 'place one marker in each chosen terrain area')
    if (selection.areas.length && !selection.outsideZone)
      return refuse('mission-selection-facts', 'confirm that each terrain area is outside your deployment zone')
    if (selection.areas.length < 5 && !selection.allEligible)
      return refuse(
        'mission-selection-count',
        'choose five terrain areas, or confirm that these are every terrain area outside your deployment zone',
      )
  }
  if (selection.kind === 'sensor-sweep') {
    const remaining = remainingOperationMarkers(state)
    if (remaining.length < 2)
      return refuse('mission-selection-count', 'a Sensor Sweep cannot start while only one operation marker remains')
    if (
      !remaining.some(
        (marker) =>
          marker.playerId === selection.marker.playerId && marker.key === selection.marker.key && marker.name === selection.marker.name,
      )
    )
      return refuse('mission-selection-objective', 'choose an operation marker that is still on the battlefield')
    if (!selection.controlled) return refuse('mission-selection-facts', 'confirm that the sweeping unit controls its central objective')
  }
  if (selection.kind === 'consecrate') {
    const consecrations = selection.consecrations
    if (consecrations.length > 20 || consecrations.some((consecration) => !validObjective(consecration.objective)))
      return refuse('mission-selection-objective', 'name each consecrated objective')
    if (new Set(consecrations.map((consecration) => consecration.objective.key)).size !== consecrations.length)
      return refuse('mission-selection-objective', 'consecrate each objective once')
    if (new Set(refs.map(unitIdentity)).size !== refs.length)
      return refuse('mission-selection-count', 'each consecration unit can consecrate one objective')
    const consecrated = new Set(consecratedObjectives(player, command.cardKey).map((objective) => objective.key))
    if (consecrations.some((consecration) => consecrated.has(consecration.objective.key)))
      return refuse('mission-selection-objective', 'that objective is already consecrated')
    if (consecrations.length && (!selection.qualified || !selection.notHome))
      return refuse(
        'mission-selection-facts',
        'confirm that each unit is a consecration unit within range of its objective and that no objective is your home objective',
      )
  }
  return null
}

export function applyMissionSelection(state: BattleState, player: PlayerState, command: SelectionCommand, seq: number) {
  const card = selectionCard(player, command.cardKey)
  if (!card) return
  const units = refsIn(command.selection).flatMap((ref) => savedUnit(state, ref) ?? [])
  const saved: SavedMissionSelection = {
    cardKey: card.key,
    cardName: card.name,
    occurrence: command.occurrence,
    seq,
    round: state.round,
    turnSeq: state.turnSeq,
    expired: false,
    selection: command.selection,
    units: units.filter((unit, index) => units.findIndex((candidate) => unitIdentity(candidate) === unitIdentity(unit)) === index),
  }
  player.missionSelections = [
    ...player.missionSelections.filter((old) => !sameOccurrence(old, { ...saved, kind: saved.selection.kind })),
    saved,
  ]
  if (command.selection.kind === 'sensor-sweep') {
    const { marker } = command.selection
    const owner = state.players.find((candidate) => candidate.id === marker.playerId)
    if (owner)
      owner.missionSelections = owner.missionSelections.map((old) =>
        old.selection.kind === 'locate-and-deny' && old.selection.areas.some((area) => area.key === marker.key)
          ? { ...old, removedMarkers: { ...old.removedMarkers, [marker.key]: state.round } }
          : old,
      )
  }
}
