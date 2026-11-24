import type { ComponentProps } from 'react'
import type { Datasheet } from '../../core/datasheet'
import { ruleReferenceMatches } from '../../core/ruleReference'
import { RuleSummarySkeleton, RuleSummaryText } from './RuleSummaryText'
import { useDatasheetAbilitySummary } from './UnitFromVsData'
import { useAbilitySummary } from '../ruleSummaries'
import { splitKeywords } from '../datasheet'
import { HoverTooltip } from './HoverTooltip'

export type KeywordRule = { name: string; description: string }
export const KEYWORD_TAG_CLASS =
  'chip inline-flex min-h-6 items-center justify-center border-parchment/50 bg-parchment/10 py-0.5 leading-none text-parchment'

export function Keyword({
  name,
  rules,
  className = '',
  note,
  condition,
  highlightNote = true,
}: {
  name: string
  rules: KeywordRule[]
  className?: string
  /** What put this keyword here, when something in the list did rather than the datasheet. */
  note?: string
  /** The attacks a granted ability is limited to, which the asterisk on its name stands for. */
  condition?: string
  /** Whether an added rule uses the stronger derived-value colour. */
  highlightNote?: boolean
}) {
  const reference = condition ? name.replace(/\*$/, '') : name
  const rule = rules
    .filter((candidate) => ruleReferenceMatches(reference, candidate.name))
    .toSorted((left, right) => right.name.length - left.name.length)[0]
  if (!rule && !note && !condition) return <span className={className}>{name}</span>
  // An ability something else in the list grants prints no text of its own, so its tooltip finds the summary by name.
  const explained = rule?.description ? rule : note ? { name: reference, description: '' } : null
  const body = (
    <>
      {condition ? <p className="text-xs">* Only {condition}.</p> : null}
      {explained ? <KeywordRuleSummary rule={explained} className={condition ? 'mt-1.5 text-xs' : 'mt-0 text-xs'} /> : null}
    </>
  )

  return (
    <HoverTooltip
      className={`${className} ${note && highlightNote ? 'font-semibold text-info' : 'text-parchment'} hover:text-bone`}
      title={rule?.name ?? name}
      body={condition || explained ? body : undefined}
      note={note}
    >
      {name}
    </HoverTooltip>
  )
}

/**
 * A keyword's rule: the ability of that name of the datasheet around it or its faction, as a faction ability chip names
 * one, or the summary of the text it prints, by `useDatasheetAbilitySummary`; and where neither is one VS Data
 * summarizes, such as a catalogue's own printing of a weapon ability, the summary of the weapon or core ability it names.
 */
function KeywordRuleSummary({ rule, className }: { rule: KeywordRule; className: string }) {
  const own = useDatasheetAbilitySummary(rule.description, rule.name)
  const named = useAbilitySummary(own === null ? { name: rule.name } : null)
  if (own === undefined || named === undefined) return <RuleSummarySkeleton className={className} />
  const shown = own ?? named
  return shown ? <RuleSummaryText summary={shown} className={className} abilities={false} /> : null
}

const nothingAdded: string[] = []

export function KeywordList({
  value,
  rules,
  className,
  added = nothingAdded,
  note,
}: {
  value: string
  rules: KeywordRule[]
  className?: string
  /** The keywords in `value` that were not on the printed profile. */
  added?: readonly string[]
  /** What added them, said once and shown on each. */
  note?: string
}) {
  return splitKeywords(value).map((name, index) => (
    <span key={name}>
      {index ? ', ' : null}
      <Keyword name={name} rules={rules} className={className} note={added.includes(name) ? note : undefined} />
    </span>
  ))
}

/** A datasheet's keywords, split into every model's and those only some models have. */
export function UnitKeywords({
  sheet,
  ...props
}: { sheet: Pick<Datasheet, 'keywords' | 'modelKeywords' | 'keywordRules'> } & ComponentProps<'div'>) {
  const groups = sheet.modelKeywords ?? []
  const tags = (keywords: readonly string[]) =>
    keywords.map((keyword) => <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className={KEYWORD_TAG_CLASS} />)
  if (!groups.length) {
    return (
      <div {...props} className={`flex flex-wrap gap-1 ${props.className ?? ''}`}>
        {tags(sheet.keywords)}
      </div>
    )
  }
  const modelOnly = new Set(groups.flatMap((group) => group.keywords))
  const rows = [
    { label: 'All models', keywords: sheet.keywords.filter((keyword) => !modelOnly.has(keyword)) },
    ...groups.map((group) => ({ label: group.models.join(', '), keywords: group.keywords })),
  ]
  return (
    <div {...props} className={`space-y-1.5 ${props.className ?? ''}`}>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center gap-1">
          <span className="eyebrow mr-1 text-dim">{row.label}</span>
          {tags(row.keywords)}
        </div>
      ))}
    </div>
  )
}

/** The same split as plain text, for print. */
export function unitKeywordsText(sheet: Pick<Datasheet, 'keywords' | 'modelKeywords'>): string {
  const groups = sheet.modelKeywords ?? []
  if (!groups.length) return sheet.keywords.join(', ')
  const modelOnly = new Set(groups.flatMap((group) => group.keywords))
  return [
    `All models: ${sheet.keywords.filter((keyword) => !modelOnly.has(keyword)).join(', ')}`,
    ...groups.map((group) => `${group.models.join(', ')}: ${group.keywords.join(', ')}`),
  ].join('; ')
}
