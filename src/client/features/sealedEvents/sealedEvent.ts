import { useQueryClient } from '@tanstack/react-query'
import {
  alliedSealedEventRosterLimit,
  effectiveSealedEventAllowances,
  isNonMatchedPlayAllowance,
  sealedEventAllowanceOptions,
  sealedEventTableShape,
  sealedEventRegistrationFull,
  sealedEventSeatPoints,
  sealedEventTitle,
  type SealedEventAdmission,
  type SealedEventAllowance,
  type SealedEventEntryView,
  type SealedEventStage,
} from '../../../core/sealedEvent'
import { pointsLabel } from '../../../core/battle'
import { TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import type { openSealedEvent } from '../../functions'
import { sealedEventReadsKey, sealedEventsKey, outdatedSealedEventEntriesKey } from '../../queries'
import { formatList } from '../../text'
import { groupBy } from '../../../core/collections'

export type SealedEvent = NonNullable<Awaited<ReturnType<typeof openSealedEvent>>>

export function useSealedEventRefresh(token: string) {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sealedEventReadsKey(token) }),
      queryClient.invalidateQueries({ queryKey: sealedEventsKey() }),
      queryClient.invalidateQueries({ queryKey: outdatedSealedEventEntriesKey() }),
    ])
  }
}

/** What players call a sealed event: a group's is its casual hidden-list game, never a tournament. */
export function sealedEventNoun(sealedEvent: { group?: unknown }) {
  return sealedEvent.group
    ? ({ noun: 'hidden-list game', Noun: 'Hidden-list game' } as const)
    : ({ noun: 'tournament', Noun: 'Tournament' } as const)
}

