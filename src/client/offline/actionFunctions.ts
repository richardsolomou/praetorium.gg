import { leagueWarlords } from '../../core/league'
import { attemptLocalSync } from './localRuntime'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { leagueEditionError } from '../../core/catalogueEdition'
import { calculateRosterPrice, savedRosterPriceInput } from '../../shared/pricing'
import { unitBattleDetailsIn } from '../../shared/catalogue'
import { matchingLeagueBattles } from '../../shared/leagueBattleOptions'
import { onboardingProgress as foldOnboarding, type OnboardingTaskId, type StoredOnboarding } from '../../core/onboarding'
import * as server from '../../server/functions'
import { offlineActionSchemas, type OfflineActionKind } from '../../contracts/offlineActions'
import { localClient, localOwner, localDocument, localEngine, hasLocalChanges, queueLocal, rememberDocument } from './localRuntime'
import { localConstruction } from './construction'
import { saveRosterSchema } from '../../contracts/schemas'
import type { LocalRoster } from './localRuntime'
import { cachedRead } from './reads'
import type { LocalDocumentUpdate } from './syncEngine'

export const queryResource = (key: readonly unknown[]) => `query:${JSON.stringify(key)}`
async function accountRead<T>(key: readonly unknown[], online: () => Promise<T>) {
  const owner = localOwner()?.id
  const resource = queryResource(key)
  const local = await localDocument<T>(resource)
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource)))) return local
  const result = await cachedRead(key, online)
  const saved = await rememberDocument(resource, result, null, owner, undefined, JSON.stringify({ data: local }))
  if (localOwner()?.id !== owner) throw new Error('The account changed while loading this screen.')
  const retained = saved ? (saved.data as T) : result
  localClient()?.setQueryData(key, retained)
  return retained
}

export const collection = () => accountRead(['collection'], () => server.collection())
export const favouriteFactions = () => accountRead(['favourite-factions'], () => server.favouriteFactions())
export const favouriteDetachments = () => accountRead(['favourite-detachments'], () => server.favouriteDetachments())
export const playerDefaults = () => accountRead(['player-defaults'], () => server.playerDefaults())
export const battleAudience = () => accountRead(['battle-audience'], () => server.battleAudience())
export const onboardingProgress = () => accountRead(['onboarding'], () => server.onboardingProgress())
export const notificationSettings = () => cachedRead(['notification-settings'], () => server.notificationSettings())
export const friendships = () => cachedRead(['friendships'], () => server.friendships())
export const opponents = () => cachedRead(['opponents'], () => server.opponents())
export const listLeagues = async (): ReturnType<typeof server.listLeagues> => {
  const leagues = await cachedRead(['leagues'], () => server.listLeagues())
  const state = await localEngine()?.storage.read()
  const byToken = new Map(leagues.map((league) => [league.token, league]))
  for (const operation of state?.operations ?? []) {
    if (operation.kind === 'deleteLeague') {
      byToken.delete(operation.resource.slice(7))
      continue
    }
    if (operation.kind !== 'createLeague' && operation.kind !== 'createLeagueEvent') continue
    const draft = state?.documents[operation.resource]?.data as Awaited<ReturnType<typeof server.openLeague>>
    if (!draft) continue
    byToken.set(draft.token, {
      ...draft,
      personal: true,
      format: draft.currentEventFormat,
      entrantCount: draft.currentAcceptedCount,
      ownEntry: null,
    })
  }
  return [...byToken.values()].sort((a, b) => b.createdAt - a.createdAt)
}
export const activeFriendInvite = () => accountRead(['friend-invite', 'active'], () => server.activeFriendInvite())
export const friendInvite = (args: Parameters<typeof server.friendInvite>[0]) =>
  cachedRead(['friend-invite', args.data.token], () => server.friendInvite(args))
export const openLeagueRoster = (args: Parameters<typeof server.openLeagueRoster>[0]) =>
  cachedRead(['league-roster', args.data.token, args.data.eventToken, args.data.userId], () => server.openLeagueRoster(args))
