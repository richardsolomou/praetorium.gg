import { Skeleton } from '@/components/ui/skeleton'

/** The points a unit costs beyond the list's room, or null when it fits or nothing is enforced. */
export const pointsOver = (points: number | null | undefined, room: number | null) =>
  room !== null && points != null && points > room ? points - room : null

/**
 * A price as a plain right-aligned figure, at a minimum width so a column of them lines up; still loading while
 * `points` is undefined, and nothing when null. The unit is only spoken, since a column of numbers needs no label.
 */
export function PointsChip({ points, over = null }: { points?: number | null; over?: number | null }) {
  if (points === undefined) return <Skeleton className="h-5 w-12 shrink-0" />
  return points === null ? null : (
    <span
      data-points
      className={`figure min-w-[4ch] shrink-0 text-right text-xl leading-none whitespace-nowrap ${over === null ? 'text-bone' : 'text-discarded'}`}
    >
      {points}
      <span className="sr-only"> pts</span>
      {over === null ? null : <span className="sr-only">, {over} pts over the limit</span>}
    </span>
  )
}
