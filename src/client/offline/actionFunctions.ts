import { boundedProgress, withCountsAs, withProgress, withWanted, type CollectionProgress } from '../../core/collection'
import { withEntry, withMember } from '../../core/collections'
import { withFavouriteDetachment, type FavouriteDetachment } from '../../core/favouriteDetachments'
import { sealedEventTitle, sealedEventWarlordRefusal, sealedEventWarlordValid, waivedWarlordRules } from '../../core/sealedEvent'
import { attemptLocalSync } from './localRuntime'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { calculateRosterPrice, savedRosterPriceInput } from '../../shared/pricing'
import { unitBattleDetailsIn } from '../../shared/catalogue'
import { matchingSealedEventBattles } from '../../shared/sealedEventBattleOptions'
import { onboardingProgress as foldOnboarding, type OnboardingTaskId, type StoredOnboarding } from '../../core/onboarding'
import * as server from '../../server/functions'
import { offlineActionSchemas, type OfflineActionKind } from '../../contracts/offlineActions'
import { localClient, localOwner, localDocument, localEngine, hasLocalChanges, queueLocal, rememberDocument } from './localRuntime'
import { localConstruction } from './construction'
import { saveRosterSchema } from '../../contracts/schemas'
import type { LocalRoster } from './localRuntime'
import { accountChanged, cachedRead, isOffline } from './reads'
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
  sealedEventKey,
  sealedEventRosterKey,
  sealedEventsKey,
  meKey,
  notificationSettingsKey,
  onboardingKey,
  opponentsKey,
  friendSealedEventRostersKey,
  outdatedSealedEventEntriesKey,
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
export const listSealedEvents = async (): ReturnType<typeof server.listSealedEvents> => {
  const sealedEvents = await cachedRead(sealedEventsKey(), () => server.listSealedEvents())
  const state = await localEngine()?.storage.read()
  const byToken = new Map(sealedEvents.map((sealedEvent) => [sealedEvent.token, sealedEvent]))
  for (const operation of state?.operations ?? []) {
    if (operation.kind === 'deleteSealedEvent') {
      byToken.delete(operation.resource.slice(13))
      continue
    }
    if (operation.kind !== 'createSealedEvent') continue
    const draft = state?.documents[operation.resource]?.data as Awaited<ReturnType<typeof server.openSealedEvent>>
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
export const openSealedEventRoster = (args: Parameters<typeof server.openSealedEventRoster>[0]) =>
  cachedRead(sealedEventRosterKey(args.data.token, args.data.eventToken, args.data.userId), () => server.openSealedEventRoster(args))
export const listFriendSealedEventRosters = () => cachedRead(friendSealedEventRostersKey(), () => server.listFriendSealedEventRosters())
export const outdatedSealedEventEntriesForRoster = (args: Parameters<typeof server.outdatedSealedEventEntriesForRoster>[0]) =>
  cachedRead(outdatedSealedEventEntriesKey(args.data.rosterId), () => server.outdatedSealedEventEntriesForRoster(args))
export const openSealedEvent = async (args: Parameters<typeof server.openSealedEvent>[0]): ReturnType<typeof server.openSealedEvent> => {
  const resource = `sealed-event:${args.data.token}`
  const draft = await localDocument<Awaited<ReturnType<typeof server.openSealedEvent>>>(resource)
  if (
    (await localEngine()?.storage.read())?.operations.some(
      (operation) => operation.resource === resource && operation.kind === 'deleteSealedEvent',
    )
  )
    return null
  if (draft && (!args.data.eventToken || args.data.eventToken === draft.eventToken) && (await hasLocalChanges(resource))) return draft
  return cachedRead(sealedEventKey(args.data.token, args.data.eventToken), () => server.openSealedEvent(args))
}

function deferredForAccount(waitForSync = true) {
  const owner = localOwner()?.id
  return async (
    kind: OfflineActionKind,
    input: unknown,
    resource: string,
    data?: unknown,
    {
      identifiers = {},
      dependencies,
      update,
    }: { identifiers?: Record<string, string>; dependencies?: string[]; update?: LocalDocumentUpdate } = {},
  ) => {
    const normalized = offlineActionSchemas[kind].parse(input)
    const operation = await queueLocal(kind, { input: normalized, identifiers }, resource, { data, dependencies, owner, update })
    if (waitForSync && navigator.onLine) {
      await attemptLocalSync()
      if (localOwner()?.id !== owner) throw new Error('The account changed while saving this action.')
      const saved = (await localEngine()?.storage.read())?.operations.find((candidate) => candidate.id === operation.id)
      if (saved && saved.status !== 'pending') throw new Error(saved.message || 'Review this saved action before continuing.')
    }
  }
}

function queuedAction<Args extends { data: object }, Result>(
  online: () => (args: Args) => Promise<Result>,
  kind: OfflineActionKind,
  resource: (data: Args['data']) => string,
  answer: Result,
) {
  return async (args: Args): Promise<Result> => {
    const defer = deferredForAccount()
    if (!localEngine()) return online()(args)
    await defer(kind, args.data, resource(args.data))
    return answer
  }
}

export async function setOwned(args: Parameters<typeof server.setOwned>[0]): ReturnType<typeof server.setOwned> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.setOwned(args)
  const input = offlineActionSchemas.setOwned.parse(args.data)
  const resource = queryResource(collectionKey())
  const owned = (await localDocument<string[]>(resource)) ?? (await collection())
  await queueLocal('setOwned', { input, identifiers: {} }, resource, {
    owner,
    update: (current) => withMember((current as typeof owned | undefined) ?? owned, input.entryId, input.owned),
    relatedUpdates: input.owned
      ? undefined
      : {
          [queryResource(collectionCountsKey())]: (current) => withoutEntry(current, input.entryId),
          [queryResource(collectionProgressKey())]: (current) => withoutEntry(current, input.entryId),
          [queryResource(collectionCountsAsKey())]: (current) => withoutEntry(current, input.entryId),
        },
  })
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
  await queueLocal('setCollectionModels', { input, identifiers: {} }, resource, {
    owner,
    update: (current) => ({ ...(current ?? counts), [input.entryId]: input.models }),
    relatedUpdates: {
      [queryResource(collectionProgressKey())]: (current) => {
        const saved = current as Record<string, CollectionProgress> | undefined
        const progress = saved?.[input.entryId]
        return progress ? { ...saved, [input.entryId]: boundedProgress(input.models, progress) } : current
      },
    },
  })
}
export async function setCollectionProgress(
  args: Parameters<typeof server.setCollectionProgress>[0],
): ReturnType<typeof server.setCollectionProgress> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionProgress(args)
  const progress =
    (await localDocument<Record<string, CollectionProgress>>(queryResource(collectionProgressKey()))) ?? (await collectionProgress())
  await defer('setCollectionProgress', args.data, queryResource(collectionProgressKey()), undefined, {
    update: (current) => withProgress((current as typeof progress | undefined) ?? progress, args.data),
  })
}
export async function setCollectionCountsAs(
  args: Parameters<typeof server.setCollectionCountsAs>[0],
): ReturnType<typeof server.setCollectionCountsAs> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionCountsAs(args)
  const saved = (await localDocument<Record<string, string[]>>(queryResource(collectionCountsAsKey()))) ?? (await collectionCountsAs())
  await defer('setCollectionCountsAs', args.data, queryResource(collectionCountsAsKey()), undefined, {
    update: (current) => withCountsAs((current as typeof saved | undefined) ?? saved, args.data),
  })
}
export async function setCollectionWanted(
  args: Parameters<typeof server.setCollectionWanted>[0],
): ReturnType<typeof server.setCollectionWanted> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setCollectionWanted(args)
  const wishes = (await localDocument<Record<string, number>>(queryResource(collectionWishesKey()))) ?? (await collectionWishes())
  await defer('setCollectionWanted', args.data, queryResource(collectionWishesKey()), undefined, {
    update: (current) => withWanted((current as typeof wishes | undefined) ?? wishes, args.data),
  })
}
export async function setFavouriteFaction(
  args: Parameters<typeof server.setFavouriteFaction>[0],
): ReturnType<typeof server.setFavouriteFaction> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteFaction(args)
  const favourites = (await localDocument<string[]>(queryResource(favouriteFactionsKey()))) ?? (await favouriteFactions())
  await defer('setFavouriteFaction', args.data, queryResource(favouriteFactionsKey()), undefined, {
    update: (current) => withMember((current as typeof favourites | undefined) ?? favourites, args.data.catalogueId, args.data.favourite),
  })
  return null
}
export async function setFavouriteDetachment(
  args: Parameters<typeof server.setFavouriteDetachment>[0],
): ReturnType<typeof server.setFavouriteDetachment> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteDetachment(args)
  const favourites =
    (await localDocument<FavouriteDetachment[]>(queryResource(favouriteDetachmentsKey()))) ?? (await favouriteDetachments())
  await defer('setFavouriteDetachment', args.data, queryResource(favouriteDetachmentsKey()), undefined, {
    update: (current) => withFavouriteDetachment((current as typeof favourites | undefined) ?? favourites, args.data),
  })
  return null
}
export async function setFavouriteDatasheet(
  args: Parameters<typeof server.setFavouriteDatasheet>[0],
): ReturnType<typeof server.setFavouriteDatasheet> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.setFavouriteDatasheet(args)
  const favourites = (await localDocument<string[]>(queryResource(favouriteDatasheetsKey()))) ?? (await favouriteDatasheets())
  await defer('setFavouriteDatasheet', args.data, queryResource(favouriteDatasheetsKey()), undefined, {
    update: (current) => withMember((current as typeof favourites | undefined) ?? favourites, args.data.entryId, args.data.favourite),
  })
  return null
}
export async function rememberMatchup(args: Parameters<typeof server.rememberMatchup>[0]): ReturnType<typeof server.rememberMatchup> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.rememberMatchup(args)
  const input = offlineActionSchemas.rememberMatchup.parse(args.data)
  const recent = (await localDocument<RecentMatchup[]>(queryResource(recentMatchupsKey()))) ?? (await recentMatchups())
  await defer('rememberMatchup', input, queryResource(recentMatchupsKey()), undefined, {
    update: (current) => withRecentMatchup((current as RecentMatchup[] | undefined) ?? recent, input),
  })
  return null
}
export async function forgetMatchup(args: Parameters<typeof server.forgetMatchup>[0]): ReturnType<typeof server.forgetMatchup> {
  const defer = deferredForAccount(false)
  if (!localEngine()) return server.forgetMatchup(args)
  const recent = (await localDocument<RecentMatchup[]>(queryResource(recentMatchupsKey()))) ?? (await recentMatchups())
  await defer('forgetMatchup', args.data, queryResource(recentMatchupsKey()), undefined, {
    update: (current) => withoutRecentMatchup((current as RecentMatchup[] | undefined) ?? recent, args.data.shared),
  })
  return null
}
export async function setAbilityReminder(
  args: Parameters<typeof server.setAbilityReminder>[0],
): ReturnType<typeof server.setAbilityReminder> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.setAbilityReminder(args)
  const input = offlineActionSchemas.setAbilityReminder.parse(args.data)
  const saved = (await localDocument<AbilityReminder[]>(queryResource(abilityRemindersKey()))) ?? (await abilityReminders())
  await defer('setAbilityReminder', input, queryResource(abilityRemindersKey()), undefined, {
    update: (current) => withAbilityReminder((current as AbilityReminder[] | undefined) ?? saved, input),
  })
  return null
}
export async function removeAbilityReminder(
  args: Parameters<typeof server.removeAbilityReminder>[0],
): ReturnType<typeof server.removeAbilityReminder> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.removeAbilityReminder(args)
  const saved = (await localDocument<AbilityReminder[]>(queryResource(abilityRemindersKey()))) ?? (await abilityReminders())
  await defer('removeAbilityReminder', args.data, queryResource(abilityRemindersKey()), undefined, {
    update: (current) => ((current as AbilityReminder[] | undefined) ?? saved).filter((reminder) => reminder.key !== args.data.key),
  })
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
  await defer('createFriendInvite', {}, queryResource(friendInviteKey('active')), token, { identifiers: { inviteToken: token } })
  return { token }
}
export async function cancelFriendInvite(): ReturnType<typeof server.cancelFriendInvite> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.cancelFriendInvite()
  await defer('cancelFriendInvite', {}, queryResource(friendInviteKey('active')), null)
  return null
}

