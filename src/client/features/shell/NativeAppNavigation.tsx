import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { Ellipsis, House, ScrollText, Swords, UsersRound } from 'lucide-react'
import { useEffect, useLayoutEffect, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { setNativeAccount, setNativeHistoryBack, setNativeNavigation } from '../../nativeBridge'
import { historyBackStaysInTab, openedByTab, tabParents } from './nativeHistory'
import { nativeNavigation, type NativeSection } from './nativeNavigation'
import { meQuery } from '../../queries'
import { restoreNativeTabScroll } from './nativeTabScroll'
import { forgetTab, recallMoreTab, recallTab, rememberMoreTab, rememberTab, tabLocation } from './nativeTabs'
import { compactChrome } from './useCompactChrome'
import { withoutRecoveryKeys } from '../../routeErrors'

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
  href: address,
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
  // Tabs remember places, and a recovery key names a reload attempt that the page later drops from its address.
  const href = withoutRecoveryKeys(address)
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
      if (recallMoreTab() === href) rememberMoreTab(null)
      return
    }
    // More returns to the last screen opened from it; sign-in and other screens with no way back are not part of it.
    if (moreActive && (path === '/more' || navigation.back)) rememberMoreTab(href)
    const memory = active ? recallTab(active) : null
    const followsHash = href.includes('#') && memory?.href !== href
    rememberTab(href, { state })
    if (followsHash) return
    if (!memory || memory.href !== href) return
    return restoreNativeTabScroll(memory.scrollY, memory.regions, SCROLL_REGIONS)
  }, [active, href, moreActive, navigation.back, notFound, path, state])

  const rememberCurrentTab = () => {
    if (!notFound) rememberTab(href, { scrollY: window.scrollY, regions: regionScroll(), state })
  }

  const openTab = async (event: MouseEvent, root: string, target: string, memory: ReturnType<typeof recallTab>) => {
    event.preventDefault()
    const destination = memory?.href ?? target
    const opened = openedByTab(router.history.location.state)
    const parents = tabParents(destination, root)
    for (const parent of parents) {
      router.history.push(parent, opened)
      // The browser history writes pushes in a microtask and merges those queued together.
      await Promise.resolve()
    }
    await navigate({
      href: destination,
      // A tab with no memory opens at its top rather than at the last tab's scroll.
      resetScroll: !memory,
      state: (current) => ({ ...current, ...memory?.state, tabEntry: opened.tabEntry }) as typeof current,
    })
    // Passing through the parents reset the tab's scroll memory, so the reopened screen restores it here unless it no longer exists.
    const section = memory && tabLocation(memory.href)?.section
    if (memory && parents.length && section && recallTab(section)?.href === memory.href) {
      rememberTab(memory.href, memory)
      restoreNativeTabScroll(memory.scrollY, memory.regions, SCROLL_REGIONS)
    }
  }

  const openSection = (event: MouseEvent, section: NativeSection, to: string) => {
    if (event.defaultPrevented) return
    rememberCurrentTab()
    if (section === active) {
      window.scrollTo(0, 0)
      return
    }
    void openTab(event, to, to, recallTab(section))
  }

  // From another tab, More reopens where it was left; tapped again inside More, it returns to the More screen.
  const openMore = (event: MouseEvent) => {
    if (event.defaultPrevented) return
    rememberCurrentTab()
    if (path === '/more') {
      window.scrollTo(0, 0)
      return
    }
    const remembered = (!moreActive && recallMoreTab()) || '/more'
    const location = tabLocation(remembered)
    const memory = location ? recallTab(location.section) : null
    void openTab(event, '/more', remembered, memory?.href === remembered ? memory : null)
  }

  // The open tab is marked by a doubled cement segment on the bar's top edge.
  const tabClass = (selected: boolean) =>
    `relative min-w-0 flex-1 flex-col items-center justify-center gap-1 text-3xs font-semibold tracking-label uppercase transition-colors ${
      selected
        ? 'text-bone before:absolute before:inset-x-3 before:-top-px before:h-1 before:animate-draw before:border-y before:border-parchment [&>svg]:text-parchment'
        : 'text-dim hover:text-bone'
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
        className="fixed right-0 bottom-0 left-0 z-50 hidden h-16 items-stretch border-t border-runner bg-sunken px-1"
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
        <Link to="/more" className={`flex ${tabClass(moreActive)}`} aria-current={moreActive ? 'page' : undefined} onClick={openMore}>
          <Ellipsis className="size-5" />
          <span className="max-w-full truncate">More</span>
        </Link>
      </nav>
    </>
  )
}
