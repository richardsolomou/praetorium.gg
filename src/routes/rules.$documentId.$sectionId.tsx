import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleSectionPage } from '../client/components/RuleSectionPage'
import { ruleIndexQuery, ruleSectionQuery } from '../client/queries'

export const Route = createFileRoute('/rules/$documentId/$sectionId')({
  loader: async ({ context, params }) => {
    const [, section] = await Promise.all([
      context.queryClient.ensureQueryData(ruleIndexQuery()),
      context.queryClient.ensureQueryData(ruleSectionQuery(params.documentId, params.sectionId)),
    ])
    if (!section) throw notFound()
  },
  component: RuleSection,
})

function RuleSection() {
  const { documentId, sectionId } = Route.useParams()
  return <RuleSectionPage documentId={documentId} sectionId={sectionId} />
}
