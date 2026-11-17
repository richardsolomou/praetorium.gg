import type { BattleDigest } from './battleDigest'
import { currentCatalogueFamilyId } from './retiredCatalogueIds'
import { type BattleOutcome, sideOutcome } from './standings'

/** How often a saved list has been played to the end and how those battles went for its owner. */
export type RosterPlays = Record<BattleOutcome, number> & { played: number; lastPlayedAt: number }

export type RosterPlayHistory = { id: string; plays: RosterPlays | null }

type OwnList = { id: string; name: string; catalogueId: string }

/**
 * Each of a player's saved lists with the finished battles that fielded it; one abandoned in setup was never played.
 *
 * A battle from before snapshots named their saved list counts for the one list of the same name and army, and for
 * none when the name is ambiguous.
 */
export function rosterPlayHistory(
  userId: string,
  battles: readonly Pick<BattleDigest, 'status' | 'lastCommandAt' | 'result' | 'seats'>[],
  rosters: readonly OwnList[],
): RosterPlayHistory[] {
  const plays = new Map<string, RosterPlays>()
  const named = new Map<string, string | null>()
  for (const roster of rosters) {
    if (!roster.name) continue
    const key = JSON.stringify([currentCatalogueFamilyId(roster.catalogueId), roster.name])
    named.set(key, named.has(key) ? null : roster.id)
  }
  for (const battle of battles) {
    const seat = battle.status === 'finished' ? battle.seats.find((candidate) => candidate.id === userId) : undefined
    if (!seat) continue
    const rosterId =
      seat.rosterId ??
      (seat.army && seat.copied ? named.get(JSON.stringify([currentCatalogueFamilyId(seat.copied.catalogueId), seat.army])) : null)
    if (!rosterId) continue
    const totals = new Map<number, number>()
    for (const other of battle.seats) totals.set(other.side, (totals.get(other.side) ?? 0) + other.score)
    const conceded = battle.seats.find((other) => other.id === battle.result?.concededBy)?.side
    const outcome = sideOutcome(
      [...totals].map(([index, total]) => ({ index, total })),
      seat.side,
      conceded,
    )
    const counted = plays.get(rosterId) ?? { played: 0, won: 0, lost: 0, drawn: 0, lastPlayedAt: 0 }
    counted.played += 1
    counted[outcome] += 1
    counted.lastPlayedAt = Math.max(counted.lastPlayedAt, battle.lastCommandAt ?? 0)
    plays.set(rosterId, counted)
  }
  return rosters.map((roster) => ({ id: roster.id, plays: plays.get(roster.id) ?? null }))
}
