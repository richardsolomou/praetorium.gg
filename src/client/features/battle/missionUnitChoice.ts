import type { MissionUnitRef, SavedMissionUnit } from '../../../core/missionSelections'

export const missionUnitChoiceKey = (unit: MissionUnitRef) => JSON.stringify([unit.playerId, unit.rosterSeq, unit.unitKey])
export function missionUnitChoice(units: readonly MissionUnitRef[], key: string): MissionUnitRef | null {
  const unit = units.find((candidate) => missionUnitChoiceKey(candidate) === key)
  return unit ? { playerId: unit.playerId, rosterSeq: unit.rosterSeq, unitKey: unit.unitKey } : null
}

/** The leaders and support a unit plays with, worded as the setup steps word them. */
export const joinedLine = (unit: Pick<SavedMissionUnit, 'joined'>) => `with ${unit.joined.join(', ')}`
export const missionUnitName = (unit: Pick<SavedMissionUnit, 'name' | 'joined'>) =>
  unit.joined.length ? `${unit.name} ${joinedLine(unit)}` : unit.name