export async function createSealedEvent(args: Parameters<typeof server.createSealedEvent>[0]): ReturnType<typeof server.createSealedEvent> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.createSealedEvent(args)
  const input = offlineActionSchemas.createSealedEvent.parse(args.data)
  const identifiers = {
    tournamentId: crypto.randomUUID(),
    tournamentToken: crypto.randomUUID(),
    eventId: crypto.randomUUID(),
    eventToken: crypto.randomUUID(),
  }
  const me = localClient()!.getQueryData<{ id: string; name: string; image: string | null }>(meKey())!
  const now = Date.now()
  const draft: NonNullable<Awaited<ReturnType<typeof server.openSealedEvent>>> = {
    kind: 'tournament',
    token: identifiers.tournamentToken,
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
    group: null,
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
    sharedPoints: input.sharedPoints ?? false,
    playsAt: input.schedule?.playsAt ?? null,
    sealBy: input.schedule?.sealBy ?? null,
    remindedAt: null,
    pairings: [],
    occupiedCount: 0,
    entries: [],
  }
  await defer('createSealedEvent', input, `sealed-event:${identifiers.tournamentToken}`, draft, { identifiers })
  return { token: identifiers.tournamentToken, eventToken: identifiers.eventToken }
}
export const requestFriend = queuedAction(
  () => server.requestFriend,
  'requestFriend',
  (data) => `friend:${data.userId}`,
  undefined,
)

