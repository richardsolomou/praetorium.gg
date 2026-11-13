import { z } from 'zod'
import { TABLE_SHAPES } from '../../core/tableShape'
import {
  SEALED_EVENT_ADMISSIONS,
  SEALED_EVENT_ENTRY_STATUSES,
  SEALED_EVENT_VISIBILITIES,
  parseSealedEventAllowances,
} from '../../core/sealedEvent'
import { GROUP_MEMBER_STATUSES, GROUP_ROLES } from '../../core/group'
import { sealedEventRosterSharingSchema } from '../../contracts/sealedEventRosterSharing'
import type { SpacetimeBase } from './client'

const tournament = z.object({
  token: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string(),
  visibility: z.enum(SEALED_EVENT_VISIBILITIES),
  admission: z.enum(SEALED_EVENT_ADMISSIONS),
  playerLimit: z.number().int().nullable(),
  createdAt: z.number().int(),
  adminIds: z.array(z.string()),
})
// Absent from a module released before events set points per army.
const eventPoints = z.number().int().nullable()
const eventSharedPoints = z
  .boolean()
  .nullish()
  .transform((value) => value ?? false)

const sealedEvent = z.object({
  token: z.string(),
  format: z.enum(TABLE_SHAPES).nullable(),
  rosterLimit: z.number().int().nullable(),
  createdAt: z.number().int(),
  revealedAt: z.number().int().nullable(),
  revealedBy: z.string().nullable(),
  allowances: z
    .string()
    .nullable()
    .transform((value) => (value === null ? null : parseSealedEventAllowances(value))),
  rounds: z.number().int().nullable(),
  pointsBudget: z.number().int().nullable(),
  soloPoints: eventPoints,
  allyPoints: eventPoints,
  sharedPoints: eventSharedPoints,
  scheduleFirst: z
    .boolean()
    .nullable()
    .transform((value) => value ?? false),
  roundEndsAt: z.number().int().nullable(),
  playsAt: z.number().int().nullable(),
  sealBy: z.number().int().nullable(),
  remindedAt: z.number().int().nullable(),
})
/** Who hosts an event: a tournament, or the group whose game it is, which `token` addresses either way. */
const eventHost = {
  kind: z.enum(['tournament', 'group']),
  token: z.string(),
  tournament: tournament.nullable(),
  group: z.object({ token: z.string(), name: z.string() }).nullable(),
  event: sealedEvent,
}
const sealedEventPairing = z.object({
  key: z.string(),
  round: z.number().int(),
  table: z.number().int(),
  aId: z.string(),
  bId: z.string().nullable(),
  battleToken: z.string().nullable(),
})
const sealedEventEntry = z.object({
  key: z.string(),
  eventId: z.string(),
  userId: z.string(),
  status: z.enum(SEALED_EVENT_ENTRY_STATUSES),
  joinedAt: z.number().int(),
  rosterId: z.string().nullable(),
  rosterName: z.string().nullable(),
  rosterSnapshot: z.string().nullable(),
  submittedAt: z.number().int().nullable(),
  requiredLimit: z.number().int().nullable(),
  teamId: z.string().nullable(),
  droppedAt: z.number().int().nullable(),
  checkedInAt: z.number().int().nullable(),
})
const sealedEventRecord = z.object({
  ...eventHost,
  organizerIds: z.array(z.string()),
  entries: z.array(sealedEventEntry),
  teams: z.array(z.object({ teamId: z.string(), disposition: z.string() })),
  teamWarlords: z.array(z.object({ teamId: z.string(), userId: z.string() })),
  pairings: z.array(sealedEventPairing),
  battlefields: z.array(z.object({ round: z.number().int(), table: z.number().int(), patternId: z.string(), terrainLayoutId: z.string() })),
})
const sealedEventAddress = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tournament'), token: z.string() }),
  z.object({ kind: z.literal('group'), groupToken: z.string() }),
  z.object({ kind: z.literal('hidden-list-game'), groupToken: z.string(), token: z.string() }),
])
const visibleSealedEvent = z.object({
  ...eventHost,
  personal: z.boolean(),
  joined: z.number().int(),
  accepted: z.number().int(),
  occupied: z.number().int(),
  ownEntry: sealedEventEntry.nullable(),
  pastAt: z.number().int().nullable(),
})
const sealedEventCandidate = z.object({ token: z.string(), name: z.string(), event: sealedEvent, entries: z.array(sealedEventEntry) })
const sealedEventRoster = z.object({ event: sealedEvent, entry: sealedEventEntry, reader: sealedEventEntry.nullable() })
const friendSealedEventRoster = z.object({
  hostToken: z.string(),
  hostName: z.string(),
  eventToken: z.string(),
  userId: z.string(),
  rosterName: z.string(),
  catalogueId: z.string(),
  revealedAt: z.number(),
})
const outdatedSealedEventEntry = z.object({ token: z.string(), name: z.string(), group: z.object({ token: z.string() }).nullable() })

