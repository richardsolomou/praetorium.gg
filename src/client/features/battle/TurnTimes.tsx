import { PHASES } from '../../../core/battle'
import { SideNames } from './PlayerName'
import type { BattleClock, ClockMatch } from '../../../core/battleClock'
import type { Side } from '../../sides'
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
    <section data-turn-times className="space-y-1.5">
      <h3 className="text-base font-semibold text-bone">Turn times</h3>
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs">
            <th scope="col" className="w-24 py-1.5 pr-2 font-normal">
              <span className="sr-only">Stretch</span>
            </th>
            {sides.map((side) => (
              <th key={side.index} scope="col" className={`truncate py-1.5 pl-2 text-right font-semibold ${tint(side.index).text}`}>
                <SideNames side={side} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`border-b border-edge ${row.divided ? 'border-t-2 border-t-edge' : ''}`}>
              <th
                scope="row"
                className={`py-1.5 pr-2 text-left capitalize ${row.key === 'total' ? 'font-semibold text-bone' : 'font-normal text-dim'}`}
              >
                {row.label}
              </th>
              {sides.map((side) => (
                <td key={side.index} className="py-1.5 pl-2 text-right">
                  <Elapsed
                    clock={clock}
                    match={{ ...row.match, side: side.index }}
                    className={row.key === 'total' ? 'font-semibold text-bone' : 'text-dim'}
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
