import { useEffect, useRef, useState } from 'react'
import { Crosshair, Swords } from 'lucide-react'
import type { CombatResult } from '../../../core/combat'
import { CombatEstimate } from './CombatEstimate'

export function CombatResults({
  ranged,
  melee,
  combined,
  updating,
  failed,
  inDialog,
  selected,
  supported,
}: {
  ranged?: CombatResult
  melee?: CombatResult
  combined?: CombatResult
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
    if (!element) return
    const measure = () => {
      const total = element.getBoundingClientRect().height
      const headline = element.firstElementChild!.getBoundingClientRect().height
      const heading = element.querySelector('summary')!.getBoundingClientRect().height
      setHeight(inDialog ? total : Math.max(0, total - headline - heading - element.clientTop * 2))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [inDialog])
  const muted = updating || failed
  return (
    <>
      <div data-results-space style={{ height }} aria-hidden />
      <div
        ref={summary}
        aria-label="Results summary"
        data-onboarding="simulator-results"
        data-results-summary
        className={`fixed right-0 left-0 z-40 mx-auto border border-edge bg-sunken shadow-lg ${inDialog ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))] max-w-3xl min-[860px]:bottom-0' : 'bottom-16 w-[calc(100%-1.5rem)] max-w-[calc(64rem-2rem)] sm:w-[calc(100%-2rem)] min-[860px]:bottom-0'}`}
      >
        <section aria-label="Combined estimate" aria-busy={supported && updating && !failed} className="px-3 pt-2 sm:px-4">
          <h2 className="rubric text-xs text-dim">Shooting + melee</h2>
          <div data-result-numbers className="mt-1 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
            <div className="min-w-0">
              <p data-combat-wipe className={`readout text-3xl font-semibold leading-none ${muted ? 'text-dim' : 'text-primary'}`}>
                {combined ? `${(combined.wipe * 100).toFixed(1)}%` : '—'}
              </p>
              <p className="mt-1 text-xs text-dim">{!selected ? 'Select two units' : !supported ? 'See Breakdown' : 'chance to destroy'}</p>
            </div>
            <div className="min-w-0">
              <p className={`readout text-lg ${muted ? 'text-dim' : 'text-bone'}`}>{combined?.meanDamage.toFixed(2) ?? '—'}</p>
              <p className="text-xs text-dim">avg. wounds lost</p>
            </div>
            <div className="min-w-0">
              <p className={`readout text-lg ${muted ? 'text-dim' : 'text-bone'}`}>{combined?.meanKills.toFixed(2) ?? '—'}</p>
              <p className="text-xs text-dim">avg. models lost</p>
            </div>
          </div>
        </section>
        <details className="group/breakdown">
          <summary className="cursor-pointer px-3 py-1.5 text-xs text-info outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4">
            Breakdown
          </summary>
          <div className="max-h-[45dvh] overflow-y-auto overscroll-contain border-t border-edge p-3 sm:p-4">
            <p className="mb-3 text-xs text-dim">
              Each phase alone starts at the target’s current health. Together, melee attacks what survives shooting.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-2 text-xs text-dim">
                <span />
                <div className="grid grid-cols-3 gap-2">
                  <span>Wounds</span>
                  <span>Models</span>
                  <span>Destroyed</span>
                </div>
              </div>
              {(
                [
                  ['Shooting', ranged, Crosshair],
                  ['Melee', melee, Swords],
                  ['Combined', combined, null],
                ] as const
              ).map(([title, result, Icon]) => (
                <section
                  key={title}
                  aria-label={title === 'Combined' ? 'Combined distributions' : `${title} estimate`}
                  aria-busy={updating && !failed}
                  className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border border-edge bg-sunken px-2 py-1"
                >
                  <h3 className="text-xs font-semibold">
                    <span className="flex items-center gap-1">
                      {Icon ? <Icon className="size-3 shrink-0 text-info" aria-hidden /> : null}
                      {title}
                    </span>
                    <span className="font-normal text-faint">{title === 'Combined' ? 'together' : 'alone'}</span>
                  </h3>
                  <div data-result-numbers className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Wounds lost', value: result?.meanDamage.toFixed(2), distribution: result?.damage },
                      { label: 'Models lost', value: result?.meanKills.toFixed(2), distribution: result?.kills },
                      { label: 'Unit destroyed', value: result ? `${(result.wipe * 100).toFixed(1)}%` : undefined },
                    ].map(({ label, value, distribution }) => (
                      <div key={label} className="min-w-0">
                        {distribution && value ? (
                          <CombatEstimate label={`${title} · ${label}`} value={value} distribution={distribution} muted={muted} />
                        ) : (
                          <p
                            data-combat-wipe={label === 'Unit destroyed' ? '' : undefined}
                            className={`readout flex min-h-8 items-center text-sm ${muted ? 'text-dim' : 'text-primary'}`}
                          >
                            {value ?? '—'}
                          </p>
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
