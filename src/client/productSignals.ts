import type { QueryClient } from '@tanstack/react-query'

const queryFamilies = {
  rosters: [
    'roster-access',
    'shared-roster',
    'saved-roster-summaries',
    'saved-roster-totals',
    'home-rosters',
    'saved-roster-page',
    'saved-roster-changed-count',
    'roster-changes',
    'saved-roster-loadout-datasheets',
    'saved-roster-price',
    'player-rosters',
    'player-profile',
  ],
  collection: ['collection'],
  favourites: ['favourite-factions', 'favourite-detachments'],
  friends: ['friendships', 'friend-battles', 'shared-battles', 'opponents', 'player-profile', 'player-search'],
  invites: ['friend-invite'],
  onboarding: ['onboarding'],
  settings: ['battle-audience', 'notification-settings', 'player-defaults', 'public-battles', 'friend-battles'],
  leagues: ['leagues', 'league', 'league-roster', 'league-battles', 'opponents'],
  battles: [
    'battles',
    'public-battles',
    'friend-battles',
    'shared-battles',
    'player-profile',
    'player-rankings',
    'standings',
    'league-battles',
  ],
} as const

const publicQueryFamilies = {
  battles: ['public-battles', 'friend-battles', 'shared-battles', 'battle', 'report', 'player-profile', 'league-battles'],
  standings: ['standings', 'player-rankings'],
  rosters: ['player-rosters', 'shared-roster', 'roster-access'],
  leagues: ['leagues', 'league', 'league-roster', 'league-battles'],
  invites: ['friend-invite'],
  opponents: ['opponents', 'player-search'],
} as const

export type ProductScope = keyof typeof queryFamilies

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

export function invalidateAdminProductQueries(queryClient: QueryClient, scope?: string) {
  if (scope !== undefined && scope !== 'admin-users') return Promise.resolve()
  return queryClient.invalidateQueries({ queryKey: ['admin-users'] })
}
