import { SyncStatus } from '../../offline/SyncStatus'
import { offlineData } from '../../offline/runtime'
import { OfflineReference } from '../../offline/OfflineReference'
import { WebMcp } from '../agents/WebMcp'
import { AppPersistence } from '../../offline/AppPersistence'
import { version } from '../../../../package.json'
import { useQuery } from '@tanstack/react-query'
import { HeadContent, Link, Outlet, Scripts, useLocation } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  BookOpen,
  Calculator,
  CalendarDays,
  ChevronDown,
  Gavel,
  Layers3,
  Medal,
  ScrollText,
  Swords,
  Trophy,
  Users,
  UsersRound,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'
import { useEffect, useLayoutEffect, type ReactNode } from 'react'
import { POSTHOG_BROWSER_OPTIONS } from '../../../posthog'
import { authClient } from '../../authClient'
import { Account } from './Account'
import { GlobalSearch, GlobalSearchProvider } from './GlobalSearch'
import { TextSourcesDialog } from '../../components/TextSourcesDialog'
import { ReleaseUpdateNotice } from './ReleaseUpdateNotice'
import { WhatsNewLink, WhatsNewNotice } from './WhatsNew'
import { Toaster } from '@/components/ui/sonner'
import { ImpersonationBanner } from './ImpersonationBanner'
import { NativeAppNavigation } from './NativeAppNavigation'
import { NativePushRegistration } from './NativePushRegistration'
import { OnboardingGuide } from '../onboarding/OnboardingGuide'
import { DisplayNamePrompt } from '../account/DisplayNamePrompt'
import { SupportPanel } from '../feedback/SupportPanel'
import { SupportIdentity } from '../feedback/support'
import { meQuery } from '../../queries'
import { CommunityLinks } from './CommunityLinks'
import { followTextSourceChoice } from '../../rulesText'
import { useRealtimeConfig, useSpacetimeLiveProduct } from '../../spacetimeLive'
// A local dev server shares the production project token, so gate the browser
// SDK on a built bundle to keep localhost sessions out of the production project.
const posthog = import.meta.env.PROD
  ? postHogEnvironment({
      projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
      host: import.meta.env.VITE_POSTHOG_HOST,
    })
  : undefined
const posthogService = { name: 'praetorium', version, environment: import.meta.env.MODE }

const PRIMARY_LINKS = [
  { to: '/rosters', label: 'Rosters', Icon: ScrollText },
  { to: '/battles', label: 'Battles', Icon: Swords },
  { to: '/simulator', label: 'Simulator', Icon: Calculator },
  { to: '/leaderboard', label: 'Leaderboard', Icon: Medal },
] as const

const EVENT_LINKS = [
  { to: '/clubs', label: 'Clubs', Icon: Users },
  { to: '/tournaments', label: 'Tournaments', Icon: Trophy },
] as const

const REFERENCE_LINKS = [
  { to: '/factions', label: 'Factions', Icon: UsersRound },
  { to: '/missions', label: 'Missions', Icon: BookOpen },
  { to: '/force-dispositions', label: 'Dispositions', Icon: Layers3 },
  { to: '/rules', label: 'Rules', Icon: Gavel },
] as const

const within = (path: string, section: string) => path === section || path.startsWith(`${section}/`)

function Tabs({ links, tone }: { links: typeof PRIMARY_LINKS | typeof REFERENCE_LINKS; tone: string }) {
  return links.map(({ to, label, Icon }) => (
    <Link key={to} to={to} search={to === '/leaderboard' ? { faction: undefined } : undefined} className={cn('nav-tab', tone)}>
      <Icon aria-hidden />
      {label}
    </Link>
  ))
}

