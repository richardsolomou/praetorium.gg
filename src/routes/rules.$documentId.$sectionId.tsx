import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleSectionPage } from '../client/features/reference/rules/RuleSectionPage'
import { ruleIndexQuery, ruleSectionQuery } from '../client/queries'
import { breadcrumbMeta, canonicalLink } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId/$sectionId')({
  loader: async ({ context, params }) => {
    const [index, section] = await Promise.all([
      context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...ruleSectionQuery(params.documentId, params.sectionId), staleTime: 'static' }),
    ])
    if (!section) throw notFound()
    return { index, section }
  },
  head: ({ loaderData, match }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.section.section.title} — ${loaderData.section.document.title} — Praetorium` },
          {
            name: 'description',
            content: `${loaderData.section.section.title} from ${loaderData.section.document.title}, with printed rule numbers and clarifications.`,
          },
          { property: 'og:title', content: `${loaderData.section.section.title} — ${loaderData.section.document.title}` },
          {
            property: 'og:description',
            content: `${loaderData.section.section.title} from ${loaderData.section.document.title}, with printed rule numbers and clarifications.`,
          },
          { property: 'og:type', content: 'article' },
          breadcrumbMeta(match.context.origin, [
            { name: 'Rules', path: '/rules' },
            { name: loaderData.section.document.title, path: `/rules/${loaderData.section.document.slug}` },
            {
              name: loaderData.section.section.title,
              path: `/rules/${loaderData.section.document.slug}/${loaderData.section.section.slug}`,
            },
          ]),
        ]
      : [],
    links: loaderData
      ? [canonicalLink(match.context.origin, `/rules/${loaderData.section.document.slug}/${loaderData.section.section.slug}`)]
      : [],
  }),
  component: RuleSection,
})

function RuleSection() {
  const { documentId, sectionId } = Route.useParams()
  return <RuleSectionPage documentId={documentId} sectionId={sectionId} />
}
