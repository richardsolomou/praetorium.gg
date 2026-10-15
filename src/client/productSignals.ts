import type { QueryClient } from '@tanstack/react-query'
import { MAX_LOCAL_OPERATIONS, type LocalOperation } from '../contracts/localState'
import type { OfflineActionKind } from '../contracts/offlineActions'

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
  ],
  collection: ['collection', 'collection-counts', 'collection-profile'],
  favourites: ['favourite-factions', 'favourite-detachments', 'favourite-datasheets'],
  friends: ['friendships', 'friend-battles', 'shared-battles', 'opponents', 'player-profile', 'player-search'],
  invites: ['friend-invite'],
  onboarding: ['onboarding'],
  settings: ['battle-audience', 'notification-settings', 'player-defaults', 'public-battles', 'friend-battles'],
  leagues: ['leagues', 'league', 'league-roster', 'league-battles', 'opponents'],
  // Standings and rankings change only when a battle finishes, which the public standings signal reports.
  battles: ['battles', 'public-battles', 'friend-battles', 'shared-battles', 'player-profile', 'league-battles'],
} as const

const publicQueryFamilies = {
  collection: ['collection-profile'],
  // An open battle follows its own signal, or polls while it has none, so every command elsewhere does not refetch it.
  battles: ['public-battles', 'friend-battles', 'shared-battles', 'player-profile', 'league-battles'],
  standings: ['standings', 'player-rankings'],
  rosters: ['player-rosters', 'shared-roster', 'roster-access', 'discovered-rosters'],
  leagues: ['leagues', 'league', 'league-roster', 'league-battles'],
  invites: ['friend-invite'],
  opponents: ['opponents', 'player-search'],
} as const

export type ProductScope = keyof typeof queryFamilies

const operationScopes = {
  saveRoster: ['rosters'],
  deleteRoster: ['rosters'],
  battleCommand: ['battles'],
  setOwned: ['collection'],
  setCollectionModels: ['collection'],
  setFavouriteFaction: ['favourites'],
  setFavouriteDetachment: ['favourites'],
  setFavouriteDatasheet: ['favourites'],
  setPlayerDefaults: ['settings'],
  setBattleAudience: ['settings'],
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
  createLeagueEvent: ['leagues'],
  joinLeague: ['leagues'],
  addLeagueEntrants: ['leagues'],
  admitLeagueEntries: ['leagues'],
  moderateLeagueEntry: ['leagues'],
  submitLeagueRoster: ['leagues'],
  setLeagueTeamDisposition: ['leagues'],
  revealLeague: ['leagues'],
  unsealLeagueRoster: ['leagues'],
  assignLeagueRosterRequirement: ['leagues'],
  assignLeagueTeam: ['leagues'],
  updateLeague: ['leagues'],
  deleteLeague: ['leagues'],
  deleteBattle: ['battles'],
  createBattle: ['battles'],
  createLeagueBattle: ['battles', 'leagues'],
} as const satisfies Record<OfflineActionKind | 'saveRoster' | 'deleteRoster' | 'battleCommand', readonly ProductScope[]>

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
    if (resource.startsWith('battle:')) exact.push(['battle', resource.slice(7)], ['report', resource.slice(7)])
    if (resource.startsWith('query:')) exact.push(JSON.parse(resource.slice(6)) as unknown[])
  }
  return queryClient.invalidateQueries(
    {
      predicate: ({ queryKey }) =>
        families.has(queryKey[0] as string) || exact.some((key) => JSON.stringify(queryKey.slice(0, key.length)) === JSON.stringify(key)),
    },
    { cancelRefetch: false },
  )
}

export function invalidateProductQueries(queryClient: QueryClient, scope?: string) {
  const families = scope && scope in queryFamilies ? queryFamilies[scope as ProductScope] : Object.values(queryFamilies).flat()
  const keys = new Set<string>(families)
  return queryClient.invalidateQueries({ predicate: (query) => keys.has(query.queryKey[0] as string) })
}

export function invalidatePublicProductQueries(queryClient: QueryClient, scope?: string) {
  const families =
    scope && scope in publicQueryFamilies
      ? publicQueryFamilies[scope as keyof typeof publicQueryFamilies]
      : Object.values(publicQueryFamilies).flat()
  const keys = new Set<string>(families)
  return queryClient.invalidateQueries({ predicate: (query) => keys.has(query.queryKey[0] as string) })
}

/**
 * Refreshes every product query once, for a connection that cannot tell what changed before it arrived.
 *
 * Several query families sit in both the account and the public lists, so refreshing the two lists apart would
 * fetch those twice, the second request cancelling the first.
 */
export function invalidateEveryProductQuery(queryClient: QueryClient, signedIn: boolean) {
  const keys = new Set<string>([...Object.values(publicQueryFamilies).flat(), ...(signedIn ? Object.values(queryFamilies).flat() : [])])
  return queryClient.invalidateQueries({ predicate: (query) => keys.has(query.queryKey[0] as string) })
}

export function invalidateAdminProductQueries(queryClient: QueryClient, scope?: string) {
  if (scope !== undefined && scope !== 'admin-users') return Promise.resolve()
  return queryClient.invalidateQueries({ queryKey: ['admin'] })
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