export const outdatedLeagueEntriesForRoster = (args: Parameters<typeof server.outdatedLeagueEntriesForRoster>[0]) =>
  cachedRead(['outdated-league-entries', args.data.rosterId], () => server.outdatedLeagueEntriesForRoster(args))
export const openLeague = async (args: Parameters<typeof server.openLeague>[0]): ReturnType<typeof server.openLeague> => {
  const resource = `league:${args.data.token}`
  const draft = await localDocument<Awaited<ReturnType<typeof server.openLeague>>>(resource)
  if (
    (await localEngine()?.storage.read())?.operations.some(
      (operation) => operation.resource === resource && operation.kind === 'deleteLeague',
    )
  )
    return null
  if (draft && (!args.data.eventToken || args.data.eventToken === draft.eventToken) && (await hasLocalChanges(resource))) return draft
  return cachedRead(['league', args.data.token, args.data.eventToken ?? 'current'], () => server.openLeague(args))
}

async function deferred(
  kind: OfflineActionKind,
  input: unknown,
  resource: string,
  data?: unknown,
  identifiers: Record<string, string> = {},
  dependencies?: string[],
  owner?: string,
  update?: LocalDocumentUpdate,
) {
  const normalized = offlineActionSchemas[kind].parse(input)
  const operation = await queueLocal(kind, { input: normalized, identifiers }, resource, data, dependencies, undefined, owner, update)
  if (navigator.onLine) {
    await attemptLocalSync()
    if (localOwner()?.id !== owner) throw new Error('The account changed while saving this action.')
    const saved = (await localEngine()?.storage.read())?.operations.find((candidate) => candidate.id === operation.id)
    if (saved && saved.status !== 'pending') throw new Error(saved.message || 'Review this saved action before continuing.')
  }
}
function deferredForAccount() {
  const owner = localOwner()?.id
  return (
    kind: OfflineActionKind,
    input: unknown,
    resource: string,
    data?: unknown,
    identifiers: Record<string, string> = {},
    dependencies?: string[],
    update?: LocalDocumentUpdate,
  ) => deferred(kind, input, resource, data, identifiers, dependencies, owner, update)
}

export async function setOwned(args: Parameters<typeof server.setOwned>[0]): ReturnType<typeof server.setOwned> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setOwned(args)
  const owned = await collection()
  await defer('setOwned', args.data, queryResource(['collection']), undefined, {}, undefined, (current) => {
    const entries = (current as typeof owned | undefined) ?? owned
    return args.data.owned ? [...new Set([...entries, args.data.entryId])] : entries.filter((id) => id !== args.data.entryId)
  })
  return undefined
}
export async function setFavouriteFaction(
  args: Parameters<typeof server.setFavouriteFaction>[0],
): ReturnType<typeof server.setFavouriteFaction> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setFavouriteFaction(args)
  const favourites = await favouriteFactions()
  await defer('setFavouriteFaction', args.data, queryResource(['favourite-factions']), undefined, {}, undefined, (current) => {
    const entries = (current as typeof favourites | undefined) ?? favourites
    return args.data.favourite ? [...new Set([...entries, args.data.catalogueId])] : entries.filter((id) => id !== args.data.catalogueId)
  })
  return null
}
export async function setFavouriteDetachment(
  args: Parameters<typeof server.setFavouriteDetachment>[0],
): ReturnType<typeof server.setFavouriteDetachment> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setFavouriteDetachment(args)
  const favourites = await favouriteDetachments()
  await defer('setFavouriteDetachment', args.data, queryResource(['favourite-detachments']), undefined, {}, undefined, (current) => {
    const entries = (current as typeof favourites | undefined) ?? favourites
    const other = entries.filter((entry) => entry.catalogueId !== args.data.catalogueId || entry.detachmentId !== args.data.detachmentId)
    return args.data.favourite ? [...other, { catalogueId: args.data.catalogueId, detachmentId: args.data.detachmentId }] : other
  })
  return null
}
export async function setPlayerDefaults(args: Parameters<typeof server.setPlayerDefaults>[0]): ReturnType<typeof server.setPlayerDefaults> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setPlayerDefaults(args)
  const next = offlineActionSchemas.setPlayerDefaults.parse(args.data)
  await defer('setPlayerDefaults', next, queryResource(['player-defaults']), next)
  return next
}
export async function setBattleAudience(args: Parameters<typeof server.setBattleAudience>[0]): ReturnType<typeof server.setBattleAudience> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setBattleAudience(args)
  await defer('setBattleAudience', args.data, queryResource(['battle-audience']), args.data.audience)
  return args.data.audience
}
export async function setPushNotifications(
  args: Parameters<typeof server.setPushNotifications>[0],
): ReturnType<typeof server.setPushNotifications> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setPushNotifications(args)
  await defer('setPushNotifications', args.data, 'notifications')
  return args.data.enabled
}

