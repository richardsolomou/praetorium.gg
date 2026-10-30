import { useEffect, useRef, useState } from 'react'
import { PHASE_TITLES, PhaseIcon } from './CombatControls'
import type { CombatResult } from '../../../core/combat'
import { HoverTooltip } from '../../components/HoverTooltip'
import { CombatEstimate } from './CombatEstimate'
import { CombatValue, formatCombatValue, UNCAPPED_KILLS_EXPLANATION } from './CombatValue'

export function CombatResults({
  ranged,
  melee,
  combined,
  without,
  updating,
  failed,
  inDialog,
  selected,
  supported,
}: {
  ranged?: CombatResult
  melee?: CombatResult
  combined?: CombatResult
  /** The same matchup without its Command Re-roll, to show what spending it changes. */
  without?: { ranged?: CombatResult; melee?: CombatResult; combined?: CombatResult }
  updating: boolean
  failed: boolean
  inDialog: boolean
  selected: boolean
  supported: boolean
}) {
  const summary = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(inDialog ? 112 : 0)
  useEffect(() => {
    const element = summary.current
    if (!element || !inDialog) return
    const measure = () => setHeight(element.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [inDialog])
  const muted = updating || failed
  const uncapped = combined?.uncappedKills !== undefined
  return (
    <>
      {inDialog ? <div data-results-space style={{ height }} aria-hidden /> : null}
      <div
        ref={summary}
        aria-label="Results summary"
        data-onboarding="simulator-results"
        data-results-summary
        className={`right-0 left-0 z-40 mx-auto border border-edge bg-sunken shadow-lg ${inDialog ? 'absolute bottom-0' : 'sticky bottom-16 w-full min-[860px]:bottom-0'}`}
      >
        <section aria-label="Combined estimate" aria-busy={supported && updating && !failed} className="px-3 pt-2 sm:px-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="rubric text-xs text-dim">Shooting + melee</h2>
            {selected && updating && !failed ? <output className="text-xs text-dim">Updating…</output> : null}
          </div>
          <div data-result-numbers className="mt-1 flex flex-wrap items-center gap-3">
            <div className="flex-[1.3]">
              <CombatValue
                result={combined}
                metric="wipe"
                className={`block text-3xl font-semibold leading-none ${muted ? 'text-dim' : 'text-primary'}`}
              />
              <p className="mt-1 text-xs text-dim">{!selected ? 'Select two units' : !supported ? 'See Breakdown' : 'chance to destroy'}</p>
            </div>
            <div className="flex-1">
              <CombatValue result={combined} metric="meanDamage" className={`block text-lg ${muted ? 'text-dim' : 'text-bone'}`} />
              <p className="text-xs text-dim">avg. wounds lost</p>
            </div>
            <div className="flex-1">
              <CombatValue
                result={combined}
                metric={uncapped ? 'uncappedKills' : 'meanKills'}
                className={`block text-lg ${muted ? 'text-dim' : 'text-bone'}`}
              />
              {uncapped ? (
                <div className="flex">
                  <HoverTooltip title="Uncapped kills" body={UNCAPPED_KILLS_EXPLANATION} className="text-left text-xs text-dim">
                    uncapped kills
                  </HoverTooltip>
                </div>
              ) : (
                <p className="text-xs text-dim">avg. models lost</p>
              )}
            </div>
          </div>
        </section>
        {without ? (
          <CommandRerollChange
            rows={[
              [PHASE_TITLES.ranged, ranged, without.ranged],
              [PHASE_TITLES.melee, melee, without.melee],
              ['Shooting + melee', combined, without.combined],
            ]}
            muted={muted}
          />
        ) : null}
        <details className="group/breakdown">
          <summary className="cursor-pointer px-3 py-1.5 text-xs text-info outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4">
            Breakdown
          </summary>
          <div className="@container max-h-[45dvh] overflow-y-auto overscroll-contain border-t border-edge p-3 sm:p-4">
            <p className="mb-3 text-xs text-dim">
              Each phase alone starts at the target’s current health. Together, melee attacks what survives shooting.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-2 text-xs text-dim @max-[17rem]:grid-cols-1">
                <span className="@max-[17rem]:hidden" />
                <div className="grid grid-cols-3 gap-2">
                  <span>Wounds</span>
                  <span>Models</span>
                  <span>Destroyed</span>
                </div>
              </div>
              {(
                [
                  [PHASE_TITLES.ranged, ranged, 'ranged'],
                  [PHASE_TITLES.melee, melee, 'melee'],
                  ['Combined', combined, null],
                ] as const
              ).map(([title, result, phase]) => (
                <section
                  key={title}
                  aria-label={title === 'Combined' ? 'Combined distributions' : `${title} estimate`}
                  aria-busy={updating && !failed}
                  className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border border-edge bg-sunken px-2 py-1 @max-[17rem]:grid-cols-1"
                >
                  <h3 className="text-xs font-semibold">
                    <span className="flex items-center gap-1">
                      {phase ? <PhaseIcon phase={phase} className="size-3" /> : null}
                      {title}
                    </span>
                    <span className="font-normal text-faint">{title === 'Combined' ? 'together' : 'alone'}</span>
                  </h3>
                  <div data-result-numbers className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { label: 'Wounds lost', metric: 'meanDamage', distribution: result?.damage },
                        { label: 'Models lost', metric: 'meanKills', distribution: result?.kills },
                        { label: 'Unit destroyed', metric: 'wipe', distribution: undefined },
                      ] as const
                    ).map(({ label, metric, distribution }) => (
                      <div key={label} className="min-w-0">
                        {distribution && result ? (
                          <CombatEstimate
                            label={`${title} · ${label}`}
                            value={formatCombatValue(result, metric)}
                            distribution={distribution}
                            muted={muted}
                          />
                        ) : (
                          <CombatValue
                            result={result}
                            metric={metric}
                            className={`flex min-h-8 items-center text-sm sm:mt-1 sm:min-h-0 sm:text-xl ${muted ? 'text-dim' : 'text-primary'}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </details>
      </div>
    </>
  )
}

/** A difference with its sign, rounded first so a negligible change reads as ±0. */
const changeLabel = (value: number, digits: number, unit = '') => {
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded).toFixed(digits)}${unit}`
}

function CommandRerollChange({
  rows,
  muted,
}: {
  rows: readonly (readonly [string, CombatResult | undefined, CombatResult | undefined])[]
  muted: boolean
}) {
  const shown = rows.flatMap(([title, result, without]) => (result && without ? [{ title, result, without }] : []))
  if (!shown.length) return null
  return (
    <section aria-label="Command Re-roll change" className={`px-3 pt-2 text-xs sm:px-4 ${muted ? 'text-faint' : 'text-dim'}`}>
      <h3 className="font-semibold text-bone">Command Re-roll compared with none</h3>
      <ul className="readout mt-0.5 space-y-0.5">
        {shown.map(({ title, result, without }) => (
          <li key={title}>
            {title}: {changeLabel((result.wipe - without.wipe) * 100, 1, '%')} chance to destroy ·{' '}
            {changeLabel(result.meanDamage - without.meanDamage, 2)} wounds · {changeLabel(result.meanKills - without.meanKills, 2)} models
          </li>
        ))}
      </ul>
    </section>
  )
}
