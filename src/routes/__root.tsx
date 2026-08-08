import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useLocation, useNavigate } from '@tanstack/react-router'
import '@fontsource/barlow-semi-condensed/latin-400.css'
import '@fontsource/barlow-semi-condensed/latin-500.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-700.css'
import barlow400 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2?url'
import barlow500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2?url'
import barlow600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2?url'
import barlow700 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url'
import { Button } from '@/components/ui/button'
import { authClient } from '../client/authClient'
import { meQuery } from '../client/queries'
import appCss from '../styles.css?url'

const TITLE = 'Praetorium'
const DESCRIPTION = 'Track a Warhammer 40,000 game with your opponent, live on both phones.'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Matches `--color-void`; the browser paints this before the stylesheet lands.
      { name: 'theme-color', content: '#0a0b0d' },
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
      { rel: 'stylesheet', href: appCss },
      ...[barlow400, barlow500, barlow600, barlow700].map((href) => ({
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

/** Who you are, and the way to stop being them. */
function Account() {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  if (me) {
    return (
      <Button
        variant="ghost"
        className="eyebrow ml-auto h-auto px-0 hover:bg-transparent hover:text-azure"
        aria-label={`${me.name} · sign out`}
        onClick={async () => {
          await authClient.signOut()
          await queryClient.invalidateQueries()
          await navigate({ to: '/' })
        }}
      >
        <span className="max-w-16 truncate sm:max-w-none">{me.name}</span>
        <span className="hidden sm:inline">· sign out</span>
      </Button>
    )
  }

  // One label whatever is cached: the page itself explains what an account is for.
  return (
    <Link to="/signin" search={{ next: undefined }} className="eyebrow ml-auto hover:text-azure">
      Sign in
    </Link>
  )
}

function RootComponent() {
  const path = useLocation({ select: (location) => location.pathname })
  const immersive = /^\/rosters\/(?:new|import|[^/]+\/edit)$/.test(path)
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
        {/*
         * The bar spans the window and the page inside it decides its own width,
         * because a three-column builder and a sign-in form do not want the same
         * measure. Nothing here is centred on the page's behalf.
         */}
        <div className={`flex flex-col ${immersive ? 'h-dvh' : 'min-h-dvh'}`}>
          <header className="sticky top-0 z-30 border-b border-edge bg-panel/95 backdrop-blur">
            <div className="flex h-12 items-center gap-2 px-2 sm:gap-5 sm:px-4">
              <Link to="/" className="text-base leading-none font-bold tracking-[0.02em] text-bone uppercase hover:text-azure sm:text-lg">
                Praetorium
              </Link>
              <nav className="flex items-center gap-2 sm:gap-4" aria-label="Primary">
                <Link to="/battles" className="eyebrow hover:text-azure" activeProps={{ className: 'text-azure' }}>
                  Battles
                </Link>
                <Link to="/rosters" className="eyebrow hover:text-azure" activeProps={{ className: 'text-azure' }}>
                  Rosters
                </Link>
                <Link to="/factions" className="eyebrow hover:text-azure" activeProps={{ className: 'text-azure' }}>
                  Factions
                </Link>
              </nav>
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
        <Scripts />
      </body>
    </html>
  )
}
