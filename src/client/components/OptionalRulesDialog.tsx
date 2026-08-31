import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type OptionalRule, plays } from '../../core/battle'

type BorrowableDetachment = { id: string; name: string; reference?: { points?: number | null } | null }

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
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel p-0 text-bone sm:max-w-2xl">
        <DialogHeader className="border-b border-edge px-5 py-4">
          <DialogTitle className="text-2xl uppercase">Optional rules</DialogTitle>
          <DialogDescription className="text-dim">
            Homebrew this battle size can be played with. None of it is on unless this roster picks it, and what it picks is shown wherever
            the list is read.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-5">
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
                        <span className="chip shrink-0">{detachment.reference?.points} DP</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 border border-dashed border-edge px-3 py-4 text-center text-sm text-dim">
                  This roster has no detachment points left over, so there is no disposition it can borrow.
                </p>
              )}
              {borrowedError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {borrowedError}
                </p>
              ) : null}
            </fieldset>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
