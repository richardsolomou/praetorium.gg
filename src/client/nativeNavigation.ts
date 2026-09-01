export type NativeSection = 'battles' | 'factions' | 'leagues' | 'missions' | 'rosters'

type NativeNavigation = {
  back?: { href: string; label: string; preferHistory?: boolean }
  section?: NativeSection
  title: string
}

export function nativeNavigation(path: string, search: Record<string, unknown> = {}): NativeNavigation {
  const segments = path.split('/').filter(Boolean)
  const [root, id, child, detail] = segments

  if (root === 'rosters') {
    if (!id) return { back: { href: '/', label: 'Back to home' }, section: 'rosters', title: 'Rosters' }
    if (typeof search.battle === 'string') {
      return {
        back: { href: `/battles/${search.battle}`, label: 'Back to battle', preferHistory: true },
        section: 'rosters',
        title: 'Roster',
      }
    }
    if (typeof search.league === 'string') {
      const event = typeof search.event === 'string' ? `?${new URLSearchParams({ event: search.event })}` : ''
      return {
        back: { href: `/leagues/${search.league}${event}`, label: 'Back to league', preferHistory: true },
        section: 'rosters',
        title: 'Roster',
      }
    }
    return { back: { href: '/rosters', label: 'Back to rosters', preferHistory: true }, section: 'rosters', title: 'Roster' }
  }
  if (root === 'battles') {
    return id
      ? { back: { href: '/battles', label: 'Back to battles', preferHistory: true }, section: 'battles', title: 'Battle' }
      : { back: { href: '/', label: 'Back to home' }, section: 'battles', title: 'Battles' }
  }
  if (root === 'leagues') {
    return id
      ? { back: { href: '/leagues', label: 'Back to leagues', preferHistory: true }, section: 'leagues', title: 'League' }
      : { back: { href: '/', label: 'Back to home' }, section: 'leagues', title: 'Leagues' }
  }
  if (root === 'factions') {
    if (!id) return { back: { href: '/', label: 'Back to home' }, section: 'factions', title: 'Factions' }
    if (child === 'datasheets' && detail) {
      return {
        back: { href: `/factions/${id}/datasheets`, label: 'Back to datasheets', preferHistory: true },
        section: 'factions',
        title: 'Datasheet',
      }
    }
    if (child) {
      return {
        back: { href: `/factions/${id}`, label: 'Back to faction', preferHistory: true },
        section: 'factions',
        title: child === 'detachments' ? 'Detachment' : 'Datasheets',
      }
    }
    return { back: { href: '/factions', label: 'Back to factions', preferHistory: true }, section: 'factions', title: 'Faction' }
  }
  if (root === 'mission-packs') {
    return id
      ? {
          back: { href: '/mission-packs', label: 'Back to mission packs', preferHistory: true },
          section: 'missions',
          title: 'Mission pack',
        }
      : { back: { href: '/', label: 'Back to home' }, section: 'missions', title: 'Mission packs' }
  }
  if (root === 'mission-matchups') {
    return {
      back: { href: id ? `/mission-packs/${id}` : '/mission-packs', label: 'Back to mission pack', preferHistory: true },
      section: 'missions',
      title: 'Mission',
    }
  }
  if (root === 'profile') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Profile' }
  if (root === 'users') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Profile' }
  if (root === 'friends') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Friends' }
  if (root === 'admin') return { back: { href: '/profile', label: 'Back to profile', preferHistory: true }, title: 'Admin' }
  if (root === 'sign-in') return { title: 'Account' }
  if (root === 'native-auth') return { title: 'Account' }
  if (root === 'reset-password') {
    return { back: { href: '/sign-in', label: 'Back to sign in', preferHistory: true }, title: 'Reset password' }
  }
  if (root === 'support') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Support' }
  if (root === 'privacy') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Privacy' }
  if (root === 'terms') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Terms' }
  if (root === 'sources') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Data sources' }
  if (root === 'delete-account') return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Delete account' }
  if (root) return { back: { href: '/', label: 'Back to home', preferHistory: true }, title: 'Praetorium' }
  return { title: 'Praetorium' }
}
