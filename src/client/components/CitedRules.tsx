import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RuleReference, RuleSection } from '../../contracts/rules'
import { ruleIndexQuery, ruleSectionQuery } from '../queries'
import { type RuleLinks, ruleLinks } from '../ruleLinks'
import { quotedRuleCodes } from '../ruleMarkup'
import { useRuleText, withText } from '../rulesText'
import { RuleMarkup } from './RuleMarkup'
import { SourceTextPrompt } from './SourceTextPrompt'

/**
 * The core rules a rule quotes by number, written out beneath it: several weapon abilities
 * only name the core rule that holds their effect, which tells a reader nothing on its own.
 */
export function CitedRules({ text }: { text: string }) {
  const codes = quotedRuleCodes(text)
  const { data: index } = useQuery({ ...ruleIndexQuery(), enabled: codes.length > 0 })
  if (!index) return null
  const links = ruleLinks(index, index.documents[0]?.slug ?? '')
  const cited = codes.flatMap((code) => links.get(code) ?? [])
  return cited.map((reference) => <CitedRule key={reference.code} reference={reference} links={links} />)
}

function CitedRule({ reference, links }: { reference: RuleReference; links: RuleLinks }) {
  const { data } = useQuery(ruleSectionQuery(reference.document, reference.section))
  const text = useRuleText(data?.document.text ?? null)
  const loaded = text.document?.sections.find((candidate) => candidate.slug === reference.section)
  const missing = !data?.document.text || text.query.isError ? null : !text.chosen ? 'unchosen' : text.document ? null : 'loading'
  return (
    <section className="mt-2 border-t border-edge pt-2">
      <Link
        to="/rules/$documentId/$sectionId"
        params={{ documentId: reference.document, sectionId: reference.section }}
        hash={reference.anchor}
        className="flex items-baseline gap-1.5 font-sans font-semibold text-bone hover:text-info"
      >
        <span className="readout text-faint">{reference.code}</span>
        {reference.title}
      </Link>
      {missing ? <SourceTextPrompt missing={missing} source="game-datacards" className="mt-1" /> : null}
      {data && loaded ? <CitedText section={withText(data.section, loaded)} anchor={reference.anchor} links={links} /> : null}
    </section>
  )
}

/** The rule the number names: a whole rule, or one clarification printed beneath one. */
function CitedText({ section, anchor, links }: { section: RuleSection; anchor: string; links: RuleLinks }) {
  const markup = (value: string, key: string) => (
    <RuleMarkup key={key} markup={value} links={links} source="game-datacards" className="mt-1 text-xs" />
  )
  const entry = section.entries.find((candidate) => candidate.anchor === anchor)
  if (!entry) {
    const clarification = section.entries
      .flatMap((candidate) => candidate.blocks)
      .find((block) => block.kind === 'clarification' && block.anchor === anchor)
    return clarification?.kind === 'clarification' && clarification.markup ? markup(clarification.markup, anchor) : null
  }
  return (
    <>
      {entry.facts.map((fact) => (
        <div key={fact.label} className="mt-1.5">
          <span className="eyebrow text-faint">{fact.label}</span>
          {markup(fact.markup, fact.label)}
        </div>
      ))}
      {entry.blocks.map((block, at) => {
        const key = `${block.kind}-${at}`
        if (block.kind === 'prose') return markup(block.markup, key)
        if (block.kind === 'heading')
          return (
            <p key={key} className="mt-1.5 font-semibold text-bone">
              {block.text}
            </p>
          )
        return null
      })}
    </>
  )
}
