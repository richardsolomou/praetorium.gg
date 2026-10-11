import { attachedUnits, attachedUnitList } from './attachedUnits'
import type { BattleState, Command, PlayerState, Secondary } from './battle'
import { playsSide, refuse, sameSide } from './battlePrimitives'

export const MISSION_SELECTION_KINDS = ['punishment', 'guards', 'tempting-target', 'beacon'] as const
export const MISSION_SELECTION_REQUIRED_MESSAGE =
  'Record the mission choices before ending the command phase. If the choice controls are missing, reconnect and refresh Praetorium.'
export type MissionSelectionKind = (typeof MISSION_SELECTION_KINDS)[number]
export type MissionUnitRef = { playerId: string; unitKey: string; rosterSeq: number }
export type MissionObjectiveRef = { key: string; name: string }
export type MissionSelection =
  | { kind: 'punishment'; units: MissionUnitRef[]; fallback: boolean; qualified: boolean; unavailable?: true }
  | { kind: 'guards'; guards: { objective: MissionObjectiveRef; unit: MissionUnitRef }[] }
  | { kind: 'tempting-target'; objective: MissionObjectiveRef; notHome: boolean; noMansLand: boolean }
  | { kind: 'beacon'; unit: MissionUnitRef | null; note: string }

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

type SelectionCommand = Extract<Command, { kind: 'select-mission' }>

function selectionCard(player: PlayerState, key: string): Secondary | undefined {
  return player.primaryCard?.key === key
    ? player.primaryCard
    : player.secondaryStatus[key] === 'active'
      ? player.secondaries.find((card) => card.key === key)
      : undefined
}

export function missionSelectionPrompt(state: BattleState, player: PlayerState, card: Secondary): MissionSelectionPrompt | null {
  const kind = card.selection
  if (!kind || state.status !== 'playing') return null
  const primary = player.primaryCard?.key === card.key
  if (!primary && (player.secondaryMode !== 'tactical' || player.secondaryStatus[card.key] !== 'active')) return null
  const ownTurn = sameSide(state, state.activePlayerId, player.id)
  const drawn = player.secondaryDrawSeq[card.key] ?? 0
  const occurrence = kind === 'punishment' ? state.turnSeq : kind === 'guards' && ownTurn ? Math.max(state.turnSeq, drawn) : drawn
  if (!occurrence) return null
  if (kind !== 'beacon' && (!ownTurn || state.phase !== 'command')) return null
  if (kind === 'punishment' && !primary) return null
  const chooserSide = kind === 'tempting-target' ? state.players.find((candidate) => candidate.side !== player.side)?.side : player.side
  return chooserSide === undefined ? null : { cardKey: card.key, cardName: card.name, kind, occurrence, chooserSide }
}

export function missionSelectionsDue(state: BattleState, player: PlayerState): MissionSelectionPrompt[] {
  if (state.pendingSettlement) return []
  const cards = [...(player.primaryCard ? [player.primaryCard] : []), ...player.secondaries]
  return cards.flatMap((card) => {
    const prompt = missionSelectionPrompt(state, player, card)
    if (!prompt || prompt.kind === 'beacon') return []
    return player.missionSelections.some((saved) => saved.cardKey === prompt.cardKey && saved.occurrence === prompt.occurrence)
      ? []
      : [prompt]
  })
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

export function missionSelectionRefusal(state: BattleState, by: string, player: PlayerState, command: SelectionCommand) {
  const card = selectionCard(player, command.cardKey)
  if (!card?.selection || card.selection !== command.selection.kind)
    return refuse('mission-selection-invalid', 'choose a selection supported by this active mission')
  const prompt = missionSelectionPrompt(state, player, card)
  if (!prompt || prompt.occurrence !== command.occurrence)
    return refuse('mission-selection-timing', 'that mission selection is not due now')
  if (!playsSide(state, by, prompt.chooserSide)) return refuse('mission-selection-owner', 'that mission choice belongs to the other side')
  if (state.pendingSettlement) return refuse('mission-selection-timing', 'settle the previous turn before choosing mission targets')
  const previous = player.missionSelections.find((saved) => saved.cardKey === command.cardKey && saved.occurrence === command.occurrence)
  if (previous && command.selection.kind !== 'beacon')
    return refuse('mission-selection-recorded', 'that mission choice is already recorded; undo it to correct it')
  const refs = refsIn(command.selection)
  const expectedSide =
    command.selection.kind === 'punishment' ? state.players.find((candidate) => candidate.side !== player.side)?.side : player.side
  for (const ref of refs) {
    const army = state.players.find((candidate) => candidate.id === ref.playerId)
    const unit = savedUnit(state, ref)
    if (!unit || army?.side !== expectedSide) return refuse('mission-selection-unit', 'choose a unit from the required army and roster')
    if (command.selection.kind !== 'beacon' && savedMissionUnitStatus(state, unit) !== 'battlefield')
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
  if (selection.kind === 'tempting-target') {
    if (!validObjective(selection.objective)) return refuse('mission-selection-objective', 'choose one objective')
    if (!selection.notHome || !selection.noMansLand)
      return refuse('mission-selection-facts', 'confirm that the objective is not a home objective and is within No Man’s Land')
  }
  if (selection.kind === 'beacon' && previous?.beaconDestroyed)
    return refuse('mission-selection-recorded', 'a destroyed Beacon cannot be replaced; undo the original choice to correct it')
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
    units: units.filter(
      (unit, index) =>
        units.findIndex(
          (candidate) =>
            candidate.playerId === unit.playerId && candidate.unitKey === unit.unitKey && candidate.rosterSeq === unit.rosterSeq,
        ) === index,
    ),
  }
  player.missionSelections = [
    ...player.missionSelections.filter((old) => old.cardKey !== saved.cardKey || old.occurrence !== saved.occurrence),
    saved,
  ]
}
