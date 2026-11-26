import { DAY_MS } from './listFilter'
import { armyOf, battleOutcome, counted, type BattleOutcome, type StandingBattle, type StandingFaction } from './standings'

const FORM_LENGTH = 5
const FACTIONS_SHOWN = 5
const RIVALRIES_SHOWN = 6
const RECENT_DAYS = 30
/** A battle still marked as in play but untouched for longer than this has most likely been left unfinished. */
const LIVE_DAYS = 7

export type Rivalry = { a: string; b: string; battles: number; aWon: number; bWon: number; drawn: number; lastPlayed: number }

export type GroupSummary = {
  /** Finished battles in the last thirty days. */
  recent: number
  /** Members who finished a battle in the last thirty days. */
  active: number
  /** Battles in play and touched within the last week, whoever is playing. */
  live: number
  /** The armies fielded most, by seats, across every finished battle. */
  factions: { faction: StandingFaction; seats: number }[]
  /** Each member's latest rated results, newest first. */
  form: Record<string, BattleOutcome[]>
  /** Members who have faced each other, most games first, from rated battles only so they agree with the leaderboard. */
  rivalries: Rivalry[]
}

/** What a group's overview says about how it plays, beside the leaderboard that rates the same battles. */
export function groupSummary(
  battles: readonly StandingBattle[],
  { members, exclude, now }: { members: ReadonlySet<string>; exclude: readonly string[]; now: number },
): GroupSummary {
  const finished = battles.filter((battle) => battle.status === 'finished')
  const factions = new Map<string, { faction: StandingFaction; seats: number }>()
  for (const faction of finished.flatMap((battle) => battle.factions)) {
    if (!faction) continue
    const known = factions.get(armyOf(faction)) ?? { faction, seats: 0 }
    known.seats += 1
    factions.set(armyOf(faction), known)
  }
  const form: Record<string, BattleOutcome[]> = {}
  const rivalries = new Map<string, Rivalry>()
  for (const battle of counted(finished, exclude).toSorted((one, other) => other.lastActivity - one.lastActivity)) {
    battle.playerIds.forEach((id, seat) => {
      if (!members.has(id)) return
      const results = (form[id] ??= [])
      if (results.length < FORM_LENGTH) results.push(battleOutcome(battle, battle.sides[seat]!))
    })
    battle.playerIds.forEach((a, seat) =>
      battle.playerIds.forEach((b, other) => {
        if (a >= b || battle.sides[seat] === battle.sides[other] || !members.has(a) || !members.has(b)) return
        const key = `${a}\n${b}`
        const rivalry = rivalries.get(key) ?? { a, b, battles: 0, aWon: 0, bWon: 0, drawn: 0, lastPlayed: battle.lastActivity }
        const outcome = battleOutcome(battle, battle.sides[seat]!)
        rivalry.battles += 1
        if (outcome === 'won') rivalry.aWon += 1
        else if (outcome === 'lost') rivalry.bWon += 1
        else rivalry.drawn += 1
        rivalries.set(key, rivalry)
      }),
    )
  }
  const lately = finished.filter((battle) => now - battle.lastActivity <= RECENT_DAYS * DAY_MS)
  return {
    recent: lately.length,
    live: battles.filter((battle) => battle.status === 'playing' && now - battle.lastActivity <= LIVE_DAYS * DAY_MS).length,
    active: new Set(lately.flatMap((battle) => battle.playerIds.filter((id) => members.has(id)))).size,
    factions: [...factions.values()]
      .toSorted((one, other) => other.seats - one.seats || one.faction.displayName.localeCompare(other.faction.displayName))
      .slice(0, FACTIONS_SHOWN),
    form,
    rivalries: [...rivalries.values()]
      .toSorted((one, other) => other.battles - one.battles || other.lastPlayed - one.lastPlayed)
      .slice(0, RIVALRIES_SHOWN),
  }
}
