import { Button } from '@/components/ui/button'
import type { Side } from '../../sides'
import { tint } from './battleTints'
import type { SendCommand } from './useCommand'

/** A side's command points and its one additional point for the round, in its panel and in the phone's stratagem sheet. */
export function CommandPoints({ side, pending, send }: { side: Side; pending: boolean; send: SendCommand }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">Command points</p>
      <p key={side.cp} data-stat="cp" className={`figure animate-figure text-4xl leading-none font-bold ${tint(side.index).text}`}>
        {side.cp}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="readout text-3xs text-faint">
          {side.cpGained} gained · {side.cpSpent} used
        </span>
        <Button
          variant="secondary"
          size="xs"
          disabled={pending || !side.canGainCp}
          title={side.canGainCp ? 'Gain one additional command point' : 'This side already gained its additional CP this round'}
          aria-label={side.canGainCp ? '+1 CP' : 'Additional CP already gained this round'}
          onClick={() => send({ kind: 'adjust-cp', delta: 1, playerId: side.captain.id })}
        >
          {side.canGainCp ? '+1 CP' : 'CP gain used'}
        </Button>
      </div>
    </div>
  )
}
