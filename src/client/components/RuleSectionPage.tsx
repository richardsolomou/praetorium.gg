import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import type { RuleEntry } from '../../server/rulesCore'
import { type RuleLinks, ruleLinks } from '../ruleLinks'
import { ruleIndexQuery, ruleSectionQuery } from '../queries'
import { RuleMarkup } from './RuleMarkup'

/**
 * One section of one rules document, which is as much as anybody reads at a time.
 *
 * A rule is addressed by the number the source prints against it, so a link from
 * another rule, from the contents, or from search lands on the rule itself.
 */
export function RuleSectionPage({ documentId, sectionId }: { documentId: string; sectionId: string }) {
  const { data: index } = useQuery(ruleIndexQuery())
  const { data } = useQuery(ruleSectionQuery(documentId, sectionId))
  const hash = useLocation({ select: (location) => location.hash })
  // A link to a clarification lands on a collapsed one, so the address opens it. Done
  // to the element rather than through a prop: the server cannot know the address, and
  // a reader's own toggle must survive every later render.
  useEffect(() => {
    const target = hash ? document.getElementById(hash) : null
    if (target instanceof HTMLDetailsElement) target.open = true
  }, [hash])
  if (!data || !index) return null

  const sections = index.documents.find((candidate) => candidate.slug === documentId)?.sections ?? []
  const at = sections.findIndex((candidate) => candidate.slug === sectionId)
  const links = ruleLinks(index, documentId)

  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <p className="eyebrow text-parchment">{data.document.title}</p>
          <h1 className="mt-1 text-3xl">{data.section.title}</h1>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-3 pt-4 pb-8 sm:px-4">
        <Link to="/rules/$documentId" params={{ documentId }} className="eyebrow flex items-center gap-1 text-info hover:text-bone">
          <ChevronLeft className="size-3.5" aria-hidden /> {data.document.title}
        </Link>
        <div className="mt-5 space-y-5">
          {data.section.entries.map((entry) => (
            <Rule key={entry.anchor} entry={entry} links={links} />
          ))}
        </div>
        <nav className="mt-8 flex items-stretch justify-between gap-2 border-t border-edge pt-4">
          {[sections[at - 1], sections[at + 1]].map((section, side) =>
            section ? (
              <Link
                key={section.id}
                to="/rules/$documentId/$sectionId"
                params={{ documentId, sectionId: section.slug }}
                className={`flex min-w-0 items-center gap-1 text-sm text-info hover:text-bone ${side ? 'ml-auto text-right' : ''}`}
              >
                {side ? null : <ChevronLeft className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{section.title}</span>
                {side ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
              </Link>
            ) : null,
          )}
        </nav>
        <p className="mt-6 border-t border-edge pt-3 text-xs text-dim">{index.attribution}</p>
      </div>
    </main>
  )
}

function Rule({ entry, links }: { entry: RuleEntry; links: RuleLinks }) {
  return (
    <article id={entry.anchor} className="scroll-mt-16 border border-edge bg-panel p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {entry.code ? <span className="chip readout">{entry.code}</span> : null}
        <h2 className="text-xl">{entry.title}</h2>
        {entry.cost === null ? null : <span className="chip readout">{entry.cost} CP</span>}
      </div>
      {entry.lore ? <p className="mt-2 font-rules text-sm text-faint italic">{entry.lore}</p> : null}
      {entry.facts.length ? (
        <dl className="mt-3 space-y-2 border-t border-edge pt-3">
          {entry.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="eyebrow">{fact.label}</dt>
              <dd>
                <RuleMarkup markup={fact.markup} links={links} className="mt-1" />
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
        if (block.kind === 'prose') return <RuleMarkup key={key} markup={block.markup} links={links} className="mt-3" />
        return (
          <details key={key} id={block.anchor ?? undefined} className="group mt-3 scroll-mt-16 border border-edge bg-sunken">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-raised">
              {block.code ? <span className="readout shrink-0 text-xs text-faint">{block.code}</span> : null}
              <span className="min-w-0 flex-1 text-sm font-semibold text-bone">{block.title}</span>
              <ChevronRight className="size-3.5 shrink-0 text-faint transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <RuleMarkup markup={block.markup} links={links} className="border-t border-edge px-3 py-2" />
          </details>
        )
      })}
    </article>
  )
}
