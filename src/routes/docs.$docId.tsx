import { createFileRoute, notFound } from '@tanstack/react-router'
import { PRODUCT_DOCS } from '../contracts/productDocs'
import { DocPage } from '../client/features/docs/DocsPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/docs/$docId')({
  loader: ({ params }) => {
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
