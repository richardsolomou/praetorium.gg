import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useDateFormatting } from '../../../dates'
import { ruleIndexQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'

/** One document's contents: every section, and every rule in it by number and name. */
export function RuleContents({ documentId }: { documentId: string }) {
  const { date } = useDateFormatting()
  const { data } = useQuery(ruleIndexQuery())
  const document = data?.documents.find((candidate) => candidate.slug === documentId)
  if (!data || !document) return null

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={
          <Link to="/rules" className="text-info hover:text-bone">
            Rules
          </Link>
        }
        title={document.title}
        description={
          <>
            {document.sections.length} sections. Open one to read it.
            {/* When the source last wrote this document, which is how current these rules are. */}
            {document.updated ? ` Updated ${date(document.updated)}.` : null}
          </>
        }
      />
      <PageContent>
        {document.sections.map((section, at) => (
          <section key={section.id} data-onboarding="rule-contents" className={at ? 'mt-5' : undefined}>
            <h2 className="rubric flex items-baseline justify-between gap-3 border-b border-edge pb-2">
              <Link
                to="/rules/$documentId/$sectionId"
                params={{ documentId: document.slug, sectionId: section.slug }}
                className="hover:text-bone"
              >
                {section.title}
              </Link>
              <span className="readout">{section.entries.length}</span>
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-px border border-edge bg-panel sm:grid-cols-2">
              {section.entries.map((entry) => (
                <Link
                  key={entry.anchor}
                  data-onboarding="rule-entry"
                  to="/rules/$documentId/$sectionId"
                  params={{ documentId: document.slug, sectionId: section.slug }}
                  hash={entry.anchor}
                  className="flex items-center gap-2 bg-panel px-3 py-2 ring-1 ring-edge hover:bg-raised"
                >
                  {entry.code ? <span className="readout w-16 shrink-0 text-xs text-faint">{entry.code}</span> : null}
                  <span className="min-w-0 flex-1 truncate text-sm text-bone">{entry.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="mt-8 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
      </PageContent>
    </main>
  )
}
