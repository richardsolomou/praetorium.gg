import { useQueryClient } from '@tanstack/react-query'
import {
  alliedLeagueRosterLimit,
  leagueAllowanceOptions,
  leagueTableShape,
  leagueRegistrationFull,
  leagueRosterSplit,
  type LeagueAdmission,
  type LeagueAllowance,
  type LeagueEntryView,
  type LeagueStage,
} from '../../../core/league'
import { pointsLabel } from '../../../core/battle'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import type { openLeague } from '../../functions'
import { leagueReadsKey, leaguesKey, outdatedLeagueEntriesKey } from '../../queries'
import { formatList } from '../../text'
import { groupBy } from '../../../core/collections'

export type League = NonNullable<Awaited<ReturnType<typeof openLeague>>>

export function useLeagueRefresh(token: string) {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leagueReadsKey(token) }),
      queryClient.invalidateQueries({ queryKey: leaguesKey() }),
      queryClient.invalidateQueries({ queryKey: outdatedLeagueEntriesKey() }),
    ])
  }
}

/** Names a few people outright and counts the rest, so a long waiting list stays one line. */
export function namesPhrase(names: string[], shown = 3) {
  if (names.length <= shown) return formatList(names)
  const rest = names.length - (shown - 1)
  return `${names.slice(0, shown - 1).join(', ')} and ${rest} others`
}

/** Which side of a 2v1 table an entry's assigned size puts it on. */
export function soloOrAllied(league: Pick<League, 'format' | 'rosterLimit'>, entry: Pick<LeagueEntryView, 'requiredLimit'>) {
  if (league.format !== '2v1' || league.rosterLimit === null || entry.requiredLimit === null) return null
  if (entry.requiredLimit === league.rosterLimit) return 'solo'
  return entry.requiredLimit === alliedLeagueRosterLimit(league.rosterLimit) ? 'allied' : null
}

/** The fixed pairs of an event in the order their first member joined, each with its entries. */
export function doublesTeams<T extends Pick<LeagueEntryView, 'teamId' | 'status'>>(entries: readonly T[]) {
  const teams = groupBy(
    entries.filter((entry) => entry.status === 'accepted' && entry.teamId),
    (entry) => entry.teamId!,
  )
  return [...teams].map(([id, members]) => ({ id, members }))
}

/** What each side of a 2v1 means at the table, said where the side is named rather than left to be guessed. */
export function sideGroups(league: Pick<League, 'rosterLimit'>): Record<'solo' | 'allied' | 'unsized', { title: string; detail?: string }> {
  const solo = league.rosterLimit ?? 0
  return {
    solo: { title: `Solo · ${pointsLabel(solo)}`, detail: 'Plays alone against a pair.' },
    allied: {
      title: `Allied · ${pointsLabel(alliedLeagueRosterLimit(solo))}`,
      detail: 'Plays beside another ally.',
    },
    unsized: { title: 'Waiting for a size' },
  }
}

/**
 * One titled run of an event's entrants: a 2v1 side, a fixed pair, or the players still waiting for one.
 *
 * `teamId` marks a pair, which plays together and seals one Force Disposition; a duel is one untitled run.
 */
export type EntrantGrouping<T> = { key: string; title?: string; detail?: string; teamId?: string; entries: T[] }

/** The groups the entrant list, the organizer and the revealed rosters all split an event into, so a pairing reads the same everywhere. */
export function entrantGroups<T extends Pick<LeagueEntryView, 'teamId' | 'status' | 'requiredLimit'>>(
  league: Pick<League, 'format' | 'rosterLimit'>,
  accepted: readonly T[],
  names: (members: T[]) => string,
): EntrantGrouping<T>[] {
  const pairs = (entries: readonly T[], prefix: string, keyPrefix: string) =>
    doublesTeams(entries).map((team, index) => ({
      key: `${keyPrefix}-${index + 1}`,
      title: `${prefix} ${index + 1}`,
      detail: names(team.members),
      teamId: team.id,
      entries: team.members,
    }))
  if (league.format === '2v2')
    return [
      ...pairs(accepted, 'Team', 'team'),
      { key: 'unpaired', title: 'Waiting for a teammate', entries: accepted.filter((entry) => !entry.teamId) },
    ].filter((group) => group.entries.length)
  if (league.format !== '2v1') return [{ key: 'all', entries: [...accepted] }]
  const sides = sideGroups(league)
  const on = (side: 'solo' | 'allied' | 'unsized') => accepted.filter((entry) => (soloOrAllied(league, entry) ?? 'unsized') === side)
  const allied = on('allied')
  return [
    { key: 'solo', ...sides.solo, entries: on('solo') },
    ...pairs(allied, 'Allied pair', 'pair'),
    { key: 'allied', ...sides.allied, entries: allied.filter((entry) => !entry.teamId) },
    { key: 'unsized', ...sides.unsized, entries: on('unsized') },
  ].filter((group) => group.entries.length)
}

