import { Button } from '@/components/ui/button'
import type { RuleTextSource } from '../../../../contracts/rules'
import { openTextSourcesDialog } from '../../../components/TextSourcesDialog'
import type { useRuleText } from '../../../rulesText'

/** A rules page's text state: asks before any text loads, then gets out of the way once it has. */
export function RulesTextNotice({ text, state }: { text: RuleTextSource | null; state: ReturnType<typeof useRuleText> }) {
  if (!text) {
    return <p className="border border-edge bg-panel p-3 text-sm text-dim">Rules text isn’t available for this document.</p>
  }
  if (!state.chosen) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
        <p className="min-w-0 flex-1 text-dim">Praetorium shows rule numbers and titles. Rules text isn’t loaded.</p>
        <Button size="sm" onClick={() => openTextSourcesDialog()}>
          Choose sources
        </Button>
      </div>
    )
  }
  if (state.query.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
        <p role="alert" className="min-w-0 flex-1 text-destructive">
          Couldn’t load the rules text.
        </p>
        <Button size="sm" variant="outline" onClick={() => void state.query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!state.document) return <p className="text-sm text-dim">Loading rules text…</p>
  return null
}
