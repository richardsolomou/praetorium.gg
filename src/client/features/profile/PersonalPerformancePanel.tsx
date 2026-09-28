import type { PerformanceRow, PersonalPerformance } from '../../../core/serviceRecord'

export function PersonalPerformancePanel({ performance }: { performance: PersonalPerformance }) {
  const groups: { label: string; rows: PerformanceRow[] }[] = [
    { label: 'Detachment', rows: performance.detachments },
    { label: 'Primary mission', rows: performance.missions },
    { label: 'Battle size', rows: performance.sizes },
  ]
  return (
    <section aria-label="Personal performance" className="space-y-3">
      <div className="border-b border-edge pb-2">
        <h2 className="rubric">Performance over time</h2>
        <p className="mt-1 text-xs text-dim">Win rate counts a draw as half a win. Open a row for results by month.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map(({ label, rows }) => (
          <section key={label} className="min-w-0">
            <h3 className="eyebrow mb-1">By {label.toLowerCase()}</h3>
            {rows.length ? (
              <div className="space-y-1">
                {rows.map((row) => (
                  <details key={row.key} className="border border-edge bg-panel p-2 text-sm">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 text-bone">
                      <span className="min-w-0 break-words font-semibold">{row.label}</span>
                      <span className="readout shrink-0">
                        {Math.round(row.total.rate * 100)}% · {row.total.battles} played
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 border-t border-edge pt-2 text-xs text-dim">
                      {row.months.map(({ month, split }) => (
                        <li key={month} className="flex justify-between gap-2">
                          <span>{month}</span>
                          <span className="readout">
                            {Math.round(split.rate * 100)}% · {split.won}W {split.drawn}D {split.lost}L
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : (
              <p className="border border-edge bg-panel p-3 text-xs text-dim">No recorded {label.toLowerCase()} results.</p>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}
