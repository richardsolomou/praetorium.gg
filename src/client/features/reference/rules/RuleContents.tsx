import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BackLink } from '../BackLink'
import { ruleIndexQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'

/** One document's contents: every section, and every rule in it by number and name. */
export function RuleContents({ documentId }: { documentId: string }) {
  const { data } = useQuery(ruleIndexQuery())
  const document = data?.documents.find((candidate) => candidate.slug === documentId)
  if (!data || !document) return null

  return (
    <main className="w-full">
      <PageHeader title={document.title} description={`${document.sections.length} sections.`} />
      <PageContent className="space-y-6">
        <BackLink to="/rules">Rules</BackLink>
        {document.sections.map((section) => (
          <section key={section.id}>
            <h2 className="rubric mb-3 flex min-h-8 items-center gap-3 text-bone">
              <Link
                to="/rules/$documentId/$sectionId"
                params={{ documentId: document.slug, sectionId: section.slug }}
                className="hover:text-info"
              >
                {section.title}
              </Link>
              <span className="readout font-sans text-sm font-semibold text-faint">{section.entries.length}</span>
            </h2>
            <div className="grid grid-cols-1 border-t border-edge sm:grid-cols-2 sm:gap-x-6">
              {section.entries.map((entry) => (
                <Link
                  key={entry.anchor}
                  to="/rules/$documentId/$sectionId"
                  params={{ documentId: document.slug, sectionId: section.slug }}
                  hash={entry.anchor}
                  className="flex min-h-11 items-center gap-2 border-b border-edge px-2 py-2 transition-colors hover:bg-raised"
                >
                  {entry.code ? <span className="readout w-16 shrink-0 text-xs text-faint">{entry.code}</span> : null}
                  <span className="min-w-0 flex-1 truncate text-sm text-bone">{entry.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </PageContent>
    </main>
  )
}
