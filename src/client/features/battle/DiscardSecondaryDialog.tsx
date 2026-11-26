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
import { tint } from './battleTints'

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
  const colours = tint(side.index)
  const confirmLabel = selected.length === 0 ? 'Keep hand' : `Discard ${selected.length}${gainCp ? ' and gain 1 CP' : ''}`

  return (
    <BattlePromptDialog open minimizedLabel={`Discard missions · ${sideName(side)}`}>
      <BattleDialogContent minimizeDisabled={pending} className={colours.border}>
        <DialogHeader className="px-(--dialog-actions) text-center">
          <p className={`eyebrow ${colours.text}`}>End of turn</p>
          <DialogTitle className={colours.text}>Discard tactical secondaries?</DialogTitle>
          <DialogDescription>
            Discard any of {sideName(side)}’s tactical secondaries, or keep the hand.{' '}
            {side.canGainCp ? 'Discarding gains 1 CP, however many you discard.' : 'This side already gained its additional CP this round.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="divide-y divide-edge border-y border-edge">
            {cards.map((card) => {
              const chosen = selected.includes(card.key)
              return (
                <button
                  key={card.key}
                  type="button"
                  aria-pressed={chosen}
                  disabled={pending}
                  onClick={() => toggle(card.key)}
                  className={`flex min-h-12 w-full items-center justify-between gap-3 px-2 py-2.5 text-left text-sm font-medium text-bone hover:bg-raised ${
                    chosen ? 'bg-raised' : ''
                  }`}
                >
                  <span>
                    {card.name}
                    {card.beaconLost ? <span className="block text-2xs font-normal text-discarded">Beacon unit destroyed</span> : null}
                  </span>
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded-full border ${chosen ? colours.mark : 'border-edge'}`}
                  >
                    {chosen ? <Check className="size-3" /> : null}
                  </span>
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
