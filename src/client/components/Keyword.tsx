import type { ComponentProps } from 'react'
import type { Datasheet } from '../../core/datasheet'
import { ruleReferenceMatches } from '../../core/ruleReference'
import { RuleSummarySkeleton, RuleSummaryText } from './RuleSummaryText'
import { useDatasheetAbilitySummary } from './UnitFromVsData'
import { useAbilitySummary, useKeywordSummary } from '../ruleSummaries'
import { splitKeywords } from '../datasheet'
import { HoverTooltip } from './HoverTooltip'

export type KeywordRule = { name: string; description: string }
export const KEYWORD_TAG_CLASS =
  'chip inline-flex min-h-6 items-center justify-center border-parchment/50 bg-parchment/10 py-0.5 leading-none text-parchment'

/** A granted ability's name with the asterisk its condition gives it. */
export const conditionalName = (name: string, condition: string | undefined) => (condition ? `${name.replace(/\*$/, '')}*` : name)

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
  /** When a granted ability holds, which an asterisk on its name stands for. */
  condition?: string
  /** Whether an added rule uses the stronger derived-value colour. */
  highlightNote?: boolean
}) {
  const shown = conditionalName(name, condition)
  const rule = matchingRule(referenceName(name, condition), rules)
  if (!rule && !note && !condition) return <span className={className}>{name}</span>

  return (
    <HoverTooltip
      className={`${className} ${note && highlightNote ? 'font-semibold text-info' : 'text-parchment'} hover:text-bone`}
      title={rule?.name ?? shown}
      body={<KeywordExplanation name={name} rules={rules} note={note} condition={condition} />}
      note={note}
    >
      {shown}
    </HoverTooltip>
  )
}

const referenceName = (name: string, condition: string | undefined) => (condition ? name.replace(/\*$/, '') : name)

const matchingRule = (reference: string, rules: KeywordRule[]) =>
  rules
    .filter((candidate) => ruleReferenceMatches(reference, candidate.name))
    .toSorted((left, right) => right.name.length - left.name.length)[0]

/** What a keyword's tooltip explains: when a granted ability holds, then its rule. */
export function KeywordExplanation({
  name,
  rules,
  note,
  condition,
}: {
  name: string
  rules: KeywordRule[]
  note?: string
  condition?: string
}) {
  // A keyword VS Data's ability answers to, or one something else in the list grants, has no text, so its summary is found by name.
  const reference = referenceName(name, condition)
  const explained = matchingRule(reference, rules) ?? (note ? { name: reference, description: '' } : null)
  if (!condition && !explained) return null
  return (
    <>
      {condition ? <p className="text-xs">* Only {condition}.</p> : null}
      {explained ? <KeywordRuleSummary rule={explained} className={condition ? 'mt-1.5 text-xs' : 'mt-0 text-xs'} /> : null}
    </>
  )
}

/**
 * A keyword's rule: VS Data's weapon or core ability of its name; else the ability of that name of the datasheet around
 * it or its faction, as a faction ability chip names one, or the summary of the text it prints, by
 * `useDatasheetAbilitySummary`; and else the core rule of that name.
 */
function KeywordRuleSummary({ rule, className }: { rule: KeywordRule; className: string }) {
  // VS Data's weapon or core ability of the keyword's name comes first, as an owner can print the same rule in other words.
  const keyword = useKeywordSummary(rule.name)
  const asked = keyword === null
  const own = useDatasheetAbilitySummary(asked ? rule.description : '', asked && rule.description ? rule.name : undefined)
  const named = useAbilitySummary(asked && own === null ? { name: rule.name } : null)
  if (keyword === undefined || own === undefined || named === undefined) return <RuleSummarySkeleton className={className} />
  const shown = keyword ?? own ?? named
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
