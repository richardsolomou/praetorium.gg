import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { PRODUCT_DOCS } from '../contracts/productDocs'
import { DocPage } from '../client/features/docs/DocsPage'
import { pageHead } from '../client/linkPreview'

/** Slugs that moved, so links shared before the rename still land. */
const MOVED: Record<string, string> = {
  'run-a-sealed-event': 'run-a-tournament',
  'play-in-a-sealed-event': 'play-in-a-tournament',
  'sealed-event-problems': 'tournament-problems',
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
