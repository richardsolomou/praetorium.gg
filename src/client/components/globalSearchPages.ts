import type { GlobalSearchResult } from '../../server/functions'

const pages: GlobalSearchResult[] = [
  { id: 'page:home', group: 'Pages', label: 'Home', detail: 'Praetorium home', href: '/' },
  { id: 'page:battles', group: 'Pages', label: 'Battles', detail: 'Your current and finished games', href: '/battles' },
  { id: 'page:rosters', group: 'Pages', label: 'Rosters', detail: 'Manage army lists', href: '/rosters' },
  { id: 'page:new-roster', group: 'Pages', label: 'New roster', detail: 'Build an army list', href: '/rosters/new' },
  { id: 'page:factions', group: 'Pages', label: 'Factions', detail: 'Datasheets and detachment references', href: '/factions' },
  { id: 'page:missions', group: 'Pages', label: 'Mission packs', detail: 'Missions, scoring and deployments', href: '/mission-packs' },
  { id: 'page:sign-in', group: 'Pages', label: 'Sign in', detail: 'Access your Praetorium account', href: '/signin' },
]

export function matchingPages(query: string) {
  const wanted = query.trim().toLowerCase()
  return wanted ? pages.filter((page) => `${page.label} ${page.detail}`.toLowerCase().includes(wanted)) : pages
}
