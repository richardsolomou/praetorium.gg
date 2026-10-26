import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleContents } from '../client/features/reference/rules/RuleContents'
import { ruleIndexQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId/')({
  loader: async ({ context, params }) => {
    const index = await context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' })
    const document = index?.documents.find((candidate) => candidate.slug === params.documentId)
    if (!document) throw notFound()
    return { document }
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const { document } = loaderData
    const path = `/rules/${document.slug}`
    return pageHead(match.context.origin, {
      title: document.title,
      description: `Contents and numbered rules from ${document.title}.`,
      path,
      article: true,
      breadcrumbs: [
        { name: 'Rules', path: '/rules' },
        { name: document.title, path },
      ],
    })
  },
  component: () => <RuleContents documentId={Route.useParams().documentId} />,
})
