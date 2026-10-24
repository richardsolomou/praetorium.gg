import { countBy, groupBy } from './collections'
import { migratedEditionId, migratedEditionPick } from './editionMigrations'
import { attachedUnitCount } from './attachedUnits'
import type { TableShape } from './tableShape'
import type { FormatRuleId, Roster } from './battle'
import type { RosterPick } from './roster'
import { teamDisposition, teamDispositionChoices } from './teamDisposition'
import { teamWarlord, teamWarlordChoices } from './teamWarlord'
import { formatList } from './text'

export const LEAGUE_VISIBILITIES = ['public', 'private'] as const
export type LeagueVisibility = (typeof LEAGUE_VISIBILITIES)[number]

export const LEAGUE_ADMISSIONS = ['automatic', 'approval'] as const
export type LeagueAdmission = (typeof LEAGUE_ADMISSIONS)[number]

export const LEAGUE_ENTRY_STATUSES = ['pending', 'accepted', 'rejected'] as const
export type LeagueEntryStatus = (typeof LEAGUE_ENTRY_STATUSES)[number]

export const LEAGUE_DEFAULT_ROSTER_LIMIT = 2_000
export const LEAGUE_TEAM_ROSTER_LIMITS = [2_000] as const

export function leagueTableShape(format: TableShape | null | undefined): TableShape {
  return format ?? '1v1'
}

export function alliedLeagueRosterLimit(rosterLimit: number) {
  return rosterLimit / 2
}

/**
 * How a shape splits an event's roster size between the players on a side.
 *
 * A 1v1 splits nothing, so it has no phrasing here and each surface prints the size in
 * whatever density it has room for.
 */
export function leagueRosterSplit(format: TableShape, rosterLimit: number) {
  if (format === '2v1')
    return `${rosterLimit.toLocaleString('en')} solo / ${alliedLeagueRosterLimit(rosterLimit).toLocaleString('en')} allied`
  if (format === '2v2')
    return `${rosterLimit.toLocaleString('en')} per force / ${alliedLeagueRosterLimit(rosterLimit).toLocaleString('en')} each`
  return null
}

export function requiredLeagueRosterLimit(
  format: TableShape | null,
  eventLimit: number | null,
  entryAssignment: number | null,
  teamId: string | null = null,
) {
  if (format === '1v1') return eventLimit
  if (format === '2v1') return entryAssignment
  if (format === '2v2') return teamId === null || eventLimit === null ? null : alliedLeagueRosterLimit(eventLimit)
  return null
}

export const LEAGUE_NAME_MAX_LENGTH = 100
export const LEAGUE_DESCRIPTION_MAX_LENGTH = 2_000
export const LEAGUE_MEMBER_MAX = 128
export const LEAGUE_MEMBER_MIN = 2

export type LeagueEntryView = {
  userId: string
  name: string
  image: string | null
  status: LeagueEntryStatus
  joinedAt: number
  submitted: boolean
  rosterName: string | null
  requiredLimit: number | null
  sealedLimit: number | null
  teamId: string | null
  dispositionOwed: boolean
  warlordOwed: boolean
}

/** The fewest places each table shape can seat. */
export const LEAGUE_SHAPE_PLACES: Record<TableShape, number> = { '1v1': 2, '2v1': 3, '2v2': 4 }

/** The lowest player limit an event of this shape can have, never below its accepted entrants and even for doubles, whose teams are pairs. */
export function leagueMinimumPlaces(format: TableShape | null, accepted = 0) {
  const shape = leagueTableShape(format)
  const needed = Math.max(LEAGUE_SHAPE_PLACES[shape], accepted)
  return shape === '2v2' ? Math.ceil(needed / 2) * 2 : needed
}

/** Whether a player limit can seat an event of this shape; no limit seats any. */
export function leaguePlacesSeat(format: TableShape | null, playerLimit: number | null, accepted = 0) {
  if (playerLimit === null) return true
  return playerLimit >= leagueMinimumPlaces(format, accepted) && (leagueTableShape(format) !== '2v2' || playerLimit % 2 === 0)
}

/** Whether an open event has room for another request, as the join command decides it. */
export function leagueRegistrationFull(
  league: { admission: LeagueAdmission; playerLimit: number | null },
  acceptedCount: number,
  occupiedCount: number,
  memberLimit: number = LEAGUE_MEMBER_MAX,
) {
  return league.admission === 'approval' && league.playerLimit !== null
    ? acceptedCount >= league.playerLimit || occupiedCount >= memberLimit
    : occupiedCount >= (league.playerLimit ?? memberLimit)
}

