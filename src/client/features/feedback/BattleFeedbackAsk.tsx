import { X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { parseStored, readStoredValue, writeStoredValue } from '../../storedValue'
import { openFeedback } from './support'

const ASKED_KEY = 'praetorium-feedback-asked'
/** Finishing battles every evening should not mean being asked every evening. */
const ASK_INTERVAL = 14 * 86_400_000

const askedSchema = z.object({ at: z.number(), dismissed: z.boolean() })

const RATINGS = [
  { rating: 'smooth', label: 'Smooth' },
  { rating: 'mostly_fine', label: 'Mostly fine', question: 'What would have made it smoother?' },
  { rating: 'got_in_the_way', label: 'Got in the way', question: 'What got in the way?' },
] as const

/** Whether this browser may ask again: never after a dismissal, and not within a fortnight of the last answer. */
function mayAsk(now: number) {
  const asked = parseStored(askedSchema, readStoredValue(ASKED_KEY))
  return !asked || (!asked.dismissed && now - asked.at >= ASK_INTERVAL)
}

/**
 * One tap on how tracking a battle went, asked as it ends, when the game is fresh; anything short of smooth opens a
 * message to say why.
 */
export function BattleFeedbackAsk({ token }: { token: string }) {
  const [state, setState] = useState<'asking' | 'thanked' | 'hidden'>(() => (mayAsk(Date.now()) ? 'asking' : 'hidden'))
  if (state === 'hidden') return null
  const remember = (dismissed: boolean) => writeStoredValue(ASKED_KEY, JSON.stringify({ at: Date.now(), dismissed }))

  return (
    <aside aria-label="How did tracking go?" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge pb-3">
      {state === 'thanked' ? (
        <p className="min-w-0 flex-1 text-sm text-dim">Thanks, that helps us make the next battle better.</p>
      ) : (
        <>
          <p className="min-w-0 flex-1 basis-48 text-sm font-semibold text-bone">How did tracking this battle go?</p>
          <div className="flex flex-wrap gap-2 max-sm:[&>button]:h-11">
            {RATINGS.map((option) => (
              <Button
                key={option.rating}
                size="sm"
                variant="outline"
                onClick={() => {
                  posthog.capture('battle_feedback_rated', { rating: option.rating, battle_token: token })
                  remember(false)
                  setState('thanked')
                  if ('question' in option)
                    openFeedback({
                      from: 'battle',
                      kind: option.rating === 'got_in_the_way' ? 'Problem' : undefined,
                      about: `Rated tracking “${option.label}” on /battles/${token}`,
                      question: option.question,
                    })
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-faint hover:text-bone max-sm:size-11"
        aria-label={state === 'thanked' ? 'Close' : 'Don’t ask again'}
        title={state === 'thanked' ? undefined : 'Don’t ask again'}
        onClick={() => {
          if (state === 'asking') {
            posthog.capture('battle_feedback_dismissed')
            remember(true)
          }
          setState('hidden')
        }}
      >
        <X />
      </Button>
    </aside>
  )
}
