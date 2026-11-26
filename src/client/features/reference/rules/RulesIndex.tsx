import { GuideHelp } from '../../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { RuleDocumentSummary } from '../../../../contracts/rules'
import { ruleIndexQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { FullPageState, PageState } from '../../../components/PageState'
import { SearchField } from '../../../components/SearchField'
import { matchesSearch } from '../../../text'

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
      <FullPageState
        loading={!data}
        title={data ? 'No rules available' : 'Getting the rules ready'}
        explanation={
          data ? 'This instance has no rules documents to read yet.' : 'The core rules and the mission documents will be available shortly.'
        }
      />
    )
  }

  const matches = matchingRules(data.documents, wanted)
  return (
    <main className="w-full">
      <PageHeader
        title="Rules"
        description="Core rules, mission sequence, event and Combat Patrol rules."
        help={<GuideHelp task="reference">Search help</GuideHelp>}
      />
      <PageContent className="space-y-6">
        <SearchField value={wanted} onChange={setWanted} placeholder="Find a rule" label="Find a rule" clearLabel="Empty the rule filter" />
        {matches ? (
          <FoundRules matches={matches} />
        ) : (
          data.documents.map((document) => <DocumentShelf key={document.id} document={document} />)
        )}
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
  if (!query.trim()) return null
  return documents.flatMap((document) =>
    document.sections.flatMap((section) =>
      section.entries
        .filter((entry) => matchesSearch(`${entry.code ?? ''} ${entry.title} ${section.title}`, query))
        .map((entry) => ({ key: `${document.id}-${entry.anchor}`, document, section, ...entry })),
    ),
  )
}

function FoundRules({ matches }: { matches: Found[] }) {
  if (!matches.length) {
    return (
      <PageState headingLevel={2} title="No rule found" explanation="Try the name the rulebook uses, or a rule number such as 09.04." />
    )
  }
  return (
    <div className="divide-y divide-edge border-y border-edge">
      {matches.map((found) => (
        <Link
          key={found.key}
          to="/rules/$documentId/$sectionId"
          params={{ documentId: found.document.slug, sectionId: found.section.slug }}
          hash={found.anchor}
          className="flex min-h-11 items-center gap-3 px-2 py-2 hover:bg-raised"
        >
          {found.code ? <span className="readout w-16 shrink-0 text-xs text-faint">{found.code}</span> : null}
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
    <section>
      <h2 className="rubric mb-3 flex min-h-8 items-center gap-3 text-bone">
        <Link to="/rules/$documentId" params={{ documentId: document.slug }} className="hover:text-info">
          {document.title}
        </Link>
        <span className="readout font-sans text-sm font-semibold text-faint">{rules}</span>
      </h2>
      <div className="grid border-t border-edge sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3">
        {document.sections.map((section) => (
          <Link
            key={section.id}
            to="/rules/$documentId/$sectionId"
            params={{ documentId: document.slug, sectionId: section.slug }}
            className="flex min-h-11 items-center gap-2 border-b border-edge px-2 py-2 transition-colors hover:bg-raised"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-bone">{section.title}</span>
            <span className="readout text-xs text-faint">{section.entries.length}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
