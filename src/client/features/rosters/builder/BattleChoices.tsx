import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type BattleChoice, battleChoiceActive, battleChoices, battleChoiceSheet, togetherLabel } from '../../../../core/battleChoices'
import { uniqueBy } from '../../../../core/collections'
import type { ActiveCombatRule } from '../../../../core/combatRules'
import type { RosterPick } from '../../../../core/roster'
import type { Datasheet } from '../../../../contracts/catalogue'
import { combatantDatasheetQuery, type Fielded } from '../../../queries'
import { readableRules } from '../../simulator/readableRules'
import { CombatRuleSummary, type CombatRuleOwners } from '../../simulator/CombatRuleLabel'
import { HoverTooltip } from '../../../components/HoverTooltip'
import { pressedClass } from '../../simulator/CombatControls'
import { useStableValue } from '../../../useStableValue'
import { useBattleChoicePicks } from './battleChoicePicks'
import { unitPicksOf, withUnitPicks } from '../../../../core/battleChoicePicks'

function useCombatantDatasheet({
  enabled,
  catalogueId,
  entryId,
  detachmentIds,
  picks,
  pickIndex,
  fielded,
}: {
  enabled: boolean
  catalogueId: string
  entryId: string | undefined
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  fielded: Fielded
}) {
  return useQuery({
    ...combatantDatasheetQuery(catalogueId, entryId ?? '', detachmentIds, picks, pickIndex ?? 0, [], fielded),
    enabled: enabled && Boolean(entryId) && pickIndex !== null && picks[pickIndex]?.entryId === entryId,
    // A wargear change refetches the same unit; keeping its last choices stops the rows above the wargear collapsing meanwhile.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === entryId && previousQuery?.queryKey[5] === pickIndex ? previous : undefined,
  }).data
}

/**
 * The rules whose option the player picks during the battle for the selected unit, and its datasheet as the picked
 * options leave it. An army-wide pick follows the player from unit to unit; any other, as an Order, is the unit's own.
 */
export function useBattleChoices({
  scope,
  catalogueId,
  entryId,
  detachmentIds,
  picks,
  pickIndex,
  fielded,
}: {
  /** Whose picks these are, as a list or an army in a battle; none turns the choices off. */
  scope: string | undefined
  catalogueId: string
  entryId: string | undefined
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  fielded: Fielded
}) {
  const enabled = scope !== undefined
  const stored = useBattleChoicePicks(scope)
  const data = useCombatantDatasheet({ enabled, catalogueId, entryId, detachmentIds, picks, pickIndex, fielded })
  const choices = useMemo(
    () => (enabled && data ? battleChoices(readableRules(data.rules), data.battleChoiceAllowances) : []),
    [enabled, data],
  )
  const lineUp = picks.map((pick) => pick.entryId).join(',')
  const units = stored.picks.lineUp === lineUp ? stored.picks.units : {}
  const unitPick = (choice: BattleChoice) => (pickIndex === null ? undefined : unitPicksOf(units, picks, pickIndex, choice.rule.name))
  const pickOf = (choice: BattleChoice) =>
    // Only the units a player selected for a rule such as Noospheric Transference have the army's pick.
    choice.selected && !unitPick(choice)?.length ? undefined : choice.armyWide ? stored.picks.army[choice.rule.name] : unitPick(choice)
  const picked = useStableValue<Record<string, readonly string[]>>(
    Object.fromEntries(choices.flatMap((choice) => (pickOf(choice)?.length ? [[choice.rule.name, pickOf(choice)!]] : []))),
  )
  const active = useMemo(
    (): ActiveCombatRule[] =>
      choices.flatMap((choice) => {
        const effects = battleChoiceActive(choice, picked[choice.rule.name] ?? [])
        return effects ? [{ name: choice.rule.name, appliedAs: choice.rule.appliedAs, effects }] : []
      }),
    [choices, picked],
  )
  const weaponAbilityRules = data?.weaponAbilityRules
  const keywordRules = useCallback(
    (rules: Datasheet['keywordRules']) =>
      active.length && weaponAbilityRules ? uniqueBy([...rules, ...weaponAbilityRules], (rule) => rule.name.toLowerCase()) : rules,
    [active, weaponAbilityRules],
  )
  const sheet = useCallback(
    <T extends Datasheet | null | undefined>(shown: T): T => (shown && active.length ? (battleChoiceSheet(shown, active) as T) : shown),
    [active],
  )
  return {
    choices,
    chosen: picked,
    choose: (rule: string, options: readonly string[]) => {
      const choice = choices.find((candidate) => candidate.rule.name === rule)
      if (!choice) return
      const army = { ...stored.picks.army }
      let unitPicks = units
      const forUnit = (values: string[]) => {
        if (pickIndex !== null) unitPicks = withUnitPicks(unitPicks, picks, pickIndex, rule, values)
      }
      // Past the limit, the newest pick replaces the oldest, as a new Order replaces the last.
      const kept = options.slice(-choice.limit)
      // Picking an option selects the unit and sets the army's pick; clearing it leaves the pick to the other selected units.
      if (choice.selected) forUnit(kept.length ? [choice.selected] : [])
      if (kept.length || !choice.selected) {
        if (!choice.armyWide) forUnit(kept)
        else if (kept.length) army[rule] = kept
        else delete army[rule]
      }
      stored.save({ army, lineUp, units: unitPicks })
    },
    keywordRules,
    sheet,
  }
}

