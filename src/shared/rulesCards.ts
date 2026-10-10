import type { Stratagem } from '../core/battle'
import type { WhenDrawn } from '../contracts/missions'
import type { MissionAction } from '../contracts/missions'
export type Award = {
  vp: number
  per: string | null
  mode: string | null
  max: number | null
  group: string | null
  cumulative: boolean
  criteria: string | null
  trigger: AwardTrigger
}
export type AwardTrigger = {
  timing: string | null
  phase: string | null
  playerTurn: string | null
  roundMin: number | null
  roundMax: number | null
}
export type Mission = {
  id: string
  name: string
  roundCap: number | null
  gameCap: number | null
  secondaryRoundCap: number | null
  secondaryGameCap: number | null
  fixedSecondaryCap?: number | null
  source: string | null
  packId: string | null
  deploymentIds: string[]
}
export type MissionCard = {
  key: string
  name: string
  text: string | null
  awards: Award[]
  actions: MissionAction[]
  whenDrawn: WhenDrawn | null
}
export type LoadedCards = {
  core: Stratagem[]
  coreDetails: { id: string; type: string | null; description: string }[]
  secondaries: MissionCard[]
  primaries: MissionCard[]
}
export function missionForIn(
  missions: ReadonlyMap<string, Mission>,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  if (!one || !two) return null
  if (missionPackId) {
    const selected = missions.get(`${missionPackId}|${one}|${two}`)
    if (selected) return selected
    if ([...missions.keys()].some((key) => key.split('|').length === 3)) return null
  }
  return missions.get(`${one}|${two}`) ?? null
}
