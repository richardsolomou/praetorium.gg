import { Check } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { type OptionalRule, plays } from '../../../core/battle'
import { Problem } from '../../components/Problem'

type BorrowableDetachment = { id: string; name: string; points: number | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What this roster's battle size offers, which is nothing at most sizes. */
  offered: readonly OptionalRule[]
  picked: readonly string[]
  onTogglePicked: (rule: OptionalRule) => void
  /** The detachments this roster's unspent points can still reach, already priced. */
  borrowable: readonly BorrowableDetachment[]
  borrowedDetachmentId: string | null
  borrowedError: string | null
  onChooseBorrowed: (detachmentId: string | null) => void
}

/**
 * The homebrew a roster plays, kept out of roster setup so that setup stays about the
 * army and this grows on its own as more optional rules arrive.
 */
export function OptionalRulesDialog({
  open,
  onOpenChange,
  offered,
  picked,
  onTogglePicked,
  borrowable,
  borrowedDetachmentId,
  borrowedError,
  onChooseBorrowed,
}: Props) {
  const borrowing = plays(picked, 'kotc-borrowed-disposition')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Optional rules</DialogTitle>
          <DialogDescription>
            Homebrew this battle size can be played with. None of it is on unless this roster picks it, and what it picks is shown wherever
            the list is read.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-5">
          <div className="space-y-2">
            {offered.map((rule) => {
              const on = plays(picked, rule.id)
              return (
                <button
                  key={rule.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onTogglePicked(rule)}
                  className={`flex min-h-12 w-full items-start justify-between gap-3 border px-3 py-2 text-left ${
                    on ? 'border-bone text-bone' : 'border-edge text-dim'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-bold uppercase">{rule.label}</span>
                    <span className="mt-0.5 block text-xs normal-case text-dim">{rule.hint}</span>
                  </span>
                  <span
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${
                      on ? 'border-current bg-bone text-void' : 'border-current/60'
                    }`}
                  >
                    {on ? <Check className="size-4" /> : null}
                  </span>
                </button>
              )
            })}
          </div>

          {borrowing ? (
            <fieldset>
              <legend className="rubric">Borrow from</legend>
              <p className="mt-1 text-xs text-dim">
                You get the disposition only — none of that detachment&rsquo;s rules, enhancements or stratagems.
              </p>
              {borrowable.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={borrowedDetachmentId === null}
                    onClick={() => onChooseBorrowed(null)}
                    className={`flex min-h-12 items-center justify-between border px-3 text-left font-bold uppercase ${
                      borrowedDetachmentId === null ? 'border-bone text-bone' : 'border-edge text-dim'
                    }`}
                  >
                    None
                  </button>
                  {borrowable.map((detachment) => {
                    const chosen = borrowedDetachmentId === detachment.id
                    return (
                      <button
                        key={detachment.id}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => onChooseBorrowed(chosen ? null : detachment.id)}
                        className={`flex min-h-12 items-center justify-between gap-2 border px-3 text-left font-bold uppercase ${
                          chosen ? 'border-bone text-bone' : 'border-edge text-dim'
                        }`}
                      >
                        <span className="min-w-0 truncate">{detachment.name}</span>
                        <span className="chip shrink-0">{detachment.points} DP</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="py-2 text-sm text-dim">
                  This roster has no detachment points left over, so there is no disposition it can borrow.
                </p>
              )}
              {borrowedError ? <Problem className="mt-2">{borrowedError}</Problem> : null}
            </fieldset>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
