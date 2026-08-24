import { ruleReferenceMatches } from '../../core/ruleReference'
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
      body={rule ? rule.description.replaceAll(/\^\^|\*/g, '') : undefined}
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