export type EntryStep = { label: string; state: 'done' | 'current' | 'upcoming' }

/** A step on the path from joining an event to playing in it; `assign` is the 2v1 size or doubles team, which a duel skips. */
export type EntryStage = 'join' | 'assign' | 'seal' | 'reveal' | 'play'

/** The path through an event with the stage the reader is on marked current, so it can only restate the status card's own decision. */
export function entryProgress(league: Pick<League, 'format'>, stage: EntryStage): EntryStep[] {
  const assignment = league.format === '2v1' ? 'Play solo or get an ally' : league.format === '2v2' ? 'Get paired with a teammate' : null
  const stages: { stage: EntryStage; label: string }[] = [
    { stage: 'join', label: 'Join the league' },
    ...(assignment ? [{ stage: 'assign' as const, label: assignment }] : []),
    { stage: 'seal', label: 'Seal your roster' },
    { stage: 'reveal', label: 'Rosters revealed' },
    { stage: 'play', label: 'Play your games' },
  ]
  const current = stages.findIndex((candidate) => candidate.stage === stage)
  return stages.map(({ label }, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }))
}

type LeagueFacts = {
  format: TableShape | null
  rosterLimit: number | null
  playerLimit: number | null
  admission: LeagueAdmission
  revealedAt: number | null
}

/** A league's table shape and points, such as "Duel · 2,000 points", or null for an event that fixed neither. */
export function leagueFormat(league: Pick<LeagueFacts, 'format' | 'rosterLimit'>) {
  return league.format && league.rosterLimit
    ? `${TABLE_SHAPE_LABELS[league.format].name} · ${leagueRosterSplit(league.format, league.rosterLimit) ?? pointsLabel(league.rosterLimit)}`
    : null
}

/** Legends and Crucible read as what a list may bring; a battle-size rule as one it may switch off. */
export const allowanceLabel = (option: { id: LeagueAllowance; label: string }) =>
  option.id === 'legends' || option.id === 'crucible' ? option.label : `${option.label} off`

/**
 * What an event lets lists do beyond matched play, such as "Legends, Warlord off", or "Matched play" for none. Null for
 * an event that fixed no format, or that predates allowances and so accepts whatever a list waives.
 */
export function leagueAllowances(league: { format: TableShape | null; rosterLimit: number | null; allowances: readonly string[] | null }) {
  if (!league.format || !league.rosterLimit || !league.allowances) return null
  const allowed = league.allowances
  const chosen = leagueAllowanceOptions(league.format, league.rosterLimit).filter((option) => allowed.includes(option.id))
  return chosen.length ? chosen.map(allowanceLabel).join(', ') : 'Matched play'
}

/** How many players are in, against the limit when there is one. */
export function leaguePlayers(league: Pick<LeagueFacts, 'playerLimit'>, accepted: number) {
  return `${accepted}${league.playerLimit ? ` of ${league.playerLimit}` : ''} ${accepted === 1 && !league.playerLimit ? 'player' : 'players'}`
}

/** Where the open event stands for someone not in it: still taking players, full, or past its reveal. */
export function leaguePhase(league: LeagueFacts, accepted: number, occupied: number) {
  if (league.revealedAt) return { label: 'Rosters revealed', tint: 'text-achieved' }
  return leagueRegistrationFull(league, accepted, occupied)
    ? { label: 'Registration full', tint: 'text-dim' }
    : { label: 'Registration open', tint: 'text-parchment' }
}

/**
 * What happens next at an event's stage. The organizer reads the step the reveal waits on; a player's own step before
 * the reveal is already on the status card and the readiness panel, so a player reads one only once their side can
 * start a battle.
 */
export function leagueNextStep(stage: LeagueStage, viewer: { organizer: boolean; canPlay: boolean }, format: League['format']) {
  const shape = leagueTableShape(format)
  if (viewer.organizer)
    return {
      empty: 'Copy the invite link and send it to your group.',
      approving: 'Answer the requests waiting below.',
      recruiting: 'Share the invite link. This format needs more players before you can reveal.',
      sizing: 'Size players below: at least one solo and two allied.',
      pairing: `Pair ${shape === '2v1' ? 'the allies' : 'players into teams'} below.`,
      sealing: 'Players seal their rosters. Nobody sees another list, you included, until the reveal.',
      choosing: 'Each team chooses its Force Disposition. Then you can reveal the rosters.',
      ready: 'Reveal the rosters. That opens every list at once and closes entry.',
      playing: 'Players start their league battles from this page. Finished ones fill the results table.',
      results: 'Start the next event once this one’s games are done.',
    }[stage]
  return (stage === 'playing' || stage === 'results') && viewer.canPlay
    ? `Start a ${TABLE_SHAPE_LABELS[shape].count} battle from your card. Finished battles fill the results table.`
    : null
}
