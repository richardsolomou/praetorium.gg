import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { RuleContents } from '../client/features/reference/rules/RuleContents'
import { ruleIndexQuery } from '../client/queries'
import { breadcrumbMeta, canonicalLink } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId')({
  loader: async ({ context, location, params }) => {
    const index = await context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' })
    const known = index?.documents.some((document) => document.slug === params.documentId)
    // A document only the child route needs is checked there, against its section.
    if (!known && location.pathname === `/rules/${params.documentId}`) throw notFound()
    return { document: index?.documents.find((document) => document.slug === params.documentId) ?? null }
  },
  head: ({ loaderData, match, matches }) => ({
    meta: loaderData?.document
      ? [
          { title: `${loaderData.document.title} — Praetorium` },
          { name: 'description', content: `Contents and numbered rules from ${loaderData.document.title}.` },
          { property: 'og:title', content: loaderData.document.title },
          { property: 'og:description', content: `Contents and numbered rules from ${loaderData.document.title}.` },
          { property: 'og:type', content: 'article' },
          // Breadcrumbs are not replaced by a child's, so only the page itself writes them.
          ...(matches.at(-1)?.routeId === match.routeId
            ? [
                breadcrumbMeta(match.context.origin, [
                  { name: 'Rules', path: '/rules' },
                  { name: loaderData.document.title, path: `/rules/${loaderData.document.slug}` },
                ]),
              ]
            : []),
        ]
      : [],
    links:
      loaderData?.document && matches.at(-1)?.routeId === match.routeId
        ? [canonicalLink(match.context.origin, `/rules/${loaderData.document.slug}`)]
        : [],
  }),
  component: RuleDocumentPage,
})

function RuleDocumentPage() {
  const { documentId } = Route.useParams()
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== `/rules/${documentId}`) return <Outlet />
  return <RuleContents documentId={documentId} />
}