/** The facts about an entry that reveal readiness reads; `requiredLimit` is the organizer's 2v1 assignment. */
export type LeagueRevealEntry = {
  userId: string
  status: LeagueEntryStatus
  submitted: boolean
  requiredLimit: number | null
  teamId: string | null
  /** Whether this entrant's team has sealed both lists without settling the one Force Disposition it plays. */
  dispositionOwed: boolean
  /** Whether this entrant's team has sealed both lists without settling whose Warlord leads it. */
  warlordOwed: boolean
}

/**
 * Every structural condition an event's shape puts on reveal, each with the entrants still holding it up.
 *
 * The reveal command refuses unless every check is done, and the organizer reads the same checks as a
 * list. The command still inspects the sealed rosters themselves, so a done list can meet a Warlord refusal.
 * A player limit caps entry; it does not hold the reveal back.
 */
export type LeagueRevealCheck =
  | { step: 'places'; done: boolean; accepted: number }
  | { step: 'requests'; done: boolean; waiting: string[] }
  /** `short` marks a size or pairing check that only more players can satisfy, whatever the organizer assigns. */
  | { step: 'sizes'; done: boolean; waiting: string[]; solo: number; allied: number; short: boolean }
  | { step: 'teams'; done: boolean; waiting: string[]; short: boolean }
  | { step: 'lists'; done: boolean; waiting: string[] }
  | { step: 'dispositions'; done: boolean; waiting: string[] }
  | { step: 'warlords'; done: boolean; waiting: string[] }

export function leagueRevealChecklist(
  event: { format: TableShape | null; rosterLimit: number | null },
  entries: readonly LeagueRevealEntry[],
): LeagueRevealCheck[] {
  const accepted = entries.filter((entry) => entry.status === 'accepted')
  const checks: LeagueRevealCheck[] = [{ step: 'places', done: accepted.length > 0, accepted: accepted.length }]
  if (event.format === '2v2') {
    const pending = entries.filter((entry) => entry.status === 'pending').map((entry) => entry.userId)
    checks.push({ step: 'requests', done: pending.length === 0, waiting: pending })
    const teamSizes = countBy(
      accepted.flatMap((entry) => (entry.teamId ? [entry.teamId] : [])),
      (teamId) => teamId,
    )
    const unpaired = accepted.filter((entry) => !entry.teamId || teamSizes.get(entry.teamId) !== 2).map((entry) => entry.userId)
    const short = accepted.length < 4 || accepted.length % 2 === 1
    checks.push({ step: 'teams', done: !short && unpaired.length === 0, waiting: unpaired, short })
  }
  if (event.format === '2v1') {
    const alliedLimit = alliedLeagueRosterLimit(event.rosterLimit ?? 0)
    const solo = accepted.filter((entry) => entry.requiredLimit !== null && entry.requiredLimit === event.rosterLimit).length
    const allied = accepted.filter((entry) => entry.requiredLimit !== null && entry.requiredLimit === alliedLimit).length
    const unsized = accepted.filter((entry) => entry.requiredLimit === null).map((entry) => entry.userId)
    // One solo player and two allies are the fewest a 2v1 seats.
    const short = accepted.length < 3
    checks.push({ step: 'sizes', done: unsized.length === 0 && solo > 0 && allied >= 2, waiting: unsized, solo, allied, short })
    const allies = accepted.filter((entry) => entry.requiredLimit !== null && entry.requiredLimit === alliedLimit)
    const unpaired = allies.filter((entry) => !entry.teamId || allies.filter((ally) => ally.teamId === entry.teamId).length !== 2)
    checks.push({ step: 'teams', done: unpaired.length === 0, waiting: unpaired.map((entry) => entry.userId), short })
  }
  const unsealed = accepted.filter((entry) => !entry.submitted).map((entry) => entry.userId)
  checks.push({ step: 'lists', done: unsealed.length === 0, waiting: unsealed })
  if (event.format === '2v1' || event.format === '2v2') {
    const owing = accepted.filter((entry) => entry.dispositionOwed).map((entry) => entry.userId)
    checks.push({ step: 'dispositions', done: owing.length === 0, waiting: owing })
    const leaderless = accepted.filter((entry) => entry.warlordOwed).map((entry) => entry.userId)
    checks.push({ step: 'warlords', done: leaderless.length === 0, waiting: leaderless })
  }
  return checks
}

/**
 * Where an event stands, from no players to a results table. Before the reveal it is the first reveal check still
 * holding the event up, so the page names the same step the reveal command would refuse on.
 */
export type LeagueStage =
  | 'empty'
  | 'approving'
  | 'recruiting'
  | 'sizing'
  | 'pairing'
  | 'sealing'
  | 'choosing'
  | 'ready'
  | 'playing'
  | 'results'

