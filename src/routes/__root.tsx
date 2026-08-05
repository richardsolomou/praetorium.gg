import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useNavigate } from '@tanstack/react-router'
import { authClient } from '../client/authClient'
import { meQuery } from '../client/queries'
import appCss from '../styles.css?url'

const TITLE = 'Praetorium'
const DESCRIPTION = 'Track a Warhammer 40,000 game with your opponent, live on both phones.'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <main className="mx-auto mt-[15vh] max-w-md px-6 text-center">
      <h1 className="text-2xl">Nothing here</h1>
      <p className="mt-2 text-dim">Check the link you were sent.</p>
    </main>
  ),
})

/** Who you are, and the way to stop being a guest. Playing needs neither. */
function Account() {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  if (me?.signedIn) {
    return (
      <button
        type="button"
        className="eyebrow ml-auto hover:text-azure"
        onClick={async () => {
          await authClient.signOut()
          await queryClient.invalidateQueries()
          await navigate({ to: '/' })
        }}
      >
        {me.name} · sign out
      </button>
    )
  }

  // One label whatever is cached: the page itself explains what an account is for.
  return (
    <Link to="/signin" className="eyebrow ml-auto hover:text-azure">
      Sign in
    </Link>
  )
}

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        {/*
         * The bar spans the window and the page inside it decides its own width,
         * because a three-column builder and a sign-in form do not want the same
         * measure. Nothing here is centred on the page's behalf.
         */}
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 border-b border-edge bg-panel/95 backdrop-blur">
            <div className="flex h-12 items-center gap-5 px-4">
              <Link to="/" className="text-lg leading-none font-bold tracking-[0.02em] text-bone uppercase hover:text-azure">
                Praetorium
              </Link>
              <Account />
            </div>
          </header>
          <div className="flex-1">
            <Outlet />
          </div>
          {/*
           * Said plainly and on every page, because the name is drawn from Games
           * Workshop's setting and nothing about this is theirs or endorsed by them.
           * The community data has its own attribution, which appears where that
           * data does — see `ATTRIBUTION` in `src/server/rules.ts`.
           */}
          <footer className="border-t border-edge px-4 py-4 text-center text-xs text-faint">
            Praetorium is an unofficial product, and is not in any way affiliated with or endorsed by Games Workshop.
          </footer>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
