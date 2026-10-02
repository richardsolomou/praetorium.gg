import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { RuleContents } from '../client/features/reference/rules/RuleContents'
import { ruleIndexQuery } from '../client/queries'
import { breadcrumbMeta, pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId')({
  loader: async ({ context, location, params }) => {
    const index = await context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' })
    const known = index?.documents.some((document) => document.slug === params.documentId)
    // A document only the child route needs is checked there, against its section.
    if (!known && location.pathname === `/rules/${params.documentId}`) throw notFound()
    return { document: index?.documents.find((document) => document.slug === params.documentId) ?? null }
  },
  head: ({ loaderData, match, matches }) => {
    if (!loaderData?.document) return {}
    const { document } = loaderData
    const path = `/rules/${document.slug}`
    // Breadcrumbs and links are not replaced by a child's, so only the page itself writes them.
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
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== `/rules/${documentId}`) return <Outlet />
  return <RuleContents documentId={documentId} />
}
