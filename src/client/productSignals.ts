import type { QueryClient } from '@tanstack/react-query'

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
    'saved-roster-price',
    'player-rosters',
    'player-profile',
    'discovered-rosters',
    'roster-loans',
    'rosters-lent-to-me',
  ],
  collection: ['collection', 'collection-counts', 'collection-profile'],
  favourites: ['favourite-factions', 'favourite-detachments', 'favourite-datasheets'],
  journal: ['journal'],
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
