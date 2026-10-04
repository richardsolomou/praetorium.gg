import { offlineData } from '../client/offline/runtime'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'
import sofiaSans from '@fontsource-variable/sofia-sans-semi-condensed/files/sofia-sans-semi-condensed-latin-wght-normal.woff2?url'
import chakraPetch from '@fontsource/chakra-petch/files/chakra-petch-latin-700-normal.woff2?url'
import martianMono from '@fontsource-variable/martian-mono/files/martian-mono-latin-wdth-normal.woff2?url'
import { PageState } from '../client/components/PageState'
import { siteMeta } from '../client/linkPreview'
import { AppShell } from '../client/features/shell/AppShell'
import { meQuery } from '../client/queries'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; origin: string }>()({
  loader: async ({ context }) => {
    const startedAt = performance.now()
    await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (import.meta.env.SSR && performance.now() - startedAt > 1000) {
      console.warn({
        event: 'slow_root_loader',
        duration_ms: Math.round(performance.now() - startedAt),
      })
    }
  },
  head: ({ match }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0e1316' },
      ...siteMeta(match.context.origin),
    ],
    links: [
      ...(offlineData() ? [] : [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }]),
      ...(offlineData() ? [] : [{ rel: 'stylesheet', href: appCss }]),
      ...(offlineData() ? [] : [sofiaSans, chakraPetch, martianMono]).map((href) => ({
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
