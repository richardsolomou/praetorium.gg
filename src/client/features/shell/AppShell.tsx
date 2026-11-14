import { SyncStatus } from '../../offline/SyncStatus'
import { offlineAssets, offlineData } from '../../offline/runtime'
import { OfflineReference } from '../../offline/OfflineReference'
import { WebMcp } from '../agents/WebMcp'
import { AppPersistence } from '../../offline/AppPersistence'
import { SelectionHaptics } from './SelectionHaptics'
import { version } from '../../../../package.json'
import { useQuery } from '@tanstack/react-query'
import { HeadContent, Link, Outlet, Scripts, useLocation } from '@tanstack/react-router'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ArrowUpRight,
  Boxes,
  BookOpen,
  Calculator,
  Gavel,
  ScrollText,
  Swords,
  UsersRound,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'
import { type ReactElement, useEffect, useLayoutEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { ROSTER_WORKSPACE, followRailState, setRailCollapsed, useRailCollapsed } from './railState'
import { POSTHOG_BROWSER_OPTIONS, setImpersonating } from '../../../posthog'
import { authClient } from '../../authClient'
import { Account } from './Account'
import { NoticeSync, NotificationsButton } from '../notifications/Notifications'
import { GlobalSearch, GlobalSearchProvider } from './GlobalSearch'
import { TextSourcesDialog } from '../../components/TextSourcesDialog'
import { ReleaseUpdateNotice } from './ReleaseUpdateNotice'
import { AchievementToasts } from '../profile/AchievementToasts'
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
import { COMMUNITY_LINKS, COMMUNITY_PAGES, FRIENDS_PAGE } from './CommunityLinks'
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
  { to: '/collection', label: 'Collection', Icon: Boxes },
] as const

const REFERENCE_LINKS = [
  { to: '/factions', label: 'Factions', Icon: UsersRound },
  { to: '/missions', label: 'Missions', Icon: BookOpen },
  { to: '/rules', label: 'Rules', Icon: Gavel },
] as const

type RailLink = { to: string; label: string; Icon: LucideIcon }
type RailSiteLink = (typeof COMMUNITY_LINKS)[number]

const RAIL_LINK_CLASS =
  'group flex h-8 items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-sm font-semibold text-dim transition-colors in-data-[rail=collapsed]:justify-center in-data-[rail=collapsed]:px-0 hover:bg-raised/60 hover:text-bone aria-[current=page]:border-edge aria-[current=page]:bg-panel aria-[current=page]:text-bone aria-[current=page]:shadow-part'

