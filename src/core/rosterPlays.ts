import { currentCatalogueFamilyId } from './retiredCatalogueIds'
import { battleOutcome, type BattleOutcome, type StandingBattle } from './standings'

/** How often a saved list has been played to the end and how those battles went for its owner. */
export type RosterPlays = Record<BattleOutcome, number> & { played: number; lastPlayedAt: number }

export type RosterPlayHistory = { id: string; plays: RosterPlays | null }

/** A finished battle with, for each seat, its player, side, score, army and the saved list it fielded. */
export type PlayedBattle = Pick<StandingBattle, 'playerIds' | 'sides' | 'scores' | 'result' | 'lastActivity'> & {
  built: readonly ({ catalogueId: string } | null)[]
  rosterIds?: readonly (string | null)[]
  rosterNames?: readonly (string | null)[]
  eventToken?: string | null
  sealedEventToken?: string | null
}

type OwnList = { id: string; name: string; catalogueId: string }

/**
 * Each of a player's saved lists with the finished battles that fielded it.
 *
 * A sealed list leaves its saved list's id out of the battle, so `sealedFrom` names it by the battle's event. A battle
 * from before battles named their saved list counts for the one list of the same name and army, and for none when the
 * name is ambiguous.
 */
export function rosterPlayHistory(
  userId: string,
  battles: readonly PlayedBattle[],
  rosters: readonly OwnList[],
  sealedFrom: ReadonlyMap<string, string> = new Map(),
): RosterPlayHistory[] {
  const plays = new Map<string, RosterPlays>()
  const named = new Map<string, string | null>()
  const nameKey = (catalogueId: string, name: string) => JSON.stringify([currentCatalogueFamilyId(catalogueId), name])
  for (const roster of rosters) {
    if (!roster.name) continue
    const key = nameKey(roster.catalogueId, roster.name)
    named.set(key, named.has(key) ? null : roster.id)
  }
  for (const battle of battles) {
    const seat = battle.playerIds.indexOf(userId)
    if (seat < 0) continue
    const catalogueId = battle.built[seat]?.catalogueId
    const name = battle.rosterNames?.[seat]
    const rosterId =
      battle.rosterIds?.[seat] ??
      sealedFrom.get(battle.eventToken ?? battle.sealedEventToken ?? '') ??
      (catalogueId && name ? named.get(nameKey(catalogueId, name)) : null)
    if (!rosterId) continue
    const outcome = battleOutcome(battle, battle.sides[seat]!)
    const counted = plays.get(rosterId) ?? { played: 0, won: 0, lost: 0, drawn: 0, lastPlayedAt: 0 }
    counted.played += 1
    counted[outcome] += 1
    counted.lastPlayedAt = Math.max(counted.lastPlayedAt, battle.lastActivity)
    plays.set(rosterId, counted)
  }
  return rosters.map((roster) => ({ id: roster.id, plays: plays.get(roster.id) ?? null }))
}