const STAGE_FOR_CHECK = {
  places: 'empty',
  requests: 'approving',
  sizes: 'sizing',
  teams: 'pairing',
  lists: 'sealing',
  dispositions: 'choosing',
  warlords: 'choosing',
} as const satisfies Record<LeagueRevealCheck['step'], LeagueStage>

export function leagueStage(
  event: { format: TableShape | null; rosterLimit: number | null; revealedAt: number | null },
  entries: readonly LeagueRevealEntry[],
  played: boolean,
): LeagueStage {
  if (event.revealedAt) return played ? 'results' : 'playing'
  // The reveal would turn waiting requests down, so answering them comes first even when nothing else holds it up.
  if (entries.some((entry) => entry.status === 'pending')) return 'approving'
  const held = leagueRevealChecklist(event, entries).find((check) => !check.done)
  if (!held) return 'ready'
  if ((held.step === 'sizes' || held.step === 'teams') && held.short) return 'recruiting'
  return STAGE_FOR_CHECK[held.step]
}

/** The most admins one league can have beside its owner. */
export const LEAGUE_ADMIN_MAX = 16

/** Whether someone runs this league: its owner, or an admin the owner chose. */
export function isLeagueOrganizer(league: { ownerId: string }, adminIds: readonly string[], userId: string | null) {
  return userId !== null && (userId === league.ownerId || adminIds.includes(userId))
}

/** Who may open a ready event's lists: the organizer, or anyone playing in it, so a group need not wait for one person. */
export function mayRevealLeague(isOwner: boolean, entry: { status: LeagueEntryStatus } | null) {
  return isOwner || entry?.status === 'accepted'
}

export function visibleLeagueEntries<T extends LeagueEntryView>(entries: readonly T[], organizer: boolean, viewerId: string | null) {
  return entries.filter((entry) => entry.status === 'accepted' || organizer || entry.userId === viewerId)
}

export function matchesSealedLeagueRoster(
  saved: {
    name: string
    catalogueId: string
    detachmentIds: readonly string[]
    disposition: string | null
    limit: number
    picks: readonly RosterPick[]
    waivedRules: readonly FormatRuleId[]
    remindersEnabled?: boolean
  },
  sealed: Roster,
) {
  const built = sealed.built
  return (
    !!built?.picks &&
    (!saved.name || saved.name === sealed.name) &&
    // A list sealed on a rules version that later folded into another is still the list saved now.
    saved.catalogueId === migratedEditionId(built.catalogueId) &&
    saved.limit === built.limit &&
    saved.disposition === built.disposition &&
    JSON.stringify(saved.detachmentIds) === JSON.stringify(built.detachmentIds ?? []) &&
    JSON.stringify(saved.picks) === JSON.stringify(built.picks.map((pick) => migratedEditionPick(pick, built.catalogueId))) &&
    JSON.stringify(saved.waivedRules) === JSON.stringify(built.waivedRules ?? []) &&
    (saved.remindersEnabled ?? true) === (sealed.remindersEnabled ?? true)
  )
}

/** The two facts about an entry that decide whether its reader is on the same side of the table. */
export type LeagueAllyEntry = {
  userId: string
  status: LeagueEntryStatus
  requiredLimit: number | null
  teamId: string | null
}

/** Before reveal, doubles teammates and 2v1 allies may read each other’s sealed rosters; solo and 1v1 entrants cannot. */
export function readsAlliedLeagueRoster(
  format: TableShape | null,
  eventLimit: number | null,
  reader: LeagueAllyEntry | null,
  sealed: LeagueAllyEntry,
) {
  if (!reader || reader.userId === sealed.userId) return false
  if (reader.status !== 'accepted' || sealed.status !== 'accepted') return false
  if (format === '2v2') return reader.teamId !== null && reader.teamId === sealed.teamId
  if (format === '2v1') {
    if (eventLimit === null) return false
    const allied = alliedLeagueRosterLimit(eventLimit)
    return reader.requiredLimit === allied && sealed.requiredLimit === allied
  }
  return false
}

/** Before reveal, an entrant reads their own sealed roster and any ally's. */
export function readsSealedLeagueRoster(
  format: TableShape | null,
  eventLimit: number | null,
  reader: LeagueAllyEntry | null,
  sealed: LeagueAllyEntry,
) {
  return reader?.userId === sealed.userId || readsAlliedLeagueRoster(format, eventLimit, reader, sealed)
}

/**
 * A fixed pair's sealed choices: the Force Disposition its lists offer and the card it plays, and the entrants whose
 * lists name a Warlord and whose leads it. Each is null while the pair still owes it.
 */
export type LeagueTeam = {
  id: string
  userIds: string[]
  choices: string[]
  disposition: string | null
  owed: boolean
  warlordChoices: string[]
  warlord: string | null
  warlordOwed: boolean
}

