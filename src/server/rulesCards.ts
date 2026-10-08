import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import type { WhenDrawn } from '../contracts/missions'
import { localizedField, stratagemLimit, stratagemText } from './datacards'
import type { MissionAction } from './missionActions'

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

export function coreFromDatacards(directory: string): Pick<LoadedCards, 'core' | 'coreDetails'> {
  const file = path.join(directory, 'core.json')
  if (!fs.existsSync(file)) return { core: [], coreDetails: [] }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { stratagems?: Record<string, unknown>[] }
  const core: Stratagem[] = []
  const coreDetails: LoadedCards['coreDetails'] = []
  for (const card of parsed.stratagems ?? []) {
    const name = localizedField(card, 'name')
    if (typeof card.id !== 'string' || !name || !Number.isInteger(card.cost)) continue
    const phases = Array.isArray(card.phase)
      ? card.phase.filter(
          (phase): phase is NonNullable<Stratagem['phases']>[number] =>
            typeof phase === 'string' && ['command', 'movement', 'shooting', 'charge', 'fight', 'end'].includes(phase),
        )
      : []
    const turn =
      card.turn === 'your' ? 'your-turn' : card.turn === 'opponents' ? 'opponent-turn' : card.turn === 'either' ? 'either' : undefined
    core.push({
      key: card.id,
      name,
      cp: card.cost as number,
      limit: stratagemLimit(localizedField(card, 'restrictions')),
      ...(phases.length ? { phases } : {}),
      ...(turn ? { turn } : {}),
    })
    const description = stratagemText(card)
    if (description) coreDetails.push({ id: card.id, type: typeof card.type === 'string' ? card.type : null, description })
  }
  return { core, coreDetails }
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