type Props = {
  choices: readonly BattleChoice[]
  chosen: Readonly<Record<string, readonly string[]>>
  onChoose: (rule: string, options: readonly string[]) => void
  rules: Datasheet['keywordRules']
  /** Whose records each rule's summary is read from, as the unit's datasheet reads them. */
  owners: CombatRuleOwners
}

// Options that share a closing word, as every Doctrina Imperative does, read without it.
function shortLabels(options: readonly { label: string }[]) {
  const last = options.map(({ label }) => label.split(' ').at(-1))
  const shared = options.length > 1 && last.every((word) => word === last[0]) && options.every(({ label }) => label.includes(' '))
  return new Map(options.map(({ label }) => [label, shared ? label.split(' ').slice(0, -1).join(' ') : label]))
}

function RuleName({
  rule,
  rules,
  owners,
  className,
}: {
  rule: BattleChoice['rule']
  rules: Props['rules']
  owners: CombatRuleOwners
  className: string
}) {
  return (
    <HoverTooltip
      label={`${rule.name} rules`}
      title={rule.name}
      className={className}
      body={<CombatRuleSummary rule={rule} owners={owners} rules={rules} className="mt-0 text-xs" />}
    >
      {rule.name}
    </HoverTooltip>
  )
}

const smallChip = `${pressedClass} min-h-6 px-1.5 py-0`

/** One line per rule under the unit's characteristics, so a pick shows its change beside them. */
export function BattleChoices({ choices, chosen, onChoose, rules, owners }: Props) {
  if (!choices.length) return null
  return (
    <section aria-label="In battle" className="flex flex-col gap-y-1.5">
      {choices.map(({ rule, options, together, limit, selected }) => {
        const short = shortLabels(options)
        return (
          <div key={rule.name} className="flex min-w-0 flex-wrap items-center gap-1">
            <RuleName rule={rule} rules={rules} owners={owners} className="eyebrow mr-0.5 text-left" />
            {together ? (
              <span className="text-xs text-bone">{togetherLabel(together)}</span>
            ) : (
              <>
                <ToggleGroup
                  multiple={limit > 1}
                  value={[...(chosen[rule.name] ?? [])]}
                  onValueChange={(value) => onChoose(rule.name, value)}
                  variant="outline"
                  size="sm"
                  spacing={1}
                  className="flex-wrap"
                  aria-label={rule.name}
                >
                  {options.map(({ label }) => (
                    <ToggleGroupItem key={label} value={label} aria-label={label} className={smallChip}>
                      {short.get(label)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <span className="text-xs text-faint">
                  {selected ? 'The same for every unit you pick it on' : limit > 1 ? `Up to ${limit} at once` : 'One at a time'}
                </span>
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}
