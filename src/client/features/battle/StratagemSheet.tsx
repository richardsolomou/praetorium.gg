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
export function StratagemSheet({
  view,
  side,
  coreKeys,
  pending,
  send,
  writtenFor,
  onRecordMissed,
}: {
  view: BattleView
  side: Side
  coreKeys: ReadonlySet<string>
  pending: boolean
  send: SendCommand
  writtenFor: (key: string) => StratagemText | undefined
  onRecordMissed?: (key: string) => void
}) {
  const colours = tint(side.index)
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            data-stratagem-sheet
            className="h-auto min-h-11 shrink-0 gap-1 rounded-xl px-3 lg:hidden"
            aria-label={`Stratagems for ${sideName(side)}, ${side.cp} CP`}
          />
        }
      >
        <span className={`figure text-lg leading-none font-bold ${colours.score}`}>{side.cp}</span>
        <span className="font-display text-2xs font-semibold text-dim uppercase">CP</span>
      </DialogTrigger>
      <DialogContent sheet className={colours.border}>
        <DialogHeader>
          <DialogTitle className={colours.text}>Stratagems · {sideName(side)}</DialogTitle>
          <DialogDescription>
            {side.cp} CP · {side.cpGained} gained, {side.cpSpent} used
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-3">
          <Stratagems
            side={side}
            phase={view.phase}
            coreKeys={coreKeys}
            pending={pending}
            send={send}
            writtenFor={writtenFor}
            onRecordMissed={onRecordMissed}
          />
        </DialogBody>
        <div className="flex shrink-0 justify-end border-t border-edge p-3">
          <GainCp side={side} pending={pending} send={send} className="h-11 min-w-24 rounded-xl text-sm" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
