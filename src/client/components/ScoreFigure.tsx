/** A finished game's two scores as one figure, the losing side faded; its text reads "a – b". */
export function ScoreFigure({ a, b }: { a: number; b: number }) {
  return (
    <span className="figure text-xl leading-none whitespace-nowrap text-bone">
      <span className={a < b ? 'text-faint' : undefined}>{a}</span>
      <span className="px-0.5 text-base text-faint"> – </span>
      <span className={b < a ? 'text-faint' : undefined}>{b}</span>
    </span>
  )
}
