import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { PRODUCT_DOCS, type ProductDoc } from '../contracts/productDocs'
import { DocPage } from '../client/features/docs/DocsPage'
import { pageHead } from '../client/linkPreview'

/** Every slug that left `PRODUCT_DOCS`, mapped to the page that covers it now, so links shared before still land. */
export const MOVED: Record<string, ProductDoc['slug']> = {
  clubs: 'groups',
  'run-a-league': 'run-a-tournament',
  'play-in-a-league': 'play-in-a-tournament',
  'league-problems': 'tournament-problems',
  'play-with-a-guest': 'start-a-battle',
}

export const Route = createFileRoute('/docs/$docId')({
  loader: ({ params }) => {
    const moved = MOVED[params.docId]
    if (moved) throw redirect({ to: '/docs/$docId', params: { docId: moved }, replace: true })
    const doc = PRODUCT_DOCS.find((candidate) => candidate.slug === params.docId)
    if (!doc) throw notFound()
    return doc
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const path = `/docs/${loaderData.slug}`
    return pageHead(match.context.origin, {
      title: loaderData.title,
      description: loaderData.description,
      path,
      article: true,
      breadcrumbs: [
        { name: 'Docs', path: '/docs' },
        { name: loaderData.title, path },
      ],
    })
  },
  component: () => <DocPage doc={Route.useLoaderData()} />,
})
