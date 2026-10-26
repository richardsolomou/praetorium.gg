import { boundedProgress, withCountsAs, withProgress, withWanted, type CollectionProgress } from '../../core/collection'
import { withEntry, withMember } from '../../core/collections'
import { withFavouriteDetachment, type FavouriteDetachment } from '../../core/favouriteDetachments'
import { leagueTitle, leagueWarlordRefusal, leagueWarlordValid, waivedWarlordRules } from '../../core/league'
import { attemptLocalSync } from './localRuntime'
import { rosterSnapshot } from '../../core/rosterSnapshot'
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
import { accountChanged, cachedRead } from './reads'
import type { LocalDocumentUpdate } from './syncEngine'
import {
  collectionCountsKey,
  collectionKey,
  collectionProgressKey,
  collectionWishesKey,
  collectionCountsAsKey,
  favouriteDatasheetsKey,
  favouriteDetachmentsKey,
  favouriteFactionsKey,
  fieldedDatasheetsKey,
  wishlistSuggestionsKey,
  friendInviteKey,
  friendshipsKey,
  leagueKey,
  leagueRosterKey,
  leaguesKey,
  meKey,
  notificationSettingsKey,
  onboardingKey,
  opponentsKey,
  friendLeagueRostersKey,
  outdatedLeagueEntriesKey,
  playerDefaultsKey,
  recentMatchupsKey,
  abilityRemindersKey,
} from '../queries/queryKeys'
import type { RecentMatchup } from '../../core/recentMatchups'
import { withAbilityReminder, type AbilityReminder } from '../../core/reminders'
import { withoutRecentMatchup, withRecentMatchup } from '../../contracts/recentMatchups'
import { OfflineRefusal } from './offlineRefusal'

export const queryResource = (key: readonly unknown[]) => `query:${JSON.stringify(key)}`
async function accountRead<T>(key: readonly unknown[], online: () => Promise<T>) {
  const owner = localOwner()?.id
  const resource = queryResource(key)
  const local = await localDocument<T>(resource)
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource)))) return local
  const result = await cachedRead(key, online, { updateCache: false })
  const saved = await rememberDocument(resource, result, null, owner, undefined, JSON.stringify({ data: local }))
  if (localOwner()?.id !== owner) throw accountChanged()
  const retained = saved ? (saved.data as T) : result
  localClient()?.setQueryData(key, retained)
  return retained
}

export const collection = () => accountRead(collectionKey(), () => server.collection())
export const collectionCounts = () => accountRead(collectionCountsKey(), () => server.collectionCounts())
export const collectionProgress = () => accountRead(collectionProgressKey(), () => server.collectionProgress())
export const collectionWishes = () => accountRead(collectionWishesKey(), () => server.collectionWishes())
export const collectionCountsAs = () => accountRead(collectionCountsAsKey(), () => server.collectionCountsAs())
export const fieldedDatasheets = () => cachedRead(fieldedDatasheetsKey(), () => server.fieldedDatasheets())
export const wishlistSuggestions = () => cachedRead(wishlistSuggestionsKey(), () => server.wishlistSuggestions())
export const favouriteFactions = () => accountRead(favouriteFactionsKey(), () => server.favouriteFactions())
export const favouriteDetachments = () => accountRead(favouriteDetachmentsKey(), () => server.favouriteDetachments())
export const favouriteDatasheets = () => accountRead(favouriteDatasheetsKey(), () => server.favouriteDatasheets())
export const recentMatchups = () => accountRead(recentMatchupsKey(), () => server.recentMatchups())
export const abilityReminders = () => accountRead(abilityRemindersKey(), () => server.abilityReminders())
/** The alerts a list fielded on this device carries: the ones it last read or set, and none if it never read them. */
export const savedAbilityReminders = async () => (await localDocument<AbilityReminder[]>(queryResource(abilityRemindersKey()))) ?? []
export const playerDefaults = () => accountRead(playerDefaultsKey(), () => server.playerDefaults())
export const onboardingProgress = () => accountRead(onboardingKey(), () => server.onboardingProgress())
export const notificationSettings = () => cachedRead(notificationSettingsKey(), () => server.notificationSettings())
export const friendships = () => cachedRead(friendshipsKey(), () => server.friendships())
export const opponents = () => cachedRead(opponentsKey(), () => server.opponents())
export const listLeagues = async (): ReturnType<typeof server.listLeagues> => {
  const leagues = await cachedRead(leaguesKey(), () => server.listLeagues())
  const state = await localEngine()?.storage.read()
  const byToken = new Map(leagues.map((league) => [league.token, league]))
  for (const operation of state?.operations ?? []) {
    if (operation.kind === 'deleteLeague') {
      byToken.delete(operation.resource.slice(7))
      continue
    }
    if (operation.kind !== 'createLeague') continue
    const draft = state?.documents[operation.resource]?.data as Awaited<ReturnType<typeof server.openLeague>>
    if (!draft) continue
    const accepted = draft.entries.filter((entry) => entry.status === 'accepted').length
    byToken.set(draft.token, {
      ...draft,
      tournament: draft.tournament && { ...draft.tournament, adminIds: draft.tournament.admins.map((admin) => admin.id) },
      personal: true,
      entrantCount: accepted,
      currentEntrantCount: draft.entries.length,
      ownEntry: null,
    })
  }
  return [...byToken.values()].sort((a, b) => b.createdAt - a.createdAt)
}
export const activeFriendInvite = () => accountRead(friendInviteKey('active'), () => server.activeFriendInvite())
export const friendInvite = (args: Parameters<typeof server.friendInvite>[0]) =>
  cachedRead(friendInviteKey(args.data.token), () => server.friendInvite(args))
