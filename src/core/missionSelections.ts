import { attachedUnits, attachedUnitList } from './attachedUnits'
import type { BattleState, Command, PlayerState, Secondary } from './battle'
import { opposingSide, playsSide, refuse, sameSide } from './battlePrimitives'
import { uniqueBy } from './collections'

export const MISSION_SELECTION_KINDS = [
  'punishment',
  'guards',
  'tempting-target',
  'beacon',
  'locate-and-deny',
  'sensor-sweep',
  'consecrate',
  'decoy',
  'triangulate',
  'extract-intel',
  'maintain-control',
  'booby-trap',
  'surveil',
] as const
export type MissionSelectionKind = (typeof MISSION_SELECTION_KINDS)[number]

/**
 * Actions that place one of your operation markers, with the first battle round each can be performed and which
 * earlier places the card rules out: any it ever marked ("not decoyed", "not yet trapped"), only those where its
 * marker still stands ("does not have any of your operation markers"), or none.
 */
export const MARKER_PLACEMENTS = {
  decoy: { fromRound: 1, excludes: 'ever' },
  triangulate: { fromRound: 2, excludes: 'standing' },
  'extract-intel': { fromRound: 2, excludes: 'standing' },
  'maintain-control': { fromRound: 1, excludes: 'none' },
  'booby-trap': { fromRound: 1, excludes: 'ever' },
} as const satisfies Record<string, { fromRound: number; excludes: 'ever' | 'standing' | 'none' }>
export type MarkerPlacementKind = keyof typeof MARKER_PLACEMENTS
export const isMarkerPlacement = (kind: MissionSelectionKind): kind is MarkerPlacementKind => kind in MARKER_PLACEMENTS
/** An action the player may take, so the board offers it on its card without asking. */
export const isOptionalSelection = (kind: MissionSelectionKind) => kind === 'sensor-sweep'
export type MissionUnitRef = { playerId: string; unitKey: string; rosterSeq: number }
export type MissionObjectiveRef = { key: string; name: string }
/** `seq` names the record that placed the marker; Locate and Deny markers from older logs omit it. */
export type MissionMarkerRef = { playerId: string; key: string; name: string; seq?: number }
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
  | { kind: MarkerPlacementKind; targets: MissionObjectiveRef[]; confirmed: boolean }
  | { kind: 'surveil'; markers: MissionMarkerRef[] }

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
  /** Marker keys of this record removed by a Sensor Sweep or Surveil the Foe, with the round of removal. */
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

export type OperationMarker = Required<MissionMarkerRef> & { placedRound: number; removedRound: number | null }

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
    case 'surveil':
      return primary && endOfTurn ? prompt(capability, state.turnSeq) : []
    case 'decoy':
    case 'triangulate':
    case 'extract-intel':
    case 'maintain-control':
    case 'booby-trap':
      return primary && endOfTurn && state.round >= MARKER_PLACEMENTS[capability].fromRound ? prompt(capability, state.turnSeq) : []
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
  if (prompt.kind === 'surveil') return !previous && remainingOperationMarkers(state).some((marker) => marker.playerId !== player.id)
  return !previous
}

const placedAt = (selection: MissionSelection): MissionObjectiveRef[] =>
  selection.kind === 'locate-and-deny'
    ? selection.areas
    : selection.kind === 'consecrate'
      ? selection.consecrations.map((consecration) => consecration.objective)
      : isMarkerPlacement(selection.kind) && 'targets' in selection
        ? selection.targets
        : []

export function operationMarkers(state: BattleState): OperationMarker[] {
  return state.players.flatMap((player) =>
    player.missionSelections.flatMap((saved) =>
      placedAt(saved.selection).map((place) => ({
        playerId: player.id,
        key: place.key,
        name: place.name,
        seq: saved.seq,
        placedRound: saved.round,
        removedRound: saved.removedMarkers?.[place.key] ?? null,
      })),
    ),
  )
}

/** The record that placed a marker; an older Locate and Deny reference without `seq` names its area alone. */
const placedBy = (saved: SavedMissionSelection, marker: MissionMarkerRef) =>
  (marker.seq === undefined ? saved.selection.kind === 'locate-and-deny' : saved.seq === marker.seq) &&
  placedAt(saved.selection).some((place) => place.key === marker.key)

