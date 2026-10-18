import type { PlayerProfileFilter } from './battles'

export const meKey = () => ['me']
export const onboardingKey = () => ['onboarding']
export const favouriteFactionsKey = () => ['favourite-factions']
export const favouriteDetachmentsKey = () => ['favourite-detachments']
export const favouriteDatasheetsKey = () => ['favourite-datasheets']
export const recentMatchupsKey = () => ['recent-matchups']
export const localWorkKey = () => ['local-work']
export const unitLoadoutsKey = () => ['unit-loadouts']
export const realtimeModeKey = () => ['realtime-mode']
export const rulesTextKey = (sha256: string | undefined) => ['rules-text', sha256]
export const rosterAccessKey = (id: string, battle?: string | null) => ['roster-access', id, battle ?? null]
export const rosterBootstrapKey = (id: string, battle?: string | null) => ['roster-bootstrap', id, battle ?? null]
export const sharedRosterKey = (id: string, battle?: string | null) => ['shared-roster', id, battle ?? null]
export const savedRosterSummariesKey = () => ['saved-roster-summaries']
export const savedRosterPageKey = (ids: readonly string[]) => ['saved-roster-page', ids]
export const homeRostersKey = () => ['home-rosters']
export const rosterChangesKey = (id: string) => ['roster-changes', id]
export const savedRosterChangedIdsKey = () => ['saved-roster-changed-ids']
export const factionIndexKey = () => ['faction-index']
export const factionKey = (catalogueId: string) => ['faction', catalogueId]
export const factionDatasheetsKey = (catalogueId: string, query: string) => ['faction-datasheets', catalogueId, query]
export const combatUnitsKey = () => ['combat-units']
export const catalogueChangesKey = (faction?: string | null, before?: string | null) => [
  'catalogue-changes',
  faction ?? null,
  before ?? null,
]
export const armyUpdatesKey = (factions: readonly string[]) => ['army-updates', factions]

export const collectionKey = () => ['collection']
export const collectionCountsKey = () => ['collection-counts']
export const collectionProgressKey = () => ['collection-progress']
export const collectionWishesKey = () => ['collection-wishes']
export const fieldedDatasheetsKey = () => ['fielded-datasheets']
/** Without an entry, every datasheet's photos. */
export const datasheetPhotosKey = (entryId?: string) => (entryId === undefined ? ['datasheet-photos'] : ['datasheet-photos', entryId])
/** Without a player, every player's collection. */
export const collectionProfileKey = (userId?: string) => (userId === undefined ? ['collection-profile'] : ['collection-profile', userId])
export const playerDefaultsKey = () => ['player-defaults']
export const battleAudienceKey = () => ['battle-audience']
export const notificationSettingsKey = () => ['notification-settings']
export const friendshipsKey = () => ['friendships']
export const opponentsKey = () => ['opponents']
/** `'active'` names the signed-in player's own open invite. */
export const friendInviteKey = (token: string) => ['friend-invite', token]
export const userProfileKey = (userId: string) => ['user-profile', userId]
export const playerRostersKey = (userId: string) => ['player-rosters', userId]
export const playerRankingsKey = (userId: string) => ['player-rankings', userId]
export const playerProfileKey = (userId: string, filter: PlayerProfileFilter) => ['player-profile', userId, filter]
/** Without a query, every search. */
export const playerSearchKey = (query?: string) => (query === undefined ? ['player-search'] : ['player-search', query])
export const standingsKey = () => ['standings']

export const battlesKey = () => ['battles']
export const publicBattlesKey = () => ['public-battles']
export const friendBattlesKey = () => ['friend-battles']
export const battleKey = (token: string) => ['battle', token]
export const guestInviteKey = (token: string, playerId: string) => ['guest-invite', token, playerId]
export const guestInvitationKey = (invite: string) => ['guest-invitation', invite]
export const reportKey = (token: string) => ['report', token]
/** Without a sequence, every replayed point of the battle. */
export const battleReplayKey = (token: string, seq?: number) =>
  seq === undefined ? ['battle-replay', token] : ['battle-replay', token, seq]

export const leaguesKey = () => ['leagues']
/** Every read under the league, including its results. */
export const leagueReadsKey = (token: string) => ['league', token]
export const leagueKey = (token: string, eventToken?: string) => [...leagueReadsKey(token), eventToken ?? 'current']
export const leagueResultsKey = (token: string, eventToken: string) => [...leagueReadsKey(token), 'results', eventToken]
export const leagueRosterKey = (token: string, eventToken: string | undefined, userId: string) => [
  'league-roster',
  token,
  eventToken,
  userId,
]
export const leagueBattlesKey = (token: string, eventToken: string) => ['league-battles', token, eventToken]
/** Without a roster, every roster's outdated entries. */
export const outdatedLeagueEntriesKey = (rosterId?: string) =>
  rosterId === undefined ? ['outdated-league-entries'] : ['outdated-league-entries', rosterId]
