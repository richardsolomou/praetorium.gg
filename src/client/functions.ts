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

export { retireDeviceConstruction } from './offline/constructionWorker'

export {
  loadoutSearch,
  prepareFactionUnits,
  priceRoster,
  units,
  datasheetOfferedBy,
  datasheet,
  loadoutDatasheets,
  combatantDatasheet,
  combatantDatasheets,
  combatLoadouts,
  unitBattleDetails,
  reminderAbilities,
  detachmentRules,
  exportRoster,
  importRoster,
} from './offline/constructionFunctions'

export {
  rosterAccess,
  rosterBootstrap,
  sharedRoster,
  DELETED_ROSTER_MESSAGE,
  saveRoster,
  copyRoster,
  projectLocalState,
  deleteRoster,
  setRosterVisibility,
  shareSealedEventRoster,
  saveUnitLoadout,
  renameUnitLoadout,
  deleteUnitLoadout,
  setRosterLocked,
  setRosterArchived,
  splitRosterVariant,
  changeRosters,
  savedRosterLoadoutDatasheets,
  savedRosterSummaries,
  savedRosterPage,
  homeRosters,
  rosterChanges,
  savedRosterChangedIds,
} from './offline/rosterFunctions'

export {
  openBattle,
  submit,
  battleReport,
  replayBattleAt,
  replayBattleBatch,
  createBattle,
  createSealedEventBattle,
  myBattles,
} from './offline/battleFunctions'

export {
  collection,
  collectionCounts,
  collectionProgress,
  collectionWishes,
  collectionCountsAs,
  fieldedDatasheets,
  wishlistSuggestions,
  updateOnboardingProgress,
  favouriteFactions,
  favouriteDetachments,
  favouriteDatasheets,
  recentMatchups,
  playerDefaults,
  onboardingProgress,
  notificationSettings,
  friendships,
  opponents,
  listSealedEvents,
  activeFriendInvite,
  friendInvite,
  openSealedEventRoster,
  listFriendSealedEventRosters,
  outdatedSealedEventEntriesForRoster,
  openSealedEvent,
  requestFriend,
  acceptFriend,
  rejectFriend,
  removeFriend,
  acceptFriendInvite,
  joinSealedEvent,
  addSealedEventEntrants,
  admitSealedEventEntries,
  moderateSealedEventEntry,
  submitSealedEventRoster,
  revealSealedEvent,
  unsealSealedEventRoster,
  assignSealedEventRosterRequirement,
  assignSealedEventTeam,
  chooseSealedEventSide,
  updateSealedEvent,
  deleteSealedEvent,
  deleteBattle,
  setOwned,
  setCollectionModels,
  setCollectionProgress,
  setCollectionWanted,
  setCollectionCountsAs,
  setFavouriteFaction,
  setFavouriteDetachment,
  setFavouriteDatasheet,
  rememberMatchup,
  forgetMatchup,
  abilityReminders,
  setAbilityReminder,
  removeAbilityReminder,
  setPlayerDefaults,
  createFriendInvite,
  cancelFriendInvite,
  createSealedEvent,
  sealedEventBattleOptions,
} from './offline/actionFunctions'

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
