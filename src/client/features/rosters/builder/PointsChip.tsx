import { Skeleton } from '@/components/ui/skeleton'

/** A price at a fixed width, so a column of them lines up; still loading while `points` is undefined, and nothing when null. */
export function PointsChip({ points }: { points?: number | null }) {
  if (points === undefined) return <Skeleton className="h-5 w-[4.5rem] shrink-0" />
  return points === null ? null : <span className="chip w-[4.5rem] shrink-0 justify-center text-info">{points} pts</span>
}
