import { ruleReferenceMatches } from '../../core/ruleReference'
import { HoverTooltip } from './HoverTooltip'

export type KeywordRule = { name: string; description: string }

export function Keyword({ name, rules, className = '' }: { name: string; rules: KeywordRule[]; className?: string }) {
  const rule = rules
    .filter((candidate) => ruleReferenceMatches(name, candidate.name))
    .toSorted((left, right) => right.name.length - left.name.length)[0]
  if (!rule) return <span className={className}>{name}</span>

  return (
    <HoverTooltip
      className={className}
      content={
        <>
          <strong className="block font-semibold">{rule.name}</strong>
          <span className="mt-1 block whitespace-pre-line text-dim">{rule.description.replaceAll(/\^\^|\*/g, '')}</span>
        </>
      }
    >
      {name}
    </HoverTooltip>
  )
}

export function KeywordList({ value, rules, className }: { value: string; rules: KeywordRule[]; className?: string }) {
  return value.split(',').map((part, index) => {
    const name = part.trim()
    return (
      <span key={name}>
        {index ? ', ' : null}
        <Keyword name={name} rules={rules} className={className} />
      </span>
    )
  })
}
