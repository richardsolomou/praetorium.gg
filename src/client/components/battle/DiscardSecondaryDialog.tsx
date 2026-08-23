import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { sideName } from '../../sides'

export function DiscardSecondaryDialog({
  side,
  keys,
  pending,
  send,
  onDone,
}: {
  side: Side
  keys: string[]
  pending: boolean
  send: (command: Command) => void
  onDone: () => void
}) {
  const cards = side.secondaries.filter((card) => keys.includes(card.key) && card.status === 'active')
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (key: string) =>
    setSelected((current) => (current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key]))

  const gainCp = selected.length > 0 && side.canGainCp
  const confirmLabel = selected.length === 0 ? 'Keep hand' : `Discard ${selected.length}${gainCp ? ' and gain 1 CP' : ''}`

  return (
    <Dialog open>
      <DialogContent className="rounded-none border border-discarded/60 bg-panel text-bone sm:max-w-lg">
        <DialogHeader className="text-center">
          <p className="eyebrow text-discarded">End of turn</p>
          <DialogTitle className="uppercase">Discard tactical secondaries?</DialogTitle>
          <DialogDescription className="text-dim">
            {sideName(side)} can discard any of their active tactical secondaries, or keep the hand as is. Discarding several at once still
            gains at most 1 CP.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end">
          <span className={`chip ${side.canGainCp ? 'border-parchment text-parchment' : 'border-edge-strong text-faint'}`}>
            {side.canGainCp ? 'Will gain 1 CP' : 'CP already gained this round'}
          </span>
        </div>
        <div className="space-y-1.5">
          {cards.map((card) => {
            const chosen = selected.includes(card.key)
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={chosen}
                disabled={pending}
                onClick={() => toggle(card.key)}
                className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-sm font-semibold ${
                  chosen ? 'border-parchment bg-parchment/10 text-parchment' : 'border-edge bg-card text-bone hover:border-dim'
                }`}
              >
                {card.name}
                {chosen ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button
            disabled={pending}
            onClick={() => {
              if (selected.length) send({ kind: 'resolve-tactical-hand', keys: selected, gainCp, playerId: side.captain.id })
              onDone()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
