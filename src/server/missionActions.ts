import { type MissionPack, missionCards, packText } from './missionPacks'
import { english, records } from '../shared/datacards'
import type { MissionAction } from '../contracts/missions'

export type { MissionAction } from '../contracts/missions'

/** Cards are keyed by name because the rules source and the mission pack give them unrelated ids. */
export const missionCardKey = (name: string) => name.toLowerCase().replaceAll(/\s+/g, ' ').trim()

/**
 * Every card's actions, keyed by card name, in the pack's own words; fields the pack
 * does not state are omitted rather than inferred.
 */
export function actionsIn(packs: readonly MissionPack[]): Map<string, MissionAction[]> {
  const found = new Map<string, MissionAction[]>()
  // A name in two packs is two cards until proven otherwise, so neither is used.
  const contested = new Set<string>()
  for (const pack of packs) {
    for (const card of missionCards(pack)) {
      const name = english(card.name)
      const actions = readActions(card, pack)
      if (!name || !actions.length) continue
      const key = missionCardKey(name)
      if (found.has(key)) contested.add(key)
      found.set(key, actions)
    }
  }
  for (const key of contested) found.delete(key)
  return found
}

function readActions(card: Record<string, unknown>, pack: MissionPack): MissionAction[] {
  return records(card, 'actions').flatMap((action) => {
    // An unnamed action cannot be told apart from another on the same card.
    const name = english(action.name)
    return name
      ? [
          {
            name,
            starts: packText(pack, action.startsText),
            completes: packText(pack, action.completesText),
            effect: packText(pack, action.effectText),
            units: packText(pack, action.unitsText),
            useLimit: packText(pack, action.useLimitText),
            restriction: packText(pack, action.restrictionText),
          },
        ]
      : []
  })
}
