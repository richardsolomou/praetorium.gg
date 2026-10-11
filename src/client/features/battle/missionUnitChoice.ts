import type { MissionUnitRef } from '../../../core/missionSelections'

export const missionUnitChoiceKey = (unit: MissionUnitRef) => JSON.stringify([unit.playerId, unit.rosterSeq, unit.unitKey])
export function missionUnitChoice(units: readonly MissionUnitRef[], key: string): MissionUnitRef | null {
  const unit = units.find((candidate) => missionUnitChoiceKey(candidate) === key)
  return unit ? { playerId: unit.playerId, rosterSeq: unit.rosterSeq, unitKey: unit.unitKey } : null
}
