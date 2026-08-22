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
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <Dialog open>
      <DialogContent className="rounded-none border border-discarded/60 bg-panel text-bone sm:max-w-lg">
        <DialogHeader className="text-center">
          <p className="eyebrow text-discarded">End of turn</p>
          <DialogTitle className="uppercase">Discard a secondary?</DialogTitle>
          <DialogDescription className="text-dim">
            {sideName(side)} may discard one active tactical secondary to gain 1 CP. Keeping them costs nothing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {cards.map((card) => (
            <Button
              key={card.key}
              variant="outline"
              className="h-auto w-full justify-start rounded-none py-2 text-left"
              aria-pressed={selected === card.key}
              disabled={pending}
              onClick={() => setSelected((current) => (current === card.key ? null : card.key))}
            >
              {card.name}
            </Button>
          ))}
        </div>
        <DialogFooter className="rounded-none border-edge bg-sunken">
          <Button variant="outline" disabled={pending} onClick={onDone}>
            Keep secondaries
          </Button>
          <Button
            disabled={pending || !selected}
            onClick={() => {
              if (selected) send({ kind: 'discard-secondary-for-cp', key: selected, playerId: side.captain.id })
              onDone()
            }}
          >
            Discard and gain 1 CP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