export const acceptFriend = queuedAction(
  () => server.acceptFriend,
  'acceptFriend',
  (data) => `friend:${data.userId}`,
  undefined,
)

export const rejectFriend = queuedAction(
  () => server.rejectFriend,
  'rejectFriend',
  (data) => `friend:${data.userId}`,
  undefined,
)

export const removeFriend = queuedAction(
  () => server.removeFriend,
  'removeFriend',
  (data) => `friend:${data.userId}`,
  undefined,
)

export const acceptFriendInvite = queuedAction(
  () => server.acceptFriendInvite,
  'acceptFriendInvite',
  (data) => `invite:${data.token}`,
  null,
)

export const joinSealedEvent = queuedAction(
  () => server.joinSealedEvent,
  'joinSealedEvent',
  (data) => `sealed-event:${data.token}`,
  'pending',
)

export const addSealedEventEntrants = queuedAction(
  () => server.addSealedEventEntrants,
  'addSealedEventEntrants',
  (data) => `sealed-event:${data.token}`,
  { added: 0 },
)

export const admitSealedEventEntries = queuedAction(
  () => server.admitSealedEventEntries,
  'admitSealedEventEntries',
  (data) => `sealed-event:${data.token}`,
  {
    admitted: 0,
  },
)

export const moderateSealedEventEntry = queuedAction(
  () => server.moderateSealedEventEntry,
  'moderateSealedEventEntry',
  (data) => `sealed-event:${data.token}`,
  null,
)

