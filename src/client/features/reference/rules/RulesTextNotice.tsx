import { Button } from '@/components/ui/button'
import type { RuleTextSource } from '../../../../contracts/rules'
import type { useRuleText } from '../../../rulesText'
import { Problem } from '../../../components/Problem'

/** What a rules page says when its text can't arrive at all; each rule asks for text on its own. */
export function RulesTextNotice({ text, state }: { text: RuleTextSource | null; state: ReturnType<typeof useRuleText> }) {
  if (!text) {
    return <p className="border border-edge bg-panel p-3 text-sm text-dim">Rules text isn’t available for this document.</p>
  }
  if (!state.chosen || !state.query.isError) return null
  return (
    <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
      <Problem className="min-w-0 flex-1">Couldn’t load the rules text.</Problem>
      <Button size="sm" variant="outline" onClick={() => void state.query.refetch()}>
        Try again
      </Button>
    </div>
  )
}
