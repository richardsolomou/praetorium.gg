import { Button } from '@/components/ui/button'
import type { RuleTextSource } from '../../../../contracts/rules'
import { openTextSourcesDialog } from '../../../components/TextSourcesDialog'
import type { useRuleText } from '../../../rulesText'
import { useHydrated } from '../../../useClientValue'
import { Problem } from '../../../components/Problem'

/** A rules page's text state: asks before any text loads, then gets out of the way once it has. */
export function RulesTextNotice({ text, state }: { text: RuleTextSource | null; state: ReturnType<typeof useRuleText> }) {
  const hydrated = useHydrated()
  if (!text) {
    return <p className="border border-edge bg-panel p-3 text-sm text-dim">Rules text isn’t available for this document.</p>
  }
  const ask = (
    <div data-text-gap-ask className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
      <p className="min-w-0 flex-1 text-dim">Praetorium shows rule numbers and titles. Rules text isn’t loaded.</p>
      <Button size="sm" onClick={() => openTextSourcesDialog()}>
        Choose sources
      </Button>
    </div>
  )
  const wait = (
    <p data-text-gap-wait className="text-sm text-dim">
      Loading rules text…
    </p>
  )
  // Storage is unread until hydration, so both answers are drawn and the document's choice shows one (styles.css).
  if (!hydrated)
    return (
      <div data-text-gap="game-datacards">
        {ask}
        {wait}
      </div>
    )
  if (!state.chosen) return ask
  if (state.query.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
        <Problem className="min-w-0 flex-1">Couldn’t load the rules text.</Problem>
        <Button size="sm" variant="outline" onClick={() => void state.query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!state.document) return wait
  return null
}