export async function submitSealedEventRoster(
  args: Parameters<typeof server.submitSealedEventRoster>[0],
): ReturnType<typeof server.submitSealedEventRoster> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.submitSealedEventRoster(args)
  const roster = await localDocument<LocalRoster>(`roster:${args.data.rosterId}`)
  const construction = roster ? await localConstruction(roster.catalogueId) : null
  if (!roster || !construction) {
    if (navigator.onLine) return server.submitSealedEventRoster(args)
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
  if (!waivedWarlordRules(snapshot).length && !sealedEventWarlordValid(snapshot)) throw new Error(sealedEventWarlordRefusal(snapshot))
  await defer(
    'submitSealedEventRoster',
    { ...args.data, capturedRoster: saveRosterSchema.parse(roster), catalogueRevision: construction.catalogue.index.revision },
    `sealed-event:${args.data.token}`,
    undefined,
    { dependencies: [`roster:${args.data.rosterId}`] },
  )
  return null
}

export const setSealedEventTeamWarlord = queuedAction(
  () => server.setSealedEventTeamWarlord,
  'setSealedEventTeamWarlord',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const setSealedEventTeamDisposition = queuedAction(
  () => server.setSealedEventTeamDisposition,
  'setSealedEventTeamDisposition',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const revealSealedEvent = queuedAction(
  () => server.revealSealedEvent,
  'revealSealedEvent',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const unsealSealedEventRoster = queuedAction(
  () => server.unsealSealedEventRoster,
  'unsealSealedEventRoster',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const assignSealedEventRosterRequirement = queuedAction(
  () => server.assignSealedEventRosterRequirement,
  'assignSealedEventRosterRequirement',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const chooseSealedEventSide = queuedAction(
  () => server.chooseSealedEventSide,
  'chooseSealedEventSide',
  (data) => `sealed-event:${data.token}`,
  null,
)

export async function assignSealedEventTeam(
  args: Parameters<typeof server.assignSealedEventTeam>[0],
): ReturnType<typeof server.assignSealedEventTeam> {
  const defer = deferredForAccount()
  if (!localEngine()) return server.assignSealedEventTeam(args)
  await defer('assignSealedEventTeam', args.data, `sealed-event:${args.data.token}`, undefined, {
    identifiers: { teamId: crypto.randomUUID() },
  })
  return null
}

export const updateSealedEvent = queuedAction(
  () => server.updateSealedEvent,
  'updateSealedEvent',
  (data) => `sealed-event:${data.token}`,
  null,
)

export const deleteSealedEvent = queuedAction(
  () => server.deleteSealedEvent,
  'deleteSealedEvent',
  (data) => `sealed-event:${data.token}`,
  null,
)

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
    tournament: current.completedTasks.includes('tournament'),
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

export async function sealedEventBattleOptions(
  args: Parameters<typeof server.sealedEventBattleOptions>[0],
): ReturnType<typeof server.sealedEventBattleOptions> {
  if (!localEngine()) return server.sealedEventBattleOptions(args)
  const owner = localOwner()!
  const sealedEvents = await listSealedEvents()
  const candidates = await Promise.all(
    sealedEvents
      .filter((sealedEvent) => sealedEvent.personal)
      .map(async (summary) => {
        const sealedEvent = await openSealedEvent({ data: { token: summary.token } })
        return sealedEvent?.revealedAt
          ? {
              ...sealedEvent,
              name: sealedEventTitle(sealedEvent),
              entries: sealedEvent.entries.filter((entry) => entry.status === 'accepted' && entry.submitted),
            }
          : null
      }),
  )
  const matching = matchingSealedEventBattles(
    candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null),
    owner.id,
    args.data,
  )
  if (isOffline()) return matching
  try {
    return await server.sealedEventBattleOptions(args)
  } catch {
    return matching
  }
}
