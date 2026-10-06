import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { FormatRuleId, OptionalRuleId } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { combatSurvivors, combatSurvivorSheet } from '../../../core/combatSurvivors'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { activeCombatRules, combatRuleKey, combatRuleDefault, combatRuleHasSharedDefence } from '../../../core/combatRules'
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
  const [selectedPreferences, setSelectedPreferences] = useState<Record<string, Record<string, string>>>(() =>
    initial?.preferences ? { [`${initial.pick.catalogueId ?? initial.catalogueId}:0:${initial.pick.entryId}`]: initial.preferences } : {},
  )
  const [health, setHealth] = useState<Record<string, { models: number; damage: number }>>({})
  const [allocations, setAllocations] = useState<Record<string, CombatCarrier[]>>({})
  const picks = usePicks(
    roster?.picks ?? (initial ? [initial.pick, ...(initial.attached ?? []).map((pick) => ({ ...pick, attachedTo: 0 }))] : []),
  )
  const detachmentIds = roster?.detachmentIds ?? []
  const settled = useSettled(picks.positioned)
  const pick = picks.positioned[pickIndex]
  const faction = pick?.catalogueId ?? catalogueId
  const entryId = pick?.entryId
  const identityAt = (index: number) =>
    `${picks.positioned[index]?.catalogueId ?? catalogueId}:${picks.picks[index]?.key}:${picks.positioned[index]?.entryId}`
  const identity = identityAt(pickIndex)
  const weaponPreferences = selectedPreferences[identity] ?? {}
  const setWeaponPreferences = useCallback(
    (preferences: Record<string, string>) =>
      setSelectedPreferences((current) =>
        JSON.stringify(current[identity] ?? {}) === JSON.stringify(preferences) ? current : { ...current, [identity]: preferences },
      ),
    [identity],
  )
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
    placeholderData: (previous, query) => {
      if (!previous) return undefined
      if (previous.units.length === picks.positioned.length) return previous
      if (query?.queryKey[1] !== catalogueId) return undefined
      const kept = survivingUnits(query.queryKey.at(-1), picks.positioned)
      return kept?.[pickIndex] === undefined ? undefined : { ...previous, units: kept.map((index) => previous.units[index]!) }
    },
  })
  const unit = price.data?.units[pickIndex]
  const currentUnit = unit?.entryId === entryId
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
    placeholderData: (previous, query) => (query?.queryKey[5] === pickIndex ? previous : undefined),
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
  const ruleSources = new Map<string, NonNullable<typeof sheets.data>['rules'][number]>()
  for (const rule of [...(sheets.data?.rules ?? []), ...(sheets.data?.companions ?? []).flatMap((member) => member.rules)]) {
    const source = combatRuleKey(rule)
    if (!ruleSources.has(source)) ruleSources.set(source, rule)
  }
  const allRules = [...ruleSources.values()]
  const ruleChoices = Object.fromEntries(allRules.map((rule) => [combatRuleKey(rule), ruleSelections[rule.id] ?? combatRuleDefault(rule)]))
  const choiceFor = (rule: (typeof allRules)[number]) => {
    return ruleChoices[combatRuleKey(rule)]!
  }
  const sharedDefenceSources = (rules: typeof allRules) =>
    rules.filter((rule) => combatRuleHasSharedDefence(rule, choiceFor(rule))).map((rule) => rule.source)
  const active = (rules: typeof allRules) => activeCombatRules(rules, ruleChoices)
  const activeRules = active(sheets.data?.rules ?? [])
  const companions = (sheets.data?.companions ?? []).map((member) => {
    const battleMember = roster?.battle?.units[member.pickIndex]
    const memberModels = health[identityAt(member.pickIndex)]?.models ?? battleMember?.models ?? member.models
    const memberKey = JSON.stringify([identityAt(member.pickIndex), memberModels, member.carriers])
    const memberCarriers = battleMember ? (allocations[memberKey] ?? combatSurvivors(member.carriers, memberModels)) : member.carriers
    return {
      sheet: battleMember && memberCarriers ? combatSurvivorSheet(member.selected, member.carriers, memberCarriers) : member.selected,
      bodyguard: picks.positioned[member.pickIndex]?.attachedTo === undefined,
      models: memberModels,
      startingModels: member.models,
      damage: health[identityAt(member.pickIndex)]?.damage ?? battleMember?.damage ?? 0,
      carriers: memberCarriers ?? [],
      allocationRequired: !memberCarriers,
      rules: active(member.rules),
      sharedDefenceSources: sharedDefenceSources(member.rules),
    }
  })
  const ready = Boolean(
    currentUnit &&
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
    weaponPreferences,
    setWeaponPreferences,
    allRules,
    companions,
    companionSurvivors: (sheets.data?.companions ?? []).map((member, index) => ({
      pickIndex: member.pickIndex,
      original: member.carriers,
      selected: companions[index]!.allocationRequired ? null : companions[index]!.carriers,
      models: companions[index]!.models,
      allocationKey: JSON.stringify([identityAt(member.pickIndex), companions[index]!.models, member.carriers]),
    })),
    setAllocation: (key: string, carriers: CombatCarrier[]) => setAllocations((current) => ({ ...current, [key]: carriers })),
    selectRule: (id: string, choice: number) =>
      setSelectedRules((current) => ({ ...current, [identity]: { ...current[identity], [id]: choice } })),
    ready,
    snapshot:
      unit && sheets.data?.selected
        ? {
            sheet:
              battleUnit && survivors ? combatSurvivorSheet(sheets.data.selected, sheets.data.carriers, survivors) : sheets.data.selected,
            bodyguard: pick?.attachedTo === undefined,
            startingModels: unit.size.models,
            models: battleUnit ? models : unit.size.models,
            damage,
            carriers: survivors ?? [],
            allocationRequired: !survivors || Boolean(sheets.data.attachmentErrors.length),
            rules: activeRules,
            ruleChoices,
            sharedDefenceSources: sharedDefenceSources(sheets.data.rules),
            companions,
          }
        : null,
    /** Undefined while another loadout's options are still being built. */
    loadoutSpace: loadoutContext && !loadouts.isPlaceholderData ? loadouts.data : undefined,
    edit: pickEditor(picks.setPicks, { catalogueId, units: price.data?.units ?? [] }, picks.allocateKey),
    selectRosterUnit,
    removeMember: (index: number) => {
      if (roster || !ready) return
      picks.setPicks((current) => {
        const removed = current[index]
        if (current.length < 2 || !removed) return current
        const remaining = current.filter((member) => member.key !== removed.key)
        const host = remaining[0]!
        return remaining.map((member) => ({
          ...member,
          attachedTo: member.key === host.key ? undefined : host.key,
        }))
      })
    },
    /** What a shared link needs to restore this standalone side. */
    shared: shareable(roster, catalogueId, picks.picks[pickIndex], ruleSelections, weaponPreferences, picks.picks),
    addAttachment: (attachmentId: string) => {
      const option = sheets.data?.attachmentOptions.find((candidate) => candidate.entryId === attachmentId)
      const host = picks.picks[pickIndex]
      if (roster || !ready || !option || !host || picks.picks.length >= 8) return
      const key = picks.allocateKey()
      if (option.kind === 'bodyguard') {
        picks.setPicks((current) =>
          current.length === 1 && current[0]?.key === host.key
            ? [
                { entryId: attachmentId, catalogueId: option.catalogueId, key },
                { ...host, attachedTo: key },
              ]
            : current,
        )
        return
      }
      picks.setPicks((current) =>
        current.length >= 8 ||
        current.some((member) => member.entryId === attachmentId) ||
        !current.some((member) => member.key === host.key)
          ? current
          : [...current, { entryId: attachmentId, catalogueId: option.catalogueId, attachedTo: host.key, key }],
      )
    },
    replaceAttachment: (index: number, replacementId: string) => {
      const option = sheets.data?.attachmentReplacements?.[index]?.find((candidate) => candidate.entryId === replacementId)
      if (roster || !ready || !option) return
      const member = picks.picks[index]
      if (!member || member.entryId === replacementId) return
      const key = picks.allocateKey()
      picks.setPicks((current) =>
        current.map((candidate) =>
          candidate.key === member.key
            ? { entryId: replacementId, catalogueId: option.catalogueId, attachedTo: member.attachedTo, key }
            : candidate,
        ),
      )
    },
    selectUnit: (catalogue: string, id: string) => {
      setCatalogueId(catalogue)
      setSelectedRules({})
      const key = picks.allocateKey()
      picks.setPicks((current) => {
        const host = current[pickIndex]
        if (!host) return [{ entryId: id, catalogueId: catalogue, key }]
        return current.map((member) =>
          member.key === host.key
            ? { entryId: id, catalogueId: catalogue, key }
            : member.attachedTo === host.key
              ? { ...member, attachedTo: key }
              : member,
        )
      })
    },
  }
}

export type Combatant = ReturnType<typeof useCombatant>

function shareable(
  roster: CombatRoster | undefined,
  catalogueId: string,
  pick: KeyedPick | undefined,
  rules: Record<string, number>,
  preferences: Record<string, string>,
  picks: readonly KeyedPick[],
): SimulatorSide | null {
  if (roster || !catalogueId || !pick) return null
  const { key: _key, attachedTo: _attachedTo, ...shared } = pick
  const attached = picks
    .filter((member) => member.attachedTo === pick.key)
    .map(({ key: _memberKey, attachedTo: _host, ...member }) => member)
  return {
    catalogueId,
    pick: shared,
    rules,
    ...(Object.keys(preferences).length ? { preferences } : {}),
    ...(attached.length ? { attached } : {}),
  }
}
