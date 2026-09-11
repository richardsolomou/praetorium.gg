import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HeadContent, Link, Outlet, Scripts, useLocation, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CircleUserRound, LogIn, LogOut, Menu, MessageSquareWarning, ShieldCheck, UserRound, UserRoundPen, Users, X } from 'lucide-react'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'
import { useEffect, useRef, useState } from 'react'
import { POSTHOG_BROWSER_OPTIONS, POSTHOG_INGEST_PATH } from '../../../posthog'
import { authClient } from '../../authClient'
import { GlobalSearch, GlobalSearchProvider } from '../../components/GlobalSearch'
import { ImpersonationBanner } from '../../components/ImpersonationBanner'
import { NativeAppHeader, NativeAppTabs } from '../../components/NativeAppNavigation'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { setNativeAccountMenuOpen } from '../../nativeBridge'
import { meQuery } from '../../queries'
const posthog = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})

function Account({ native = false }: { native?: boolean }) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [nativeOpen, setNativeOpen] = useState(false)

  useEffect(() => {
    if (!native) return
    const setOpen = (event: Event) => setNativeOpen(Boolean((event as CustomEvent<{ open?: unknown }>).detail?.open))
    document.addEventListener('praetorium:set-account-menu', setOpen)
    return () => document.removeEventListener('praetorium:set-account-menu', setOpen)
  }, [native])

  return (
    <DropdownMenu
      open={native ? nativeOpen : undefined}
      onOpenChange={
        native
          ? (open) => {
              setNativeOpen(open)
              setNativeAccountMenuOpen(open)
            }
          : undefined
      }
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={native ? 'icon' : 'icon-sm'}
            className={`${native ? 'size-12' : ''} shrink-0 text-dim hover:bg-raised hover:text-info`}
            aria-label={me ? `Account menu for ${me.name}` : 'Account menu'}
          />
        }
      >
        {me ? <PlayerAvatar name={me.name} image={me.image} className="size-7 text-xs" /> : <CircleUserRound className="size-5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-none border border-edge bg-panel">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2">
            <span className="eyebrow block">{me ? 'Profile' : 'Account'}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-bone">{me?.name ?? 'Not signed in'}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {me ? (
          <>
            <DropdownMenuItem render={<Link to="/users/$userId" params={{ userId: me.id }} search={{}} />}>
              <UserRound /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/profile" />}>
              <UserRoundPen /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/friends" />}>
              <Users /> Friends
            </DropdownMenuItem>
            {me.role === 'admin' ? (
              <DropdownMenuItem render={<Link to="/admin" />}>
                <ShieldCheck /> Admin
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              render={
                <a
                  href="https://github.com/richardsolomou/praetorium.gg/issues"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Send feedback"
                />
              }
            >
              <MessageSquareWarning /> Send feedback
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                void (async () => {
                  await authClient.signOut()
                  await queryClient.invalidateQueries()
                  await navigate({ to: '/' })
                })()
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem render={<Link to="/sign-in" search={{ next: undefined }} />}>
            <LogIn /> Sign in
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PrimaryNavigation({ path }: { path: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [path])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const linkClass =
    'eyebrow flex min-h-11 items-center border-l-2 border-transparent px-3 hover:border-info hover:bg-raised hover:text-info min-[860px]:min-h-0 min-[860px]:border-0 min-[860px]:bg-transparent min-[860px]:px-0'

  return (
    <div ref={root} className="min-[860px]:contents">
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-sm"
        className="text-dim hover:bg-raised hover:text-info min-[860px]:hidden"
        aria-label={open ? 'Close primary navigation' : 'Open primary navigation'}
        aria-controls="primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      <nav
        id="primary-navigation"
        className={`${open ? 'grid' : 'hidden'} absolute top-full right-0 left-0 gap-1 border-b border-edge bg-panel p-2 shadow-lg min-[860px]:static min-[860px]:flex min-[860px]:items-center min-[860px]:gap-4 min-[860px]:border-0 min-[860px]:bg-transparent min-[860px]:p-0 min-[860px]:shadow-none`}
        aria-label="Primary"
      >
        <Link
          to="/rosters"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Rosters
        </Link>
        <Link
          to="/battles"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Battles
        </Link>
        <Link
          to="/leagues"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Leagues
        </Link>
        <Link
          to="/factions"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Factions
        </Link>
        <Link
          to="/mission-packs"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Mission packs
        </Link>
        <Link
          to="/leaderboard"
          search={{ faction: undefined }}
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Leaderboard
        </Link>
        <Link
          to="/rules"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[860px]:bg-transparent' }}
        >
          Rules
        </Link>
      </nav>
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const path = location.pathname
  const immersive = /^\/rosters\/(?:new|import|[^/]+(?:\/edit)?)$/.test(path)
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
        <PostHogIntegration environment={posthog} ingestPath={POSTHOG_INGEST_PATH} options={POSTHOG_BROWSER_OPTIONS}>
          <TooltipProvider delay={250} closeDelay={100}>
            {posthog && <PostHogBetterAuthIdentity authClient={authClient} />}
            <GlobalSearchProvider>
              {/*
               * The bar spans the window and the page inside it decides its own width,
               * because a three-column builder and a sign-in form do not want the same
               * measure. Nothing here is centred on the page's behalf.
               */}
              <div data-native-app-frame className={`flex flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
                <header data-web-app-chrome className="sticky top-0 z-30 border-b border-edge bg-panel/95 backdrop-blur">
                  <div className="flex h-12 items-center gap-2 px-2 sm:px-4 min-[860px]:gap-3 min-[1000px]:gap-5">
                    <Link
                      to="/"
                      className="group flex shrink-0 items-center gap-1.5 text-base leading-none font-bold tracking-[0.02em] text-bone uppercase hover:text-info sm:text-lg"
                    >
                      <img src="/logo.svg" alt="" className="size-7 transition-transform group-hover:rotate-180" />
                      <span className="min-[860px]:hidden min-[1000px]:inline">Praetorium</span>
                    </Link>
                    <PrimaryNavigation path={path} />
                    <GlobalSearch />
                    <Account />
                  </div>
                </header>
                <NativeAppHeader path={path} search={location.search} account={<Account native />} />
                <div
                  data-native-app-content
                  data-immersive={immersive || undefined}
                  className={immersive ? 'h-[calc(100dvh-3rem)] min-h-0' : 'flex min-h-0 flex-1 flex-col [&>main]:flex-1'}
                >
                  <Outlet />
                </div>
                <NativeAppTabs href={location.href} state={location.state} />
                <Impersonation />
                {/*
                 * Said plainly and on every page, because the name is drawn from Games
                 * Workshop's setting and nothing about this is theirs or endorsed by them.
                 * The community data has its own attribution, which appears where that
                 * data does — see `ATTRIBUTION` in `src/server/rules.ts`.
                 */}
                {immersive ? null : (
                  <footer
                    data-web-app-footer
                    className="flex flex-col items-center gap-1.5 border-t border-edge px-4 py-4 text-center text-xs text-faint min-[1000px]:flex-row min-[1000px]:justify-between"
                  >
                    <p>Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop.</p>
                    <p className="space-x-3">
                      <Link to="/support" className="transition-colors hover:text-bone">
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
                    </p>
                  </footer>
                )}
              </div>
            </GlobalSearchProvider>
          </TooltipProvider>
        </PostHogIntegration>
        <Scripts />
      </body>
    </html>
  )
}

function Impersonation() {
  const { data: me } = useQuery(meQuery())
  return me?.impersonatedBy ? <ImpersonationBanner name={me.name} email={me.email} /> : null
}