/** Names an icon beside the folded rail, where its label is hidden; the open rail shows the label instead. */
function RailTooltip({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactElement }) {
  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function RailLinks({
  links,
  sites,
  name,
  collapsed,
}: {
  links: readonly RailLink[]
  sites?: readonly RailSiteLink[]
  name: string
  collapsed: boolean
}) {
  const path = useLocation().pathname
  return (
    <nav
      aria-label={name}
      className="runner gap-0.5 [--gate-y:1rem] in-data-[rail=collapsed]:pl-0 in-data-[rail=collapsed]:before:hidden in-data-[rail=collapsed]:*:before:hidden in-data-[rail=collapsed]:*:after:hidden"
    >
      {links.map(({ to, label, Icon }) => (
        <RailTooltip key={to} label={label} collapsed={collapsed}>
          <Link
            to={to}
            search={to === '/leaderboard' ? { faction: undefined } : undefined}
            aria-current={to === '/missions' && path.startsWith('/force-dispositions/') ? 'page' : undefined}
            className={RAIL_LINK_CLASS}
          >
            <Icon aria-hidden className="size-4.5 shrink-0 text-faint group-aria-[current=page]:text-parchment" />
            <span className="truncate in-data-[rail=collapsed]:sr-only">{label}</span>
          </Link>
        </RailTooltip>
      ))}
      {sites?.map(({ href, label, Icon }) => (
        <RailTooltip key={href} label={label} collapsed={collapsed}>
          <a href={href} target="_blank" rel="noreferrer noopener" className={RAIL_LINK_CLASS}>
            <Icon className="size-4.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
            <span className="truncate in-data-[rail=collapsed]:sr-only">{label}</span>
            <ArrowUpRight aria-hidden className="ml-auto size-3.5 shrink-0 text-faint in-data-[rail=collapsed]:hidden" />
          </a>
        </RailTooltip>
      ))}
    </nav>
  )
}

function RailSection({ name, ...links }: Parameters<typeof RailLinks>[0]) {
  return (
    <div>
      <p className="mb-1.5 ml-1 text-2xs font-semibold tracking-eyebrow text-faint uppercase in-data-[rail=collapsed]:sr-only">{name}</p>
      <RailLinks name={name} {...links} />
    </div>
  )
}

/**
 * The desktop navigation is a sprue: a framed rail whose sections hang off a runner by gates, the open one gated in green.
 * It stays pinned beside the page at the window's full height, so nothing sits above the page and `--app-header` is zero.
 * Folded, it keeps only the icons; the document's `data-rail` carries that, so the head script can set it before paint.
 * The roster workspace keeps its own choice, folded until opened there.
 */
function SiteRail({ workspace }: { workspace: boolean }) {
  const collapsed = useRailCollapsed(workspace)
  const { data: me } = useQuery(meQuery())
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
  const frame = useRef<HTMLDivElement>(null)
  return (
    <aside
      data-web-app-chrome
      data-print-hide
      className="sticky top-0 z-30 flex h-dvh w-(--app-rail) shrink-0 flex-col p-3 pr-0 transition-[width] duration-200 ease-out"
    >
      <div ref={frame} className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-runner bg-void">
        {/*
         * Laid out at the rail's target width at once, less the frame's padding and border,
         * so the frame animates around contents that stay put instead of sliding with its edge.
         */}
        <div className="flex min-h-0 w-[calc(var(--app-rail)-0.75rem-4px)] shrink-0 flex-col py-3">
          <Link
            to="/"
            className="group mx-3 mb-3 flex items-center gap-2.5 font-display text-base leading-none font-bold tracking-label text-bone uppercase in-data-[rail=collapsed]:justify-center hover:text-parchment"
          >
            <img src={offlineAssets()?.logo ?? '/logo.svg'} alt="" className="size-7 transition-transform group-hover:rotate-45" />
            <span className="in-data-[rail=collapsed]:sr-only">Praetorium</span>
          </Link>
          <div className="mx-3 mb-4 in-data-[rail=collapsed]:hidden">
            <GlobalSearch />
          </div>
          <div className="mx-auto mb-3 hidden in-data-[rail=collapsed]:block">
            <RailTooltip label="Search" collapsed={collapsed}>
              <GlobalSearch compact />
            </RailTooltip>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-2.5 pl-2 in-data-[rail=collapsed]:pr-2">
            <RailLinks links={PRIMARY_LINKS} name="Primary" collapsed={collapsed} />
            <RailSection links={REFERENCE_LINKS} name="Reference" collapsed={collapsed} />
            <RailSection
              links={me ? [...COMMUNITY_PAGES, FRIENDS_PAGE] : COMMUNITY_PAGES}
              sites={COMMUNITY_LINKS}
              name="Community"
              collapsed={collapsed}
            />
          </div>
          {/*
           * Folded, the column keeps the open row's order: the toggle keeps the bottom corner under the pointer
           * so the rail opens again without moving, with the account and bell above it.
           */}
          <div className="mx-2.5 mt-2 flex items-center justify-between gap-1 border-t border-edge pt-2 in-data-[rail=collapsed]:flex-col">
            <div className="flex items-center gap-1 in-data-[rail=collapsed]:flex-col">
              <Account className="size-8" />
              {me ? <NotificationsButton beside={frame} className="size-8" /> : null}
            </div>
            <RailTooltip label="Expand navigation" collapsed={collapsed}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                title={collapsed ? undefined : 'Collapse navigation'}
                className="size-8 text-dim hover:text-bone"
                onClick={() => setRailCollapsed(workspace, !collapsed)}
              >
                <Toggle aria-hidden className="size-4.5" />
              </Button>
            </RailTooltip>
          </div>
        </div>
      </div>
    </aside>
  )
}

/** Pages someone reaches before they are in the app, so they keep the front door's bar rather than the rail. */
const AUTH_PAGES = new Set(['/sign-in', '/reset-password', '/native-auth'])

/**
 * The signed-out home and the sign-in pages are a front door rather than the app, so a visitor meets a slim bar that
 * says where to start instead of the full rail. Every other page, signed in or not, keeps the rail. A sign-in page
 * leaves out the bar's own sign-in links, since its form is the thing they point to.
 */
function VisitorBar({ signingIn }: { signingIn: boolean }) {
  return (
    <header data-web-app-chrome data-print-hide className="sticky top-0 z-30 h-14 w-full border-b border-edge bg-void/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-6 px-5 sm:px-6">
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2.5 font-display text-base leading-none font-bold tracking-label text-bone uppercase hover:text-parchment"
        >
          <img src={offlineAssets()?.logo ?? '/logo.svg'} alt="" className="size-7 transition-transform group-hover:rotate-45" />
          Praetorium
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden text-sm font-semibold text-dim">
          {VISITOR_LINKS.map(({ to, label }) => (
            <Link key={to} to={to} className="shrink-0 hover:text-bone">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <GlobalSearch compact />
          {signingIn ? null : (
            <>
              <Link to="/sign-in" search={{ next: undefined }} className={buttonClass({ variant: 'ghost' })}>
                Sign in
              </Link>
              <Link to="/sign-in" search={{ next: undefined, join: true }} className={buttonClass()}>
                Create a free account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

const VISITOR_LINKS = [
  { to: '/rosters', label: 'Army builder' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/battles', label: 'Battle tracker' },
  { to: '/factions', label: 'Factions' },
  { to: '/rules', label: 'Rules' },
  { to: '/missions', label: 'Missions' },
] as const

/*
 * Said plainly and on every page, because the name is drawn from Games Workshop's setting and nothing about this is
 * theirs or endorsed by them. The community data is credited on /sources, where readers choose its text.
 */
function SiteFooter() {
  return (
    <footer
      data-web-app-footer
      className="flex flex-col items-center gap-1.5 border-t border-edge px-4 py-4 text-center text-xs text-faint min-[1000px]:flex-row min-[1000px]:justify-between"
    >
      <p>Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop.</p>
      <p className="flex flex-wrap justify-center gap-x-3 *:inline-flex *:min-h-6 *:items-center">
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
  )
}

export function AppShell() {
  const location = useLocation()
  const path = location.pathname
  const immersive = ROSTER_WORKSPACE.test(path)
  const { data: me } = useQuery(meQuery())
  const signingIn = AUTH_PAGES.has(path)
  const frontDoor = signingIn || (path === '/' && me === null)
  const impersonating = Boolean(me?.impersonatedBy)
  // Set while rendering so it holds before any child's effect captures.
  if (typeof window !== 'undefined') setImpersonating(impersonating)
  const realtime = useRealtimeConfig()
  useSpacetimeLiveProduct(realtime, Boolean(me))
  useLayoutEffect(followTextSourceChoice, [])
  useLayoutEffect(() => followRailState(immersive), [immersive])
  // Browser tests wait for this before interacting: a click before hydration does nothing.
  useEffect(() => document.documentElement.setAttribute('data-hydrated', ''), [])
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {offlineData() ? <style dangerouslySetInnerHTML={{ __html: offlineAssets()?.css ?? '' }} /> : null}
      </head>
      <body className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
        <PostHogIntegration environment={posthog} options={POSTHOG_BROWSER_OPTIONS} service={posthogService}>
          <TooltipProvider delay={250} closeDelay={100}>
            {posthog && me !== undefined && !impersonating && (
              <PostHogBetterAuthIdentity authClient={authClient} properties={({ name, email }) => ({ name, email })} />
            )}
            {posthog && !impersonating && <SupportIdentity />}
            {me && !impersonating ? <NoticeSync /> : null}
            <GlobalSearchProvider>
              {/*
               * The rail sits beside the page and the page decides its own width,
               * because a three-column builder and a sign-in form do not want the same
               * measure. Nothing here is centred on the page's behalf.
               */}
              <div data-native-app-frame className={`flex ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
                {frontDoor ? null : <SiteRail workspace={immersive} />}
                <div className={`flex min-w-0 flex-1 flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
                  {frontDoor ? <VisitorBar signingIn={signingIn} /> : null}
                  {immersive ? null : (
                    <header
                      data-mobile-app-header
                      data-print-hide
                      className="fixed inset-x-0 top-0 z-30 hidden h-12 items-center border-b border-edge-strong bg-sunken/95 px-2 backdrop-blur"
                    >
                      <Link
                        to="/"
                        aria-label="Praetorium home"
                        className="group flex min-w-0 items-center gap-2 font-display text-[0.9375rem] font-bold tracking-label text-bone uppercase hover:text-parchment"
                      >
                        <img
                          src={offlineAssets()?.logo ?? '/logo.svg'}
                          alt=""
                          className="size-7 shrink-0 transition-transform group-hover:rotate-45"
                        />
                        <span className="truncate">Praetorium</span>
                      </Link>
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <GlobalSearch compact />
                        {me ? <NotificationsButton className="size-[44px]" /> : null}
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
                    <SelectionHaptics />
                    <SyncStatus />
                    <WebMcp />
                    <Outlet />
                  </div>
                  {immersive ? null : <SiteFooter />}
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
                {me?.impersonatedBy ? <ImpersonationBanner name={me.name} email={me.email} /> : null}
                <NativePushRegistration />
                <ReleaseUpdateNotice />
                {/* An administrator viewing as a player must not use up the player's announcements. */}
                {me && !impersonating && <AchievementToasts userId={me.id} />}
                {immersive || /^\/battles\/[^/]+/.test(path) ? null : <WhatsNewNotice />}
                <Toaster theme="dark" position="top-center" containerAriaLabel="Messages" />
              </div>
            </GlobalSearchProvider>
          </TooltipProvider>
        </PostHogIntegration>
        {offlineData() ? null : <Scripts />}
      </body>
    </html>
  )
}
