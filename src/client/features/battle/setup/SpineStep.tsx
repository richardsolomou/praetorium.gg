import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Side } from '../../../sides'
import type { OnboardingTarget } from '../../../onboardingTargets'
import { tint } from '../battleTints'
import { SideSwitch, SideSwitchNext } from './chrome'
import type { SectionId } from './sections'

/**
 * One step of setup, hung from the spine.
 *
 * Every step stays open, so the whole of setup reads at once; one not reached yet is faded and can't be used. Without
 * controls to show, as for a reader with no seat or a step waiting on the armies, it reads as its answer: one line
 * for a choice the table shares, or a cell either side of the spine for one each side makes.
 */
export function SpineStep({
  watching = false,
  skipped = false,
  id,
  number,
  name,
  complete,
  settled,
  locked,
  current,
  needed = false,
  hint,
  onboarding,
  sides,
  renderSide,
  summary,
  check,
  children,
}: {
  /** Read by someone with no seat: only the answers, without the step's controls or the hints about what to do. */
  watching?: boolean
  /** Absent from a battle that does not play this step, such as a manually tracked one. */
  skipped?: boolean
  id: SectionId
  number: number
  name: string
  /** Whether the step owes nothing more before the battle can begin. */
  complete: boolean
  /** Whether it has been answered rather than only left at a valid default, which ticks it. */
  settled: boolean
  locked: boolean
  /** The first step still owed an answer. */
  current: boolean
  /** Whether the hint names something the table still owes, rather than describing the step. */
  needed?: boolean
  hint?: string
  onboarding?: OnboardingTarget
  /** A step each side answers for itself: both sides, and how to read one side's answer. */
  sides?: Side[]
  renderSide?: (side: Side) => ReactNode
  /** The table's one answer, for a step the sides share. */
  summary?: ReactNode
  /** The tick the table gives a step whose default is a valid answer, drawn on its number. */
  check?: { checked: boolean; disabled: boolean; onCheck: () => void }
  children: ReactNode
}) {
  if (skipped) return null
  const body = watching ? null : children
  const tick = watching ? undefined : check
  // The runner down from the step's number says where the table is: settled solid, the step owed now doubled, the rest dashed.
  const line = settled ? 'done' : current ? 'now' : locked ? 'locked' : 'todo'
  return (
    <li className="list-none">
      <section
        id={`setup-${id}`}
        data-onboarding={onboarding}
        data-locked={locked}
        data-complete={complete}
        aria-labelledby={`setup-${id}-title`}
        className={cn('relative scroll-mt-(--app-header)! pb-8', locked && 'text-faint')}
      >
        <span
          aria-hidden
          data-line={line}
          className={cn(
            'absolute top-13 bottom-1 left-6 -translate-x-1/2 sm:top-15 sm:left-[2.375rem]',
            line === 'done' && 'w-0.5 rounded-full bg-parchment/45',
            line === 'now' && 'w-1.5 origin-top animate-draw-down border-x-2 border-parchment',
            line === 'todo' && 'w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-runner-hi)_0_5px,transparent_5px_10px)]',
            line === 'locked' && 'w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-runner)_0_5px,transparent_5px_10px)]',
          )}
        />
        {/* Held under the app header while the step's body scrolls past, so its tick stays in reach. */}
        <div className="sticky top-(--app-header) z-10 flex items-center gap-3 bg-void/95 py-1 backdrop-blur sm:gap-5">
          {/* Outside the heading, so the step is still named by its title alone. */}
          {tick ? (
            <label
              title={tick.checked ? `Mark ${name} not done` : `Mark ${name} done`}
              className="group/check relative grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-lg has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-primary sm:w-19"
            >
              <input
                type="checkbox"
                className="sr-only"
                aria-label={`${name} done`}
                checked={tick.checked}
                disabled={tick.disabled}
                onChange={tick.onCheck}
              />
              <StepMark settled={settled} current={current} locked={locked} number={number} checkable={!tick.disabled} />
            </label>
          ) : (
            <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center sm:w-19">
              <StepMark settled={settled} current={current} locked={locked} number={number} checkable={false} />
            </span>
          )}
          <h2 id={`setup-${id}-title`} className="flex min-h-11 min-w-0 flex-1 items-center text-lg normal-case sm:text-xl">
            <span className={cn('min-w-0', current ? 'text-bone' : locked ? 'text-faint' : undefined)}>{name}</span>
          </h2>
        </div>
        <div className="pl-15 sm:pl-24">
          {hint && !watching ? (
            <p className={cn('mt-0.5 max-w-prose text-sm text-balance', needed ? 'text-discarded' : 'text-dim')}>{hint}</p>
          ) : null}
          {/* Only the controls go inert and fade: the hint above says why the step isn't open yet, so it stays readable. */}
          <div id={`setup-${id}-body`} className={cn('relative mt-3', locked && 'opacity-50')} inert={locked}>
            {body ? (
              <div className={cn('relative', current ? 'rounded-2xl border-2 border-runner bg-panel shadow-lifted' : 'part')}>
                {/* The step being answered is drawn out of the frame, joined back to the runner by its own sprue. */}
                {current ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute -top-5 -left-[2.375rem] h-9 w-[2.25rem] rounded-bl-xl border-b-2 border-l-2 border-runner sm:-left-[3.75rem] sm:w-[3.625rem]"
                    />
                    <span aria-hidden className="absolute top-2.5 -left-1.5 size-2.5 rounded-full bg-parchment ring-3 ring-void" />
                  </>
                ) : null}
                {sides && renderSide ? <SideSwitch sides={sides} renderSide={renderSide} /> : null}
                <div className="space-y-4 p-3 sm:p-4">
                  {body}
                  {sides ? <SideSwitchNext sides={sides} /> : null}
                </div>
              </div>
            ) : sides && renderSide ? (
              <div className="grid grid-cols-2 items-stretch gap-2">
                {sides.map((side, position) => (
                  <div
                    key={side.index}
                    className={cn(
                      'min-w-0 rounded-lg border border-t-2 border-edge bg-sunken px-3 py-2 text-sm',
                      tint(side.index).edge,
                      position ? 'text-right' : 'text-left',
                    )}
                  >
                    {renderSide(side)}
                  </div>
                ))}
              </div>
            ) : summary ? (
              <div className="w-fit max-w-full rounded-lg border border-edge bg-sunken px-3 py-2 text-left text-sm text-balance">
                {summary}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </li>
  )
}

/** A step's assembly number, with its tick once settled; a checkbox's box when the table ticks it. */
function StepMark({
  settled,
  current,
  locked,
  number,
  checkable,
}: {
  settled: boolean
  current: boolean
  locked: boolean
  number: number
  checkable: boolean
}) {
  return (
    <>
      <span
        className={cn(
          'step-number transition-colors',
          settled
            ? 'text-dim'
            : current
              ? 'text-bone'
              : locked
                ? 'text-transparent [-webkit-text-stroke:1.2px_var(--color-runner-hi)]'
                : undefined,
        )}
      >
        {number}
      </span>
      {settled ? (
        <span className="absolute -top-1 right-0 grid size-5.5 animate-in place-items-center rounded-full bg-parchment text-parchment-ink duration-200 ease-settle zoom-in-50 fade-in-0 sm:right-2">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : checkable ? (
        <span className="absolute -top-1 right-0 size-5.5 rounded-full border-2 border-runner-hi bg-void transition-colors group-hover/check:border-parchment sm:right-2" />
      ) : null}
    </>
  )
}
