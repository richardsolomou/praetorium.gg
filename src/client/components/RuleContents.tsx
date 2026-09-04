import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { formatDate } from '../dates'
import { ruleIndexQuery } from '../queries'

/** One document's contents: every section, and every rule in it by number and name. */
export function RuleContents({ documentId }: { documentId: string }) {
  const { data } = useQuery(ruleIndexQuery())
  const document = data?.documents.find((candidate) => candidate.slug === documentId)
  if (!data || !document) return null

  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <p className="eyebrow text-parchment">Rules</p>
          <h1 className="mt-1 text-3xl">{document.title}</h1>
          <p className="mt-2 text-sm text-dim">
            {document.sections.length} sections. Open one to read it.
            {/* When the source last wrote this document, which is how current these rules are. */}
            {document.updated ? ` Updated ${formatDate(document.updated)}.` : null}
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-3 pt-4 pb-8 sm:px-4">
        <Link to="/rules" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
          <ChevronLeft className="size-3.5" aria-hidden /> Rules
        </Link>
        {document.sections.map((section) => (
          <section key={section.id} className="mt-5">
            <h2 className="rubric">
              <Link
                to="/rules/$documentId/$sectionId"
                params={{ documentId: document.slug, sectionId: section.slug }}
                className="hover:text-bone"
              >
                {section.title}
              </Link>
            </h2>
            <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-2">
              {section.entries.map((entry) => (
                <Link
                  key={entry.anchor}
                  to="/rules/$documentId/$sectionId"
                  params={{ documentId: document.slug, sectionId: section.slug }}
                  hash={entry.anchor}
                  className="flex items-center gap-2 bg-panel px-3 py-2 hover:bg-raised"
                >
                  {entry.code ? <span className="readout w-16 shrink-0 text-xs text-faint">{entry.code}</span> : null}
                  <span className="min-w-0 flex-1 truncate text-sm text-bone">{entry.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="mt-8 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
      </div>
    </main>
  )
}