const sameMarker = (marker: OperationMarker, ref: MissionMarkerRef) =>
  marker.playerId === ref.playerId &&
  marker.key === ref.key &&
  marker.name === ref.name &&
  (ref.seq === undefined || marker.seq === ref.seq)

export const remainingOperationMarkers = (state: BattleState) => operationMarkers(state).filter((marker) => marker.removedRound === null)

/** Places a card cannot choose again: consecrated objectives, and those its marker action rules out. */
export function markedObjectives(player: PlayerState, cardKey: string, kind: MissionSelectionKind): MissionObjectiveRef[] {
  const excludes = kind === 'consecrate' ? 'ever' : isMarkerPlacement(kind) ? MARKER_PLACEMENTS[kind].excludes : 'none'
  if (excludes === 'none') return []
  return uniqueBy(
    player.missionSelections.flatMap((saved) =>
      saved.cardKey === cardKey && saved.selection.kind === kind
        ? placedAt(saved.selection).filter((place) => excludes === 'ever' || !saved.removedMarkers?.[place.key])
        : [],
    ),
    (place) => place.key,
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

/** Whether the Beacon chosen for the card as currently drawn was destroyed, so the card can no longer score. */
export const beaconLost = (player: PlayerState, cardKey: string) =>
  player.missionSelections.some(
    (saved) => saved.cardKey === cardKey && saved.occurrence === player.secondaryDrawSeq[cardKey] && saved.beaconDestroyed === true,
  )

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
    if (!remaining.some((marker) => sameMarker(marker, selection.marker)))
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
    const consecrated = new Set(markedObjectives(player, command.cardKey, kind).map((objective) => objective.key))
    if (consecrations.some((consecration) => consecrated.has(consecration.objective.key)))
      return refuse('mission-selection-objective', 'that objective is already consecrated')
    if (consecrations.length && (!selection.qualified || !selection.notHome))
      return refuse(
        'mission-selection-facts',
        'confirm that each unit is a consecration unit within range of its objective and that no objective is your home objective',
      )
  }
  if (isMarkerPlacement(selection.kind) && 'targets' in selection) {
    const keys = selection.targets.map((place) => place.key)
    if (keys.length > 20 || selection.targets.some((place) => !validObjective(place)))
      return refuse('mission-selection-objective', 'name each place that received a marker')
    if (new Set(keys).size !== keys.length) return refuse('mission-selection-objective', 'name each place once')
    const ruledOut = new Set(markedObjectives(player, command.cardKey, selection.kind).map((place) => place.key))
    if (keys.some((key) => ruledOut.has(key))) return refuse('mission-selection-objective', 'this mission rules that place out')
    if (keys.length && !selection.confirmed)
      return refuse('mission-selection-facts', 'confirm that each action met the conditions printed on the mission')
  }
  if (selection.kind === 'surveil') {
    const remaining = remainingOperationMarkers(state).filter((marker) => marker.playerId !== player.id)
    if (selection.markers.length > 40 || selection.markers.some((ref) => !remaining.some((marker) => sameMarker(marker, ref))))
      return refuse('mission-selection-objective', 'choose opposing operation markers that are still on the battlefield')
    if (uniqueBy(selection.markers, (ref) => JSON.stringify([ref.playerId, ref.seq, ref.key])).length !== selection.markers.length)
      return refuse('mission-selection-objective', 'remove each marker once')
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
    units: uniqueBy(units, unitIdentity),
  }
  player.missionSelections = [
    ...player.missionSelections.filter((old) => !sameOccurrence(old, { ...saved, kind: saved.selection.kind })),
    saved,
  ]
  const removed =
    command.selection.kind === 'sensor-sweep'
      ? [command.selection.marker]
      : command.selection.kind === 'surveil'
        ? command.selection.markers
        : []
  for (const marker of removed) {
    const owner = state.players.find((candidate) => candidate.id === marker.playerId)
    if (owner)
      owner.missionSelections = owner.missionSelections.map((old) =>
        placedBy(old, marker) ? { ...old, removedMarkers: { ...old.removedMarkers, [marker.key]: state.round } } : old,
      )
  }
}
