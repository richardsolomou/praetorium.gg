import { criteriaKey } from './missionCriteria'
import { english, type MissionPack, missionCards, readMissionPacks } from './missionPacks'
import type { MissionAction } from '../contracts/missions'

export type { MissionAction } from '../contracts/missions'

/** Keep mission actions in the pack’s own words; omit fields the pack does not state rather than inferring limits. */
/** Every card's actions in every pack under `missions`, keyed by card name. */
export function loadMissionActions(directory: string): Map<string, MissionAction[]> {
  return actionsIn(readMissionPacks(directory))
}

/** The same reading, for a caller that has already parsed the packs. */
export function actionsIn(packs: readonly MissionPack[]): Map<string, MissionAction[]> {
  const found = new Map<string, MissionAction[]>()
  // A name in two packs is two cards until proven otherwise, so neither is used.
  const contested = new Set<string>()
  for (const pack of packs) {
    for (const card of missionCards(pack)) {
      const name = english(card.name)
      const actions = readActions(card.actions)
      if (!name || !actions.length) continue
      const key = criteriaKey(name)
      if (found.has(key)) contested.add(key)
      found.set(key, actions)
    }
  }
  for (const key of contested) found.delete(key)
  return found
}

function readActions(actions: unknown): MissionAction[] {
  if (!Array.isArray(actions)) return []
  return actions.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const action = entry as Record<string, unknown>
    // An unnamed action cannot be told apart from another on the same card.
    const name = english(action.name)
    return name
      ? [
          {
            name,
            starts: english(action.startsText),
            completes: english(action.completesText),
            effect: english(action.effectText),
            units: english(action.unitsText),
            useLimit: english(action.useLimitText),
            restriction: english(action.restrictionText),
          },
        ]
      : []
  })
}
