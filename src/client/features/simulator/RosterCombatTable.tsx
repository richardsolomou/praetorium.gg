import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Choice } from './CombatControls'
import { CombatValue, formatCombatValue, type CombatMetric } from './CombatValue'
import type { RosterCombatSummary, RosterCombatUnit } from './rosterCombat'
import { combatUnitTarget } from '../../../core/combatUnit'

type Metric = CombatMetric
const metrics = [
  ['meanDamage', 'Wounds lost'],
  ['meanKills', 'Models lost'],
  ['uncappedKills', 'Uncapped kills'],
  ['wipe', 'Destruction chance'],
] as const
const phases = [
  ['ranged', 'Shooting'],
  ['melee', 'Melee'],
  ['combined', 'Shooting + melee'],
] as const

function modelCount(unit: RosterCombatUnit) {
  if (!unit.snapshot) return '— models'
  const models = [unit.snapshot, ...(unit.snapshot.companions ?? [])].reduce((sum, member) => sum + member.models, 0)
  const count = `${models} ${models === 1 ? 'model' : 'models'}`
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
  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        aria-label="View options"
        aria-expanded={optionsOpen}
        onClick={() => setOptionsOpen(!optionsOpen)}
        className="flex w-full items-center justify-between gap-2 border border-edge px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
      >
        {phases.find(([value]) => value === phase)![1]} · {heading}
        <ChevronDown className={`size-4 shrink-0 ${optionsOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className={`${optionsOpen ? 'grid' : 'hidden sm:grid'} grid-cols-2 gap-2 sm:grid-cols-3`}>
        <Choice label="Phase" ariaLabel="Comparison phase" choices={phases} value={phase} onChange={setPhase} />
        <Choice label="Show" ariaLabel="Comparison metric" choices={metrics} value={metric} onChange={setMetric} />
        <div className="col-span-2 min-w-0 sm:col-span-1">
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
      <p className="text-xs text-dim">
        <span className="text-achieved">Green: {highlight === 'targets' ? 'best target per attacker' : 'best attacker per target'}.</span>{' '}
        <span className="hidden sm:inline">Select a result to adjust the matchup.</span>
        <span className="sm:hidden">Swipe for more targets; tap a result to adjust.</span>
      </p>
      <section
        aria-label="All unit matchups"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the matchup columns.
        tabIndex={0}
        className="max-h-[min(32rem,65dvh)] max-w-full overflow-auto rounded border border-edge focus-visible:outline-2 focus-visible:outline-primary"
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            {phases.find(([value]) => value === phase)![1]} · {heading}. Attackers in rows; defenders in columns.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 w-28 min-w-28 border-b border-edge bg-sunken p-2 text-left text-xs text-dim sm:w-36 sm:min-w-36"
              >
                Attacker / Target
              </th>
              {defenders.map((unit, index) => (
                <th
                  scope="col"
                  key={`${unit.rosterIndex}:${unit.pickIndex}`}
                  className="sticky top-0 z-20 w-28 min-w-28 border-b border-l border-edge bg-sunken p-2 text-left text-xs font-semibold"
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
              return (
                <tr key={`${unit.rosterIndex}:${unit.pickIndex}`}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-28 min-w-28 border-b border-edge bg-panel p-2 text-left text-xs font-semibold sm:w-36 sm:min-w-36"
                  >
                    {unit.name}
                    <span className="block text-xs font-normal text-faint">{attackingHealth[row]}</span>
                  </th>
                  {defenders.map((target, column) => {
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
                        className={`border-b border-l border-edge p-0 ${bestTarget ? 'bg-achieved/15' : 'bg-panel'}`}
                      >
                        <button
                          type="button"
                          title={reason}
                          disabled={!answer}
                          aria-label={`${unit.name} #${row + 1} against ${target.name} #${column + 1}: ${value === undefined ? (answer ? `Not calculated: ${reason}` : 'Pending') : formatCombatValue(answer?.result, metric)}${bestTarget ? `, ${bestLabel.toLowerCase()}` : ''}. Open matchup`}
                          onClick={() => onSelect(row, column)}
                          className="min-h-14 w-full p-2 text-center outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:text-faint"
                        >
                          {value !== undefined ? (
                            <>
                              <CombatValue
                                result={answer!.result}
                                metric={metric}
                                className={`block text-sm ${bestTarget ? 'font-semibold text-achieved underline decoration-achieved/50 underline-offset-4' : 'text-bone'}`}
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
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
