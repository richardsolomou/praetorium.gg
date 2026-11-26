import { cn } from '@/lib/utils'

/** A place in a table as a large figure: the top three carry a short green bar under it, and an unplaced row reads faint. */
export function RankFigure({ place, placed = true, className }: { place?: number; placed?: boolean; className?: string }) {
  const podium = placed && place !== undefined && place <= 3
  return (
    <span
      className={cn(
        'figure inline-flex w-8 shrink-0 flex-col items-center text-2xl leading-none',
        placed ? 'text-bone' : 'text-faint',
        className,
      )}
    >
      {place ?? '–'}
      {podium ? <span aria-hidden className={cn('mt-1 h-[3px] w-4', place === 1 ? 'bg-parchment' : 'bg-parchment/45')} /> : null}
    </span>
  )
}
