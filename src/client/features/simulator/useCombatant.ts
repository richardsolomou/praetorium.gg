import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormatRuleId, OptionalRuleId } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { combatSurvivors, combatSurvivorSheet } from '../../../core/combatSurvivors'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { combatRuleChoices, combatRuleDefault } from '../../../core/combatRules'
import { combatLoadoutsQuery, combatantDatasheetQuery, priceQuery } from '../../queries'
import type { SimulatorSide } from './simulatorUrl'
import { useSettled } from '../../useSettled'
import { survivingUnits } from '../rosters/builder/pricePlaceholder'
import type { KeyedPick } from '../rosters/rosterPicks'
import { pickEditor, usePicks } from '../rosters/builder/usePicks'

export type CombatRoster = {
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  limit: number
  picks: readonly RosterPick[]
  pickIndex: number
  waivedRules: readonly FormatRuleId[]
  borrowedDetachmentId: string | null
  optionalRules: readonly OptionalRuleId[]
  battle?: {
    units: { available: boolean; key: string; name: string; models: number; startingModels: number; damage: number; wounds?: number }[]
  }
}

/** `initial` restores a standalone side from a shared link; a roster side starts from its roster. */
export function useCombatant(roster?: CombatRoster, initial?: SimulatorSide | null) {
  const [catalogueId, setCatalogueId] = useState(roster?.catalogueId ?? initial?.catalogueId ?? '')
  const [pickIndex, selectRosterUnit] = useState(roster?.pickIndex ?? 0)
  // A restored pick takes the first key, so its rule choices belong to that identity.
  const [selectedRules, setSelectedRules] = useState<Record<string, Record<string, number>>>(() =>
    initial ? { [`${initial.pick.catalogueId ?? initial.catalogueId}:0:${initial.pick.entryId}`]: initial.rules } : {},
  )
  const [health, setHealth] = useState<Record<string, { models: number; damage: number }>>({})
  const [allocations, setAllocations] = useState<Record<string, CombatCarrier[]>>({})
  const picks = usePicks(roster?.picks ?? (initial ? [initial.pick] : []))
  const detachmentIds = roster?.detachmentIds ?? []
  const settled = useSettled(picks.positioned)
  const pick = picks.positioned[pickIndex]
  const faction = pick?.catalogueId ?? catalogueId
  const entryId = pick?.entryId
  const identity = `${faction}:${picks.picks[pickIndex]?.key}:${entryId}`
  const price = useQuery({
    ...priceQuery(
      catalogueId,
      detachmentIds,
      roster?.disposition ?? null,
      roster?.limit ?? 2000,
      settled,
      roster?.waivedRules,
      roster?.borrowedDetachmentId,
      roster?.optionalRules,
    ),
    enabled: Boolean(catalogueId && settled.length),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === catalogueId && survivingUnits(query.queryKey.at(-1), picks.positioned)?.length === picks.positioned.length
        ? previous
        : undefined,
  })
  const unit = price.data?.units[pickIndex]?.entryId === entryId ? price.data?.units[pickIndex] : undefined
  const sheets = useQuery({
    ...combatantDatasheetQuery(
      catalogueId,
      entryId ?? '',
      detachmentIds,
      settled,
      pickIndex,
      roster?.battle?.units.flatMap((member, index) => (member.available ? [] : [index])),
    ),
    enabled: Boolean(entryId && entryId === settled[pickIndex]?.entryId),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === catalogueId && query.queryKey[2] === entryId && query.queryKey[5] === pickIndex ? previous : undefined,
  })
  // A battle fields frozen loadouts, so there is nothing to choose between.
  const loadoutContext =
    !roster?.battle && entryId && entryId === settled[pickIndex]?.entryId ? { catalogueId, detachmentIds, picks: settled, pickIndex } : null
  const loadouts = useQuery({
    ...combatLoadoutsQuery(loadoutContext ?? { catalogueId: '', detachmentIds: [], picks: [], pickIndex: 0 }),
    enabled: Boolean(loadoutContext),
    placeholderData: (previous, query) => (query?.queryKey[4] === pickIndex && query.queryKey[1] === catalogueId ? previous : undefined),
  })
  const battleUnit = roster?.battle?.units[pickIndex]
  const currentHealth = health[identity] ?? battleUnit
  const models = currentHealth?.models ?? pick?.models ?? unit?.size.models ?? 0
  const damage = currentHealth?.damage ?? 0
  const allocationKey = JSON.stringify([identity, models, sheets.data?.carriers])
  const survivors = sheets.data
    ? battleUnit
      ? (allocations[allocationKey] ?? combatSurvivors(sheets.data.carriers, models))
      : sheets.data.carriers
    : null
  const ruleSelections = selectedRules[identity] ?? {}
  const activeRules = [
    ...new Map(
      (sheets.data?.rules ?? []).flatMap((rule) => {
        const choice = combatRuleChoices(rule)[(ruleSelections[rule.id] ?? combatRuleDefault(rule)) - 1]
        return choice ? [[rule.name, { name: rule.name, effects: choice.effects }] as const] : []
      }),
    ).values(),
  ]
  const ready = Boolean(
    unit &&
    sheets.data?.selected &&
    picks.positioned === settled &&
    !price.isFetching &&
    !sheets.isFetching &&
    !price.isPlaceholderData &&
    !sheets.isPlaceholderData &&
    !price.isError &&
    !sheets.isError,
  )
  return {
    catalogueId,
    faction,
    battleUnit,
    availableUnits: roster?.battle?.units.map((member) => member.available),
    models,
    damage,
    survivors,
    allocationKey,
    setSurvivors: (carriers: CombatCarrier[]) => setAllocations((current) => ({ ...current, [allocationKey]: carriers })),
    setHealth: (update: Partial<{ models: number; damage: number }>) =>
      setHealth((current) => ({ ...current, [identity]: { models, damage, ...update } })),
    roster: Boolean(roster),
    detachmentIds,
    pickIndex,
    pick,
    identity,
    picks,
    price,
    unit,
    sheets,
    ruleSelections,
    selectRule: (id: string, choice: number) =>
      setSelectedRules((current) => ({ ...current, [identity]: { ...current[identity], [id]: choice } })),
    ready,
    snapshot:
      unit && sheets.data?.selected
        ? {
            sheet:
              battleUnit && survivors ? combatSurvivorSheet(sheets.data.selected, sheets.data.carriers, survivors) : sheets.data.selected,
            startingModels: unit.size.models,
            models: battleUnit ? models : unit.size.models,
            damage,
            carriers: survivors ?? [],
            allocationRequired: !survivors,
            rules: activeRules,
          }
        : null,
    /** Undefined while another loadout's options are still being built. */
    loadoutSpace: loadoutContext && !loadouts.isPlaceholderData ? loadouts.data : undefined,
    edit: pickEditor(picks.setPicks, { catalogueId, units: price.data?.units ?? [] }, picks.allocateKey),
    selectRosterUnit,
    /** What a shared link needs to restore this standalone side. */
    shared: shareable(roster, catalogueId, picks.picks[pickIndex], ruleSelections),
    selectUnit: (catalogue: string, id: string) => {
      setCatalogueId(catalogue)
      setSelectedRules({})
      picks.setPicks([{ entryId: id, catalogueId: catalogue, key: picks.allocateKey() }])
    },
  }
}

export type Combatant = ReturnType<typeof useCombatant>

function shareable(
  roster: CombatRoster | undefined,
  catalogueId: string,
  pick: KeyedPick | undefined,
  rules: Record<string, number>,
): SimulatorSide | null {
  if (roster || !catalogueId || !pick) return null
  const { key: _key, attachedTo: _attachedTo, ...shared } = pick
  return { catalogueId, pick: shared, rules }
}