/**
 * Every fixed pair in an event, with the one Force Disposition it plays and the one Warlord it fields.
 *
 * A pair chooses only once both lists are sealed, from every card either list's detachments offered
 * and from the Warlord each list names, so the choices are made before reveal shows them the other
 * side. A pick the sealed lists no longer offer counts for nothing, so replacing a list cannot leave
 * a card neither list brings.
 */
export function leagueTeams(
  entries: readonly { userId: string; status: LeagueEntryStatus; teamId: string | null; roster: Roster | null }[],
  picks: ReadonlyMap<string, string>,
  warlordPicks: ReadonlyMap<string, string> = new Map(),
): LeagueTeam[] {
  const members = groupBy(
    entries.filter((entry) => entry.status === 'accepted' && entry.teamId),
    (entry) => entry.teamId!,
  )
  return [...members].map(([id, team]) => {
    const sealed = team.length === 2 && team.every((entry) => entry.roster)
    const rosters = team.map((entry) => entry.roster)
    const choices = sealed ? teamDispositionChoices(rosters) : []
    const disposition = sealed ? teamDisposition(rosters, picks.get(id) ?? null) : null
    const armies = team.map((entry) => ({ id: entry.userId, roster: entry.roster }))
    const warlordChoices = sealed ? teamWarlordChoices(armies) : []
    const warlord = sealed ? teamWarlord(armies, warlordPicks.get(id) ?? null) : null
    return {
      id,
      userIds: team.map((entry) => entry.userId),
      choices,
      disposition,
      owed: choices.length > 1 && disposition === null,
      warlordChoices,
      warlord,
      warlordOwed: warlordChoices.length > 1 && warlord === null,
    }
  })
}

const sealedWarlords = (snapshots: readonly Roster[]) =>
  snapshots.flatMap((snapshot) => snapshot.built?.units.filter((unit) => unit.warlord) ?? [])
const warlordEligible = (unit: NonNullable<Roster['built']>['units'][number], legacy = false) =>
  unit.warlordEligible ?? (legacy || unit.group === 'character' || unit.group === 'epic-hero')

export function leagueWarlords(snapshots: readonly Roster[], legacy = false) {
  const selected = sealedWarlords(snapshots)
  return { count: selected.length, eligible: selected.every((unit) => warlordEligible(unit, legacy)) }
}

/**
 * Whether a sealed list names the one eligible Warlord every list needs. Allies each bring their own and choose whose
 * leads their side, so a doubles list is held to the same rule as any other.
 */
export function leagueWarlordValid(roster: Roster, legacy = false) {
  const selected = leagueWarlords([roster], legacy)
  return selected.eligible && selected.count === 1
}

/** Explains why a roster's Warlords were refused at seal. Only call it after a refusal. */
export function leagueWarlordRefusal(roster: Roster) {
  const selected = sealedWarlords([roster])
  const ineligible = selected.find((unit) => !warlordEligible(unit))
  if (ineligible) return `${ineligible.name} can’t be your Warlord — only a Character or Epic Hero can`
  if (selected.length > 1) return `Choose one Warlord: ${formatList(selected.map((unit) => unit.name))} are marked`
  return 'Choose a Warlord: this list has none'
}

/** What a roster card shows of a revealed list. */
export type LeagueArmy = {
  name: string
  catalogueId: string | null
  /** Each detachment's id with the name it was sealed under, so a card names it without today's catalogue. */
  detachments: { id: string; name: string }[]
  disposition: string | null
  pointsBudget: number | null
  waivedRules: FormatRuleId[]
  points: number | null
  limit: number | null
  unitCount: number
}

export function leagueArmy(roster: Roster): LeagueArmy {
  const built = roster.built
  if (!built)
    return {
      name: roster.name,
      catalogueId: null,
      detachments: [],
      disposition: null,
      pointsBudget: null,
      waivedRules: [],
      points: null,
      limit: null,
      unitCount: 0,
    }
  return {
    name: roster.name,
    catalogueId: built.catalogueId,
    detachments: sealedDetachments(built),
    disposition: built.disposition,
    pointsBudget: built.pointsBudget ?? null,
    waivedRules: built.waivedRules ?? [],
    points: built.units.reduce((total, unit) => total + unit.points, 0),
    limit: built.limit,
    unitCount: attachedUnitCount(built.units),
  }
}

function sealedDetachments(built: NonNullable<Roster['built']>) {
  const names = built.detachments?.map((detachment) => detachment.name) ?? (built.detachment ? [built.detachment] : [])
  return (built.detachmentIds ?? []).map((id, index) => ({ id, name: names[index] ?? id }))
}
