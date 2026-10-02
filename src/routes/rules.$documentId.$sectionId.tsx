import { createFileRoute, notFound } from '@tanstack/react-router'
import { RuleSectionPage } from '../client/features/reference/rules/RuleSectionPage'
import { ruleIndexQuery, ruleSectionQuery } from '../client/queries'
import { breadcrumbMeta, pageHead } from '../client/linkPreview'

export const Route = createFileRoute('/rules/$documentId/$sectionId')({
  loader: async ({ context, params }) => {
    const [index, section] = await Promise.all([
      context.queryClient.query({ ...ruleIndexQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...ruleSectionQuery(params.documentId, params.sectionId), staleTime: 'static' }),
    ])
    if (!section) throw notFound()
    return { index, section }
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {}
    const { document, section } = loaderData.section
    const path = `/rules/${document.slug}/${section.slug}`
    const head = pageHead(match.context.origin, {
      title: `${section.title} — ${document.title}`,
      description: `${section.title} from ${document.title}, with printed rule numbers and clarifications.`,
      path,
      article: true,
      markdown: `/api/reference/v1/rules/${document.slug}/${section.slug}`,
    })
    return {
      meta: [
        ...head.meta,
        breadcrumbMeta(match.context.origin, [
          { name: 'Rules', path: '/rules' },
          { name: document.title, path: `/rules/${document.slug}` },
          { name: section.title, path },
        ]),
      ],
      links: head.links,
    }
  },
  component: RuleSection,
})

function RuleSection() {
  const { documentId, sectionId } = Route.useParams()
  return <RuleSectionPage documentId={documentId} sectionId={sectionId} />
}
