import { useState } from 'react'
import type { RatingPoint } from '../../../core/standings'
import { useDateFormatting } from '../../dates'
import { RatingChange } from '../../components/RatingChange'

const HEIGHT = 112
const START = 1000

/**
 * The player's overall rating after each counted battle, oldest on the left.
 *
 * Battles are spaced evenly rather than by date, so a busy weekend reads as the run of
 * results it was instead of a vertical smear. The line starts from the newcomer rating,
 * marked across the chart, so the first battle's move shows like every other.
 * Pointing at the line reads out that battle's date, rating and change.
 */
export function RatingHistory({ points }: { points: readonly RatingPoint[] }) {
  const { date } = useDateFormatting()
  const [pointed, setPointed] = useState<number | null>(null)
  if (!points.length) return null
  const ratings = points.map((point) => point.rating)
  const low = Math.min(START, ...ratings)
  const high = Math.max(START, ...ratings)
  const span = high - low || 1
  // Position 0 is the newcomer rating before the first battle; battle n sits at n.
  const x = (at: number) => (at / points.length) * 100
  const y = (rating: number) => ((high - rating) / span) * 100
  const at = pointed ?? points.length
  const point = points[at - 1]!
  const change = point.rating - (points[at - 2]?.rating ?? START)
  return (
    <figure data-rating-history className="mt-4 border border-edge bg-panel p-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="eyebrow">Rating after each battle</span>
        <span className="readout text-dim" aria-live="polite">
          {date(point.at)} · <span className="text-bone">{point.rating}</span> <RatingChange change={change} />
        </span>
      </figcaption>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div className="readout relative text-right text-2xs text-faint" style={{ height: HEIGHT }} aria-hidden>
          {/* The longer label sets the column width; both sit on the level they name. */}
          <span className="invisible">{high}</span>
          {(
            [
              ['high', high],
              ['low', low],
            ] as const
          ).map(([end, level]) => (
            <span key={end} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(level)}%` }}>
              {level}
            </span>
          ))}
        </div>
        <div
          className="relative touch-none"
          style={{ height: HEIGHT }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setPointed(Math.max(1, Math.round(((event.clientX - box.left) / box.width) * points.length)))
          }}
          onPointerLeave={() => setPointed(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <line
              x1="0"
              x2="100"
              y1={y(START)}
              y2={y(START)}
              vectorEffect="non-scaling-stroke"
              className="stroke-edge-strong"
              strokeDasharray="4 4"
            />
            {pointed === null ? null : (
              <line x1={x(at)} x2={x(at)} y1="0" y2="100" vectorEffect="non-scaling-stroke" className="stroke-edge-strong" />
            )}
            <polyline
              points={[START, ...ratings].map((rating, index) => `${x(index)},${y(rating)}`).join(' ')}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-info"
            />
          </svg>
          <span
            className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info ring-2 ring-panel"
            style={{ left: `${x(at)}%`, top: `${y(point.rating)}%` }}
            aria-hidden
          />
        </div>
      </div>
      <p className="mt-1 flex justify-between pl-8 text-2xs text-faint">
        <span>Start</span>
        <span>{date(points.at(-1)!.at)}</span>
      </p>
      <p className="sr-only">
        From {START} before the first counted battle to {points.at(-1)!.rating} after the latest, across {points.length} battles.
      </p>
    </figure>
  )
}
