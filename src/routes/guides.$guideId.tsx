import { createFileRoute, notFound } from '@tanstack/react-router'
import { PRODUCT_GUIDES } from '../contracts/productGuides'
import { GuidePage } from '../client/features/guides/GuidesPage'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/guides/$guideId')({
  loader: ({ params }) => {
    const guide = PRODUCT_GUIDES.find((candidate) => candidate.slug === params.guideId)
    if (!guide) throw notFound()
    return guide
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const path = `/guides/${loaderData.slug}`
    return pageHead(match.context.origin, {
      title: loaderData.title,
      description: loaderData.description,
      path,
      article: true,
      breadcrumbs: [
        { name: 'Player guides', path: '/guides' },
        { name: loaderData.title, path },
      ],
    })
  },
  component: () => <GuidePage guide={Route.useLoaderData()} />,
})
