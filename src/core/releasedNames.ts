/**
 * Names the previous release stored and sent before groups and sealed events had theirs. For one release they still
 * arrive from its server, open tabs and saved device work, so each boundary translates them here, and the module
 * rewrites the rows it stored under them.
 */
const COMMAND_KINDS = new Map([
  ['set-battle-club', 'set-battle-group'],
  ['lock-league-rosters', 'lock-sealed-event-rosters'],
])
const COMMAND_FIELDS = new Map([
  ['clubId', 'groupId'],
  ['leagueToken', 'sealedEventToken'],
])
const RELEASED_COMMAND_KINDS = new Map(Array.from(COMMAND_KINDS, ([released, current]) => [current, released]))
const RELEASED_COMMAND_FIELDS = new Map(Array.from(COMMAND_FIELDS, ([released, current]) => [current, released]))

export const RELEASED_OFFLINE_KINDS = new Map([
  ['createLeague', 'createSealedEvent'],
  ['joinLeague', 'joinSealedEvent'],
  ['addLeagueEntrants', 'addSealedEventEntrants'],
  ['admitLeagueEntries', 'admitSealedEventEntries'],
  ['moderateLeagueEntry', 'moderateSealedEventEntry'],
  ['submitLeagueRoster', 'submitSealedEventRoster'],
  ['setLeagueTeamDisposition', 'setSealedEventTeamDisposition'],
  ['setLeagueTeamWarlord', 'setSealedEventTeamWarlord'],
  ['revealLeague', 'revealSealedEvent'],
  ['unsealLeagueRoster', 'unsealSealedEventRoster'],
  ['assignLeagueRosterRequirement', 'assignSealedEventRosterRequirement'],
  ['assignLeagueTeam', 'assignSealedEventTeam'],
  ['chooseLeagueSide', 'chooseSealedEventSide'],
  ['updateLeague', 'updateSealedEvent'],
  ['deleteLeague', 'deleteSealedEvent'],
  ['createLeagueBattle', 'createSealedEventBattle'],
])
export const RELEASED_RESOURCE_PREFIX = ['league:', 'sealed-event:'] as const
const OFFLINE_IDENTIFIERS = new Map([
  ['leagueId', 'tournamentId'],
  ['leagueToken', 'tournamentToken'],
])
export const RELEASED_ACHIEVEMENTS = new Map([
  ['club-night', 'group-night'],
  ['club-stalwart', 'group-stalwart'],
  ['pillar-of-the-club', 'pillar-of-the-group'],
])
export const RELEASED_TASKS = new Map([['league', 'tournament']])
export const RELEASED_SCOPES = new Map([
  ['clubs', 'groups'],
  ['leagues', 'sealed-events'],
])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function renameCommand(value: unknown, kinds: Map<string, string>, fields: Map<string, string>) {
  if (!isRecord(value) || typeof value.kind !== 'string' || !kinds.has(value.kind)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => (key === 'kind' ? [key, kinds.get(field as string)] : [fields.get(key) ?? key, field])),
  )
}

/** A command as this release names it, whichever release wrote it. */
export const currentCommand = (value: unknown) => renameCommand(value, COMMAND_KINDS, COMMAND_FIELDS)
/** A command as the released server reads it. */
export const releasedCommand = (value: unknown) => renameCommand(value, RELEASED_COMMAND_KINDS, RELEASED_COMMAND_FIELDS)

/** Every command anywhere in saved device data, as this release names it. */
export function currentCommands(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(currentCommands)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(currentCommand(value) as Record<string, unknown>).map(([key, field]) => [key, currentCommands(field)]),
  )
}

/** A queued offline action's kind and identifiers as this release names them. */
export function currentOfflineAction(value: unknown) {
  if (!isRecord(value)) return value
  const identifiers = isRecord(value.identifiers)
    ? Object.fromEntries(Object.entries(value.identifiers).map(([key, id]) => [OFFLINE_IDENTIFIERS.get(key) ?? key, id]))
    : value.identifiers
  const kind = typeof value.kind === 'string' ? (RELEASED_OFFLINE_KINDS.get(value.kind) ?? value.kind) : value.kind
  return { ...value, kind, ...(identifiers === undefined ? {} : { identifiers }) }
}

export const currentResource = (resource: string) =>
  resource.startsWith(RELEASED_RESOURCE_PREFIX[0])
    ? RELEASED_RESOURCE_PREFIX[1] + resource.slice(RELEASED_RESOURCE_PREFIX[0].length)
    : resource

export const currentTask = (task: unknown) => (typeof task === 'string' ? (RELEASED_TASKS.get(task) ?? task) : task)
