import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { RuleDocumentSummary } from '../../../../contracts/rules'
import { ruleIndexQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { PageState } from '../../../components/PageState'
import { SearchField } from '../../../components/SearchField'

/**
 * Every rules document the community data carries, and a way into any one rule.
 *
 * The documents each hold too much to put on one page, so this is their contents:
 * a reader either walks down to the section they want or names the rule they are
 * after, which is what the filter answers across all five at once.
 */
export function RulesIndex() {
  const { data } = useQuery(ruleIndexQuery())
  const [wanted, setWanted] = useState('')

  if (!data?.documents.length) {
    return (
      <main className="flex w-full">
        <PageState
          className="flex-1 border-x-0 border-t-0"
          loading={!data}
          eyebrow="Rules"
          title={data ? 'No rules available' : 'Getting the rules ready'}
          explanation={
            data
              ? 'This instance has no rules documents to read yet.'
              : 'The core rules and the mission documents will be available shortly.'
          }
        />
      </main>
    )
  }

  const matches = matchingRules(data.documents, wanted)
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Reference"
        title="Rules"
        description="The core rules, the mission sequence, and the event and Combat Patrol rules, as the community data writes them."
      />
      <PageContent>
        <SearchField
          onboarding="rules-search"
          value={wanted}
          onChange={setWanted}
          placeholder="Find a rule"
          label="Find a rule"
          clearLabel="Empty the rule filter"
        />
        {matches ? (
          <FoundRules matches={matches} />
        ) : (
          data.documents.map((document) => <DocumentShelf key={document.id} document={document} />)
        )}
        <p className="mt-8 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
      </PageContent>
    </main>
  )
}

type Found = {
  key: string
  document: RuleDocumentSummary
  section: RuleDocumentSummary['sections'][number]
  code: string | null
  title: string
  anchor: string
}

/** Nothing while the box is empty, so an empty filter is the contents rather than every rule. */
function matchingRules(documents: readonly RuleDocumentSummary[], query: string): Found[] | null {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return null
  return documents.flatMap((document) =>
    document.sections.flatMap((section) =>
      section.entries
        .filter((entry) => `${entry.code ?? ''} ${entry.title} ${section.title}`.toLowerCase().includes(wanted))
        .map((entry) => ({ key: `${document.id}-${entry.anchor}`, document, section, ...entry })),
    ),
  )
}

function FoundRules({ matches }: { matches: Found[] }) {
  if (!matches.length) {
    return (
      <PageState
        className="mt-4"
        headingLevel={2}
        eyebrow="Rules"
        title="No rule found"
        explanation="Try the name the rulebook uses, or a rule number such as 09.04."
      />
    )
  }
  return (
    <div className="mt-4 border border-edge bg-panel">
      {matches.map((found) => (
        <Link
          key={found.key}
          to="/rules/$documentId/$sectionId"
          params={{ documentId: found.document.slug, sectionId: found.section.slug }}
          hash={found.anchor}
          className="flex items-center gap-3 border-b border-edge px-3 py-2 last:border-b-0 hover:bg-raised"
        >
          {found.code ? <span className="chip readout">{found.code}</span> : null}
          <span className="min-w-0 flex-1 truncate text-sm text-bone">{found.title}</span>
          <span className="hidden truncate text-xs text-dim sm:block">
            {found.document.title} · {found.section.title}
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
        </Link>
      ))}
    </div>
  )
}

function DocumentShelf({ document }: { document: RuleDocumentSummary }) {
  const rules = document.sections.reduce((count, section) => count + section.entries.length, 0)
  return (
    <section data-onboarding="rules-documents" className="mt-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
        <h2 className="rubric">
          <Link to="/rules/$documentId" params={{ documentId: document.slug }} className="hover:text-bone">
            {document.title}
          </Link>
        </h2>
        <p className="rubric readout">{rules} rules</p>
      </div>
      <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-3">
        {document.sections.map((section) => (
          <Link
            key={section.id}
            to="/rules/$documentId/$sectionId"
            params={{ documentId: document.slug, sectionId: section.slug }}
            className="flex items-center gap-2 bg-panel px-3 py-2 hover:bg-raised"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-bone">{section.title}</span>
            <span className="readout text-xs text-faint">{section.entries.length}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
