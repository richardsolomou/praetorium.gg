import { routeSlug } from '../core/slug'
import { english, type MissionPack, readMissionPacks } from './missionPacks'

/**
 * The optional twist a pack offers, which changes one rule for the whole battle.
 *
 * Only the mission pack carries these — the rules source describes missions, cards
 * and dispositions and says nothing about twists — so they are read from the pack
 * itself and keyed by the name it shares with the missions in it.
 *
 * Nothing is invented: a pack with no twists offers none, which is what every pack
 * did before this was read at all.
 */
export type MissionTwist = { id: string; name: string; lore: string | null; rules: string | null }

/** Twists by pack, under the same slug `gameReferences` gives that pack. */
export function loadMissionTwists(directory: string): Map<string, MissionTwist[]> {
  return twistsIn(readMissionPacks(directory))
}

/** The same reading, for a caller that has already parsed the packs. */
export function twistsIn(packs: readonly MissionPack[]): Map<string, MissionTwist[]> {
  const found = new Map<string, MissionTwist[]>()
  for (const pack of packs) {
    const packName = english(pack.name)
    const twists = Array.isArray(pack.missionTwists) ? pack.missionTwists : []
    if (!packName || !twists.length) continue
    const read = twists.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return []
      const twist = entry as Record<string, unknown>
      const name = english(twist.name)
      return typeof twist.id === 'string' && name ? [{ id: twist.id, name, lore: english(twist.lore), rules: english(twist.rules) }] : []
    })
    if (read.length) found.set(routeSlug(packName), read)
  }
  return found
}

/**
 * The most a single Fixed Secondary Mission card may score across the whole battle.
 *
 * Its own ceiling, beside the per-round and per-battle ones the rules source states
 * for secondaries as a whole: a fixed card that pays per model destroyed has no cap
 * of its own, so without this one card can bank more than the pack allows.
 *
 * Read off the pack rather than written down here, and absent for a pack that does
 * not state it — an unstated ceiling is not enforced rather than assumed to be 20.
 */
export function fixedSecondaryCapsIn(packs: readonly MissionPack[]): Map<string, number> {
  const found = new Map<string, number>()
  for (const pack of packs) {
    const packName = english(pack.name)
    const cap = pack.fixedSecondaryMissionCapLimit
    if (packName && typeof cap === 'number' && cap > 0) found.set(routeSlug(packName), cap)
  }
  return found
}
