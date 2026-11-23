import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import type { RuleEntry, RuleSummary } from '../../../../contracts/rules'
import { ruleIndexQuery, ruleSectionQuery } from '../../../queries'
import { RuleSummaryText } from '../../../components/RuleSummaryText'
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
  const { summaryOf, settled } = useRuleEntrySummaries(data?.document.text?.url ?? null)
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
        <div className="runner gap-2.5 [--gate-y:1.5rem]">
          {shown.entries.map((entry) => (
            <Rule key={entry.anchor} entry={entry} summary={summaryOf(entry.id)} current={target === entry.anchor} />
          ))}
        </div>
        <nav className="flex items-stretch justify-between gap-2">
          {[sections[at - 1], sections[at + 1]].map((section, side) =>
            section ? (
              <Link
                key={section.id}
                to="/rules/$documentId/$sectionId"
                params={{ documentId, sectionId: section.slug }}
                className={`flex min-h-11 min-w-0 items-center gap-1 part px-3 py-2 text-sm font-semibold transition-colors hover:border-runner hover:bg-raised ${side ? 'ml-auto text-right' : ''}`}
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

function Rule({ entry, summary, current }: { entry: RuleEntry; summary: RuleSummary | undefined; current: boolean }) {
  return (
    <article
      id={entry.anchor}
      data-gate={current ? 'current' : undefined}
      className={`scroll-mt-header part p-3 sm:p-4 ${current ? 'border-parchment' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {entry.code ? <span className={`part-tag ${current ? 'bg-parchment text-parchment-ink' : ''}`}>{entry.code}</span> : null}
        <h2 className="text-lg sm:text-xl">{entry.title}</h2>
        {entry.cost === null ? null : <span className="chip readout">{entry.cost} CP</span>}
      </div>
      {summary ? <RuleSummaryText summary={summary} className="mt-3" /> : null}
      {entry.blocks.map((block, at) => {
        const key = `${block.kind}-${at}`
        if (block.kind === 'heading') {
          return (
            <h3 key={key} className="rubric mt-4 text-bone">
              {block.text}
            </h3>
          )
        }
        if (block.kind === 'prose') return null
        return (
          <div
            key={key}
            id={block.anchor ?? undefined}
            className="mt-3 flex scroll-mt-header items-center gap-2 rounded-lg border border-edge bg-sunken px-3 py-2"
          >
            {block.code ? <span className="readout shrink-0 text-xs text-faint">{block.code}</span> : null}
            <span className="min-w-0 flex-1 text-sm font-semibold text-bone">{block.title}</span>
          </div>
        )
      })}
    </article>
  )
}
