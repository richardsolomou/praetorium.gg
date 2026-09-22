import { HoverTooltip } from '../../components/HoverTooltip'
import type { KeywordRule } from '../../components/Keyword'
import { RuleText } from '../../components/RuleText'

export function CombatRuleLabel({
  side,
  name,
  description,
  rules,
}: {
  side: string
  name: string
  description: string | null
  rules?: KeywordRule[]
}) {
  return (
    <HoverTooltip
      label={`${side} ${name} rules`}
      title={name}
      className="min-w-0 text-left text-sm text-bone"
      body={description ? <RuleText text={description} rules={rules} className="mt-0 text-xs" /> : 'No description available.'}
    >
      {name}
    </HoverTooltip>
  )
}
