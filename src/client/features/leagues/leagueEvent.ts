import { useQueryClient } from '@tanstack/react-query'
import {
  alliedLeagueRosterLimit,
  effectiveLeagueAllowances,
  isNonMatchedPlayAllowance,
  leagueAllowanceOptions,
  leagueTableShape,
  leagueRegistrationFull,
  leagueSeatPoints,
  leagueTitle,
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

/** What players call a league: a club's is its casual sealed game, never a tournament. */
export function leagueNoun(league: { club?: unknown }) {
  return league.club ? ({ noun: 'sealed game', Noun: 'Sealed game' } as const) : ({ noun: 'tournament', Noun: 'Tournament' } as const)
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
function sideGroups(
  league: Pick<League, 'rosterLimit' | 'soloPoints' | 'allyPoints' | 'sharedPoints'>,
): Record<'solo' | 'allied' | 'unsized', { title: string; detail?: string }> {
  const ally = leagueSeatPoints(league, false) ?? 0
  return {
    solo: { title: `Solo · ${pointsLabel(leagueSeatPoints(league, true) ?? 0)}`, detail: 'Plays alone against a pair.' },
    allied: {
      title: league.sharedPoints ? `Allied · ${pointsLabel(ally * 2)} shared` : `Allied · ${pointsLabel(ally)}`,
      detail: league.sharedPoints ? 'Plays beside another ally, splitting the points between them.' : 'Plays beside another ally.',
    },
    unsized: { title: 'Waiting for a size' },
  }
}

/**
 * One titled run of an event's entrants: a 2v1 side, a fixed pair, or the players still waiting for one.
 *
 * `teamId` marks a pair, which plays together and seals one Force Disposition; a duel is one untitled run.
 */
type EntrantGrouping<T> = { key: string; title?: string; detail?: string; teamId?: string; entries: T[] }

/** The groups the entrant list, the organizer and the revealed rosters all split an event into, so a pairing reads the same everywhere. */
export function entrantGroups<T extends Pick<LeagueEntryView, 'teamId' | 'status' | 'requiredLimit'>>(
  league: Pick<League, 'format' | 'rosterLimit' | 'soloPoints' | 'allyPoints' | 'sharedPoints'>,
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
export function entryProgress(league: Pick<League, 'format' | 'club'>, stage: EntryStage): EntryStep[] {
  const assignment = league.format === '2v1' ? 'Play solo or get an ally' : league.format === '2v2' ? 'Get paired with a teammate' : null
  const stages: { stage: EntryStage; label: string }[] = [
    { stage: 'join', label: `Join the ${leagueNoun(league).noun}` },
    ...(assignment ? [{ stage: 'assign' as const, label: assignment }] : []),
    { stage: 'seal', label: 'Seal your roster' },
    { stage: 'reveal', label: 'Rosters revealed' },
    { stage: 'play', label: 'Play your games' },
  ]
  const current = stages.findIndex((candidate) => candidate.stage === stage)
  return stages.map(({ label }, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }))
}

/** An event's host as the helpers here read it: a tournament with its own entry rules, or a club's game. */
type Host = { tournament: { admission: LeagueAdmission; playerLimit: number | null } | null }

/** Who gets in and how many: a tournament's own rules, while a club game lets its members straight in, with no limit. */
export function entryRules({ tournament }: Host) {
  return { admission: tournament?.admission ?? ('automatic' as const), playerLimit: tournament?.playerLimit ?? null }
}

/** Who runs an event, as its copy names them: a tournament's owner, or the club whose game it is. */
export function organizerName(league: { tournament: { ownerName: string } | null; club: { name: string } | null }) {
  return league.tournament?.ownerName ?? league.club?.name ?? ''
}

type NamedEvent = {
  tournament: { name: string } | null
  club: { name: string } | null
  format?: TableShape | null
  rosterLimit?: number | null
  pointsBudget?: number | null
  soloPoints?: number | null
  allyPoints?: number | null
  sharedPoints?: boolean
}

/** An event's name where its club is in view: a tournament's own name, or what a sealed game plays. */
export const eventName = (event: NamedEvent) => namedEvent(event, false)

/** An event's name on its own, such as on Home or an invite: a sealed game reads after its club. */
export const eventFullName = (event: NamedEvent) => namedEvent(event, true)

function namedEvent(event: NamedEvent, withClub: boolean) {
  return leagueTitle(
    {
      tournament: event.tournament,
      club: event.club,
      format: event.format ?? null,
      rosterLimit: event.rosterLimit ?? null,
      pointsBudget: event.pointsBudget,
      soloPoints: event.soloPoints,
      allyPoints: event.allyPoints,
      sharedPoints: event.sharedPoints,
    },
    { withClub },
  )
}

/**
 * What an event lets lists do beyond matched play, such as "Legends allowed · Restrictions off: Warlord", or "Matched
 * play" for none. An older event reads as what it accepts in effect. Null for an event that fixed no format.
 */
export function leagueAllowances(league: {
  format: TableShape | null
  rosterLimit: number | null
  allowances: readonly LeagueAllowance[] | null
}) {
  if (!league.format || !league.rosterLimit) return null
  const allowed = effectiveLeagueAllowances(league.format, league.rosterLimit, league.allowances)
  const chosen = leagueAllowanceOptions(league.format, league.rosterLimit).filter((option) => allowed.includes(option.id))
  const datasheets = chosen.filter((option) => isNonMatchedPlayAllowance(option.id)).map((option) => option.label)
  const off = chosen.filter((option) => !isNonMatchedPlayAllowance(option.id)).map((option) => option.label)
  return (
    [datasheets.length ? `${formatList(datasheets)} allowed` : null, off.length ? `Restrictions off: ${off.join(', ')}` : null]
      .filter(Boolean)
      .join(' · ') || 'Matched play'
  )
}

/** How many players are in, against the limit when there is one. */
export function leaguePlayers(league: Host, accepted: number) {
  const { playerLimit } = entryRules(league)
  return `${accepted}${playerLimit ? ` of ${playerLimit}` : ''} ${accepted === 1 && !playerLimit ? 'player' : 'players'}`
}

/** Where the open event stands for someone not in it: still taking players, full, or past its reveal. */
export function leaguePhase(league: Host & { revealedAt: number | null }, accepted: number, occupied: number) {
  if (league.revealedAt) return { label: 'Rosters revealed', tint: 'text-achieved' }
  return leagueRegistrationFull(entryRules(league), accepted, occupied)
    ? { label: 'Registration full', tint: 'text-dim' }
    : { label: 'Registration open', tint: 'text-parchment' }
}

/**
 * What happens next at an event's stage. The organizer reads the step the reveal waits on; a player's own step before
 * the reveal is already on the status card and the readiness panel, so a player reads one only once their side can
 * start a battle.
 */
export function leagueNextStep(
  stage: LeagueStage,
  viewer: { organizer: boolean; canPlay: boolean },
  league: Pick<League, 'format' | 'club'>,
) {
  const shape = leagueTableShape(league.format)
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
      playing: 'Players start their battles from this page. Finished ones fill the results table.',
      results: `To play again with fresh rosters, start a new ${leagueNoun(league).noun}.`,
    }[stage]
  return (stage === 'playing' || stage === 'results') && viewer.canPlay
    ? `Start a ${TABLE_SHAPE_LABELS[shape].count} battle from your card. Finished battles fill the results table.`
    : null
}

/** Where an event lives: a club's sealed game under its club, a tournament under tournaments. */
export function eventPath(league: { token: string; club?: { token: string } | null }) {
  return league.club ? `/clubs/${league.club.token}/games/${league.token}` : `/tournaments/${league.token}`
}

/** The same address as `eventPath`, as a route link, with what the page should open on arrival. */
export function eventLink(league: { token: string; club?: { token: string } | null }, search: { start?: true; choose?: true } = {}) {
  return league.club
    ? ({ to: '/clubs/$token/games/$game', params: { token: league.club.token, game: league.token }, search } as const)
    : ({ to: '/tournaments/$token', params: { token: league.token }, search } as const)
}
