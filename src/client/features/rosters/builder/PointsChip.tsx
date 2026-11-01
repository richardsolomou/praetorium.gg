import { Skeleton } from '@/components/ui/skeleton'

/** The points a unit costs beyond the list's room, or null when it fits or nothing is enforced. */
export const pointsOver = (points: number | null | undefined, room: number | null) =>
  room !== null && points != null && points > room ? points - room : null

/** A price at a fixed width, so a column of them lines up; still loading while `points` is undefined, and nothing when null. */
export function PointsChip({ points, over = false }: { points?: number | null; over?: boolean }) {
  if (points === undefined) return <Skeleton className="h-5 w-[4.5rem] shrink-0" />
  return points === null ? null : (
    <span className={`chip w-[4.5rem] shrink-0 justify-center ${over ? 'text-discarded' : 'text-info'}`}>{points} pts</span>
  )
}
