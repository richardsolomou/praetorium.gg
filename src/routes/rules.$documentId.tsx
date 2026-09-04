import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { RuleContents } from '../client/components/RuleContents'
import { ruleIndexQuery } from '../client/queries'

export const Route = createFileRoute('/rules/$documentId')({
  loader: async ({ context, location, params }) => {
    const index = await context.queryClient.ensureQueryData(ruleIndexQuery())
    const known = index?.documents.some((document) => document.slug === params.documentId)
    // A document only the child route needs is checked there, against its section.
    if (!known && location.pathname === `/rules/${params.documentId}`) throw notFound()
  },
  component: RuleDocumentPage,
})

function RuleDocumentPage() {
  const { documentId } = Route.useParams()
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== `/rules/${documentId}`) return <Outlet />
  return <RuleContents documentId={documentId} />
}
