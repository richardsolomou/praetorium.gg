import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SectionId } from './sections'

/** What setup still owes, held at the foot of the screen beside the one thing to do next. */
export function SetupBar({
  problem,
  remaining,
  next,
  watching,
  pending,
  share,
  onChooseArmy,
  onBegin,
}: {
  /** The latest refusal, when the bar says it rather than the row it answers. */
  problem: string | null
  remaining: string[]
  next: SectionId | undefined
  watching: boolean
  pending: boolean
  /** Present while a place is open and no link is out yet. */
  share?: { pending: boolean; onShare: () => void }
  /** Present while your own army has no list. */
  onChooseArmy?: () => void
  /** Absent until a side takes the first turn. */
  onBegin?: () => void
}) {
  return (
    <div data-setup-bar className="sticky bottom-0 z-20 mt-4 border-t border-edge bg-sunken">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="min-w-0" aria-live="polite">
          {problem ? (
            <p className="line-clamp-2 text-sm text-destructive">{problem}</p>
          ) : remaining.length ? (
            <a href={next ? `#setup-${next}` : undefined} className="block min-w-0 hover:text-bone">
              <span className="figure block text-xs font-bold text-discarded uppercase">{remaining.length} left</span>
              <span className="block truncate text-xs text-dim">{remaining.join(' · ')}</span>
            </a>
          ) : (
            <p className="text-xs font-bold text-achieved uppercase">Ready</p>
          )}
        </div>
        {watching ? (
          <p className="shrink-0 text-xs text-dim">{remaining.length ? 'Being set up' : 'Waiting to start'}</p>
        ) : share ? (
          <Button className="h-11 shrink-0 px-5 text-base" disabled={share.pending} onClick={share.onShare}>
            <QrCode /> Share a link
          </Button>
        ) : onChooseArmy ? (
          <Button className="h-11 shrink-0 px-5 text-base" onClick={onChooseArmy}>
            Choose your army
          </Button>
        ) : (
          <Button
            data-onboarding="battle-setup-begin"
            className="h-11 shrink-0 px-5 text-base"
            disabled={pending || remaining.length > 0 || !onBegin}
            onClick={onBegin}
          >
            Start battle
          </Button>
        )}
      </div>
    </div>
  )
}
