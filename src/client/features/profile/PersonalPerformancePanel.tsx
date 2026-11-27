import type { PerformanceRow, PersonalPerformance } from '../../../core/serviceRecord'
import { percentLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'
import { DisclosureChevron } from '../../components/DisclosureChevron'

export function PersonalPerformancePanel({ performance }: { performance: PersonalPerformance }) {
  const groups: { label: string; rows: PerformanceRow[] }[] = [
    { label: 'Detachment', rows: performance.detachments },
    { label: 'Primary mission', rows: performance.missions },
    { label: 'Battle size', rows: performance.sizes },
  ]
  return (
    <section aria-label="Personal performance" className="space-y-3">
      <div>
        <SectionHeading title="Performance over time" />
        <p className="text-xs text-dim">Win rate counts a draw as half a win. Open a row for results by month.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map(({ label, rows }) => (
          <section key={label} className="min-w-0">
            <h3 className="eyebrow mb-1">By {label.toLowerCase()}</h3>
            {rows.length ? (
              <div className="divide-y divide-edge border-y border-edge">
                {rows.map((row) => (
                  <details key={row.key} className="px-1 py-2 text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-bone [&::-webkit-details-marker]:hidden">
                      <DisclosureChevron />
                      <span className="min-w-0 flex-1 break-words">{row.label}</span>
                      <span className="readout shrink-0">
                        {percentLabel(row.total.rate)} · {row.total.battles} played
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 pl-3 text-xs text-dim">
                      {row.months.map(({ month, split }) => (
                        <li key={month} className="flex justify-between gap-2">
                          <span>{month}</span>
                          <span className="readout">
                            {percentLabel(split.rate)} · {split.won}W {split.drawn}D {split.lost}L
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : (
              <p className="py-2 text-xs text-dim">No recorded {label.toLowerCase()} results.</p>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}
