import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { useNewBattle } from '../battles/NewBattle'

/** Where a practice game ends, the step it was practice for. */
export function PracticeNextGame() {
  const start = useNewBattle()
  return (
    <aside data-practice-next className="flex flex-wrap items-center gap-3 part p-4">
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-semibold text-bone">Playing someone next?</p>
        <p className="text-xs text-dim">
          Unlike practice, a game against a friend goes on your record, with a replay of every turn. Set up a game and share a link; they
          sign in and join with their own army.
        </p>
      </div>
      <Button
        size="sm"
        disabled={start.isPending}
        onClick={() => {
          posthog.capture('practice_next_game_opened')
          start.mutate({})
        }}
      >
        Start a game
      </Button>
    </aside>
  )
}
