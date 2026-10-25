import type { GlobalSearchResult } from '../../functions'
import { PRODUCT_DOCS } from '../../../contracts/productDocs'
import { matchesSearch } from '../../text'

export const SEARCH_DEBOUNCE_MS = 250

export const globalSearchGroups: GlobalSearchResult['group'][] = [
  'Pages',
  'Factions',
  'Datasheets',
  'Detachments',
  'Missions',
  'Rules',
  'Your rosters',
  'Your battles',
]

const pages: GlobalSearchResult[] = [
  { id: 'page:home', group: 'Pages', label: 'Home', detail: 'Praetorium home', href: '/' },
  { id: 'page:battles', group: 'Pages', label: 'Battles', detail: 'Your current and finished games', href: '/battles' },
  { id: 'page:rosters', group: 'Pages', label: 'Rosters', detail: 'Your saved rosters', href: '/rosters' },
  { id: 'page:new-roster', group: 'Pages', label: 'New roster', detail: 'Build a roster', href: '/rosters/new' },
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
    id: 'page:docs',
    group: 'Pages',
    label: 'Docs',
    detail: 'Army lists, imports, combat comparisons and battle tracking',
    href: '/docs',
  },
  ...PRODUCT_DOCS.map<GlobalSearchResult>((doc) => ({
    id: `doc:${doc.slug}`,
    group: 'Pages',
    label: doc.title,
    detail: doc.description,
    href: `/docs/${doc.slug}`,
  })),
  { id: 'page:sign-in', group: 'Pages', label: 'Sign in', detail: 'Access your Praetorium account', href: '/sign-in' },
]

export function matchingPages(query: string) {
  return pages.filter((page) => matchesSearch(`${page.label} ${page.detail}`, query))
}
