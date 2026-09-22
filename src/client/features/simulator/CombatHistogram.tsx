export function CombatHistogram({ distribution }: { distribution: number[] }) {
  const last = distribution.findLastIndex((probability) => probability > 0)
  const width = Math.max(1, Math.ceil((last + 1) / 12))
  const bins = Array.from({ length: Math.ceil((last + 1) / width) }, (_, index) => {
    const from = index * width
    const to = Math.min(last, from + width - 1)
    return {
      label: from === to ? String(from) : `${from}–${to}`,
      probability: distribution.slice(from, to + 1).reduce((total, value) => total + value, 0),
    }
  })
  return (
    <div className="space-y-1">
      {bins.map((bin) => (
        <div key={bin.label} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-xs">
          <span className="readout text-dim">{bin.label}</span>
          <div className="h-2 overflow-hidden rounded-sm bg-sunken">
            <div className="h-full rounded-sm bg-primary/70" style={{ width: `${100 * bin.probability}%` }} />
          </div>
          <span className="readout text-right">{(100 * bin.probability).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}