export async function createFriendInvite(): ReturnType<typeof server.createFriendInvite> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.createFriendInvite()
  const token = crypto.randomUUID()
  await defer('createFriendInvite', {}, queryResource(['friend-invite', 'active']), token, { inviteToken: token })
  return { token }
}
export async function cancelFriendInvite(): ReturnType<typeof server.cancelFriendInvite> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.cancelFriendInvite()
  await defer('cancelFriendInvite', {}, queryResource(['friend-invite', 'active']), null)
  return null
}

export async function createLeague(args: Parameters<typeof server.createLeague>[0]): ReturnType<typeof server.createLeague> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.createLeague(args)
  const input = offlineActionSchemas.createLeague.parse(args.data)
  const identifiers = {
    leagueId: crypto.randomUUID(),
    leagueToken: crypto.randomUUID(),
    eventId: crypto.randomUUID(),
    eventToken: crypto.randomUUID(),
  }
  const me = localClient()!.getQueryData<{ id: string; name: string; image: string | null }>(['me'])!
  const now = Date.now()
  const draft: NonNullable<Awaited<ReturnType<typeof server.openLeague>>> = {
    ...input,
    id: identifiers.leagueId,
    token: identifiers.leagueToken,
    ownerId: me.id,
    ownerName: me.name,
    ownerImage: me.image,
    recurring: true,
    createdAt: now,
    eventToken: identifiers.eventToken,
    eventNumber: 1,
    eventCreatedAt: now,
    revealedAt: null,
    eventCount: 1,
    currentEventFormat: input.format,
    currentEventRevealedAt: null,
    currentEntrantCount: 0,
    currentAcceptedCount: 0,
    occupiedCount: 0,
    entries: [],
    events: [
      { token: identifiers.eventToken, number: 1, format: input.format, rosterLimit: input.rosterLimit, createdAt: now, revealedAt: null },
    ],
  }
  await defer('createLeague', input, `league:${identifiers.leagueToken}`, draft, identifiers)
  return { token: identifiers.leagueToken, eventToken: identifiers.eventToken }
}
export async function createLeagueEvent(args: Parameters<typeof server.createLeagueEvent>[0]): ReturnType<typeof server.createLeagueEvent> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.createLeagueEvent(args)
  const identifiers = { eventId: crypto.randomUUID(), eventToken: crypto.randomUUID() }
  const league = await openLeague({ data: { token: args.data.token } })
  if (!league) throw new Error('Save this league on the device before starting an event offline.')
  const input = offlineActionSchemas.createLeagueEvent.parse(args.data)
  const now = Date.now()
  const event = {
    token: identifiers.eventToken,
    number: league.eventCount + 1,
    format: input.format,
    rosterLimit: input.rosterLimit,
    createdAt: now,
    revealedAt: null,
  }
  await defer(
    'createLeagueEvent',
    input,
    `league:${input.token}`,
    {
      ...league,
      ...input,
      eventToken: event.token,
      eventNumber: event.number,
      eventCreatedAt: now,
      eventCount: event.number,
      currentEventFormat: input.format,
      currentEventRevealedAt: null,
      currentEntrantCount: 0,
      currentAcceptedCount: 0,
      occupiedCount: 0,
      entries: [],
      revealedAt: null,
      events: [...league.events, event],
    },
    identifiers,
  )
  return { eventToken: identifiers.eventToken }
}

export async function requestFriend(args: Parameters<typeof server.requestFriend>[0]): ReturnType<typeof server.requestFriend> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.requestFriend(args)
  await defer('requestFriend', args.data, `friend:${args.data.userId}`)
  return undefined
}