function NavMenu({
  label,
  links,
  className,
  children,
}: {
  label: string
  links: typeof EVENT_LINKS | typeof REFERENCE_LINKS
  className: string
  children?: ReactNode
}) {
  const path = useLocation({ select: (location) => location.pathname })
  const inside = links.some(({ to }) => within(path, to))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger openOnHover className={cn('nav-tab', className)} data-status={inside ? 'active' : undefined}>
        {children}
        {label} <ChevronDown aria-hidden className="block! size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        {links.map((link) => (
          <DropdownMenuItem key={link.to} className="whitespace-nowrap" render={<Link to={link.to} />}>
            <link.Icon aria-hidden className="text-info" />
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One bar while every section fits beside the search; narrower, the sections move to a row of their own below it, losing
 * their icons and then folding the reference into a menu. The sections render once and grid areas move them, and rem
 * widths track the reader's text size. The whole header stays pinned; `publishHeaderHeight` tells what sits beneath it.
 */
function SiteHeader() {
  return (
    <header
      data-web-app-chrome
      ref={publishHeaderHeight}
      className="@container sticky top-0 z-30 border-b border-edge-strong bg-sunken/95 backdrop-blur"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[3rem_2.75rem] gap-x-4 px-2 [grid-template-areas:'logo_search_account'_'nav_nav_nav'] sm:px-4 @min-[76rem]:grid-cols-[auto_auto_minmax(0,1fr)_auto] @min-[76rem]:grid-rows-[3rem] @min-[76rem]:gap-x-5 @min-[76rem]:[grid-template-areas:'logo_nav_search_account']">
        <Link
          to="/"
          className="group flex items-center gap-2 font-display text-base leading-none font-bold tracking-label text-bone uppercase [grid-area:logo] hover:text-info"
        >
          <img src={offlineData()?.logo ?? '/logo.svg'} alt="" className="size-7 transition-transform group-hover:rotate-45" />
          Praetorium
        </Link>
        <div className="mx-auto flex w-full max-w-lg min-w-0 items-center [grid-area:search] @min-[76rem]:mr-0 @min-[76rem]:max-w-56">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-1 [grid-area:account]">
          <CommunityLinks compact />
          <Account className="size-8" />
        </div>
        {/* Spans the padding as its own row, so its hairline crosses the window; in the bar it sits inside it. */}
        <div className="-mx-2 flex items-stretch gap-4 border-t border-edge px-2 [grid-area:nav] sm:-mx-4 sm:px-4 @min-[62.5rem]:gap-6 @min-[62.5rem]:[--nav-tab-icon:block] @min-[76rem]:mx-0 @min-[76rem]:border-0 @min-[76rem]:px-0 @min-[76rem]:[--nav-tab-icon:none] @min-[90rem]:[--nav-tab-icon:block]">
          <nav aria-label="Primary" className="flex items-stretch gap-4 @min-[62.5rem]:gap-5">
            <Tabs links={PRIMARY_LINKS} tone="text-bone" />
            <NavMenu label="Events" links={EVENT_LINKS} className="text-bone">
              <CalendarDays aria-hidden />
            </NavMenu>
          </nav>
          <span aria-hidden className="my-3 w-px shrink-0 bg-edge" />
          <nav aria-label="Reference" className="hidden items-stretch gap-4 @min-[47rem]:flex @min-[62.5rem]:gap-5">
            <Tabs links={REFERENCE_LINKS} tone="text-dim" />
          </nav>
          <NavMenu label="Reference" links={REFERENCE_LINKS} className="text-dim @min-[47rem]:hidden" />
        </div>
      </div>
    </header>
  )
}

/** Pins sticky bars and anchor targets below the header at whatever height its layout takes; hidden, it leaves the default. */
function publishHeaderHeight(header: HTMLElement) {
  const root = document.documentElement.style
  const observer = new ResizeObserver(() => {
    if (header.offsetHeight) root.setProperty('--app-header', `${header.offsetHeight}px`)
    else root.removeProperty('--app-header')
  })
  observer.observe(header)
  return () => {
    observer.disconnect()
    root.removeProperty('--app-header')
  }
}

export function AppShell() {
  const location = useLocation()
  const path = location.pathname
  const immersive = /^\/rosters\/(?:new|import|(?!discover$)[^/]+(?:\/edit)?)$/.test(path)
  const { data: me } = useQuery(meQuery())
  const realtime = useRealtimeConfig()
  useSpacetimeLiveProduct(realtime, Boolean(me))
  useLayoutEffect(followTextSourceChoice, [])
  // Browser tests wait for this before interacting: a click before hydration does nothing.
  useEffect(() => document.documentElement.setAttribute('data-hydrated', ''), [])
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {offlineData() ? <style dangerouslySetInnerHTML={{ __html: offlineData()!.css }} /> : null}
      </head>
      <body className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
        <PostHogIntegration environment={posthog} options={POSTHOG_BROWSER_OPTIONS} service={posthogService}>
          <TooltipProvider delay={250} closeDelay={100}>
            {posthog && <PostHogBetterAuthIdentity authClient={authClient} properties={({ name, email }) => ({ name, email })} />}
            {posthog && <SupportIdentity />}
            <GlobalSearchProvider>
              {/*
               * The bar spans the window and the page inside it decides its own width,
               * because a three-column builder and a sign-in form do not want the same
               * measure. Nothing here is centred on the page's behalf.
               */}
              <div data-native-app-frame className={`flex flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
                <SiteHeader />
                {immersive ? null : (
                  <header
                    data-mobile-app-header
                    data-print-hide
                    className="fixed inset-x-0 top-0 z-30 hidden h-12 items-center border-b border-edge-strong bg-sunken/95 px-2 backdrop-blur"
                  >
                    <Link
                      to="/"
                      aria-label="Praetorium home"
                      className="group flex min-w-0 items-center gap-2 font-display text-[0.9375rem] font-bold tracking-label text-bone uppercase hover:text-info"
                    >
                      <img
                        src={offlineData()?.logo ?? '/logo.svg'}
                        alt=""
                        className="size-7 shrink-0 transition-transform group-hover:rotate-45"
                      />
                      <span className="truncate">Praetorium</span>
                    </Link>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <GlobalSearch compact />
                      <CommunityLinks />
                      <Account className="size-[44px]" />
                    </div>
                  </header>
                )}
                {immersive ? null : <div data-mobile-app-header-spacer className="hidden h-12 shrink-0" />}
                <div
                  data-native-app-content
                  data-immersive={immersive || undefined}
                  className={`flex min-h-0 flex-col [&>main]:min-h-0 [&>main]:flex-1 ${immersive ? 'h-[calc(100dvh-var(--app-header))]' : 'flex-1'}`}
                >
                  <OfflineReference />
                  <AppPersistence />
                  <SyncStatus />
                  <WebMcp />
                  <Outlet />
                </div>
                <NativeAppNavigation
                  accountBridge={<Account native />}
                  href={location.href}
                  path={path}
                  search={location.search}
                  state={location.state}
                />
                <OnboardingGuide />
                <DisplayNamePrompt />
                <SupportPanel />
                <TextSourcesDialog />
                <Impersonation />
                <NativePushRegistration />
                <ReleaseUpdateNotice />
                {immersive || /^\/battles\/[^/]+/.test(path) ? null : <WhatsNewNotice />}
                <Toaster theme="dark" position="top-center" containerAriaLabel="Messages" />
                {/*
                 * Said plainly and on every page, because the name is drawn from Games
                 * Workshop's setting and nothing about this is theirs or endorsed by them.
                 * The community data is credited on /sources, where readers choose its text.
                 */}
                {immersive ? null : (
                  <footer
                    data-web-app-footer
                    className="flex flex-col items-center gap-1.5 border-t border-edge px-4 py-4 text-center text-xs text-faint min-[1000px]:flex-row min-[1000px]:justify-between"
                  >
                    <p>Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop.</p>
                    <p className="flex flex-wrap justify-center gap-x-3">
                      <Link to="/docs" data-listed-in-more className="transition-colors hover:text-bone">
                        Docs
                      </Link>
                      <Link to="/support" data-listed-in-more className="transition-colors hover:text-bone">
                        Support
                      </Link>
                      <Link to="/privacy" className="transition-colors hover:text-bone">
                        Privacy policy
                      </Link>
                      <Link to="/terms" className="transition-colors hover:text-bone">
                        Terms of service
                      </Link>
                      <Link to="/sources" className="transition-colors hover:text-bone">
                        Data sources
                      </Link>
                      <Link to="/data-updates" data-listed-in-more className="transition-colors hover:text-bone">
                        Data updates
                      </Link>
                      <WhatsNewLink />
                    </p>
                  </footer>
                )}
              </div>
            </GlobalSearchProvider>
          </TooltipProvider>
        </PostHogIntegration>
        {offlineData() ? null : <Scripts />}
      </body>
    </html>
  )
}

function Impersonation() {
  const { data: me } = useQuery(meQuery())
  return me?.impersonatedBy ? <ImpersonationBanner name={me.name} email={me.email} /> : null
}
