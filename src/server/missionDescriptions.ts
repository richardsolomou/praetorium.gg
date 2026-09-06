import { criteriaKey } from './missionCriteria'
import { english, type MissionPack, missionCards, readMissionPacks } from './missionPacks'

export function loadMissionDescriptions(directory: string): Map<string, string> {
  return descriptionsIn(readMissionPacks(directory))
}

export function descriptionsIn(packs: readonly MissionPack[]): Map<string, string> {
  const found = new Map<string, string>()
  const contested = new Set<string>()
  for (const pack of packs) {
    for (const card of missionCards(pack)) {
      const name = english(card.name)
      const description = english(card.description)
      if (!name || !description) continue
      const key = criteriaKey(name)
      if (found.has(key)) contested.add(key)
      found.set(key, description)
    }
  }
  for (const key of contested) found.delete(key)
  return found
}