/** Names a few people outright and counts the rest, so a long waiting list stays one line. */
export function namesPhrase(names: string[]) {
  if (names.length <= 3) return formatList(names)
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`
}

/** Which side of a 2v1 table an entry's assigned size puts it on. */
export function soloOrAllied(sealedEvent: Pick<SealedEvent, 'format' | 'rosterLimit'>, entry: Pick<SealedEventEntryView, 'requiredLimit'>) {
  if (sealedEvent.format !== '2v1' || sealedEvent.rosterLimit === null || entry.requiredLimit === null) return null
  if (entry.requiredLimit === sealedEvent.rosterLimit) return 'solo'
  return entry.requiredLimit === alliedSealedEventRosterLimit(sealedEvent.rosterLimit) ? 'allied' : null
}

/** The fixed pairs of an event in the order their first member joined, each with its entries. */
export function doublesTeams<T extends Pick<SealedEventEntryView, 'teamId' | 'status'>>(entries: readonly T[]) {
  const teams = groupBy(
    entries.filter((entry) => entry.status === 'accepted' && entry.teamId),
    (entry) => entry.teamId!,
  )
  return [...teams].map(([id, members]) => ({ id, members }))
}

/** What each side of a 2v1 means at the table, said where the side is named rather than left to be guessed. */
export function sideGroups(
  sealedEvent: Pick<SealedEvent, 'rosterLimit' | 'soloPoints' | 'allyPoints' | 'sharedPoints'>,
): Record<'solo' | 'allied' | 'unsized', { title: string; detail?: string }> {
  const ally = sealedEventSeatPoints(sealedEvent, false) ?? 0
  return {
    solo: { title: `Solo · ${pointsLabel(sealedEventSeatPoints(sealedEvent, true) ?? 0)}`, detail: 'Plays alone against a pair.' },
    allied: {
      title: sealedEvent.sharedPoints ? `Allied · ${pointsLabel(ally * 2)} shared` : `Allied · ${pointsLabel(ally)}`,
      detail: sealedEvent.sharedPoints ? 'Plays beside another ally, splitting the points between them.' : 'Plays beside another ally.',
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
export function entrantGroups<T extends Pick<SealedEventEntryView, 'teamId' | 'status' | 'requiredLimit'>>(
  sealedEvent: Pick<SealedEvent, 'format' | 'rosterLimit' | 'soloPoints' | 'allyPoints' | 'sharedPoints'>,
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
  if (sealedEvent.format === '2v2')
    return [
      ...pairs(accepted, 'Team', 'team'),
      { key: 'unpaired', title: 'Waiting for a teammate', entries: accepted.filter((entry) => !entry.teamId) },
    ].filter((group) => group.entries.length)
  if (sealedEvent.format !== '2v1') return [{ key: 'all', entries: [...accepted] }]
  const sides = sideGroups(sealedEvent)
  const on = (side: 'solo' | 'allied' | 'unsized') => accepted.filter((entry) => (soloOrAllied(sealedEvent, entry) ?? 'unsized') === side)
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
export function entryProgress(sealedEvent: Pick<SealedEvent, 'format' | 'group'>, stage: EntryStage): EntryStep[] {
  const assignment =
    sealedEvent.format === '2v1' ? 'Play solo or get an ally' : sealedEvent.format === '2v2' ? 'Get paired with a teammate' : null
  const stages: { stage: EntryStage; label: string }[] = [
    { stage: 'join', label: `Join the ${sealedEventNoun(sealedEvent).noun}` },
    ...(assignment ? [{ stage: 'assign' as const, label: assignment }] : []),
    { stage: 'seal', label: 'Seal your roster' },
    { stage: 'reveal', label: 'Rosters revealed' },
    { stage: 'play', label: 'Play your games' },
  ]
  const current = stages.findIndex((candidate) => candidate.stage === stage)
  return stages.map(({ label }, index) => ({ label, state: index < current ? 'done' : index === current ? 'current' : 'upcoming' }))
}

/** An event's host as the helpers here read it: a tournament with its own entry rules, or a group's game. */
type Host = { tournament: { admission: SealedEventAdmission; playerLimit: number | null } | null }

/** Who gets in and how many: a tournament's own rules, while a hidden-list game lets its group's members straight in, with no limit. */
export function entryRules({ tournament }: Host) {
  return { admission: tournament?.admission ?? ('automatic' as const), playerLimit: tournament?.playerLimit ?? null }
}

/** Who runs an event, as its copy names them: a tournament's owner, or the group whose game it is. */
export function organizerName(sealedEvent: { tournament: { ownerName: string } | null; group: { name: string } | null }) {
  return sealedEvent.tournament?.ownerName ?? sealedEvent.group?.name ?? ''
}

type NamedEvent = {
  tournament: { name: string } | null
  group: { name: string } | null
  format?: TableShape | null
  rosterLimit?: number | null
  pointsBudget?: number | null
  soloPoints?: number | null
  allyPoints?: number | null
  sharedPoints?: boolean
}

/** An event's name where its group is in view: a tournament's own name, or what a hidden-list game plays. */
export const eventName = (event: NamedEvent) => namedEvent(event, false)

/** An event's name on its own, such as on Home or an invite: a hidden-list game reads after its group. */
export const eventFullName = (event: NamedEvent) => namedEvent(event, true)

function namedEvent(event: NamedEvent, withGroup: boolean) {
  return sealedEventTitle(
    {
      tournament: event.tournament,
      group: event.group,
      format: event.format ?? null,
      rosterLimit: event.rosterLimit ?? null,
      pointsBudget: event.pointsBudget,
      soloPoints: event.soloPoints,
      allyPoints: event.allyPoints,
      sharedPoints: event.sharedPoints,
    },
    { withGroup },
  )
}

/**
 * What an event lets lists do beyond matched play, such as "Legends allowed · Restrictions off: Warlord", or "Matched
 * play" for none. An older event reads as what it accepts in effect. Null for an event that fixed no format.
 */
export function sealedEventAllowances(sealedEvent: {
  format: TableShape | null
  rosterLimit: number | null
  allowances: readonly SealedEventAllowance[] | null
}) {
  if (!sealedEvent.format || !sealedEvent.rosterLimit) return null
  const allowed = effectiveSealedEventAllowances(sealedEvent.format, sealedEvent.rosterLimit, sealedEvent.allowances)
  const chosen = sealedEventAllowanceOptions(sealedEvent.format, sealedEvent.rosterLimit).filter((option) => allowed.includes(option.id))
  const datasheets = chosen.filter((option) => isNonMatchedPlayAllowance(option.id)).map((option) => option.label)
  const off = chosen.filter((option) => !isNonMatchedPlayAllowance(option.id)).map((option) => option.label)
  return (
    [datasheets.length ? `${formatList(datasheets)} allowed` : null, off.length ? `Restrictions off: ${off.join(', ')}` : null]
      .filter(Boolean)
      .join(' · ') || 'Matched play'
  )
}

/** How many players are in, against the limit when there is one. */
export function sealedEventPlayers(sealedEvent: Host, accepted: number) {
  const { playerLimit } = entryRules(sealedEvent)
  return `${accepted}${playerLimit ? ` of ${playerLimit}` : ''} ${accepted === 1 && !playerLimit ? 'player' : 'players'}`
}

/** Where the open event stands for someone not in it: still taking players, full, or past its reveal. */
export function sealedEventPhase(sealedEvent: Host & { revealedAt: number | null }, accepted: number, occupied: number) {
  if (sealedEvent.revealedAt) return { label: 'Rosters revealed', tint: 'text-achieved' }
  return sealedEventRegistrationFull(entryRules(sealedEvent), accepted, occupied)
    ? { label: 'Registration full', tint: 'text-dim' }
    : { label: 'Registration open', tint: 'text-parchment' }
}

/**
 * What happens next at an event's stage. The organizer reads the step the reveal waits on; a player's own step before
 * the reveal is already on the status card and the readiness panel, so a player reads one only once their side can
 * start a battle.
 */
export function sealedEventNextStep(
  stage: SealedEventStage,
  viewer: { organizer: boolean; canPlay: boolean },
  sealedEvent: Pick<SealedEvent, 'format' | 'group'>,
) {
  const shape = sealedEventTableShape(sealedEvent.format)
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
      results: `To play again with fresh rosters, start a new ${sealedEventNoun(sealedEvent).noun}.`,
    }[stage]
  return (stage === 'playing' || stage === 'results') && viewer.canPlay
    ? `Start a ${TABLE_SHAPE_LABELS[shape].count} battle from your card. Finished battles fill the results table.`
    : null
}

/** Where an event lives: a group's hidden-list game under its group, a tournament under tournaments. */
export function eventPath(sealedEvent: { token: string; group?: { token: string } | null }) {
  return sealedEvent.group ? `/groups/${sealedEvent.group.token}/games/${sealedEvent.token}` : `/tournaments/${sealedEvent.token}`
}

/** The same address as `eventPath`, as a route link, with what the page should open on arrival. */
export function eventLink(sealedEvent: { token: string; group?: { token: string } | null }, search: { start?: true; choose?: true } = {}) {
  return sealedEvent.group
    ? ({ to: '/groups/$token/games/$game', params: { token: sealedEvent.group.token, game: sealedEvent.token }, search } as const)
    : ({ to: '/tournaments/$token', params: { token: sealedEvent.token }, search } as const)
}
