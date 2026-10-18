import { RECENT_MATCHUP_LIMIT, recentMatchupSchema, type RecentMatchup } from '../core/recentMatchups'
import { simulatorPairing } from './simulatorState'

/** Puts `entry` first, replacing the same pairing's older settings; an unfinished setup leaves the list unchanged. */
export function withRecentMatchup(recent: readonly RecentMatchup[], entry: RecentMatchup): RecentMatchup[] {
  const parsed = recentMatchupSchema.safeParse(entry)
  const pairing = parsed.success ? simulatorPairing(parsed.data.shared) : null
  if (!pairing) return [...recent]
  return [parsed.data!, ...recent.filter((old) => simulatorPairing(old.shared) !== pairing)].slice(0, RECENT_MATCHUP_LIMIT)
}

export function withoutRecentMatchup(recent: readonly RecentMatchup[], shared: string): RecentMatchup[] {
  const pairing = simulatorPairing(shared)
  return recent.filter((entry) => entry.shared !== shared && simulatorPairing(entry.shared) !== pairing)
}
