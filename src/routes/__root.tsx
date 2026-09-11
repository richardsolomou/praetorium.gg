import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'
import barlow400 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2?url'
import barlow500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2?url'
import barlow600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2?url'
import barlow700 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url'
import rules400 from '@fontsource/barlow/files/barlow-latin-400-normal.woff2?url'
import rules600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2?url'
import { PageState } from '../client/components/PageState'
import { AppShell } from '../client/features/shell/AppShell'
import { meQuery } from '../client/queries'
import appCss from '../styles.css?url'

const TITLE = 'Praetorium'
const DESCRIPTION = 'Build Warhammer 40,000 armies and track your games from setup to final score.'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.query({ ...meQuery(), staleTime: 'static' }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0b0c0e' },
      { title: `${TITLE} — Warhammer 40,000 army builder and battle tracker` },
      { name: 'description', content: DESCRIPTION },
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
  component: AppShell,
  notFoundComponent: () => (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        eyebrow="404"
        title="Nothing here"
        explanation="This page does not exist or its current data is unavailable. Check the link and try again."
      />
    </main>
  ),
})
