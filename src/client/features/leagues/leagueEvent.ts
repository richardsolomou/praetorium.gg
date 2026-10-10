import { useQueryClient } from '@tanstack/react-query'
import { alliedLeagueRosterLimit, type LeagueEntryView } from '../../../core/league'
import type { openLeague } from '../../functions'
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

/** A step on the path from joining an event to playing in it; `assign` is the 2v1 size or doubles team, which a duel skips. */
export type EntryStage = 'join' | 'assign' | 'seal' | 'reveal' | 'play'

/** The path through an event with the stage the reader is on marked current, so it can only restate the status card's own decision. */
export function entryProgress(league: Pick<League, 'format'>, stage: EntryStage): EntryStep[] {
  const assignment = league.format === '2v1' ? 'Size' : league.format === '2v2' ? 'Team' : null
  const stages: { stage: EntryStage; label: string }[] = [
    { stage: 'join', label: 'Join' },
    ...(assignment ? [{ stage: 'assign' as const, label: assignment }] : []),
    { stage: 'seal', label: 'Seal' },
    { stage: 'reveal', label: 'Reveal' },
    { stage: 'play', label: 'Play' },
  ]
  const current = stages.findIndex((candidate) => candidate.stage === stage)
  return stages.map(({ label }, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }))
}
