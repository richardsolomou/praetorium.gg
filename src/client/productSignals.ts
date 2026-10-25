import { partialMatchKey, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { MAX_LOCAL_OPERATIONS, type LocalOperation } from '../contracts/localState'
import type { OfflineActionKind } from '../contracts/offlineActions'
import { adminKey, battleKey, reportKey } from './queries/queryKeys'

const queryFamilies = {
  rosters: [
    'roster-bootstrap',
    'roster-access',
    'shared-roster',
    'saved-roster-summaries',
    'home-rosters',
    'saved-roster-page',
    'saved-roster-changed-ids',
    'roster-changes',
    'saved-roster-loadout-datasheets',
    'player-rosters',
    'player-profile',
    'discovered-rosters',
    'roster-loans',
    'rosters-lent-to-me',
    'outdated-league-entries',
    'unit-loadouts',
    'league-roster-sharing',
  ],
  collection: [
    'collection',
    'collection-counts',
    'collection-progress',
    'collection-wishes',
    'collection-counts-as',
    'collection-photos',
    'collection-photo-shows',
    'collection-profile',
    'datasheet-photos',
  ],
  favourites: ['favourite-factions', 'favourite-detachments', 'favourite-datasheets'],
  friends: ['friendships', 'friend-battles', 'opponents', 'player-profile', 'player-search'],
  invites: ['friend-invite'],
  onboarding: ['onboarding'],
  settings: ['notification-settings', 'player-defaults', 'ability-reminders', 'public-battles', 'friend-battles', 'played-armies'],
  leagues: ['leagues', 'league', 'league-roster', 'league-roster-sharing', 'league-battles', 'opponents'],
  clubs: ['clubs', 'club', 'club-standings', 'battle-clubs'],
  // Standings and rankings change only when a battle finishes, which the public standings signal reports.
  battles: ['battles', 'public-battles', 'friend-battles', 'player-profile', 'league-battles', 'played-armies', 'battle-clubs'],
  simulator: ['recent-matchups'],
} as const

const publicQueryFamilies = {
  collection: ['collection-profile', 'datasheet-photos'],
  // An open battle follows its own signal, or polls while it has none, so every command elsewhere does not refetch it.
  battles: ['public-battles', 'friend-battles', 'player-profile', 'league-battles'],
  standings: ['standings', 'player-rankings', 'club-standings'],
  rosters: ['player-rosters', 'shared-roster', 'roster-access', 'discovered-rosters'],
  leagues: ['leagues', 'league', 'league-roster', 'league-roster-sharing', 'league-battles'],
  clubs: ['clubs', 'club', 'club-standings', 'battle-clubs'],
  invites: ['friend-invite'],
  opponents: ['opponents', 'player-search'],
} as const

export type ProductScope = keyof typeof queryFamilies

const followRosterSignals = new Set<string>(['discovered-rosters', 'roster-loans', 'rosters-lent-to-me'])
/** What a roster write refreshes; live roster signals refresh discovery and loans, so the write does not wait on them. */
export const savedRosterFamilies = new Set<string>(queryFamilies.rosters.filter((family) => !followRosterSignals.has(family)))

const operationScopes = {
  saveRoster: ['rosters'],
  deleteRoster: ['rosters'],
  battleCommand: ['battles'],
  setOwned: ['collection'],
  setCollectionModels: ['collection'],
  setCollectionProgress: ['collection'],
  setCollectionWanted: ['collection'],
  setCollectionCountsAs: ['collection'],
  setFavouriteFaction: ['favourites'],
  setFavouriteDetachment: ['favourites'],
  setFavouriteDatasheet: ['favourites'],
  rememberMatchup: ['simulator'],
  forgetMatchup: ['simulator'],
  setAbilityReminder: ['settings'],
  removeAbilityReminder: ['settings'],
  setPlayerDefaults: ['settings'],
  setPushNotifications: ['settings'],
  updateOnboardingProgress: ['onboarding'],
  requestFriend: ['friends'],
  acceptFriend: ['friends'],
  rejectFriend: ['friends'],
  removeFriend: ['friends'],
  acceptFriendInvite: ['friends', 'invites'],
  createFriendInvite: ['invites'],
  cancelFriendInvite: ['invites'],
  createLeague: ['leagues'],
  joinLeague: ['leagues'],
  addLeagueEntrants: ['leagues'],
  admitLeagueEntries: ['leagues'],
  moderateLeagueEntry: ['leagues'],
  submitLeagueRoster: ['leagues'],
  setLeagueTeamDisposition: ['leagues'],
  setLeagueTeamWarlord: ['leagues'],
  revealLeague: ['leagues'],
  unsealLeagueRoster: ['leagues'],
  assignLeagueRosterRequirement: ['leagues'],
  assignLeagueTeam: ['leagues'],
  chooseLeagueSide: ['leagues'],
  updateLeague: ['leagues'],
  deleteLeague: ['leagues'],
  deleteBattle: ['battles'],
  createBattle: ['battles'],
  createLeagueBattle: ['battles', 'leagues'],
} as const satisfies Record<OfflineActionKind | 'saveRoster' | 'deleteRoster' | 'battleCommand', readonly ProductScope[]>

/** Matches a query whose key starts with one of these families. */
export const inFamilies =
  (families: ReadonlySet<string>) =>
  ({ queryKey }: { queryKey: QueryKey }) =>
    families.has(queryKey[0] as string)

const synced = new Set<string>()

/**
 * Refreshes what the synced operations could have changed on the server, once per operation.
 *
 * The sync engine and the sync status both report the same acknowledgement, so a second report is a no-op instead of
 * cancelling the first refetch and starting it again. Catalogue reads and roster prices depend only on their inputs,
 * so no sync refreshes them.
 */
export function invalidateSyncedQueries(queryClient: QueryClient, operations: readonly Pick<LocalOperation, 'id' | 'kind' | 'resource'>[]) {
  const fresh = operations.filter(({ id }) => !synced.has(id))
  if (!fresh.length) return Promise.resolve()
  for (const { id } of fresh) synced.add(id)
  for (const id of synced) if (synced.size > MAX_LOCAL_OPERATIONS) synced.delete(id)
  const families = new Set<string>()
  const exact: unknown[][] = []
  for (const { kind, resource } of fresh) {
    const scopes: readonly ProductScope[] =
      kind in operationScopes ? operationScopes[kind as keyof typeof operationScopes] : (Object.keys(queryFamilies) as ProductScope[])
    for (const scope of scopes) for (const key of queryFamilies[scope]) families.add(key)
    if (resource.startsWith('battle:')) exact.push(battleKey(resource.slice(7)), reportKey(resource.slice(7)))
    if (resource.startsWith('query:')) exact.push(JSON.parse(resource.slice(6)) as unknown[])
  }
  const inFamily = inFamilies(families)
  return queryClient.invalidateQueries(
    { predicate: (query) => inFamily(query) || exact.some((key) => partialMatchKey(query.queryKey, key)) },
    { cancelRefetch: false },
  )
}

export function invalidateProductQueries(queryClient: QueryClient, scope?: string) {
  const families = scope && scope in queryFamilies ? queryFamilies[scope as ProductScope] : Object.values(queryFamilies).flat()
  return queryClient.invalidateQueries({ predicate: inFamilies(new Set(families)) })
}

export function invalidatePublicProductQueries(queryClient: QueryClient, scope?: string) {
  const families =
    scope && scope in publicQueryFamilies
      ? publicQueryFamilies[scope as keyof typeof publicQueryFamilies]
      : Object.values(publicQueryFamilies).flat()
  return queryClient.invalidateQueries({ predicate: inFamilies(new Set(families)) })
}

/**
 * Refreshes every product query once, for a connection that cannot tell what changed before it arrived.
 *
 * Several query families sit in both the account and the public lists, so refreshing the two lists apart would
 * fetch those twice, the second request cancelling the first.
 */
export function invalidateEveryProductQuery(queryClient: QueryClient, signedIn: boolean) {
  const keys = new Set<string>([...Object.values(publicQueryFamilies).flat(), ...(signedIn ? Object.values(queryFamilies).flat() : [])])
  return queryClient.invalidateQueries({ predicate: inFamilies(keys) })
}

export function invalidateAdminProductQueries(queryClient: QueryClient, scope?: string) {
  if (scope !== undefined && scope !== 'admin-users') return Promise.resolve()
  return queryClient.invalidateQueries({ queryKey: adminKey() })
}

/**
 * Runs an invalidation at once, then at most once more per window for the same scope however many signals arrive.
 *
 * Every command in any public battle moves the public battles signal, so an open tab would otherwise refetch the
 * feed on each one.
 */
export function coalescedBy(windowMs: number, run: (scope?: string) => void) {
  const windows = new Map<string, { pending: boolean; timer: ReturnType<typeof setTimeout> }>()
  const open = (key: string, scope?: string) => {
    run(scope)
    const entry = {
      pending: false,
      timer: setTimeout(() => {
        windows.delete(key)
        if (entry.pending) open(key, scope)
      }, windowMs),
    }
    windows.set(key, entry)
  }
  const coalesced = (scope?: string) => {
    const key = scope ?? ''
    const held = windows.get(key)
    if (held) held.pending = true
    else open(key, scope)
  }
  coalesced.cancel = () => {
    for (const { timer } of windows.values()) clearTimeout(timer)
    windows.clear()
  }
  return coalesced
}
