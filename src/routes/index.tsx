import { createFileRoute } from '@tanstack/react-router'
import { Home } from '../client/features/home/Home'
import { loadHome } from '../client/features/home/homeRouteData'
import { canonicalLink, siteStructuredData } from '../client/linkPreview'

export const Route = createFileRoute('/')({
  loader: ({ context }) => loadHome(context.queryClient),
  // The instance's own title and card are the home page's; only its address is its own.
  head: ({ match }) => ({
    meta: [{ property: 'og:url', content: `${match.context.origin}/` }, siteStructuredData(match.context.origin)],
    links: [canonicalLink(match.context.origin, '/')],
  }),
  component: Home,
})
