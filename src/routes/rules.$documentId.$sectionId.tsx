import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleSectionPage } from '../client/components/RuleSectionPage'
import { ruleIndexQuery, ruleSectionQuery } from '../client/queries'

export const Route = createFileRoute('/rules/$documentId/$sectionId')({
  loader: async ({ context, params }) => {
    const [, section] = await Promise.all([
      context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...ruleSectionQuery(params.documentId, params.sectionId), staleTime: 'static' }),
    ])
    if (!section) throw notFound()
  },
  component: RuleSection,
})

function RuleSection() {
  const { documentId, sectionId } = Route.useParams()
  return <RuleSectionPage documentId={documentId} sectionId={sectionId} />
}
