import type { GlobalSearchResult } from '../../../server/functions'
import { PRODUCT_GUIDES } from '../../../contracts/productGuides'

const pages: GlobalSearchResult[] = [
  { id: 'page:home', group: 'Pages', label: 'Home', detail: 'Praetorium home', href: '/' },
  { id: 'page:battles', group: 'Pages', label: 'Battles', detail: 'Your current and finished games', href: '/battles' },
  { id: 'page:rosters', group: 'Pages', label: 'Rosters', detail: 'Manage army lists', href: '/rosters' },
  { id: 'page:new-roster', group: 'Pages', label: 'New roster', detail: 'Build an army list', href: '/rosters/new' },
  { id: 'page:factions', group: 'Pages', label: 'Factions', detail: 'Datasheets and detachment references', href: '/factions' },
  { id: 'page:missions', group: 'Pages', label: 'Missions', detail: 'Mission packs, scoring and deployments', href: '/missions' },
  {
    id: 'page:force-dispositions',
    group: 'Pages',
    label: 'Force dispositions',
    detail: 'Primary mission matchups',
    href: '/force-dispositions',
  },
  { id: 'page:rules', group: 'Pages', label: 'Rules', detail: 'Core rules, missions and event rules', href: '/rules' },
  {
    id: 'page:guides',
    group: 'Pages',
    label: 'Player guides',
    detail: 'Army lists, imports, combat comparisons and battle tracking',
    href: '/guides',
  },
  ...PRODUCT_GUIDES.map<GlobalSearchResult>((guide) => ({
    id: `guide:${guide.slug}`,
    group: 'Pages',
    label: guide.title,
    detail: guide.description,
    href: `/guides/${guide.slug}`,
  })),
  { id: 'page:sign-in', group: 'Pages', label: 'Sign in', detail: 'Access your Praetorium account', href: '/sign-in' },
]

export function matchingPages(query: string) {
  const wanted = query.trim().toLowerCase()
  return wanted ? pages.filter((page) => `${page.label} ${page.detail}`.toLowerCase().includes(wanted)) : pages
}
