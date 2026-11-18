import { cachedRead, cachedPage, filteredPage } from './offline/reads'
import { battleFilterActive, matchesBattle, type BattleFilter } from '../core/battleFilter'
import type { BattlesCursor } from '../contracts/battles'
import * as server from '../server/functions'
import { loadSavedQuery, referenceData } from './offline/runtime'
import {
  catalogueChangesKey,
  combatUnitsKey,
  friendBattlesKey,
  sealedEventBattlesKey,
  meKey,
  playerBattlesKey,
  playerProfileKey,
  playerRankingsKey,
  playerAchievementsKey,
  battleRatingChangesKey,
  playerRostersKey,
  playerSearchKey,
  publicBattlesKey,
  standingsKey,
  userProfileKey,
} from './queries/queryKeys'

export * from '../server/functions'
export { browserAgentToolCatalog, callBrowserAgentTool, prepareBrowserAgentTool } from '../server/functions/agentTools'
export { mcpConnections, revokeMcpConnection } from '../server/functions/mcpConnections'

/**
 * The device fallbacks load on first use, or once the page is idle, so a page's first load carries none of the offline engine.
 * Once loaded, each call goes straight through, with the same timing as a static import.
 */
function lazily<M>(load: () => Promise<M>) {
  let loaded: M | undefined
  const module = () => load().then((found) => (loaded = found))
  idleLoads.push(module)
  return <K extends DeferrableKeys<M>>(name: K) =>
    ((...args: unknown[]) => (loaded ? call(loaded, name, args) : module().then((found) => call(found, name, args)))) as M[K]
}
type Deferrable = (...args: any[]) => Promise<unknown> | void
type DeferrableKeys<M> = { [K in keyof M]: M[K] extends Deferrable ? K : never }[keyof M]
const call = <M>(found: M, name: keyof M, args: unknown[]) => (found[name] as Deferrable)(...args)
const idleLoads: (() => Promise<unknown>)[] = []

/** Loads the device fallbacks after the first screen, so a connection lost later still finds them in memory. */
export function loadOfflineFallbacks() {
  return Promise.all(idleLoads.map((load) => load()))
}

export { DELETED_ROSTER_MESSAGE } from './offline/rosterMessages'

const worker = lazily(() => import('./offline/constructionWorker'))
const construction = lazily(() => import('./offline/constructionFunctions'))
const rosters = lazily(() => import('./offline/rosterFunctions'))
const battles = lazily(() => import('./offline/battleFunctions'))
const actions = lazily(() => import('./offline/actionFunctions'))

export const retireDeviceConstruction = worker('retireDeviceConstruction')

export const loadoutSearch = construction('loadoutSearch')
export const prepareFactionUnits = construction('prepareFactionUnits')
export const priceRoster = construction('priceRoster')
export const units = construction('units')
export const datasheetOfferedBy = construction('datasheetOfferedBy')
export const datasheet = construction('datasheet')
export const loadoutDatasheets = construction('loadoutDatasheets')
export const combatantDatasheet = construction('combatantDatasheet')
export const combatantDatasheets = construction('combatantDatasheets')
export const combatLoadouts = construction('combatLoadouts')
export const unitBattleDetails = construction('unitBattleDetails')
export const reminderAbilities = construction('reminderAbilities')
export const detachmentRules = construction('detachmentRules')
export const exportRoster = construction('exportRoster')
export const importRoster = construction('importRoster')

export const rosterAccess = rosters('rosterAccess')
export const rosterBootstrap = rosters('rosterBootstrap')
export const sharedRoster = rosters('sharedRoster')
export const saveRoster = rosters('saveRoster')
export const copyRoster = rosters('copyRoster')
export const projectLocalState = rosters('projectLocalState')
export const deleteRoster = rosters('deleteRoster')
export const setRosterVisibility = rosters('setRosterVisibility')
export const shareSealedEventRoster = rosters('shareSealedEventRoster')
export const saveUnitLoadout = rosters('saveUnitLoadout')
export const renameUnitLoadout = rosters('renameUnitLoadout')
export const deleteUnitLoadout = rosters('deleteUnitLoadout')
export const setRosterLocked = rosters('setRosterLocked')
export const setRosterArchived = rosters('setRosterArchived')
export const declineRosterSharing = rosters('declineRosterSharing')
export const splitRosterVariant = rosters('splitRosterVariant')
export const changeRosters = rosters('changeRosters')
export const savedRosterLoadoutDatasheets = rosters('savedRosterLoadoutDatasheets')
export const savedRosterSummaries = rosters('savedRosterSummaries')
export const savedRosterPage = rosters('savedRosterPage')
export const homeRosters = rosters('homeRosters')
export const rosterChanges = rosters('rosterChanges')
export const savedRosterChangedIds = rosters('savedRosterChangedIds')
export const savedRosterPlays = rosters('savedRosterPlays')

