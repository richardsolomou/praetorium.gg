import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { RuleContents } from '../client/features/reference/rules/RuleContents'
import { ruleIndexQuery } from '../client/queries'
import { breadcrumbMeta, pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId')({
  loader: async ({ context, location, params }) => {
    const index = await context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' })
    const document = index?.documents.find((candidate) => candidate.slug === params.documentId) ?? null
    if (!document && location.pathname.split('/').filter(Boolean).length === 2) throw notFound()
    return { document }
  },
  head: ({ loaderData, match, matches }) => {
    if (!loaderData?.document) return {}
    const { document } = loaderData
    const path = `/rules/${document.slug}`
    const leaf = matches.at(-1)?.routeId === match.routeId
    const head = pageHead(match.context.origin, {
      title: document.title,
      description: `Contents and numbered rules from ${document.title}.`,
      path: leaf ? path : undefined,
      article: true,
    })
    return {
      meta: [
        ...head.meta,
        ...(leaf
          ? [
              breadcrumbMeta(match.context.origin, [
                { name: 'Rules', path: '/rules' },
                { name: document.title, path },
              ]),
            ]
          : []),
      ],
      links: head.links,
    }
  },
  component: RuleDocumentPage,
})

function RuleDocumentPage() {
  const { documentId } = Route.useParams()
  const leaf = useRouterState({ select: (state) => state.matches.at(-1)?.routeId === Route.id })
  if (!leaf) return <Outlet />
  return <RuleContents documentId={documentId} />
}