export async function acceptFriend(args: Parameters<typeof server.acceptFriend>[0]): ReturnType<typeof server.acceptFriend> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.acceptFriend(args)
  await defer('acceptFriend', args.data, `friend:${args.data.userId}`)
  return undefined
}

export async function rejectFriend(args: Parameters<typeof server.rejectFriend>[0]): ReturnType<typeof server.rejectFriend> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.rejectFriend(args)
  await defer('rejectFriend', args.data, `friend:${args.data.userId}`)
  return undefined
}

export async function removeFriend(args: Parameters<typeof server.removeFriend>[0]): ReturnType<typeof server.removeFriend> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.removeFriend(args)
  await defer('removeFriend', args.data, `friend:${args.data.userId}`)
  return undefined
}

export async function acceptFriendInvite(
  args: Parameters<typeof server.acceptFriendInvite>[0],
): ReturnType<typeof server.acceptFriendInvite> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.acceptFriendInvite(args)
  await defer('acceptFriendInvite', args.data, `invite:${args.data.token}`)
  return null
}

export async function joinLeague(args: Parameters<typeof server.joinLeague>[0]): ReturnType<typeof server.joinLeague> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.joinLeague(args)
  await defer('joinLeague', args.data, `league:${args.data.token}`)
  return 'pending'
}

export async function addLeagueEntrants(args: Parameters<typeof server.addLeagueEntrants>[0]): ReturnType<typeof server.addLeagueEntrants> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.addLeagueEntrants(args)
  await defer('addLeagueEntrants', args.data, `league:${args.data.token}`)
  return { added: 0 }
}

export async function admitLeagueEntries(
  args: Parameters<typeof server.admitLeagueEntries>[0],
): ReturnType<typeof server.admitLeagueEntries> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.admitLeagueEntries(args)
  await defer('admitLeagueEntries', args.data, `league:${args.data.token}`)
  return { admitted: 0 }
}

export async function moderateLeagueEntry(
  args: Parameters<typeof server.moderateLeagueEntry>[0],
): ReturnType<typeof server.moderateLeagueEntry> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.moderateLeagueEntry(args)
  await defer('moderateLeagueEntry', args.data, `league:${args.data.token}`)
  return null
}

export async function submitLeagueRoster(
  args: Parameters<typeof server.submitLeagueRoster>[0],
): ReturnType<typeof server.submitLeagueRoster> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.submitLeagueRoster(args)
  const roster = await localDocument<LocalRoster>(`roster:${args.data.rosterId}`)
  const construction = roster ? localConstruction(roster.catalogueId) : null
  if (!roster || !construction) {
    if (navigator.onLine) return server.submitLeagueRoster(args)
    throw new Error('Save this roster and army data on this device before sealing it offline.')
  }
  const editionError = leagueEditionError(construction.catalogue.edition)
  if (editionError) throw new Error(editionError)
  const league = await openLeague({ data: { token: args.data.token, eventToken: args.data.eventToken } })
  const priced = calculateRosterPrice(savedRosterPriceInput(roster), construction.catalogue, construction.rules)
  if (!priced) throw new Error('Army data is unavailable.')
  const snapshot = rosterSnapshot(
    roster,
    priced,
    unitBattleDetailsIn(
      construction.catalogue,
      roster.catalogueId,
      roster.picks.map((pick) => pick.entryId),
    ),
  )
  const warlords = leagueWarlords([snapshot])
  if (!warlords.eligible || (league?.format === '2v2' ? warlords.count > 1 : warlords.count !== 1))
    throw new Error(
      league?.format === '2v2'
        ? 'a doubles team must seal exactly one Character or Epic Hero Warlord between both rosters'
        : 'a league roster must seal exactly one Character or Epic Hero Warlord',
    )
  await defer(
    'submitLeagueRoster',
    { ...args.data, capturedRoster: saveRosterSchema.parse(roster), catalogueRevision: construction.catalogue.index.revision },
    `league:${args.data.token}`,
    undefined,
    {},
    [`roster:${args.data.rosterId}`],
  )
  return null
}

