import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleSectionPage } from '../client/components/RuleSectionPage'
import { ruleIndexQuery, ruleSectionQuery } from '../client/queries'

export const Route = createFileRoute('/rules/$documentId/$sectionId')({
  loader: async ({ context, params }) => {
    const [index, section] = await Promise.all([
      context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...ruleSectionQuery(params.documentId, params.sectionId), staleTime: 'static' }),
    ])
    if (!section) throw notFound()
    return { index, section }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.section.section.title} — ${loaderData.section.document.title} — Praetorium` },
          {
            name: 'description',
            content: `${loaderData.section.section.title} from ${loaderData.section.document.title}, with printed rule numbers and clarifications.`,
          },
          { property: 'og:title', content: `${loaderData.section.section.title} — ${loaderData.section.document.title}` },
          { property: 'og:type', content: 'article' },
        ]
      : [],
    links: loaderData ? [{ rel: 'canonical', href: `/rules/${loaderData.section.document.slug}/${loaderData.section.section.slug}` }] : [],
  }),
  component: RuleSection,
})

function RuleSection() {
  const { documentId, sectionId } = Route.useParams()
  return <RuleSectionPage documentId={documentId} sectionId={sectionId} />
}