export const openLeagueRoster = (args: Parameters<typeof server.openLeagueRoster>[0]) =>
  cachedRead(leagueRosterKey(args.data.token, args.data.eventToken, args.data.userId), () => server.openLeagueRoster(args))
export const listFriendLeagueRosters = () => cachedRead(friendLeagueRostersKey(), () => server.listFriendLeagueRosters())
export const outdatedLeagueEntriesForRoster = (args: Parameters<typeof server.outdatedLeagueEntriesForRoster>[0]) =>
  cachedRead(outdatedLeagueEntriesKey(args.data.rosterId), () => server.outdatedLeagueEntriesForRoster(args))
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
  return cachedRead(leagueKey(args.data.token, args.data.eventToken), () => server.openLeague(args))
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
  waitForSync = true,
) {
  const normalized = offlineActionSchemas[kind].parse(input)
  const operation = await queueLocal(kind, { input: normalized, identifiers }, resource, data, dependencies, undefined, owner, update)
  if (waitForSync && navigator.onLine) {
    await attemptLocalSync()
    if (localOwner()?.id !== owner) throw new Error('The account changed while saving this action.')
    const saved = (await localEngine()?.storage.read())?.operations.find((candidate) => candidate.id === operation.id)
    if (saved && saved.status !== 'pending') throw new Error(saved.message || 'Review this saved action before continuing.')
  }
}
function deferredForAccount(waitForSync = true) {
  const owner = localOwner()?.id
  return (
    kind: OfflineActionKind,
    input: unknown,
    resource: string,
    data?: unknown,
    identifiers: Record<string, string> = {},
    dependencies?: string[],
    update?: LocalDocumentUpdate,
  ) => deferred(kind, input, resource, data, identifiers, dependencies, owner, update, waitForSync)
}

export async function setOwned(args: Parameters<typeof server.setOwned>[0]): ReturnType<typeof server.setOwned> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.setOwned(args)
  const input = offlineActionSchemas.setOwned.parse(args.data)
  const resource = queryResource(collectionKey())
  const owned = (await localDocument<string[]>(resource)) ?? (await collection())
  await queueLocal(
    'setOwned',
    { input, identifiers: {} },
    resource,
    undefined,
    undefined,
    undefined,
    owner,
    (current) => withMember((current as typeof owned | undefined) ?? owned, input.entryId, input.owned),
    input.owned
      ? undefined
      : {
          [queryResource(collectionCountsKey())]: (current) => withoutEntry(current, input.entryId),
          [queryResource(collectionProgressKey())]: (current) => withoutEntry(current, input.entryId),
          [queryResource(collectionCountsAsKey())]: (current) => withoutEntry(current, input.entryId),
        },
  )
  return undefined
}
const withoutEntry = (current: unknown, entryId: string) =>
  current ? withEntry(current as Record<string, unknown>, entryId, undefined) : undefined
