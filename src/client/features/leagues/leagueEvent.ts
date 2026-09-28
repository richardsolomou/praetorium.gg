import { useQueryClient } from '@tanstack/react-query'
import { alliedLeagueRosterLimit, leagueRevealChecklist, type LeagueEntryView } from '../../../core/league'
import type { openLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'

export type League = NonNullable<Awaited<ReturnType<typeof openLeague>>>

export function useLeagueRefresh(token: string) {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['league', token] }),
      queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['outdated-league-entries'] }),
    ])
  }
}

export function formatNames(names: string[]) {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Names a few people outright and counts the rest, so a long waiting list stays one line. */
export function namesPhrase(names: string[], shown = 3) {
  if (names.length <= shown) return formatNames(names)
  const rest = names.length - (shown - 1)
  return `${names.slice(0, shown - 1).join(', ')} and ${rest} others`
}

export function revealChecklist(league: League) {
  return leagueRevealChecklist(league, league.entries)
}

/** Which side of a 2v1 table an entry's assigned size puts it on. */
export function soloOrAllied(league: Pick<League, 'format' | 'rosterLimit'>, entry: Pick<LeagueEntryView, 'requiredLimit'>) {
  if (league.format !== '2v1' || league.rosterLimit === null || entry.requiredLimit === null) return null
  if (entry.requiredLimit === league.rosterLimit) return 'solo'
  return entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit) ? 'allied' : null
}

/** The teams of a doubles event in the order their first member joined, each with its two entries. */
export function doublesTeams<T extends Pick<LeagueEntryView, 'teamId' | 'status'>>(entries: readonly T[]) {
  const teams = new Map<string, T[]>()
  for (const entry of entries) {
    if (entry.status === 'accepted' && entry.teamId) teams.set(entry.teamId, [...(teams.get(entry.teamId) ?? []), entry])
  }
  return [...teams].map(([id, members]) => ({ id, members }))
}

export type EntryStep = { label: string; state: 'done' | 'current' | 'upcoming' }

/**
 * The path one player walks through an event, with the step they are on.
 *
 * It reads the same facts the status card does, so the steps can never say a player is
 * further along than the action the card offers them.
 */
export function entryProgress(league: League, entry: LeagueEntryView | undefined): EntryStep[] {
  const labels = ['Join', ...(league.format === '2v1' ? ['Size'] : league.format === '2v2' ? ['Team'] : []), 'Seal', 'Reveal', 'Play']
  const assignment = labels.length === 5 ? 1 : null
  const seal = labels.indexOf('Seal')
  const current =
    entry?.status !== 'accepted'
      ? 0
      : assignment !== null && entry.requiredLimit === null && !league.revealedAt
        ? assignment
        : !entry.submitted
          ? seal
          : league.revealedAt
            ? labels.length - 1
            : seal + 1
  return labels.map((label, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }))
}
