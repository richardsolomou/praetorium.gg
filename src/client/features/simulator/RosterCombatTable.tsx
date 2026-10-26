import { Fragment, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Choice, PHASE_TITLES, PhaseIcon } from './CombatControls'
import { OwnerName, type RosterOwner } from './rosterOwners'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CombatValue, formatCombatValue, type CombatMetric } from './CombatValue'
import type { RosterCombatSummary, RosterCombatUnit } from './rosterCombat'
import { combatUnitTarget } from '../../../core/combatUnit'
import { countLabel } from '../../text'

type Metric = CombatMetric
const metrics = [
  ['meanDamage', 'Wounds lost'],
  ['meanKills', 'Models lost'],
  ['uncappedKills', 'Uncapped kills'],
  ['wipe', 'Destruction chance'],
] as const
const phases = [
  ['ranged', PHASE_TITLES.ranged],
  ['melee', PHASE_TITLES.melee],
  ['combined', 'Shooting + melee'],
] as const

function modelCount(unit: RosterCombatUnit) {
  if (!unit.snapshot) return '— models'
  const models = [unit.snapshot, ...(unit.snapshot.companions ?? [])].reduce((sum, member) => sum + member.models, 0)
  const count = countLabel(models, 'model')
  const target = unit.live ? combatUnitTarget(unit.snapshot).target : null
  if (!target) return count
  const wounds =
    target.groups.reduce((sum, group) => sum + group.models * group.wounds - (group.damage ?? 0), 0) -
    (unit.snapshot.companions?.length ? 0 : (unit.snapshot.damage ?? 0))
  return `${count} · ${wounds} wounds`
}

export function bestRosterMatches(results: (RosterCombatSummary[keyof RosterCombatSummary] | undefined)[], metric: Metric) {
  if (results.some((answer) => !answer)) return []
  const best = Math.max(0, ...results.map((answer) => answer?.result?.[metric] ?? 0))
  return best > 0 ? results.flatMap((answer, index) => (answer?.result?.[metric] === best ? [index] : [])) : []
}

/** How much of the bone tint a cell takes, so larger results read brighter at a glance. */
const shadeColor = (percent: number) => (percent ? `color-mix(in srgb, var(--color-bone) ${percent}%, var(--color-panel))` : undefined)

export function matchupShade(value: number | undefined, max: number) {
  return value && max > 0 ? Math.round(4 + (24 * value) / max) : 0
}

/** Consecutive units that share an owner, so a pair's two lists read as labelled blocks. */
export function ownerRuns(units: readonly RosterCombatUnit[]) {
  const runs: { owner: RosterOwner; start: number; count: number }[] = []
  units.forEach((unit, index) => {
    const last = runs.at(-1)
    if (last && last.owner.name === unit.owner?.name) last.count += 1
    else if (unit.owner) runs.push({ owner: unit.owner, start: index, count: 1 })
  })
  return runs
}

