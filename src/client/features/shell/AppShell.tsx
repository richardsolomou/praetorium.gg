import { SyncStatus } from '../../offline/SyncStatus'
import { offlineData } from '../../offline/runtime'
import { OfflineReference } from '../../offline/OfflineReference'
import { WebMcp } from '../agents/WebMcp'
import { AppPersistence } from '../../offline/AppPersistence'
import { version } from '../../../../package.json'
import { useQuery } from '@tanstack/react-query'
import { HeadContent, Link, Outlet, Scripts, useLocation } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BookOpen, Calculator, Gavel, Layers3, Medal, ScrollText, Swords, Trophy, UsersRound } from 'lucide-react'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'
import { useEffect, useLayoutEffect } from 'react'
import { POSTHOG_BROWSER_OPTIONS } from '../../../posthog'
import { authClient } from '../../authClient'
import { Account } from './Account'
import { GlobalSearch, GlobalSearchProvider } from './GlobalSearch'
import { TextSourcesNotice } from './TextSourcesNotice'
import { TextSourcesDialog } from '../../components/TextSourcesDialog'
import { ReleaseUpdateNotice } from './ReleaseUpdateNotice'
import { ImpersonationBanner } from './ImpersonationBanner'
import { NativeAppNavigation } from './NativeAppNavigation'
import { NativePushRegistration } from './NativePushRegistration'
import { OnboardingGuide } from '../onboarding/OnboardingGuide'
import { FeedbackDialog, openFeedback } from '../feedback/FeedbackDialog'
import { meQuery } from '../../queries'
import { CommunityLinks } from './CommunityLinks'
import { followTextSize } from '../../textSize'
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
  { to: '/leagues', label: 'Leagues', Icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', Icon: Medal },
] as const

const REFERENCE_LINKS = [
  { to: '/factions', label: 'Factions', Icon: UsersRound },
  { to: '/missions', label: 'Missions', Icon: BookOpen },
  { to: '/force-dispositions', label: 'Force dispositions', Icon: Layers3 },
  { to: '/rules', label: 'Rules', Icon: Gavel },
] as const

function PrimaryNavigation() {
  return (
    <nav aria-label="Primary" className="flex min-w-0 items-center gap-3 overflow-x-auto @min-[55.55rem]:gap-4">
      {PRIMARY_LINKS.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          search={to === '/leaderboard' ? { faction: undefined } : undefined}
          className="eyebrow flex shrink-0 items-center gap-1.5 whitespace-nowrap hover:text-info"
          activeProps={{ className: 'text-parchment' }}
        >
          <Icon aria-hidden className="size-4 shrink-0 text-info" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

function ReferenceNavigation() {
  return (
    <nav
      data-web-app-chrome
      aria-label="Reference"
      className="flex h-9 shrink-0 items-center gap-4 overflow-x-auto border-b border-edge bg-panel/60 px-2 sm:px-4"
    >
      {REFERENCE_LINKS.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className="eyebrow flex shrink-0 items-center gap-1.5 whitespace-nowrap text-dim hover:text-info"
          activeProps={{ className: 'text-parchment' }}
        >
          <Icon aria-hidden className="size-3.5 shrink-0 text-info" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function AppShell() {
  const location = useLocation()
  const path = location.pathname
  const immersive = /^\/rosters\/(?:new|import|(?!discover$)[^/]+(?:\/edit)?)$/.test(path)
  const { data: me } = useQuery(meQuery())
  const realtime = useRealtimeConfig()
  useSpacetimeLiveProduct(realtime, Boolean(me))
  useLayoutEffect(followTextSize, [])
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
            <GlobalSearchProvider>
              {/*
               * The bar spans the window and the page inside it decides its own width,
               * because a three-column builder and a sign-in form do not want the same
               * measure. Nothing here is centred on the page's behalf.
               */}
              <div data-native-app-frame className={`flex flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
                <header data-web-app-chrome className="@container sticky top-0 z-30 border-b border-edge bg-panel/95 backdrop-blur">
                  <div className="flex h-12 items-center gap-3 px-2 sm:px-4 @min-[55.55rem]:gap-5">
                    <Link
                      to="/"
                      className="group flex shrink-0 items-center gap-1.5 font-display text-base leading-none font-bold tracking-label text-bone uppercase hover:text-info"
                    >
                      <img src={offlineData()?.logo ?? '/logo.svg'} alt="" className="size-7 transition-transform group-hover:rotate-45" />
                      <span className="hidden @min-[61.11rem]:inline">Praetorium</span>
                    </Link>
                    <PrimaryNavigation />
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <GlobalSearch />
                      <CommunityLinks compact />
                      <Account className="size-8" />
                    </div>
                  </div>
                </header>
                {immersive ? null : <ReferenceNavigation />}
                {immersive ? null : (
                  <header
                    data-mobile-app-header
                    data-print-hide
                    className="fixed inset-x-0 top-0 z-30 hidden h-12 items-center border-b border-edge bg-panel/95 px-2 backdrop-blur"
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
                  className={`flex min-h-0 flex-col [&>main]:min-h-0 [&>main]:flex-1 ${immersive ? 'h-[calc(100dvh-3rem)]' : 'flex-1'}`}
                >
                  <OfflineReference />
                  <AppPersistence />
                  <SyncStatus />
                  <TextSourcesNotice path={path} />
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
                <FeedbackDialog />
                <TextSourcesDialog />
                <Impersonation />
                <NativePushRegistration />
                <ReleaseUpdateNotice />
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
                      <Link to="/guides" data-listed-in-more className="transition-colors hover:text-bone">
                        Player guides
                      </Link>
                      <Link to="/support" data-listed-in-more className="transition-colors hover:text-bone">
                        Support
                      </Link>
                      <button type="button" data-listed-in-more onClick={openFeedback} className="transition-colors hover:text-bone">
                        Send feedback
                      </button>
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
                      <Link to="/whats-new" data-listed-in-more className="transition-colors hover:text-bone">
                        What's new
                      </Link>
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