export const openBattle = battles('openBattle')
export const submit = battles('submit')
export const battleReport = battles('battleReport')
export const replayBattleAt = battles('replayBattleAt')
export const replayBattleBatch = battles('replayBattleBatch')
export const createBattle = battles('createBattle')
export const createSealedEventBattle = battles('createSealedEventBattle')
export const myBattles = battles('myBattles')

export const collection = actions('collection')
export const collectionCounts = actions('collectionCounts')
export const collectionProgress = actions('collectionProgress')
export const collectionWishes = actions('collectionWishes')
export const collectionCountsAs = actions('collectionCountsAs')
export const fieldedDatasheets = actions('fieldedDatasheets')
export const wishlistSuggestions = actions('wishlistSuggestions')
export const updateOnboardingProgress = actions('updateOnboardingProgress')
export const favouriteFactions = actions('favouriteFactions')
export const favouriteDetachments = actions('favouriteDetachments')
export const favouriteDatasheets = actions('favouriteDatasheets')
export const recentMatchups = actions('recentMatchups')
export const playerDefaults = actions('playerDefaults')
export const rosterFolders = actions('rosterFolders')
export const onboardingProgress = actions('onboardingProgress')
export const notificationSettings = actions('notificationSettings')
export const friendships = actions('friendships')
export const opponents = actions('opponents')
export const listSealedEvents = actions('listSealedEvents')
export const activeFriendInvite = actions('activeFriendInvite')
export const friendInvite = actions('friendInvite')
export const openSealedEventRoster = actions('openSealedEventRoster')
export const listFriendSealedEventRosters = actions('listFriendSealedEventRosters')
export const outdatedSealedEventEntriesForRoster = actions('outdatedSealedEventEntriesForRoster')
export const openSealedEvent = actions('openSealedEvent')
export const requestFriend = actions('requestFriend')
export const acceptFriend = actions('acceptFriend')
export const rejectFriend = actions('rejectFriend')
export const removeFriend = actions('removeFriend')
export const acceptFriendInvite = actions('acceptFriendInvite')
export const joinSealedEvent = actions('joinSealedEvent')
export const addSealedEventEntrants = actions('addSealedEventEntrants')
export const admitSealedEventEntries = actions('admitSealedEventEntries')
export const moderateSealedEventEntry = actions('moderateSealedEventEntry')
export const submitSealedEventRoster = actions('submitSealedEventRoster')
export const revealSealedEvent = actions('revealSealedEvent')
export const unsealSealedEventRoster = actions('unsealSealedEventRoster')
export const assignSealedEventRosterRequirement = actions('assignSealedEventRosterRequirement')
export const assignSealedEventTeam = actions('assignSealedEventTeam')
export const chooseSealedEventSide = actions('chooseSealedEventSide')
export const updateSealedEvent = actions('updateSealedEvent')
export const deleteSealedEvent = actions('deleteSealedEvent')
export const deleteBattle = actions('deleteBattle')
export const setOwned = actions('setOwned')
export const setCollectionModels = actions('setCollectionModels')
export const setCollectionProgress = actions('setCollectionProgress')
export const setCollectionWanted = actions('setCollectionWanted')
export const setCollectionCountsAs = actions('setCollectionCountsAs')
export const setFavouriteFaction = actions('setFavouriteFaction')
export const setFavouriteDetachment = actions('setFavouriteDetachment')
export const setFavouriteDatasheet = actions('setFavouriteDatasheet')
export const rememberMatchup = actions('rememberMatchup')
export const forgetMatchup = actions('forgetMatchup')
export const abilityReminders = actions('abilityReminders')
export const setAbilityReminder = actions('setAbilityReminder')
export const removeAbilityReminder = actions('removeAbilityReminder')
export const setPlayerDefaults = actions('setPlayerDefaults')
export const changeRosterFolders = actions('changeRosterFolders')
export const createFriendInvite = actions('createFriendInvite')
export const cancelFriendInvite = actions('cancelFriendInvite')
export const createSealedEvent = actions('createSealedEvent')
export const sealedEventBattleOptions = actions('sealedEventBattleOptions')

export const me = (args?: Parameters<typeof server.me>[0]) => cachedRead(meKey(), () => server.me(args))

