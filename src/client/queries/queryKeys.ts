import type { PlayerProfileFilter } from './battles'

export const meKey = () => ['me']
export const onboardingKey = () => ['onboarding']
export const favouriteFactionsKey = () => ['favourite-factions']
export const favouriteDetachmentsKey = () => ['favourite-detachments']
export const favouriteDatasheetsKey = () => ['favourite-datasheets']
export const recentMatchupsKey = () => ['recent-matchups']
export const abilityRemindersKey = () => ['ability-reminders']
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
export const collectionCountsAsKey = () => ['collection-counts-as']
export const fieldedDatasheetsKey = () => ['fielded-datasheets']
export const wishlistSuggestionsKey = () => ['wishlist-suggestions']
/** Every administration read sits under one key, so an administrator's change refreshes all of them. */
export const adminKey = () => ['admin']
/** Every Support read sits under one key, so a change of identity resets all of them. */
export const supportKey = () => ['support']
export const supportTicketsKey = () => ['support', 'tickets']
/** Without a conversation, every conversation's messages. */
export const supportMessagesKey = (ticketId?: string) =>
  ticketId === undefined ? ['support', 'messages'] : ['support', 'messages', ticketId]
export const supportOpeningKey = (ticketId: string) => ['support', 'opening', ticketId]
export const supportIdentityKey = (userId: string | undefined) => ['support-identity', userId]
/** Without an entry, every datasheet's photos. */
export const datasheetPhotosKey = (entryId?: string) => (entryId === undefined ? ['datasheet-photos'] : ['datasheet-photos', entryId])
/** Without a player, every player's collection. */
export const collectionProfileKey = (userId?: string) => (userId === undefined ? ['collection-profile'] : ['collection-profile', userId])
export const playerDefaultsKey = () => ['player-defaults']
export const notificationSettingsKey = () => ['notification-settings']
export const friendshipsKey = () => ['friendships']
export const opponentsKey = () => ['opponents']
/** `'active'` names the signed-in player's own open invite. */
export const friendInviteKey = (token: string) => ['friend-invite', token]
export const userProfileKey = (userId?: string) => (userId === undefined ? ['user-profile'] : ['user-profile', userId])
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

export const clubsKey = () => ['clubs']
export const clubKey = (token: string) => ['club', token]
export const clubStandingsKey = (token: string) => ['club-standings', token]
export const battleClubsKey = (token: string) => ['battle-clubs', token]
export const leaguesKey = () => ['leagues']
/** Every read under the league, including its results. */
export const leagueReadsKey = (token: string) => ['league', token]
export const leagueKey = (token: string, eventToken?: string) => [...leagueReadsKey(token), eventToken ?? 'current']
export const leagueResultsKey = (token: string, eventToken: string) => [...leagueReadsKey(token), 'results', eventToken]
export const revealedLeagueRostersKey = (token: string, eventToken: string) => [...leagueReadsKey(token), 'rosters', eventToken]
export const leagueRosterSharingKey = (token: string, eventToken: string, userId: string) => [
  'league-roster-sharing',
  token,
  eventToken,
  userId,
]
export const leagueRosterKey = (token: string, eventToken: string | undefined, userId: string) => [
  'league-roster',
  token,
  eventToken,
  userId,
]
export const friendLeagueRostersKey = () => ['friend-league-rosters']
export const leagueBattlesKey = (token: string, eventToken: string) => ['league-battles', token, eventToken]
/** Without a roster, every roster's outdated entries. */
export const outdatedLeagueEntriesKey = (rosterId?: string) =>
  rosterId === undefined ? ['outdated-league-entries'] : ['outdated-league-entries', rosterId]
