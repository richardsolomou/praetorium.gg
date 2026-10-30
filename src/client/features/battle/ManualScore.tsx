import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import { type Side, sideName } from '../../sides'
import { tint } from './battleTints'
import { signedLabel } from '../../text'

type Props = {
  side: Side
  actionable: boolean
  pending: boolean
  send: (command: Command) => void
}

/** A side's score and command points in a manually tracked battle, changed only by the table. */
export function ManualScore({ side, actionable, pending, send }: Props) {
  const colours = tint(side.index)
  const name = sideName(side)
  const target = side.captain.id
  const rows: { label: string; value: number; steps: number[]; change: (delta: number) => Command }[] = [
    {
      label: 'Primary',
      value: side.primary,
      steps: [-1, 1, 5],
      change: (delta) => ({ kind: 'score', category: 'primary', delta, playerId: target }),
    },
    {
      label: 'Secondary',
      value: side.secondary,
      steps: [-1, 1, 5],
      change: (delta) => ({ kind: 'score', category: 'secondary', delta, playerId: target }),
    },
    { label: 'CP', value: side.cp, steps: [-1, 1], change: (delta) => ({ kind: 'adjust-cp', delta, playerId: target }) },
  ]

  return (
    <div data-manual-score className="space-y-2 border-y border-edge py-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Victory points</p>
          <p data-stat="vp" className="figure text-4xl leading-none font-bold">
            {side.total}
          </p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow">Command points</p>
          <p data-stat="cp" className={`figure text-4xl leading-none font-bold ${colours.text}`}>
            {side.cp}
          </p>
        </div>
      </div>
      {actionable ? (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-24 text-sm">
                <span className="eyebrow mr-2">{row.label}</span>
                <span className="readout font-bold">{row.value}</span>
              </span>
              <span className="flex gap-1.5">
                {row.steps.map((step) => (
                  <Button
                    key={step}
                    variant="secondary"
                    className="h-11 min-w-11 lg:h-8"
                    disabled={pending || row.value + step < 0}
                    aria-label={`${step > 0 ? 'Add' : 'Remove'} ${Math.abs(step)} ${row.label === 'CP' ? 'CP' : `${row.label.toLowerCase()} VP`} for ${name}`}
                    onClick={() => send(row.change(step))}
                  >
                    {signedLabel(step)}
                  </Button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="readout text-xs text-dim">
          {side.primary} primary · {side.secondary} secondary
        </p>
      )}
    </div>
  )
}
