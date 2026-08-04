import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import appCss from '../styles.css?url'

const TITLE = 'Muster'
const DESCRIPTION = 'Track a Warhammer 40,000 game with your opponent, live on both phones.'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0d0f11' },
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

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between border-b border-edge py-4">
            <Link to="/" className="eyebrow text-bone transition-colors hover:text-amber">
              Muster
            </Link>
            <span className="eyebrow">Warhammer 40,000</span>
          </header>
          <div className="flex-1 py-8">
            <Outlet />
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
