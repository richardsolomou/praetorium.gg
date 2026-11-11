import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import type { RuleEntry } from '../../../../contracts/rules'
import { type RuleLinks, ruleLinks } from '../../../ruleLinks'
import { ruleIndexQuery, ruleSectionQuery } from '../../../queries'
import { RuleMarkup } from '../../../components/RuleMarkup'
import { SourceTextPrompt } from '../../../components/SourceTextPrompt'
import type { MissingText } from '../../../sourceText'
import { PageContent, PageHeader } from '../../../components/Page'
import { useRuleText, withText } from '../../../rulesText'
import { RulesTextNotice } from './RulesTextNotice'
import { revealHashTarget } from '../../../hashTarget'
import { BackLink } from '../BackLink'

/**
 * One section of one rules document, which is as much as anybody reads at a time.
 *
 * A rule is addressed by the number the source prints against it, so a link from
 * another rule, from the contents, or from search lands on the rule itself.
 */
export function RuleSectionPage({ documentId, sectionId }: { documentId: string; sectionId: string }) {
  const { data: index } = useQuery(ruleIndexQuery())
  const { data } = useQuery(ruleSectionQuery(documentId, sectionId))
  const text = useRuleText(data?.document.text ?? null)
  const hash = useLocation({ select: (location) => location.hash })
  const loaded = text.document?.sections.find((candidate) => candidate.slug === sectionId)
  // The outline names and numbers every rule; the loaded file gives each rule its text, matched by the rule's id.
  const shown = data?.section && loaded ? withText(data.section, loaded) : data?.section
  // A link to a clarification lands on a collapsed one, so the address opens it. Done
  // to the element rather than through a prop: the server cannot know the address, and
  // a reader's own toggle must survive every later render. Loaded text replaces the
  // outline's elements, so it runs again once that text lands.
  useEffect(() => {
    if (shown) revealHashTarget(hash)
  }, [hash, shown])
  // The server never sees the address's hash, so the rule it names is gated once the page is in the browser;
  // `hash` above re-renders this on in-app navigation, which fires no event.
  const target = useSyncExternalStore(subscribeToHash, currentHash, noHash)
  if (!data || !index || !shown) return null

  const sections = index.documents.find((candidate) => candidate.slug === documentId)?.sections ?? []
  const at = sections.findIndex((candidate) => candidate.slug === sectionId)
  const links = ruleLinks(index, documentId)
  const missing: MissingText =
    !data.document.text || text.query.isError ? 'unavailable' : !text.chosen ? 'unchosen' : text.document ? null : 'loading'

  return (
    <main className="w-full">
      <PageHeader title={shown.title} />
      <PageContent className="space-y-6 *:max-w-3xl">
        <BackLink to="/rules/$documentId" params={{ documentId }}>
          {data.document.title}
        </BackLink>
        <RulesTextNotice text={data.document.text} state={text} />
        <div className="runner gap-2.5 [--gate-y:1.5rem]">
          {shown.entries.map((entry) => (
            <Rule key={entry.anchor} entry={entry} links={links} missing={missing} current={target === entry.anchor} />
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

function Rule({ entry, links, missing, current }: { entry: RuleEntry; links: RuleLinks; missing: MissingText; current: boolean }) {
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
      {missing ? <SourceTextPrompt missing={missing} source="game-datacards" className="mt-2" /> : null}
      {entry.lore ? <p className="mt-2 font-rules text-sm text-faint italic">{entry.lore}</p> : null}
      {entry.facts.length ? (
        <dl className="mt-3 space-y-2 border-t border-edge pt-3">
          {entry.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="eyebrow">{fact.label}</dt>
              <dd>
                <RuleMarkup markup={fact.markup} links={links} source="game-datacards" className="mt-1" />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {entry.blocks.map((block, at) => {
        const key = `${block.kind}-${at}`
        if (block.kind === 'heading') {
          return (
            <h3 key={key} className="rubric mt-4 text-bone">
              {block.text}
            </h3>
          )
        }
        if (block.kind === 'prose')
          return <RuleMarkup key={key} markup={block.markup} links={links} source="game-datacards" className="mt-3" />
        if (block.markup === null) {
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
        }
        return (
          <details key={key} id={block.anchor ?? undefined} className="group mt-3 scroll-mt-header rounded-lg border border-edge bg-sunken">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-raised">
              {block.code ? <span className="readout shrink-0 text-xs text-faint">{block.code}</span> : null}
              <span className="min-w-0 flex-1 text-sm font-semibold text-bone">{block.title}</span>
              <ChevronRight className="size-3.5 shrink-0 text-faint transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <RuleMarkup markup={block.markup} links={links} source="game-datacards" className="border-t border-edge px-3 py-2" />
          </details>
        )
      })}
    </article>
  )
}