export async function setCollectionModels(
  args: Parameters<typeof server.setCollectionModels>[0],
): ReturnType<typeof server.setCollectionModels> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.setCollectionModels(args)
  const input = offlineActionSchemas.setCollectionModels.parse(args.data)
  const resource = queryResource(collectionCountsKey())
  const counts = (await localDocument<Record<string, number>>(resource)) ?? (await collectionCounts())
  await queueLocal(
    'setCollectionModels',
    { input, identifiers: {} },
    resource,
    undefined,
    undefined,
    undefined,
    owner,
    (current) => ({ ...(current ?? counts), [input.entryId]: input.models }),
    {
      [queryResource(collectionProgressKey())]: (current) => {
        const saved = current as Record<string, CollectionProgress> | undefined
        const progress = saved?.[input.entryId]
        return progress ? { ...saved, [input.entryId]: boundedProgress(input.models, progress) } : current
      },
    },
  )
}
export async function setCollectionProgress(
  args: Parameters<typeof server.setCollectionProgress>[0],
): ReturnType<typeof server.setCollectionProgress> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionProgress(args)
  const progress =
    (await localDocument<Record<string, CollectionProgress>>(queryResource(collectionProgressKey()))) ?? (await collectionProgress())
  await defer('setCollectionProgress', args.data, queryResource(collectionProgressKey()), undefined, {}, undefined, (current) =>
    withProgress((current as typeof progress | undefined) ?? progress, args.data),
  )
}
export async function setCollectionCountsAs(
  args: Parameters<typeof server.setCollectionCountsAs>[0],
): ReturnType<typeof server.setCollectionCountsAs> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionCountsAs(args)
  const saved = (await localDocument<Record<string, string[]>>(queryResource(collectionCountsAsKey()))) ?? (await collectionCountsAs())
  await defer('setCollectionCountsAs', args.data, queryResource(collectionCountsAsKey()), undefined, {}, undefined, (current) =>
    withCountsAs((current as typeof saved | undefined) ?? saved, args.data),
  )
}
export async function setCollectionWanted(
  args: Parameters<typeof server.setCollectionWanted>[0],
): ReturnType<typeof server.setCollectionWanted> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionWanted(args)
  const wishes = (await localDocument<Record<string, number>>(queryResource(collectionWishesKey()))) ?? (await collectionWishes())
  await defer('setCollectionWanted', args.data, queryResource(collectionWishesKey()), undefined, {}, undefined, (current) =>
    withWanted((current as typeof wishes | undefined) ?? wishes, args.data),
  )
}
export async function setFavouriteFaction(
  args: Parameters<typeof server.setFavouriteFaction>[0],
): ReturnType<typeof server.setFavouriteFaction> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteFaction(args)
  const favourites = (await localDocument<string[]>(queryResource(favouriteFactionsKey()))) ?? (await favouriteFactions())
  await defer('setFavouriteFaction', args.data, queryResource(favouriteFactionsKey()), undefined, {}, undefined, (current) =>
    withMember((current as typeof favourites | undefined) ?? favourites, args.data.catalogueId, args.data.favourite),
  )
  return null
}
export async function setFavouriteDetachment(
  args: Parameters<typeof server.setFavouriteDetachment>[0],
): ReturnType<typeof server.setFavouriteDetachment> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteDetachment(args)
  const favourites =
    (await localDocument<FavouriteDetachment[]>(queryResource(favouriteDetachmentsKey()))) ?? (await favouriteDetachments())
  await defer('setFavouriteDetachment', args.data, queryResource(favouriteDetachmentsKey()), undefined, {}, undefined, (current) =>
    withFavouriteDetachment((current as typeof favourites | undefined) ?? favourites, args.data),
  )
  return null
}
export async function setFavouriteDatasheet(
  args: Parameters<typeof server.setFavouriteDatasheet>[0],
): ReturnType<typeof server.setFavouriteDatasheet> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteDatasheet(args)
  const favourites = (await localDocument<string[]>(queryResource(favouriteDatasheetsKey()))) ?? (await favouriteDatasheets())
  await defer('setFavouriteDatasheet', args.data, queryResource(favouriteDatasheetsKey()), undefined, {}, undefined, (current) =>
    withMember((current as typeof favourites | undefined) ?? favourites, args.data.entryId, args.data.favourite),
  )
  return null
}
export async function rememberMatchup(args: Parameters<typeof server.rememberMatchup>[0]): ReturnType<typeof server.rememberMatchup> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.rememberMatchup(args)
  const input = offlineActionSchemas.rememberMatchup.parse(args.data)
  const recent = (await localDocument<RecentMatchup[]>(queryResource(recentMatchupsKey()))) ?? (await recentMatchups())
  await defer('rememberMatchup', input, queryResource(recentMatchupsKey()), undefined, {}, undefined, (current) =>
    withRecentMatchup((current as RecentMatchup[] | undefined) ?? recent, input),
  )
  return null
}
export async function forgetMatchup(args: Parameters<typeof server.forgetMatchup>[0]): ReturnType<typeof server.forgetMatchup> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.forgetMatchup(args)
  const recent = (await localDocument<RecentMatchup[]>(queryResource(recentMatchupsKey()))) ?? (await recentMatchups())
  await defer('forgetMatchup', args.data, queryResource(recentMatchupsKey()), undefined, {}, undefined, (current) =>
    withoutRecentMatchup((current as RecentMatchup[] | undefined) ?? recent, args.data.shared),
  )
  return null
}
export async function setAbilityReminder(
  args: Parameters<typeof server.setAbilityReminder>[0],
): ReturnType<typeof server.setAbilityReminder> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setAbilityReminder(args)
  const input = offlineActionSchemas.setAbilityReminder.parse(args.data)
  const saved = (await localDocument<AbilityReminder[]>(queryResource(abilityRemindersKey()))) ?? (await abilityReminders())
  await defer('setAbilityReminder', input, queryResource(abilityRemindersKey()), undefined, {}, undefined, (current) =>
    withAbilityReminder((current as AbilityReminder[] | undefined) ?? saved, input),
  )
  return null
}
export async function removeAbilityReminder(
  args: Parameters<typeof server.removeAbilityReminder>[0],
): ReturnType<typeof server.removeAbilityReminder> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.removeAbilityReminder(args)
  const saved = (await localDocument<AbilityReminder[]>(queryResource(abilityRemindersKey()))) ?? (await abilityReminders())
  await defer('removeAbilityReminder', args.data, queryResource(abilityRemindersKey()), undefined, {}, undefined, (current) =>
    ((current as AbilityReminder[] | undefined) ?? saved).filter((reminder) => reminder.key !== args.data.key),
  )
  return null
}
export async function setPlayerDefaults(args: Parameters<typeof server.setPlayerDefaults>[0]): ReturnType<typeof server.setPlayerDefaults> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setPlayerDefaults(args)
  const next = offlineActionSchemas.setPlayerDefaults.parse(args.data)
  await defer('setPlayerDefaults', next, queryResource(playerDefaultsKey()), next)
  return next
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
  await defer('createFriendInvite', {}, queryResource(friendInviteKey('active')), token, { inviteToken: token })
  return { token }
}
export async function cancelFriendInvite(): ReturnType<typeof server.cancelFriendInvite> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.cancelFriendInvite()
  await defer('cancelFriendInvite', {}, queryResource(friendInviteKey('active')), null)
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
  const me = localClient()!.getQueryData<{ id: string; name: string; image: string | null }>(meKey())!
  const now = Date.now()
  const draft: NonNullable<Awaited<ReturnType<typeof server.openLeague>>> = {
    kind: 'tournament',
    token: identifiers.leagueToken,
    eventToken: identifiers.eventToken,
    createdAt: now,
    tournament: {
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      admission: input.admission,
      playerLimit: input.playerLimit,
      ownerId: me.id,
      ownerName: me.name,
      ownerImage: me.image,
      admins: [],
    },
    club: null,
    organizer: true,
    format: input.format,
    rosterLimit: input.rosterLimit,
    allowances: input.allowances,
    revealedAt: null,
    revealedByName: null,
    rounds: input.rounds ?? null,
    pointsBudget: input.pointsBudget ?? null,
    soloPoints: input.soloPoints ?? null,
    allyPoints: input.allyPoints ?? null,
    playsAt: input.schedule?.playsAt ?? null,
    sealBy: input.schedule?.sealBy ?? null,
    remindedAt: null,
    pairings: [],
    occupiedCount: 0,
    entries: [],
  }
  await defer('createLeague', input, `league:${identifiers.leagueToken}`, draft, identifiers)
  return { token: identifiers.leagueToken, eventToken: identifiers.eventToken }
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
    throw new OfflineRefusal('Save this roster and army data on this device before sealing it offline.')
  }
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
  // The event decides whether a waived Warlord is allowed; the server answers that once the seal syncs.
  if (!waivedWarlordRules(snapshot).length && !leagueWarlordValid(snapshot)) throw new Error(leagueWarlordRefusal(snapshot))
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

export async function setLeagueTeamWarlord(
  args: Parameters<typeof server.setLeagueTeamWarlord>[0],
): ReturnType<typeof server.setLeagueTeamWarlord> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setLeagueTeamWarlord(args)
  await defer('setLeagueTeamWarlord', args.data, `league:${args.data.token}`)
  return null
}

export async function setLeagueTeamDisposition(
  args: Parameters<typeof server.setLeagueTeamDisposition>[0],
): ReturnType<typeof server.setLeagueTeamDisposition> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setLeagueTeamDisposition(args)
  await defer('setLeagueTeamDisposition', args.data, `league:${args.data.token}`)
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

export async function chooseLeagueSide(args: Parameters<typeof server.chooseLeagueSide>[0]): ReturnType<typeof server.chooseLeagueSide> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.chooseLeagueSide(args)
  await defer('chooseLeagueSide', args.data, `league:${args.data.token}`)
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
  await defer('updateOnboardingProgress', input, queryResource(onboardingKey()), next)
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
          ? {
              ...league,
              name: leagueTitle(league),
              entries: league.entries.filter((entry) => entry.status === 'accepted' && entry.submitted),
            }
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
