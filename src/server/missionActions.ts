import { criteriaKey } from './missionCriteria'
import { english, type MissionPack, missionCards, readMissionPacks } from './missionPacks'

/**
 * The action a mission card puts a unit up to, in the words the pack prints.
 *
 * A card's payouts say what has to be true when the points are due; several of them
 * are only ever true because a unit spent a phase performing an action the card names
 * and nothing else does. That action is printed beside the mission in the pack and
 * appears nowhere in the rules source, so a card shown without it asks a player to
 * remember how its points are actually earned.
 *
 * Every field is the pack's own sentence. A field the pack leaves out is absent
 * rather than filled in, so an action with no stated limit states none.
 */
export type MissionAction = {
  name: string
  starts: string | null
  completes: string | null
  effect: string | null
  /** Which units may start it. */
  units: string | null
  /** How often it may be started. */
  useLimit: string | null
  restriction: string | null
}

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
