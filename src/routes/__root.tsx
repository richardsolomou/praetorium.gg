import { offlineData } from '../client/offline/runtime'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import sofiaSans from '@fontsource-variable/sofia-sans-semi-condensed/files/sofia-sans-semi-condensed-latin-wght-normal.woff2?url'
import chakraPetch from '@fontsource/chakra-petch/files/chakra-petch-latin-700-normal.woff2?url'
import martianMono from '@fontsource-variable/martian-mono/files/martian-mono-latin-wdth-normal.woff2?url'
import { FullPageState } from '../client/components/PageState'
import { siteMeta } from '../client/linkPreview'
import { AppShell } from '../client/features/shell/AppShell'
import { warnIfSlow } from '../client/features/shell/slowLoader'
import { meQuery } from '../client/queries'
import { notFoundPage } from '../client/routeErrors'
import { TEXT_SOURCES_SCRIPT } from '../client/rulesText'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; origin: string }>()({
  loader: async ({ context }) => {
    const startedAt = performance.now()
    await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    warnIfSlow('slow_root_loader', startedAt)
  },
  head: ({ match }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0f1113' },
      ...siteMeta(match.context.origin),
    ],
    scripts: [{ children: TEXT_SOURCES_SCRIPT }],
    links: offlineData()
      ? []
      : [
          { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
          { rel: 'stylesheet', href: appCss },
          ...[sofiaSans, chakraPetch, martianMono].map((href) => ({
            rel: 'preload' as const,
            href,
            as: 'font' as const,
            type: 'font/woff2',
            crossOrigin: 'anonymous' as const,
          })),
        ],
  }),
  component: AppShell,
  notFoundComponent: NotFound,
})

function NotFound() {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  useEffect(() => notFoundPage(pathname, Object.keys(router.routesByPath)), [pathname, router])
  return (
    <FullPageState
      eyebrow="404"
      title="Nothing here"
      explanation="This page does not exist or its current data is unavailable. Check the link and try again."
    />
  )
}
