import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import type { RuleEntry, RuleSummary } from '../../../../contracts/rules'
import { ruleIndexQuery, ruleSectionQuery } from '../../../queries'
import { RuleSummarySkeleton, RuleSummaryText } from '../../../components/RuleSummaryText'
import { useRuleEntrySummaries } from '../../../ruleSummaries'
import { PageContent, PageHeader } from '../../../components/Page'
import { revealHashTarget } from '../../../hashTarget'
import { BackLink } from '../BackLink'

/**
 * One section of one rules document, which is as much as anybody reads at a time: each rule's name and number,
 * and its VS Data summary, never the document's own words.
 *
 * A rule is addressed by the number the source prints against it, so a link from
 * another rule, from the contents, or from search lands on the rule itself.
 */
export function RuleSectionPage({ documentId, sectionId }: { documentId: string; sectionId: string }) {
  const { data: index } = useQuery(ruleIndexQuery())
  const { data } = useQuery(ruleSectionQuery(documentId, sectionId))
  const { summaryOf, settled } = useRuleEntrySummaries()
  const hash = useLocation({ select: (location) => location.hash })
  const shown = data?.section
  // The server cannot know the address, so the rule or clarification it names is brought into view in the browser,
  // and again once the summaries above it have arrived and moved it down.
  useEffect(() => {
    if (shown && settled) revealHashTarget(hash)
  }, [hash, shown, settled])
  // The server never sees the address's hash, so the rule it names is gated once the page is in the browser;
  // `hash` above re-renders this on in-app navigation, which fires no event.
  const target = useSyncExternalStore(subscribeToHash, currentHash, noHash)
  if (!data || !index || !shown) return null

  const sections = index.documents.find((candidate) => candidate.slug === documentId)?.sections ?? []
  const at = sections.findIndex((candidate) => candidate.slug === sectionId)

  return (
    <main className="w-full">
      <PageHeader title={shown.title} />
      <PageContent className="space-y-6 *:max-w-3xl">
        <BackLink to="/rules/$documentId" params={{ documentId }}>
          {data.document.title}
        </BackLink>
        <div className="divide-y divide-edge border-y border-edge">
          {shown.entries.map((entry) => (
            <Rule
              key={entry.anchor}
              entry={entry}
              summaryOf={summaryOf}
              loading={!settled}
              current={target === entry.anchor || entry.formerAnchors.includes(target)}
            />
          ))}
        </div>
        <nav className="flex items-stretch justify-between gap-2 border-b border-edge pb-2">
          {[sections[at - 1], sections[at + 1]].map((section, side) =>
            section ? (
              <Link
                key={section.id}
                to="/rules/$documentId/$sectionId"
                params={{ documentId, sectionId: section.slug }}
                className={`flex min-h-11 min-w-0 items-center gap-1 rounded-md px-2 py-2 text-sm text-dim transition-colors hover:bg-raised hover:text-bone ${side ? 'ml-auto text-right' : ''}`}
              >
                {side ? null : <ChevronLeft className="size-3.5 shrink-0 text-dim" aria-hidden />}
                <span className="truncate">{section.title}</span>
                {side ? <ChevronRight className="size-3.5 shrink-0 text-dim" aria-hidden /> : null}
              </Link>
            ) : null,
          )}
        </nav>
      </PageContent>
    </main>
  )
}

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const currentHash = () => decodeURIComponent(window.location.hash.slice(1))
const noHash = () => ''

function Rule({
  entry,
  summaryOf,
  loading,
  current,
}: {
  entry: RuleEntry
  summaryOf: (entry: string) => RuleSummary | undefined
  loading: boolean
  current: boolean
}) {
  const summary = summaryOf(entry.id)
  return (
    <article
      id={entry.anchor}
      data-gate={current ? 'current' : undefined}
      className={`scroll-mt-header px-2 py-5 ${current ? 'bg-parchment/5 shadow-[inset_2px_0_0_var(--color-parchment)]' : ''}`}
    >
      {/* A link made before VS Data outlined the documents names the rule by its former address. */}
      {entry.formerAnchors.map((anchor) => (
        <span key={anchor} id={anchor} className="block scroll-mt-header" />
      ))}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {entry.code ? <span className={`readout text-sm ${current ? 'text-parchment' : 'text-faint'}`}>{entry.code}</span> : null}
        <h2 className="min-w-0 flex-1 text-lg font-semibold sm:text-xl">{entry.title}</h2>
        {entry.cost === null ? null : (
          <span className="shrink-0 whitespace-nowrap">
            <span className="figure text-xl leading-none text-bone">{entry.cost}</span>
            <span className="ml-1 text-xs text-dim">CP</span>
          </span>
        )}
      </div>
      {summary ? <RuleSummaryText summary={summary} className="mt-3" /> : loading ? <RuleSummarySkeleton className="mt-3" /> : null}
      {entry.clarifications.map((clarification) => {
        const clarified = summaryOf(clarification.id)
        return (
          <div key={clarification.anchor} id={clarification.anchor} className="mt-4 scroll-mt-header border-l-2 border-edge pl-3">
            <div className="flex items-center gap-2">
              {clarification.code ? <span className="readout shrink-0 text-xs text-faint">{clarification.code}</span> : null}
              <span className="min-w-0 flex-1 text-sm font-medium text-bone">{clarification.title}</span>
            </div>
            {clarified ? <RuleSummaryText summary={clarified} /> : null}
          </div>
        )
      })}
    </article>
  )
}
