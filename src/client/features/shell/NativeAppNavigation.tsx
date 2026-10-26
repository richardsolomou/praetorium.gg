import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { Ellipsis, House, ScrollText, Swords, UsersRound } from 'lucide-react'
import { useEffect, useLayoutEffect, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { setNativeAccount, setNativeHistoryBack, setNativeNavigation } from '../../nativeBridge'
import { historyBackStaysInTab, openedByTab } from './nativeHistory'
import { nativeNavigation, type NativeSection } from './nativeNavigation'
import { meQuery } from '../../queries'
import { restoreNativeTabScroll } from './nativeTabScroll'
import { forgetTab, recallTab, rememberTab, tabLocation } from './nativeTabs'
import { compactChrome } from './useCompactChrome'

type Tab = { icon: ComponentType<{ className?: string }>; label: string; section: NativeSection; to: string }

const PRIMARY_TABS: readonly Tab[] = [
  { icon: House, label: 'Home', section: 'home', to: '/' },
  { icon: ScrollText, label: 'Rosters', section: 'rosters', to: '/rosters' },
  { icon: Swords, label: 'Battles', section: 'battles', to: '/battles' },
  { icon: UsersRound, label: 'Factions', section: 'factions', to: '/factions' },
]

const SCROLL_REGIONS = {
  roster: '[data-slot="roster-units"]',
  picker: '[data-pane="picker"] [data-slot="scroll-area-viewport"]',
  loadout: '[data-pane="loadout"] [data-slot="scroll-area-viewport"]',
} as const

function regionScroll() {
  return Object.fromEntries(
    Object.entries(SCROLL_REGIONS).flatMap(([name, selector]) => {
      const element = document.querySelector<HTMLElement>(selector)
      return element ? [[name, element.scrollTop]] : []
    }),
  )
}

export function NativeAppNavigation({
  accountBridge,
  href,
  path,
  search,
  state,
}: {
  accountBridge: ReactNode
  href: string
  path: string
  search: Record<string, unknown>
  state: unknown
}) {
  const { data: me } = useQuery(meQuery())
  const navigate = useNavigate()
  const router = useRouter()
  const navigation = nativeNavigation(path, search)
  const active = tabLocation(href)?.section
  const index = router.history.location.state.__TSR_index
  const staysInTab = Boolean(navigation.back) && historyBackStaysInTab(index, state)
  const notFound = useRouterState({ select: ({ matches }) => matches.some((match) => match.status === 'notFound' || match._notFound) })
  const moreActive = path === '/more' || !PRIMARY_TABS.some(({ section }) => section === active)

  useEffect(() => {
    setNativeHistoryBack(staysInTab)
    if (document.documentElement.dataset.nativeShell === 'true') {
      setNativeNavigation(navigation.title, navigation.back, staysInTab)
    }
  }, [navigation.back, navigation.title, staysInTab])
  useEffect(() => {
    if (document.documentElement.dataset.nativeShell === 'true') setNativeAccount(me?.name, me?.image)
  }, [me?.image, me?.name])

  useLayoutEffect(() => {
    if (!compactChrome()) return
    if (notFound) {
      forgetTab(href)
      return
    }
    const memory = active ? recallTab(active) : null
    const followsHash = href.includes('#') && memory?.href !== href
    rememberTab(href, { state })
    if (followsHash) return
    if (!memory || memory.href !== href) return
    return restoreNativeTabScroll(memory.scrollY, memory.regions, SCROLL_REGIONS)
  }, [active, href, notFound, state])

  const rememberCurrentTab = () => {
    if (!notFound) rememberTab(href, { scrollY: window.scrollY, regions: regionScroll(), state })
  }

  const openSection = (event: MouseEvent, section: NativeSection, to: string) => {
    if (event.defaultPrevented) return
    rememberCurrentTab()
    if (section === active) {
      window.scrollTo(0, 0)
      return
    }
    const remembered = recallTab(section)
    event.preventDefault()
    void navigate({
      href: remembered?.href ?? to,
      // A tab with no memory opens at its top rather than at the last tab's scroll.
      resetScroll: !remembered,
      state: (current) => openedByTab({ ...current, ...remembered?.state }) as typeof current,
    })
  }

  const tabClass = (selected: boolean) =>
    `min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 text-3xs font-semibold tracking-label uppercase ${
      selected ? 'border-parchment bg-raised text-parchment' : 'border-transparent text-dim hover:bg-raised hover:text-info'
    }`

  return (
    <>
      <div data-native-account-bridge aria-hidden className="pointer-events-none invisible fixed top-0 right-0 z-30 size-12">
        {accountBridge}
      </div>
      <nav
        data-native-app-chrome
        data-native-app-tabs
        data-print-hide
        aria-label="Application sections"
        className="fixed right-0 bottom-0 left-0 z-50 hidden h-16 items-stretch border-t border-edge-strong bg-sunken/95 backdrop-blur"
      >
        {PRIMARY_TABS.map(({ icon: Icon, label, section, to }) => (
          <Link
            key={section}
            to={to}
            onClick={(event) => openSection(event, section, to)}
            aria-current={active === section ? 'page' : undefined}
            className={`flex ${tabClass(active === section)}`}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <Link
          to="/more"
          className={`flex ${tabClass(moreActive)}`}
          aria-current={moreActive ? 'page' : undefined}
          onClick={(event) => {
            if (event.defaultPrevented) return
            rememberCurrentTab()
            if (path === '/more') window.scrollTo(0, 0)
          }}
        >
          <Ellipsis className="size-5" />
          <span className="max-w-full truncate">More</span>
        </Link>
      </nav>
    </>
  )
}
