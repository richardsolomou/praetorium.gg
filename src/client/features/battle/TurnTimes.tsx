import { PHASES } from '../../../core/battle'
import type { BattleClock, ClockMatch } from '../../../core/battleClock'
import { sideName, type Side } from '../../sides'
import { Elapsed } from './Elapsed'
import { tint } from './battleTints'

type Props = { clock: BattleClock; sides: readonly Side[] }

/** How long each side took, by round and by phase, for reading back a finished battle's pace. */
export function TurnTimes({ clock, sides }: Props) {
  const rounds = [...new Set([...clock.spans, ...(clock.running ? [clock.running] : [])].map((span) => span.round))].toSorted(
    (left, right) => left - right,
  )
  if (!rounds.length) return null
  const rows: { key: string; label: string; match: ClockMatch; divided?: boolean }[] = [
    ...rounds.map((round) => ({ key: `round-${round}`, label: `Round ${round}`, match: { round } })),
    ...PHASES.map((phase, index) => ({ key: phase, label: phase, match: { phase }, divided: index === 0 })),
    { key: 'total', label: 'Total', match: {}, divided: true },
  ]

  return (
    <section data-turn-times className="space-y-1">
      <p className="eyebrow">Turn times</p>
      <table className="w-full table-fixed border-collapse border border-edge bg-sunken text-xs">
        <thead>
          <tr className="border-b border-edge text-left text-2xs tracking-wide text-faint uppercase">
            <th scope="col" className="w-24 px-2 py-1.5 font-normal">
              <span className="sr-only">Stretch</span>
            </th>
            {sides.map((side) => (
              <th key={side.index} scope="col" className={`truncate px-2 py-1.5 text-right font-semibold ${tint(side.index).text}`}>
                {sideName(side)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`border-b border-edge last:border-0 ${row.divided ? 'border-t border-t-edge-strong' : ''}`}>
              <th scope="row" className={`px-2 py-1 text-left capitalize ${row.key === 'total' ? 'font-bold' : 'font-normal text-dim'}`}>
                {row.label}
              </th>
              {sides.map((side) => (
                <td key={side.index} className="px-2 py-1 text-right">
                  <Elapsed
                    clock={clock}
                    match={{ ...row.match, side: side.index }}
                    className={row.key === 'total' ? 'font-bold' : 'text-dim'}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