export const combatUnits = async () => {
  const saved = await loadSavedQuery<Awaited<ReturnType<typeof server.combatUnits>>>(referenceData(), combatUnitsKey())
  return saved ?? server.combatUnits()
}

/** `perspective` is whose seat a result is read from when it is not the device owner's, as on a profile. */
const filteredBattles = <T extends Parameters<typeof matchesBattle>[0] & { lastActivity: number }>(
  key: unknown[],
  filter: BattleFilter,
  online: () => Promise<{ battles: T[]; nextCursor: BattlesCursor | null }>,
  perspective?: string,
) =>
  filteredPage<T>(key, online, (battle, viewerId) =>
    matchesBattle(battle, filter, perspective ?? viewerId, battle.lastActivity, Date.now()),
  ) as ReturnType<typeof online>
export const publicBattles = (args: Parameters<typeof server.publicBattles>[0]) =>
  battleFilterActive(args.data.filter as BattleFilter | undefined)
    ? filteredBattles(publicBattlesKey(), args.data.filter as BattleFilter, () => server.publicBattles(args))
    : cachedPage(publicBattlesKey(), args.data.before, () => server.publicBattles(args))
export const friendBattles = (args: Parameters<typeof server.friendBattles>[0]) =>
  battleFilterActive(args.data.filter as BattleFilter | undefined)
    ? filteredBattles(friendBattlesKey(), args.data.filter as BattleFilter, () => server.friendBattles(args))
    : cachedPage(friendBattlesKey(), args.data.before, () => server.friendBattles(args))
export const listSealedEventBattles = (args: Parameters<typeof server.listSealedEventBattles>[0]) =>
  battleFilterActive(args.data.filter as BattleFilter | undefined)
    ? filteredBattles(sealedEventBattlesKey(args.data.token, args.data.eventToken), args.data.filter as BattleFilter, () =>
        server.listSealedEventBattles(args),
      )
    : cachedPage(sealedEventBattlesKey(args.data.token, args.data.eventToken), args.data.before, () => server.listSealedEventBattles(args))
export const playerBattles = (args: Parameters<typeof server.playerBattles>[0]) =>
  battleFilterActive(args.data.filter as BattleFilter | undefined)
    ? filteredBattles(
        playerBattlesKey(args.data.userId),
        args.data.filter as BattleFilter,
        () => server.playerBattles(args),
        args.data.userId,
      )
    : cachedPage(playerBattlesKey(args.data.userId), args.data.before, () => server.playerBattles(args))
export const winningLists = () => server.winningLists()
export const winningList = (args: Parameters<typeof server.winningList>[0]) => server.winningList(args)
export const topFourUnitCounts = (args: Parameters<typeof server.topFourUnitCounts>[0]) => server.topFourUnitCounts(args)
export const topFourUnitLists = (args: Parameters<typeof server.topFourUnitLists>[0]) => server.topFourUnitLists(args)
export const standings = () => cachedRead(standingsKey(), () => server.standings())
export const playerRosters = (args: Parameters<typeof server.playerRosters>[0]) =>
  cachedRead(playerRostersKey(args.data.userId), () => server.playerRosters(args))
export const battleRatingChanges = (args: Parameters<typeof server.battleRatingChanges>[0]) =>
  cachedRead(battleRatingChangesKey(args.data.token), () => server.battleRatingChanges(args))
export const playerRankings = (args: Parameters<typeof server.playerRankings>[0]) =>
  cachedRead(playerRankingsKey(args.data.userId), () => server.playerRankings(args))
export const playerAchievements = (args: Parameters<typeof server.playerAchievements>[0]) =>
  cachedRead(playerAchievementsKey(args.data.userId), () => server.playerAchievements(args))
export const userProfile = (args: Parameters<typeof server.userProfile>[0]) =>
  cachedRead(userProfileKey(args.data.userId), () => server.userProfile(args))
export const playerProfile = (args: Parameters<typeof server.playerProfile>[0]) => {
  const { userId, ...filter } = args.data
  return cachedRead(playerProfileKey(userId, filter), () => server.playerProfile(args))
}
export const searchPlayers = (args: Parameters<typeof server.searchPlayers>[0]) =>
  cachedRead(playerSearchKey(args.data.query), () => server.searchPlayers(args))
export const catalogueChangeLog = (args: Parameters<typeof server.catalogueChangeLog>[0]) =>
  cachedRead(catalogueChangesKey(args.data.faction, args.data.before), () => server.catalogueChangeLog(args))
