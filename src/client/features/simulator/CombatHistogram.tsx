export function atLeastProbabilities(distribution: number[]) {
  const chances = Array<number>(distribution.length)
  let chance = 0
  for (let threshold = distribution.length - 1; threshold >= 0; threshold--) {
    chance += distribution[threshold]!
    chances[threshold] = chance
  }
  return chances
}

export function CombatHistogram({ distribution }: { distribution: number[] }) {
  const last = distribution.findLastIndex((probability) => probability > 0)
  const cumulative = atLeastProbabilities(distribution)
  const chances = Array.from({ length: Math.max(1, last) }, (_, index) => ({ threshold: index + 1, chance: cumulative[index + 1] ?? 0 }))
  return (
    <div>
      <div className="mb-1 grid grid-cols-[3rem_1fr_3rem] gap-2 text-xs text-dim">
        <span>At least</span>
        <span />
        <span className="text-right">Chance</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {chances.map(({ threshold, chance }) => (
          <div key={threshold} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="readout text-dim">{threshold}</span>
            <div className="h-2 overflow-hidden rounded-sm bg-sunken">
              <div className="h-full rounded-sm bg-primary/70" style={{ width: `${100 * chance}%` }} />
            </div>
            <span className="readout text-right">{(100 * chance).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