export function RosterCombatTable({
  attackers,
  defenders,
  results,
  onSelect,
  benchmarkTargets = false,
}: {
  attackers: RosterCombatUnit[]
  defenders: RosterCombatUnit[]
  results: Record<string, RosterCombatSummary>
  onSelect: (row: number, column: number) => void
  benchmarkTargets?: boolean
}) {
  const [phase, setPhase] = useState<keyof RosterCombatSummary>('ranged')
  const [metric, setMetric] = useState<Metric>('meanDamage')
  const [highlight, setHighlight] = useState(benchmarkTargets ? 'attackers' : 'targets')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const attackingHealth = useMemo(() => attackers.map(modelCount), [attackers])
  const defendingHealth = useMemo(() => defenders.map(modelCount), [defenders])
  const bestAttackers = defenders.map((_defender, column) =>
    bestRosterMatches(
      attackers.map((_attacker, row) => results[`${row}:${column}`]?.[phase]),
      metric,
    ),
  )
  const heading = metrics.find(([value]) => value === metric)![1]
  const largest = Math.max(0, ...Object.values(results).map((summary) => summary[phase]?.result?.[metric] ?? 0))
  const columnOwners = ownerRuns(defenders)
  const rowOwners = new Map(ownerRuns(attackers).map((run) => [run.start, run.owner]))
  return (
    <Tabs value={phase} onValueChange={(value) => setPhase(value as keyof RosterCombatSummary)} className="min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <TabsList aria-label="Comparison phase" className="h-11! w-full border border-edge bg-raised p-1 sm:w-auto">
          {phases.map(([value, title]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-w-0 flex-1 gap-1.5 px-2 text-sm font-semibold data-active:bg-panel data-active:text-primary sm:flex-none sm:px-3"
            >
              {value === 'combined' ? null : <PhaseIcon phase={value} />}
              {value === 'combined' ? (
                <>
                  <span className="sm:hidden">Both</span>
                  <span className="hidden sm:inline">{title}</span>
                </>
              ) : (
                title
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          type="button"
          aria-label="View options"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen(!optionsOpen)}
          className="flex w-full items-center justify-between gap-2 border border-edge px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
        >
          {heading} · {highlight === 'targets' ? 'Best targets' : 'Best attackers'}
          <ChevronDown className={`size-4 shrink-0 ${optionsOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className={`${optionsOpen ? 'grid' : 'hidden sm:grid'} w-full grid-cols-2 gap-2 sm:ml-auto sm:w-[30rem]`}>
          <Choice label="Show" ariaLabel="Comparison metric" choices={metrics} value={metric} onChange={setMetric} />
          <Choice
            label="Highlight"
            ariaLabel="Highlight matchups"
            choices={[
              ['targets', 'Best targets per attacker'],
              ['attackers', 'Best attackers per target'],
            ]}
            value={highlight}
            onChange={setHighlight}
          />
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dim">
        <span className="inline-flex items-center gap-1.5">
          Less
          <span aria-hidden className="flex">
            {[8, 18, 28].map((shade) => (
              <span key={shade} className="h-2.5 w-4" style={{ backgroundColor: shadeColor(shade) }} />
            ))}
          </span>
          more {heading.toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1.5 text-achieved">
          <span aria-hidden className="h-2.5 w-6 bg-panel shadow-[inset_0_0_0_2px_var(--color-achieved)]" />
          {highlight === 'targets' ? 'Best target per attacker' : 'Best attacker per target'}
        </span>
        <span className="hidden sm:inline">Select a result to adjust the matchup.</span>
        <span className="sm:hidden">Swipe for more targets; tap a result to adjust.</span>
      </p>
      <TabsContent value={phase}>
        <section
          aria-label="All unit matchups"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the matchup columns.
          tabIndex={0}
          className="relative max-h-[min(44rem,72dvh)] max-w-full overflow-auto rounded border border-edge focus-visible:outline-2 focus-visible:outline-primary"
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              {phases.find(([value]) => value === phase)![1]} · {heading}. Attackers in rows; defenders in columns.
            </caption>
            <thead>
              {columnOwners.length ? (
                <tr>
                  <th
                    aria-hidden
                    className="sticky top-0 left-0 z-30 h-8 w-28 min-w-28 border-b border-edge bg-sunken sm:w-36 sm:min-w-36"
                  />
                  {columnOwners.map((run) => (
                    <th
                      key={run.start}
                      scope="colgroup"
                      colSpan={run.count}
                      className="sticky top-0 z-20 h-8 border-b border-l border-edge bg-sunken px-2 text-left"
                    >
                      <OwnerName owner={run.owner} className="eyebrow" />
                    </th>
                  ))}
                </tr>
              ) : null}
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 z-30 w-28 min-w-28 border-b border-edge bg-sunken p-2 text-left text-xs text-dim sm:w-36 sm:min-w-36 ${columnOwners.length ? 'top-8' : 'top-0'}`}
                >
                  Attacker / Target
                </th>
                {defenders.map((unit, index) => (
                  <th
                    scope="col"
                    key={`${unit.rosterIndex}:${unit.pickIndex}`}
                    className={`sticky z-20 w-28 min-w-28 border-b border-l border-edge bg-sunken p-2 text-left align-bottom text-xs font-semibold ${columnOwners.length ? 'top-8' : 'top-0'}`}
                  >
                    {unit.name}
                    <span className="block text-xs font-normal text-faint">{defendingHealth[index]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attackers.map((unit, row) => {
                const best = bestRosterMatches(
                  defenders.map((_, column) => results[`${row}:${column}`]?.[phase]),
                  metric,
                )
                const owner = rowOwners.get(row)
                // A unit that cannot attack at all says why once rather than in every cell.
                const blocked =
                  unit.error && defenders.every((_, column) => results[`${row}:${column}`]?.[phase]?.error !== undefined)
                    ? unit.error
                    : null
                return (
                  <Fragment key={`${unit.rosterIndex}:${unit.pickIndex}`}>
                    {owner ? (
                      <tr>
                        <th scope="rowgroup" colSpan={defenders.length + 1} className="border-b border-edge bg-sunken p-0 text-left">
                          <OwnerName owner={owner} className="eyebrow sticky left-0 px-2 py-1.5" />
                        </th>
                      </tr>
                    ) : null}
                    <tr>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 w-28 min-w-28 border-b border-edge bg-panel p-2 text-left text-xs font-semibold sm:w-36 sm:min-w-36"
                      >
                        {unit.name}
                        <span className="block text-xs font-normal text-faint">{attackingHealth[row]}</span>
                      </th>
                      {blocked ? (
                        <td colSpan={defenders.length} className="border-b border-l border-edge bg-panel px-3 text-xs text-dim">
                          <span className="sticky left-28 inline-block sm:left-36">Not calculated: {blocked}</span>
                        </td>
                      ) : null}
                      {(blocked ? [] : defenders).map((target, column) => {
                        const answer = results[`${row}:${column}`]?.[phase]
                        const value = answer?.result?.[metric]
                        const reason =
                          answer?.error ??
                          (answer?.result ? 'No uncapped estimate: the target has mixed profiles or too many possible kills.' : undefined)
                        const bestTarget = highlight === 'targets' ? best.includes(column) : bestAttackers[column]!.includes(row)
                        const bestLabel = highlight === 'targets' ? 'Best target' : 'Best attacker'
                        return (
                          <td
                            key={`${target.rosterIndex}:${target.pickIndex}`}
                            data-best-matchup={bestTarget || undefined}
                            className="border-b border-l border-edge bg-panel p-0"
                            style={{ backgroundColor: shadeColor(matchupShade(value, largest)) }}
                          >
                            <button
                              type="button"
                              title={reason}
                              disabled={!answer}
                              aria-label={`${unit.name} #${row + 1} against ${target.name} #${column + 1}: ${value === undefined ? (answer ? `Not calculated: ${reason}` : 'Pending') : formatCombatValue(answer?.result, metric)}${bestTarget ? `, ${bestLabel.toLowerCase()}` : ''}. Open matchup`}
                              onClick={() => onSelect(row, column)}
                              className={`min-h-14 w-full p-2 text-center outline-none hover:bg-bone/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:text-faint ${bestTarget ? 'shadow-[inset_0_0_0_2px_var(--color-achieved)]' : ''}`}
                            >
                              {value !== undefined ? (
                                <>
                                  <CombatValue
                                    result={answer!.result}
                                    metric={metric}
                                    className={`block text-sm tabular-nums ${bestTarget ? 'font-semibold text-achieved' : 'text-bone'}`}
                                  />
                                  {bestTarget ? <span className="sr-only">{bestLabel}</span> : null}
                                </>
                              ) : answer ? (
                                <>
                                  <span aria-hidden className="text-discarded">
                                    —
                                  </span>
                                  <span className="sr-only">Not calculated: {reason}</span>
                                </>
                              ) : (
                                <span className="text-xs">
                                  …<span className="sr-only">Pending</span>
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </section>
      </TabsContent>
    </Tabs>
  )
}
