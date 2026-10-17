import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { RuleTextSource } from '../../../../contracts/rules'
import { chooseTextSource, type useRuleText } from '../../../rulesText'

/**
 * Where the text on a rules page comes from, and the reader's choice to load it.
 *
 * Praetorium publishes rule numbers and titles; the text is read in the reader's own
 * browser from the pinned Game Datacards file on GitHub, only once they ask for it.
 */
export function RulesTextNotice({ text, state }: { text: RuleTextSource | null; state: ReturnType<typeof useRuleText> }) {
  const source = text ? (
    <a href={text.url} className="text-info hover:text-bone" target="_blank" rel="noreferrer">
      Game Datacards
    </a>
  ) : (
    'Game Datacards'
  )
  if (!text) {
    return <p className="border border-edge bg-panel p-3 text-sm text-dim">Rules text isn’t available for this document.</p>
  }
  if (!state.chosen) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
        <p className="min-w-0 flex-1 text-dim">
          Praetorium shows rule numbers and titles. The text loads in your browser from {source} on GitHub.
        </p>
        <Button size="sm" onClick={() => chooseTextSource('game-datacards', true)}>
          Load Game Datacards text
        </Button>
        <Link to="/sources" className="text-info hover:text-bone">
          Data sources
        </Link>
      </div>
    )
  }
  if (state.query.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-edge bg-panel p-3 text-sm">
        <p role="alert" className="min-w-0 flex-1 text-destructive">
          Couldn’t load the rules text from {source}.
        </p>
        <Button size="sm" variant="outline" onClick={() => void state.query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!state.document) return <p className="text-sm text-dim">Loading rules text from {source}…</p>
  return (
    <p className="text-xs text-dim">
      Text loaded on this device from {source}.{' '}
      <Link to="/sources" className="text-info hover:text-bone">
        Data sources
      </Link>
    </p>
  )
}
