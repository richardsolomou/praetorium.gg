import { Skeleton } from '@/components/ui/skeleton'

/** The points a unit costs beyond the list's room, or null when it fits or nothing is enforced. */
export const pointsOver = (points: number | null | undefined, room: number | null) =>
  room !== null && points != null && points > room ? points - room : null

/** A price at a minimum width, so a column of them lines up while four-digit prices still fit; still loading while `points` is undefined, and nothing when null. */
export function PointsChip({ points, over = null }: { points?: number | null; over?: number | null }) {
  if (points === undefined) return <Skeleton className="h-5 w-16 shrink-0" />
  return points === null ? null : (
    <span className={`chip min-w-16 shrink-0 justify-center whitespace-nowrap ${over === null ? 'text-info' : 'text-discarded'}`}>
      {points} pts
      {over === null ? null : <span className="sr-only">, {over} pts over the limit</span>}
    </span>
  )
}
