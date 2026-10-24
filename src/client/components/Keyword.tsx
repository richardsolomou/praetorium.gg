import type { ComponentProps } from 'react'
import type { Datasheet } from '../../core/datasheet'
import { ruleReferenceMatches } from '../../core/ruleReference'
import { RuleText } from './RuleText'
import { splitKeywords } from '../datasheet'
import { HoverTooltip } from './HoverTooltip'

export type KeywordRule = { name: string; description: string }
export const KEYWORD_TAG_CLASS =
  'chip inline-flex min-h-6 items-center justify-center border-azure/50 bg-azure/10 py-0.5 leading-none text-azure'

export function Keyword({
  name,
  rules,
  className = '',
  note,
  highlightNote = true,
}: {
  name: string
  rules: KeywordRule[]
  className?: string
  /** What put this keyword here, when something in the list did rather than the datasheet. */
  note?: string
  /** Whether an added rule uses the stronger derived-value colour. */
  highlightNote?: boolean
}) {
  const rule = rules
    .filter((candidate) => ruleReferenceMatches(name, candidate.name))
    .toSorted((left, right) => right.name.length - left.name.length)[0]
  if (!rule && !note) return <span className={className}>{name}</span>

  return (
    <HoverTooltip
      className={`${className} ${note && highlightNote ? 'font-semibold text-info' : 'text-azure'} hover:text-bone`}
      title={rule?.name ?? name}
      body={rule?.description ? <RuleText text={rule.description} className="mt-0 text-xs" /> : undefined}
      note={note}
    >
      {name}
    </HoverTooltip>
  )
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
