import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useLocation, useNavigate } from '@tanstack/react-router'
import barlow400 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2?url'
import barlow500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2?url'
import barlow600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2?url'
import barlow700 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url'
import rules400 from '@fontsource/barlow/files/barlow-latin-400-normal.woff2?url'
import rules600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2?url'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CircleUserRound, LogIn, LogOut, Menu, ScrollText, Swords, UserRoundPen, X } from 'lucide-react'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '../client/authClient'
import { GlobalSearch } from '../client/components/GlobalSearch'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { favouriteFactionsQuery, meQuery } from '../client/queries'
import { POSTHOG_INGEST_PATH } from '../posthog'
import appCss from '../styles.css?url'

const TITLE = 'Praetorium'
const DESCRIPTION = 'Track a Warhammer 40,000 game with your opponent, live on both phones.'
const posthog = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(favouriteFactionsQuery())]),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Matches `--color-void`; the browser paints this before the stylesheet lands.
      { name: 'theme-color', content: '#0b0c0e' },
      { title: `${TITLE} — live Warhammer 40,000 battle tracking` },
      { name: 'description', content: DESCRIPTION },
      // Battle links get pasted into chats, so they need a real card.
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: TITLE },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'stylesheet', href: appCss },
      ...[barlow400, barlow500, barlow600, barlow700, rules400, rules600].map((href) => ({
        rel: 'preload' as const,
        href,
        as: 'font' as const,
        type: 'font/woff2',
        crossOrigin: 'anonymous' as const,
      })),
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <main className="mx-auto mt-[15vh] max-w-md px-6 text-center">
      <h1 className="text-2xl">Nothing here</h1>
      <p className="mt-2 text-dim">Check the link you were sent.</p>
    </main>
  ),
})

function Account() {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-dim hover:bg-raised hover:text-azure"
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
            <DropdownMenuItem render={<Link to="/profile" />}>
              <UserRoundPen /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/battles" />}>
              <Swords /> My battles
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/rosters" />}>
              <ScrollText /> My rosters
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
          <DropdownMenuItem render={<Link to="/signin" search={{ next: undefined }} />}>
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
    'eyebrow flex min-h-11 items-center border-l-2 border-transparent px-3 hover:border-azure hover:bg-raised hover:text-azure min-[815px]:min-h-0 min-[815px]:border-0 min-[815px]:bg-transparent min-[815px]:px-0'

  return (
    <div ref={root} className="min-[815px]:contents">
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-sm"
        className="text-dim hover:bg-raised hover:text-azure min-[815px]:hidden"
        aria-label={open ? 'Close primary navigation' : 'Open primary navigation'}
        aria-controls="primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      <nav
        id="primary-navigation"
        className={`${open ? 'grid' : 'hidden'} absolute top-full right-0 left-0 gap-1 border-b border-edge bg-panel p-2 shadow-lg min-[815px]:static min-[815px]:flex min-[815px]:items-center min-[815px]:gap-4 min-[815px]:border-0 min-[815px]:bg-transparent min-[815px]:p-0 min-[815px]:shadow-none`}
        aria-label="Primary"
      >
        <Link
          to="/battles"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[815px]:bg-transparent' }}
        >
          Battles
        </Link>
        <Link
          to="/rosters"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[815px]:bg-transparent' }}
        >
          Rosters
        </Link>
        <Link
          to="/friends"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[815px]:bg-transparent' }}
        >
          Friends
        </Link>
        <Link
          to="/factions"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[815px]:bg-transparent' }}
        >
          Factions
        </Link>
        <Link
          to="/mission-packs"
          className={linkClass}
          activeProps={{ className: 'border-parchment bg-raised text-parchment min-[815px]:bg-transparent' }}
        >
          Mission packs
        </Link>
      </nav>
    </div>
  )
}

function RootComponent() {
  const path = useLocation({ select: (location) => location.pathname })
  const immersive = /^\/rosters\/(?:new|import|[^/]+(?:\/edit)?)$/.test(path)
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
        <PostHogIntegration environment={posthog} ingestPath={POSTHOG_INGEST_PATH}>
          {posthog && <PostHogBetterAuthIdentity authClient={authClient} />}
          {/*
           * The bar spans the window and the page inside it decides its own width,
           * because a three-column builder and a sign-in form do not want the same
           * measure. Nothing here is centred on the page's behalf.
           */}
          <div className={`flex flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
            <header className="sticky top-0 z-30 border-b border-edge bg-panel/95 backdrop-blur">
              <div className="flex h-12 items-center gap-2 px-2 sm:px-4 min-[815px]:gap-3 min-[900px]:gap-5">
                <Link
                  to="/"
                  className="group flex shrink-0 items-center gap-1.5 text-base leading-none font-bold tracking-[0.02em] text-bone uppercase hover:text-azure sm:text-lg"
                >
                  <img src="/logo.svg" alt="" className="size-7 transition-transform group-hover:-translate-y-px" />
                  <span className="min-[815px]:hidden min-[900px]:inline">Praetorium</span>
                </Link>
                <PrimaryNavigation path={path} />
                <GlobalSearch />
                <Account />
              </div>
            </header>
            <div className={immersive ? 'h-[calc(100dvh-3rem)] min-h-0' : 'min-h-0 flex-1'}>
              <Outlet />
            </div>
            {/*
             * Said plainly and on every page, because the name is drawn from Games
             * Workshop's setting and nothing about this is theirs or endorsed by them.
             * The community data has its own attribution, which appears where that
             * data does — see `ATTRIBUTION` in `src/server/rules.ts`.
             */}
            {immersive ? null : (
              <footer className="border-t border-edge px-4 py-4 text-center text-xs text-faint">
                Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop.
              </footer>
            )}
          </div>
        </PostHogIntegration>
        <Scripts />
      </body>
    </html>
  )
}
