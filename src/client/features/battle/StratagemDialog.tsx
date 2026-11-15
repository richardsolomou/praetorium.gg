import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import type { BattleView } from '../../../core/battleView'
import { type Side, sideName } from '../../sides'
import type { StratagemText } from './MissionCards'
import { GainCp } from './SidePanel'
import { Stratagems } from './Stratagems'
import { tint } from './battleTints'
import type { SendCommand } from './useCommand'

/**
 * A side's command points beside the phase button on a phone, opening what it can spend them on now. Spending CP is the
 * most common press after ending a phase, and the panel lists stratagems a screen and a half down, past both missions.
 */
export function StratagemDialog({
  view,
  sides,
  side: opened,
  coreKeys,
  pending,
  send,
  writtenFor,
  onRecordMissed,
}: {
  view: BattleView
  sides: readonly Side[]
  /** The side it opens on; a phone running both sides switches inside the dialog. */
  side: Side
  coreKeys: (side: Side) => ReadonlySet<string>
  pending: boolean
  send: SendCommand
  writtenFor: (side: Side, key: string) => StratagemText | undefined
  onRecordMissed?: (side: Side, key: string) => void
}) {
  const [chosen, setChosen] = useState<number | null>(null)
  const side = sides.find((each) => each.index === chosen) ?? opened
  const colours = tint(side.index)
  return (
    <Dialog onOpenChange={(open) => open && setChosen(null)}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="h-auto min-h-11 shrink-0 gap-1 rounded-xl px-3 lg:hidden"
            aria-label={`Stratagems for ${sideName(opened)}, ${opened.cp} CP`}
          />
        }
      >
        <span className={`figure text-lg leading-none font-bold ${tint(opened.index).score}`}>{opened.cp}</span>
        <span className="font-display text-2xs font-semibold text-dim uppercase">CP</span>
      </DialogTrigger>
      <DialogContent className={colours.border}>
        <DialogHeader>
          <DialogTitle className={colours.text}>Stratagems · {sideName(side)}</DialogTitle>
          {/* Beside the count it changes, not in the footer, where it reads as a way back and has no undo. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DialogDescription>
              {side.cp} CP · {side.cpGained} gained, {side.cpSpent} used
            </DialogDescription>
            <GainCp side={side} pending={pending} send={send} />
          </div>
        </DialogHeader>
        <DialogBody className="gap-3">
          {side.stratagems.length ? null : <p className="text-sm text-dim">This army has no stratagems to play.</p>}
          <Stratagems
            side={side}
            phase={view.phase}
            coreKeys={coreKeys(side)}
            pending={pending}
            send={send}
            writtenFor={(key) => writtenFor(side, key)}
            onRecordMissed={onRecordMissed && ((key) => onRecordMissed(side, key))}
          />
        </DialogBody>
        {sides.length > 1 ? (
          <div className="shrink-0 border-t border-edge p-3">
            <fieldset className="flex min-w-0 gap-1">
              <legend className="sr-only">Spend for</legend>
              {sides.map((each) => (
                <Button
                  key={each.index}
                  variant="outline"
                  aria-pressed={each.index === side.index}
                  className={`h-11 min-w-0 flex-1 rounded-xl ${each.index === side.index ? tint(each.index).mark : ''}`}
                  onClick={() => setChosen(each.index)}
                >
                  <span className="truncate">{each.isViewer ? 'You' : sideName(each)}</span>
                </Button>
              ))}
            </fieldset>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
