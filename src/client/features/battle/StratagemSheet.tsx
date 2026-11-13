import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import type { BattleView } from '../../../core/battleView'
import { type Side, sideName } from '../../sides'
import { BattleMinimizeContext } from './BattlePromptDialog'
import type { StratagemText } from './MissionCards'
import { CommandPoints } from './CommandPoints'
import { Stratagems } from './Stratagems'
import { tint } from './battleTints'
import type { SendCommand } from './useCommand'

type Props = {
  phase: BattleView['phase']
  side: Side
  coreKeys: ReadonlySet<string>
  pending: boolean
  send: SendCommand
  writtenFor: (side: Side, key: string) => StratagemText | undefined
  onRecordMissed?: (side: Side, stratagemKey: string) => void
  className?: string
}

/**
 * A side's command points and stratagems, opened from the phone's bottom bar.
 *
 * The side panel holds them under the army roster, out of a thumb's reach, so a phone
 * also opens them here over whichever tab is showing. The battle stays the one
 * authority: this draws the same controls the panel does.
 */
export function StratagemSheet({ phase, side, coreKeys, pending, send, writtenFor, onRecordMissed, className }: Props) {
  const colours = tint(side.index)
  return (
    <Dialog onOpenChange={(open) => open && posthog.capture('battle_stratagems_opened', { active: side.isActive })}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            aria-label={`Stratagems, ${side.cp} CP`}
            className={cn('h-auto min-h-11 shrink-0 flex-col gap-0.5 rounded-xl px-3', className)}
          />
        }
      >
        <span key={side.cp} className={`figure animate-figure text-sm leading-none font-bold ${colours.text}`}>
          {side.cp} CP
        </span>
        <span className="text-3xs leading-none font-semibold tracking-label text-dim uppercase">Stratagems</span>
      </DialogTrigger>
      <DialogContent className={cn('border-t-2', colours.edge)}>
        <DialogHeader>
          <DialogTitle>Stratagems</DialogTitle>
          <DialogDescription>{sideName(side)}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CommandPoints side={side} pending={pending} send={send} />
          {/*
           * No minimizing from in here: the board is one tap away behind this sheet, and a
           * minimized card would leave the sheet open over it.
           */}
          <BattleMinimizeContext.Provider value={null}>
            {side.stratagems.length ? (
              <Stratagems
                side={side}
                phase={phase}
                coreKeys={coreKeys}
                pending={pending}
                send={send}
                writtenFor={(key) => writtenFor(side, key)}
                onRecordMissed={onRecordMissed && ((key) => onRecordMissed(side, key))}
              />
            ) : (
              <p className="text-sm text-dim">This side has no stratagems to use.</p>
            )}
          </BattleMinimizeContext.Provider>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Back to the battle</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