const group = z.object({
  id: z.string(),
  token: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string(),
  visibility: z.enum(SEALED_EVENT_VISIBILITIES),
  admission: z.enum(SEALED_EVENT_ADMISSIONS),
  createdAt: z.number().int(),
})
const groupMember = z.object({
  userId: z.string(),
  status: z.enum(GROUP_MEMBER_STATUSES),
  role: z.enum(GROUP_ROLES),
  joinedAt: z.number().int(),
})
const battleGroup = group.pick({ id: true, token: true, name: true, visibility: true })
const hiddenListGame = z.object({
  token: z.string(),
  createdAt: z.number().int(),
  pastAt: z.number().int().nullable(),
  revealedAt: z.number().int().nullable(),
  playsAt: z.number().int().nullable(),
  sealBy: z.number().int().nullable(),
  format: z.enum(TABLE_SHAPES).nullable(),
  rosterLimit: z.number().int().nullable(),
  pointsBudget: z.number().int().nullable(),
  soloPoints: eventPoints,
  allyPoints: eventPoints,
  sharedPoints: eventSharedPoints,
  players: z.array(
    z.object({ userId: z.string(), sealed: z.boolean(), teamId: z.string().nullable(), requiredLimit: z.number().int().nullable() }),
  ),
  battles: z.number().int(),
  playing: z.array(z.string()),
  played: z.array(z.tuple([z.string(), z.string()])),
})
const groupLeague = z.object({
  seed: z.number().int(),
  createdAt: z.number().int(),
  publishedAt: z.number().int().nullable(),
  deadlines: z.array(z.number().int().nullable()),
  players: z.array(z.object({ userId: z.string(), withdrawn: z.boolean() })),
  fixtures: z.array(
    z.object({
      key: z.string(),
      round: z.number().int(),
      table: z.number().int(),
      aId: z.string(),
      bId: z.string().nullable(),
      battleToken: z.string().nullable(),
    }),
  ),
})
const groupRecord = z.object({
  group,
  members: z.array(groupMember),
  games: z.array(hiddenListGame),
  league: groupLeague.nullable(),
  battlesRevision: z.string(),
  pastLeagues: z.array(
    groupLeague.pick({ publishedAt: true, players: true, fixtures: true }).extend({ id: z.string(), endedAt: z.number().int() }),
  ),
})
const visibleGroup = z.object({
  group,
  adminIds: z.array(z.string()),
  memberCount: z.number().int(),
  battleCount: z.number().int(),
  lastBattleAt: z.number().int().nullable(),
  ownMember: groupMember.pick({ status: true, role: true }).nullable(),
})

/** Groups, leagues, tournaments and the sealed events they host. */
export function withEvents<B extends SpacetimeBase>(Base: B) {
  return class EventOperations extends Base {
    sealedEventNames(tokens: readonly string[]) {
      return this.namesByToken('sealed_event_names', tokens)
    }

    groupNames(tokens: readonly string[]) {
      return this.namesByToken('group_names', tokens)
    }

    private async namesByToken(procedure: 'sealed_event_names' | 'group_names', tokens: readonly string[]) {
      if (!tokens.length) return new Map<string, string>()
      const pairs = await this.read(procedure, [[...new Set(tokens)]], z.array(z.tuple([z.string(), z.string()])))
      return new Map(pairs)
    }

    async sealedEventByToken(token: string, eventToken?: string) {
      return this.read('sealed_event_by_token', [token, eventToken ?? ''], sealedEventRecord.nullable())
    }

    async sealedEventAddress(token: string, eventToken?: string) {
      return this.read('sealed_event_address', [token, eventToken ?? ''], sealedEventAddress.nullable())
    }

    async sealedEventsVisibleTo(userId: string | null, limit: number) {
      return this.read('sealed_events_visible_to', [userId ?? '', limit], z.array(visibleSealedEvent))
    }

    async groupByToken(token: string) {
      return this.read('group_by_token', [token], groupRecord.nullable())
    }

    async groupsVisibleTo(userId: string | null, limit: number) {
      return this.read('groups_visible_to', [userId ?? '', limit], z.array(visibleGroup))
    }

    async battleGroups(battleId: string) {
      return this.read('battle_groups', [battleId], z.object({ current: battleGroup.nullable(), options: z.array(battleGroup) }))
    }

    async groupCommand<S extends z.ZodType>(command: Record<string, unknown>, result: S): Promise<z.output<S>> {
      return this.read('group_command', [JSON.stringify(command)], result)
    }

    async outdatedSealedEventEntriesForRoster(userId: string, rosterId: string) {
      return this.read('outdated_sealed_event_entries_for_roster', [userId, rosterId], z.array(outdatedSealedEventEntry))
    }

    async friendSealedEventRosters(viewerId: string) {
      return this.read('friend_sealed_event_rosters', [viewerId], z.array(friendSealedEventRoster))
    }

    async sealedEventBattleCandidates(userId: string, participantIds: readonly string[]) {
      return this.read('sealed_event_battle_candidates', [userId, [...participantIds]], z.array(sealedEventCandidate))
    }

    async sealedEventRosters(token: string, userId: string, eventToken?: string, readerId?: string | null) {
      return this.read('sealed_event_rosters', [token, userId, eventToken ?? '', readerId ?? ''], sealedEventRoster.nullable())
    }

    async sealedEventRosterSharing(token: string, eventToken: string, userId: string) {
      return this.read('sealed_event_roster_sharing', [token, eventToken, userId], sealedEventRosterSharingSchema.nullable())
    }

    async sealedEventCommand<S extends z.ZodType>(command: Record<string, unknown>, result: S): Promise<z.output<S>> {
      const value = await this.read('sealed_event_command', [JSON.stringify(command)], z.unknown())
      if (value === 'past') throw new Response('This hidden-list game has moved to Past. Start a new game to play again.', { status: 409 })
      return result.parse(value)
    }
  }
}
