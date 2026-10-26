import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import type { Command } from '../../../core/battle'
import type { Side } from '../../sides'
import { sideName } from '../../sides'
import { UndoLatest, type UndoTarget } from './UndoLatest'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { withMember } from '../../../core/collections'

export function DiscardSecondaryDialog({
  side,
  keys,
  pending,
  send,
  onDone,
  undo,
  initialSelection,
  onSelectionChange,
}: {
  side: Side
  keys: string[]
  pending: boolean
  send: (command: Command) => void
  onDone: () => void
  undo: UndoTarget
  initialSelection?: string[]
  onSelectionChange: (selected: string[]) => void
}) {
  const cards = side.secondaries.filter((card) => keys.includes(card.key) && card.status === 'active')
  const [chosenKeys, setChosenKeys] = useState<string[]>(() => initialSelection ?? [])
  const selected = chosenKeys.filter((key) => cards.some((card) => card.key === key))

  const toggle = (key: string) => {
    const next = withMember(selected, key)
    setChosenKeys(next)
    onSelectionChange(next)
  }

  const gainCp = selected.length > 0 && side.canGainCp
  const confirmLabel = selected.length === 0 ? 'Keep hand' : `Discard ${selected.length}${gainCp ? ' and gain 1 CP' : ''}`

  return (
    <BattlePromptDialog open minimizedLabel={`Discard missions · ${sideName(side)}`}>
      <BattleDialogContent minimizeDisabled={pending} className="border-discarded/60">
        <DialogHeader className="px-(--dialog-actions) text-center">
          <p className="eyebrow text-discarded">End of turn</p>
          <DialogTitle>Discard tactical secondaries?</DialogTitle>
          <DialogDescription>
            Discard any of {sideName(side)}’s tactical secondaries, or keep the hand.{' '}
            {side.canGainCp ? 'Discarding gains 1 CP, however many you discard.' : 'This side already gained its additional CP this round.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
        </DialogBody>
        <DialogFooter>
          <UndoLatest undo={undo} send={send} pending={pending} />
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
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}