export async function revealLeague(args: Parameters<typeof server.revealLeague>[0]): ReturnType<typeof server.revealLeague> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.revealLeague(args)
  await defer('revealLeague', args.data, `league:${args.data.token}`)
  return null
}

export async function unsealLeagueRoster(
  args: Parameters<typeof server.unsealLeagueRoster>[0],
): ReturnType<typeof server.unsealLeagueRoster> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.unsealLeagueRoster(args)
  await defer('unsealLeagueRoster', args.data, `league:${args.data.token}`)
  return null
}

export async function assignLeagueRosterRequirement(
  args: Parameters<typeof server.assignLeagueRosterRequirement>[0],
): ReturnType<typeof server.assignLeagueRosterRequirement> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.assignLeagueRosterRequirement(args)
  await defer('assignLeagueRosterRequirement', args.data, `league:${args.data.token}`)
  return null
}

export async function assignLeagueTeam(args: Parameters<typeof server.assignLeagueTeam>[0]): ReturnType<typeof server.assignLeagueTeam> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.assignLeagueTeam(args)
  await defer('assignLeagueTeam', args.data, `league:${args.data.token}`, undefined, { teamId: crypto.randomUUID() })
  return null
}

export async function updateLeague(args: Parameters<typeof server.updateLeague>[0]): ReturnType<typeof server.updateLeague> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.updateLeague(args)
  await defer('updateLeague', args.data, `league:${args.data.token}`)
  return null
}

export async function deleteLeague(args: Parameters<typeof server.deleteLeague>[0]): ReturnType<typeof server.deleteLeague> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.deleteLeague(args)
  await defer('deleteLeague', args.data, `league:${args.data.token}`)
  return null
}

export async function deleteBattle(args: Parameters<typeof server.deleteBattle>[0]): ReturnType<typeof server.deleteBattle> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.deleteBattle(args)
  await defer('deleteBattle', args.data, `battle:${args.data.token}`, null)
  return null
}

export async function updateOnboardingProgress(
  args: Parameters<typeof server.updateOnboardingProgress>[0],
): ReturnType<typeof server.updateOnboardingProgress> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.updateOnboardingProgress(args)
  const input = offlineActionSchemas.updateOnboardingProgress.parse(args.data)
  const current = await onboardingProgress()
  const facts = {
    roster: current.completedTasks.includes('roster'),
    friend: current.completedTasks.includes('friend'),
    battle: current.completedTasks.includes('battle'),
    league: current.completedTasks.includes('league'),
  }
  const tasks: { task: OnboardingTaskId; state: 'completed' | 'skipped' }[] = [
    ...current.completedTasks.map((task) => ({ task, state: 'completed' as const })),
    ...current.skippedTasks.map((task) => ({ task, state: 'skipped' as const })),
  ]
  const stored: StoredOnboarding = {
    welcomed: current.welcomed || input.operation === 'welcome',
    tasks:
      input.operation === 'welcome'
        ? tasks
        : [
            ...tasks.filter((task) => task.task !== input.task),
            ...(input.operation === 'restore'
              ? []
              : [{ task: input.task, state: input.operation === 'skip' ? ('skipped' as const) : ('completed' as const) }]),
          ],
  }
  const next = foldOnboarding(stored, facts)
  await defer('updateOnboardingProgress', input, queryResource(['onboarding']), next)
  return next
}

export async function leagueBattleOptions(
  args: Parameters<typeof server.leagueBattleOptions>[0],
): ReturnType<typeof server.leagueBattleOptions> {
  if (!localEngine()) return server.leagueBattleOptions(args)
  const owner = localOwner()!
  const leagues = await listLeagues()
  const candidates = await Promise.all(
    leagues
      .filter((league) => league.personal)
      .map(async (summary) => {
        const league = await openLeague({ data: { token: summary.token } })
        return league?.revealedAt
          ? { ...league, entries: league.entries.filter((entry) => entry.status === 'accepted' && entry.submitted) }
          : null
      }),
  )
  const matching = matchingLeagueBattles(
    candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null),
    owner.id,
    args.data,
  )
  if (typeof window !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) return matching
  try {
    return await server.leagueBattleOptions(args)
  } catch {
    return matching
  }
}
