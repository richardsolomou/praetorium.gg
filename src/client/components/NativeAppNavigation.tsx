import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { BookOpen, ChevronLeft, ScrollText, Swords, Trophy, UsersRound } from 'lucide-react'
import { useEffect, useLayoutEffect, type ComponentType } from 'react'
import { Button } from '@/components/ui/button'
import { setNativeBackGesture } from '../nativeBridge'
import { historyStaysInSection, rememberHistorySection } from '../nativeHistory'
import { nativeNavigation, type NativeSection } from '../nativeNavigation'
import { restoreNativeTabScroll } from '../nativeTabScroll'
import { recallTab, rememberTab, tabLocation } from '../nativeTabs'
import { GlobalSearch } from './GlobalSearch'

type Tab = { icon: ComponentType<{ className?: string }>; label: string; section: NativeSection; to: string }

const TABS: readonly Tab[] = [
  { icon: ScrollText, label: 'Rosters', section: 'rosters', to: '/rosters' },
  { icon: Swords, label: 'Battles', section: 'battles', to: '/battles' },
  { icon: Trophy, label: 'Leagues', section: 'leagues', to: '/leagues' },
  { icon: UsersRound, label: 'Factions', section: 'factions', to: '/factions' },
  { icon: BookOpen, label: 'Missions', section: 'missions', to: '/mission-packs' },
]

export function NativeAppHeader({ account, path, search }: { account: React.ReactNode; path: string; search: Record<string, unknown> }) {
  const navigate = useNavigate()
  const router = useRouter()
  const navigation = nativeNavigation(path, search)
  const index = router.history.location.state.__TSR_index
  // Back belongs to the tab it is pressed in, so it walks this tab's own history and
  // otherwise goes to the screen above rather than into whichever tab was open before.
  const staysInTab = Boolean(navigation.back?.preferHistory) && historyStaysInSection(index, navigation.section)
  useEffect(() => {
    rememberHistorySection(index, navigation.section)
  }, [index, navigation.section])
  useEffect(() => {
    setNativeBackGesture(staysInTab)
  }, [staysInTab])

  const goBack = () => {
    if (staysInTab) {
      router.history.back()
      return
    }
    if (navigation.back) void navigate({ href: navigation.back.href, replace: true })
  }

  return (
    <header
      data-native-app-chrome
      data-native-app-header
      data-print-hide
      aria-label="Application"
      className="sticky top-0 z-30 hidden h-12 shrink-0 grid-cols-[7rem_minmax(0,1fr)_7rem] items-center border-b border-edge bg-panel/95 backdrop-blur"
    >
      {navigation.back ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-12 shrink-0 text-dim hover:bg-raised hover:text-info"
          aria-label={navigation.back.label}
          onClick={goBack}
        >
          <ChevronLeft className="size-5" />
        </Button>
      ) : (
        <span className="size-12 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-center text-sm font-bold tracking-[0.04em] uppercase">{navigation.title}</span>
      <span className="flex w-full items-center justify-end gap-1 pr-2">
        <GlobalSearch compact />
        {account}
      </span>
    </header>
  )
}

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

export function NativeAppTabs({ href, state }: { href: string; state: unknown }) {
  const navigate = useNavigate()
  const active = tabLocation(href)?.section

  useLayoutEffect(() => {
    if (document.documentElement.dataset.nativeApp !== 'true') return
    rememberTab(href, { state })
    const memory = active ? recallTab(active) : null
    if (!memory || memory.href !== href) return
    return restoreNativeTabScroll(memory.scrollY, memory.regions, SCROLL_REGIONS)
  }, [active, href, state])

  return (
    <nav
      data-native-app-chrome
      data-native-app-tabs
      data-print-hide
      aria-label="Application sections"
      className="fixed right-0 bottom-0 left-0 z-30 hidden h-16 items-stretch border-t border-edge bg-panel/95 backdrop-blur"
    >
      {TABS.map(({ icon: Icon, label, section, to }) => (
        <Link
          key={section}
          to={to}
          onClick={(event) => {
            if (event.defaultPrevented) return
            rememberTab(href, { scrollY: window.scrollY, regions: regionScroll(), state })
            if (section === active) {
              window.scrollTo(0, 0)
              return
            }
            const remembered = recallTab(section)
            if (!remembered || remembered.href === to) return
            event.preventDefault()
            void navigate({
              href: remembered.href,
              resetScroll: false,
              ...(remembered.state ? { state: (current) => ({ ...current, ...remembered.state }) } : {}),
            })
          }}
          aria-current={active === section ? 'page' : undefined}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 text-[0.625rem] font-semibold tracking-[0.04em] uppercase ${
            active === section ? 'border-parchment bg-raised text-parchment' : 'border-transparent text-dim hover:bg-raised hover:text-info'
          }`}
        >
          <Icon className="size-5" />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
