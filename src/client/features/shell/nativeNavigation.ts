export type NativeSection = 'battles' | 'events' | 'factions' | 'home' | 'leaderboard' | 'missions' | 'rosters' | 'rules'

type NativeNavigation = {
  /**
   * Where Back leads when history cannot. A tab's own top screen is the bottom of that tab, so it has none:
   * the tabs, not a back stack, are how a player leaves one section for another.
   */
  back?: string
  section?: NativeSection
  title: string
}

export function nativeNavigation(path: string, search: Record<string, unknown> = {}): NativeNavigation {
  const segments = path.split('/').filter(Boolean)
  const [root, id, child, detail] = segments

  if (root === 'rosters') {
    if (!id) return { section: 'rosters', title: 'Rosters' }
    if (typeof search.battle === 'string') {
      return {
        back: `/battles/${search.battle}`,
        section: 'rosters',
        title: 'Roster',
      }
    }
    if (typeof search.league === 'string') {
      const event = typeof search.event === 'string' ? `?${new URLSearchParams({ event: search.event })}` : ''
      return {
        back: `/tournaments/${search.league}${event}`,
        section: 'rosters',
        title: 'Roster',
      }
    }
    return { back: '/rosters', section: 'rosters', title: 'Roster' }
  }
  if (root === 'battles') {
    return id ? { back: '/battles', section: 'battles', title: 'Battle' } : { section: 'battles', title: 'Battles' }
  }
  if (root === 'tournaments') {
    return id
      ? { back: '/tournaments', section: 'events', title: 'Tournament' }
      : { back: '/more', section: 'events', title: 'Tournaments' }
  }
  if (root === 'groups') {
    if (id && child === 'games' && detail) return { back: `/groups/${id}`, section: 'events', title: 'Hidden-list game' }
    return id ? { back: '/groups', section: 'events', title: 'Group' } : { back: '/more', section: 'events', title: 'Groups' }
  }
  if (root === 'factions') {
    if (!id) return { section: 'factions', title: 'Factions' }
    const versioned = child === 'rules' && detail
    const factionPath = `/factions/${id}${versioned ? `/rules/${detail}` : ''}`
    const referenceChild = versioned ? segments[4] : child
    const referenceDetail = versioned ? segments[5] : detail
    const version = typeof search.rules === 'string' ? `?${new URLSearchParams({ rules: search.rules })}` : ''
    if (referenceChild === 'datasheets' && referenceDetail) {
      return {
        back: `${factionPath}/datasheets${version}`,
        section: 'factions',
        title: 'Datasheet',
      }
    }
    if (referenceChild) {
      return {
        back: `${factionPath}${version}`,
        section: 'factions',
        title: referenceChild === 'detachments' ? 'Detachment' : 'Datasheets',
      }
    }
    return { back: '/factions', section: 'factions', title: 'Faction' }
  }
  if (root === 'missions') {
    if (child === 'matchups' && detail) {
      return {
        back: `/missions/${id}`,
        section: 'missions',
        title: 'Mission',
      }
    }
    if (child === 'secondaries' && detail) {
      return {
        back: `/missions/${id}`,
        section: 'missions',
        title: 'Secondary mission',
      }
    }
    return id
      ? {
          back: '/missions',
          section: 'missions',
          title: 'Mission pack',
        }
      : { back: '/more', section: 'missions', title: 'Missions' }
  }
  if (root === 'rules') {
    if (!id) return { back: '/more', section: 'rules', title: 'Rules' }
    if (child) {
      return { back: `/rules/${id}`, section: 'rules', title: 'Rules' }
    }
    return { back: '/rules', section: 'rules', title: 'Rules' }
  }
  if (root === 'force-dispositions') {
    return id
      ? {
          back: '/force-dispositions',
          section: 'missions',
          title: 'Force disposition',
        }
      : { back: '/more', section: 'missions', title: 'Force dispositions' }
  }
  if (root === 'more') return { title: 'More' }
  if (root === 'simulator') return { back: '/more', title: 'Combat simulator' }
  if (root === 'profile') return { back: '/', title: 'Account settings' }
  if (root === 'leaderboard') return { back: '/more', section: 'leaderboard', title: 'Leaderboard' }
  if (root === 'users') return { back: '/', title: 'Profile' }
  if (root === 'friends') return { back: '/', title: 'Friends' }
  if (root === 'admin') return { back: '/profile', title: 'Admin' }
  if (root === 'sign-in') return { title: 'Account' }
  if (root === 'native-auth') return { title: 'Account' }
  if (root === 'reset-password') {
    return { back: '/sign-in', title: 'Reset password' }
  }
  if (root === 'support') return { back: '/', title: 'Support' }
  if (root === 'privacy') return { back: '/', title: 'Privacy' }
  if (root === 'terms') return { back: '/', title: 'Terms' }
  if (root === 'sources') return { back: '/', title: 'Data sources' }
  if (root === 'data-updates') return { back: '/more', title: 'Data updates' }
  if (root === 'delete-account') return { back: '/', title: 'Delete account' }
  if (root) return { back: '/', title: 'Praetorium' }
  return { section: 'home', title: 'Praetorium' }
}
