import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreateBattle } from '../battles/CreateBattle'

/** Where a practice game ends, the step it was practice for. */
export function PracticeNextGame() {
  const [starting, setStarting] = useState(false)
  return (
    <aside data-practice-next className="flex flex-wrap items-center gap-3 part p-4">
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-semibold text-bone">Playing someone next?</p>
        <p className="text-xs text-dim">Start a game against a friend. Once you both have accounts, it counts for each of you.</p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          posthog.capture('practice_next_game_opened')
          setStarting(true)
        }}
      >
        Start a game
      </Button>
      <CreateBattle open={starting} onOpenChange={setStarting} />
    </aside>
  )
}
