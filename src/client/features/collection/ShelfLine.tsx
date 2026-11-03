import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { boundedProgress } from '../../../core/collection'

/** Up to this many models get a tick each; beyond it the line is split by share instead. */
const TICKED_MODELS = 30

type Stage = 'painted' | 'built' | 'unbuilt'

const LINE: Record<Stage, { line: 'done' | 'todo'; style?: CSSProperties }> = {
  painted: { line: 'done', style: { '--line-colour': 'var(--color-achieved)' } as CSSProperties },
  built: { line: 'done', style: { '--line-colour': 'var(--color-dim)' } as CSSProperties },
  unbuilt: { line: 'todo' },
}

/**
 * How far a pile of models has got from sprue to shelf: painted solid green, built solid, the rest dashed.
 * A small pile gets one tick per model so a player can count it; a large one is split by share. The counts beside it carry
 * the same figures in words, so the line is hidden from screen readers.
 */
export function ShelfLine({ owned, built, painted, className }: { owned: number; built: number; painted: number; className?: string }) {
  const progress = boundedProgress(owned, { built, painted })
  const stages: [Stage, number][] = [
    ['painted', progress.painted],
    ['built', progress.built - progress.painted],
    ['unbuilt', owned - progress.built],
  ]
  return (
    <span aria-hidden className={cn('flex h-1.5 w-full gap-0.5', owned > TICKED_MODELS && 'gap-1', className)}>
      {owned > TICKED_MODELS
        ? stages.map(([stage, count]) =>
            count ? (
              <span
                key={stage}
                data-line={LINE[stage].line}
                className="line-segment min-w-1 transition-[flex-grow] duration-300 ease-settle motion-reduce:transition-none"
                style={{ ...LINE[stage].style, flexGrow: count }}
              />
            ) : null,
          )
        : stages.flatMap(([stage, count]) =>
            Array.from({ length: count }, (_, index) => (
              <span key={`${stage}-${index}`} data-line={LINE[stage].line} className="line-segment flex-1" style={LINE[stage].style} />
            )),
          )}
    </span>
  )
}
