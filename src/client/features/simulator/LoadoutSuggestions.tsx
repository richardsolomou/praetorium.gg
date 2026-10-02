import { useState } from 'react'
import { ChevronDown, Crosshair, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { CombatResult } from '../../../core/combat'
import type { RosterPick } from '../../../core/roster'
import type { Loadouts, PhaseLoadouts } from './loadoutSearch'

type Phase = 'ranged' | 'melee'
const titles: Record<Phase, string> = { ranged: 'Shooting', melee: 'Melee' }
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

function PhaseIcon({ phase }: { phase: Phase }) {
  const Icon = phase === 'ranged' ? Crosshair : Swords
  return <Icon className="size-3.5 shrink-0 text-info" aria-hidden />
}

function Gain({ from, to }: { from: CombatResult; to: CombatResult }) {
  return (
    <p className="readout text-xs text-dim">
      Destroyed {percent(from.wipe)} → <span className="text-primary">{percent(to.wipe)}</span> · Models {from.meanKills.toFixed(2)} →{' '}
      <span className="text-primary">{to.meanKills.toFixed(2)}</span> · Wounds {from.meanDamage.toFixed(2)} →{' '}
      <span className="text-primary">{to.meanDamage.toFixed(2)}</span>
    </p>
  )
}

/** The strongest legal loadout against the current defender for each phase, applied only to this matchup. */
export function LoadoutSuggestions({
  loadouts,
  defender,
  disabled,
  onUse,
}: {
  loadouts: Loadouts
  defender: string
  disabled: boolean
  onUse: (pick: RosterPick) => void
}) {
  const ready = loadouts.status === 'ready' ? loadouts.phases : null
  const shown = (['ranged', 'melee'] as const).flatMap((phase) => {
    const found = ready?.[phase]
    return found ? [[phase, found] as const] : []
  })
  const rangedBest = ready?.ranged?.best
  const shared = rangedBest && ready?.melee?.best && JSON.stringify(rangedBest.pick) === JSON.stringify(ready.melee.best.pick)
  const rows = (shared ? [['both', ready.ranged!] as const] : shown) as readonly (readonly [Phase | 'both', PhaseLoadouts])[]
  return (
    <section
      aria-label="Best loadout"
      aria-busy={loadouts.status === 'searching'}
      className="mt-4 rounded-md border border-edge bg-sunken p-3"
    >
      <h2 className="rubric">Best loadout</h2>
      <p className="mt-1 text-xs text-dim">Against {defender}</p>
      {loadouts.status === 'searching' ? <p className="mt-3 min-h-9 text-sm text-dim">Comparing loadouts…</p> : null}
      {loadouts.status === 'failed' ? (
        <p role="alert" className="mt-3 text-sm text-discarded">
          Loadouts could not be compared.{' '}
          <Button size="sm" variant="outline" onClick={loadouts.retry}>
            Retry
          </Button>
        </p>
      ) : null}
      {ready && !shown.length ? <p className="mt-3 text-sm text-dim">This unit's loadouts cannot be compared.</p> : null}
      <div className="mt-3 space-y-3">
        {rows.map(([phase, found]) => (
          <div key={phase} aria-label={`${phase === 'both' ? 'Shooting and melee' : titles[phase]} loadout`} className="min-w-0 space-y-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-bone">
              {phase === 'both' ? (
                <>
                  <PhaseIcon phase="ranged" />
                  <PhaseIcon phase="melee" />
                  Shooting and melee
                </>
              ) : (
                <>
                  <PhaseIcon phase={phase} />
                  {titles[phase]}
                </>
              )}
            </h3>
            {found.best ? (
              <>
                <p className="text-sm text-bone">{found.best.changes.join(', ')}</p>
                {phase === 'both' ? (
                  shown.map(([part, each]) =>
                    each.best ? (
                      <div key={part} className="flex items-center gap-1.5">
                        <PhaseIcon phase={part} />
                        <Gain from={each.current} to={each.best.result} />
                      </div>
                    ) : null,
                  )
                ) : (
                  <Gain from={found.current} to={found.best.result} />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => onUse(found.best!.pick)}>
                    Use loadout
                  </Button>
                  {found.best.points ? (
                    <span className="readout text-xs text-info">
                      {found.best.points > 0 ? '+' : '−'}
                      {Math.abs(found.best.points)} pts
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-dim">{found.complete ? 'Current loadout is strongest.' : 'No stronger loadout found.'}</p>
            )}
          </div>
        ))}
      </div>
      {shown.some(([, found]) => found.ranked.length > 1) ? (
        <Collapsible defaultOpen className="mt-3 border-t border-edge pt-2">
          <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-semibold text-dim hover:text-bone">
            Ranked loadouts
            <ChevronDown className="size-3.5 transition-transform group-data-panel-open:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 grid gap-4 @xl:grid-cols-2">
            {shown.map(([phase, found]) => (
              <RankedLoadouts key={phase} phase={phase} ranked={found.ranked} disabled={disabled} onUse={onUse} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  )
}

const columns = [
  ['wipe', 'Destroyed', (result: CombatResult) => percent(result.wipe)],
  ['meanKills', 'Models', (result: CombatResult) => result.meanKills.toFixed(2)],
  ['meanDamage', 'Wounds', (result: CombatResult) => result.meanDamage.toFixed(2)],
] as const
type Column = (typeof columns)[number][0]
/** Phones stack each loadout's name above its averages; wider matchups keep one aligned line. */
const grid = '@md:grid @md:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_3.5rem_2.75rem] @md:items-center @md:gap-x-2'

/** Ranked best first by destruction, models, then wounds; any column re-ranks by that average alone. */
function RankedLoadouts({
  phase,
  ranked,
  disabled,
  onUse,
}: {
  phase: Phase
  ranked: PhaseLoadouts['ranked']
  disabled: boolean
  onUse: (pick: RosterPick) => void
}) {
  const [column, setColumn] = useState<Column>('wipe')
  const rows = column === 'wipe' ? ranked : ranked.toSorted((left, right) => right.result[column] - left.result[column])
  return (
    <section aria-label={`${titles[phase]} loadouts`} className="min-w-0">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-bone">
        <PhaseIcon phase={phase} />
        {titles[phase]}
      </h3>
      <div className="mt-1 text-xs">
        <div className={`eyebrow flex flex-wrap items-center gap-x-3 py-1 text-faint ${grid}`}>
          <span className="mr-auto @md:mr-0">Loadout</span>
          {columns.map(([key, title]) => (
            <button
              key={key}
              type="button"
              aria-pressed={column === key}
              className={`@md:text-right ${column === key ? 'text-bone' : 'hover:text-bone'}`}
              onClick={() => setColumn(key)}
            >
              {title}
            </button>
          ))}
          <span className="hidden @md:block" />
        </div>
        <ol>
          {rows.map((row) => (
            <li key={row.label} className={`border-t border-edge py-1 ${grid} ${row.best ? 'text-primary' : 'text-dim'}`}>
              <p className="break-words">
                {row.label}
                {row.best ? <span className="ml-1.5 text-[0.65rem] uppercase">Best</span> : null}
                {row.points ? (
                  <span className="readout ml-1.5 text-faint">
                    {row.points > 0 ? '+' : '−'}
                    {Math.abs(row.points)} pts
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 @md:contents">
                {columns.map(([key, title, shown]) => (
                  <span key={key} className="readout @md:text-right">
                    <span className="text-faint @md:hidden">{title} </span>
                    {shown(row.result)}
                  </span>
                ))}
                <span className="ml-auto min-h-6 text-right @md:ml-0">
                  {row.current ? null : (
                    <Button size="xs" variant="ghost" disabled={disabled} aria-label={`Use ${row.label}`} onClick={() => onUse(row.pick)}>
                      Use
                    </Button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
