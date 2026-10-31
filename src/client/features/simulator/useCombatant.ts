import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { FormatRuleId, OptionalRuleId } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { combatAtHealth } from '../../../core/combatSurvivors'
import type { CombatCarrier } from '../../../core/combatLoadout'
import { combatRuleSelections } from '../../../core/combatRules'
import { useSourceTexts } from '../../sourceText'
import { combatantTexts, readableCombatant } from './readableRules'
import { combatLoadoutsQuery, combatantDatasheetQuery, factionQuery, priceQuery } from '../../queries'
import type { SimulatorRosterSource, SimulatorSide } from '../../../contracts/simulatorState'
import type { RosterOwner } from './rosterOwners'
import { useSettled } from '../../useSettled'
import { useStableValue } from '../../useStableValue'
import { survivingUnits } from '../rosters/builder/pricePlaceholder'
import type { KeyedPick } from '../rosters/rosterPicks'
import { pickEditor, usePicks } from '../rosters/builder/usePicks'
import { attachedHost, attachedUnit, withoutUnit } from '../../../core/attachedUnits'
import { restoreWeaponPreferences, storeWeaponPreferences, type PreferenceMember, type StoredWeaponPreferences } from './combatPreferences'

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
  /** The saved roster or revealed sealed event list a standalone side came from, so its link and recent simulation can reopen it. */
  saved?: { source: SimulatorRosterSource; name: string }
  /** Fields only the unit at `pickIndex`, with what is attached to it, when a comparison would take the whole roster. */
  only?: boolean
  /** Whose list this is, when a comparison fields more than one roster on a side. */
  owner?: RosterOwner
  battle?: {
    units: { available: boolean; key: string; name: string; models: number; startingModels: number; damage: number; wounds?: number }[]
  }
}

/** `initial` restores a standalone side from a shared link; a roster side starts from its roster. */
export function useCombatant(roster?: CombatRoster, initial?: SimulatorSide | null) {
  const [catalogueId, setCatalogueId] = useState(roster?.catalogueId ?? initial?.catalogueId ?? '')
  const [selectedIndex, selectRosterUnit] = useState(roster?.pickIndex ?? 0)
  // A unit destroyed while the battle simulator is open hands the side back to the battle's choice.
  const pickIndex = roster?.battle?.units[selectedIndex]?.available === false ? roster.pickIndex : selectedIndex
  // Picks are keyed by position when seeded, so restored rule choices belong to the restored pick's identity.
  const [selectedRules, setSelectedRules] = useState<Record<string, Record<string, number>>>(() =>
    initial
      ? { [`${initial.pick.catalogueId ?? initial.catalogueId}:${roster?.pickIndex ?? 0}:${initial.pick.entryId}`]: initial.rules }
      : {},
  )
  const [initialPreferences] = useState(initial?.preferences ?? {})
  const [selectedPreferences, setSelectedPreferences] = useState<StoredWeaponPreferences | null>(null)
  const [health, setHealth] = useState<Record<string, { models: number; damage: number }>>({})
  const [allocations, setAllocations] = useState<Record<string, CombatCarrier[]>>({})
  const picks = usePicks(
    roster?.picks ??
      (initial ? [initial.pick, ...(initial.attached ?? []).map((pick) => ({ ...pick, attachedTo: pick.attachedTo ?? 0 }))] : []),
  )
  const battlePicks = useStableValue(roster?.battle ? roster.picks : null)
  const { resetPicks } = picks
  useEffect(() => {
    if (battlePicks) resetPicks(battlePicks)
  }, [battlePicks, resetPicks])
  const [chosenDetachments, setChosenDetachments] = useState({
    catalogueId: initial?.catalogueId,
    ids: initial?.detachmentIds ?? NO_DETACHMENTS,
  })
  // Detachments belong to a faction; picking another faction's unit leaves them behind.
  const detachmentIds = roster?.detachmentIds ?? (chosenDetachments.catalogueId === catalogueId ? chosenDetachments.ids : NO_DETACHMENTS)
  const factionDetail = useQuery({ ...factionQuery(catalogueId), enabled: Boolean(catalogueId) })
  const detachmentOptions = factionDetail.data?.detachments
  // A lone unit has no list to set a battle size, so it is priced and limited as Strike Force.
  const limit = roster?.limit ?? 2000
  const settled = useSettled(picks.positioned)
  const pick = picks.positioned[pickIndex]
  const faction = pick?.catalogueId ?? catalogueId
  const entryId = pick?.entryId
  const identityAt = (index: number) =>
    `${picks.positioned[index]?.catalogueId ?? catalogueId}:${picks.picks[index]?.key}:${picks.positioned[index]?.entryId}`
  const identity = identityAt(pickIndex)
  const healthKey = (index: number) => {
    const member = roster?.battle?.units[index]
    return member ? JSON.stringify([identityAt(index), member.models, member.damage]) : identityAt(index)
  }
  const price = useQuery({
    ...priceQuery(
      catalogueId,
      detachmentIds,
      roster?.disposition ?? null,
      limit,
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
  useSourceTexts(combatantTexts(sheets.data))
  const readable = sheets.data ? readableCombatant(sheets.data) : undefined
  // A battle fields frozen loadouts, so there is nothing to choose between.
  const loadoutContext =
    !roster?.battle && entryId && entryId === settled[pickIndex]?.entryId ? { catalogueId, detachmentIds, picks: settled, pickIndex } : null
  const loadouts = useQuery({
    ...combatLoadoutsQuery(loadoutContext ?? { catalogueId: '', detachmentIds: [], picks: [], pickIndex: 0 }),
    enabled: Boolean(loadoutContext),
    placeholderData: (previous, query) => (query?.queryKey[4] === pickIndex && query.queryKey[1] === catalogueId ? previous : undefined),
  })
  const battleUnit = roster?.battle?.units[pickIndex]
  const currentHealth = health[healthKey(pickIndex)] ?? battleUnit
  const models = currentHealth?.models ?? pick?.models ?? unit?.size.models ?? 0
  const damage = currentHealth?.damage ?? 0
  const allocationKey = JSON.stringify([identity, models, sheets.data?.carriers])
  const liveUnit =
    sheets.data && battleUnit
      ? combatAtHealth(
          { sheet: sheets.data.selected, models: sheets.data.models, carriers: sheets.data.carriers },
          { models, startingModels: battleUnit.startingModels, damage },
          allocations[allocationKey],
        )
      : null
  const survivors = sheets.data ? (liveUnit ? (liveUnit.allocationRequired ? null : liveUnit.carriers) : sheets.data.carriers) : null
  const ruleSelections = selectedRules[identity] ?? {}
  const {
    rules: allRules,
    choices: ruleChoices,
    active,
    sharedDefenceSources,
  } = combatRuleSelections([...(readable?.rules ?? []), ...(readable?.companions ?? []).flatMap((member) => member.rules)], ruleSelections)
  const activeRules = active(readable?.rules ?? [])
  const companions = (readable?.companions ?? []).map((member) => {
    const battleMember = roster?.battle?.units[member.pickIndex]
    const memberModels = health[healthKey(member.pickIndex)]?.models ?? battleMember?.models ?? member.models
    const memberKey = JSON.stringify([identityAt(member.pickIndex), memberModels, member.carriers])
    const projected = {
      sheet: member.selected,
      bodyguard: picks.positioned[member.pickIndex]?.attachedTo === undefined,
      models: memberModels,
      startingModels: member.models,
      damage: health[healthKey(member.pickIndex)]?.damage ?? battleMember?.damage ?? 0,
      carriers: member.carriers,
      allocationRequired: false,
      rules: active(member.rules),
      sharedDefenceSources: sharedDefenceSources(member.rules),
    }
    return battleMember
      ? combatAtHealth(
          projected,
          { models: memberModels, startingModels: battleMember.startingModels, damage: projected.damage },
          allocations[memberKey],
        )
      : projected
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
  const preferenceMembers = useStableValue<PreferenceMember[]>(
    [pickIndex, ...attachedUnit(picks.positioned, pickIndex).filter((index) => roster?.battle?.units[index]?.available !== false)].map(
      (index) => ({
        identity: identityAt(index),
        pickIndex: index,
        profileIds:
          (index === pickIndex
            ? sheets.data?.selected
            : sheets.data?.companions.find((member) => member.pickIndex === index)?.selected
          )?.profiles.map((profile) => profile.id) ?? [],
      }),
    ),
  )
  const preferenceKey = JSON.stringify(preferenceMembers)
  const preferenceRoster = useStableValue(picks.picks.map((_, index) => identityAt(index)))
  const weaponPreferences = useMemo(
    () => (selectedPreferences ? restoreWeaponPreferences(selectedPreferences, preferenceMembers, ready) : initialPreferences),
    [selectedPreferences, preferenceMembers, initialPreferences, ready],
  )
  // Lets a late update from a unit that has since changed find out that it is stale.
  const preferenceContext = useRef({ key: preferenceKey, ready })
  useLayoutEffect(() => {
    preferenceContext.current = { key: preferenceKey, ready }
  }, [preferenceKey, ready])
  const invalidatedPreferences =
    ready &&
    selectedPreferences !== null &&
    preferenceMembers.reduce((count, member) => count + Object.keys(selectedPreferences[member.identity]?.choices ?? {}).length, 0) >
      Object.keys(weaponPreferences).length
  const setWeaponPreferences = useCallback(
    (update: SetStateAction<Record<string, string>>) => {
      if (!preferenceContext.current.ready || preferenceContext.current.key !== preferenceKey) return
      setSelectedPreferences((current) => {
        const identities = new Set(preferenceRoster)
        const retained = Object.fromEntries(Object.entries(current ?? {}).filter(([key]) => identities.has(key)))
        const preferences =
          typeof update === 'function'
            ? update(current ? restoreWeaponPreferences(current, preferenceMembers) : initialPreferences)
            : update
        const next = storeWeaponPreferences(retained, preferenceMembers, preferences)
        return JSON.stringify(next) === JSON.stringify(current) ? current : next
      })
    },
    [preferenceKey, preferenceMembers, preferenceRoster, initialPreferences],
  )
  useEffect(() => {
    if (ready) setWeaponPreferences((current) => current)
  }, [ready, setWeaponPreferences])
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
      setHealth((current) => ({ ...current, [healthKey(pickIndex)]: { models, damage, ...update } })),
    roster: Boolean(roster),
    rosterName: roster?.saved?.name,
    detachmentIds,
    /** Undefined while the faction is loading. */
    detachmentOptions,
    detachmentNames: detachmentIds.flatMap((id) => detachmentOptions?.find((option) => option.id === id)?.name ?? []),
    limit,
    selectDetachments: (ids: readonly string[]) => {
      if (!roster) setChosenDetachments({ catalogueId, ids })
    },
    pickIndex,
    pick,
    identity,
    picks,
    price,
    unit,
    sheets,
    ruleSelections,
    weaponPreferences,
    invalidatedPreferences,
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
            sheet: liveUnit?.sheet ?? sheets.data.selected,
            bodyguard: pick?.attachedTo === undefined,
            startingModels: unit.size.models,
            models: battleUnit ? models : unit.size.models,
            damage,
            carriers: survivors ?? [],
            allocationRequired: !survivors || Boolean(sheets.data.attachmentErrors.length),
            rules: activeRules,
            ruleChoices,
            sharedDefenceSources: sharedDefenceSources(readable?.rules ?? []),
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
        // A combatant is one unit, so whatever the removal leaves standing alone joins the unit that remains.
        const remaining = withoutUnit(current, removed.key)
        const host = remaining.find((member) => member.attachedTo === undefined) ?? remaining[0]!
        return remaining.map((member) =>
          member.attachedTo === undefined && member !== host ? { ...member, attachedTo: host.key } : member,
        )
      })
    },
    /** What a shared link needs to restore this standalone side. */
    shared: shareable(
      roster,
      catalogueId,
      picks.picks[pickIndex],
      pickIndex,
      ruleSelections,
      weaponPreferences,
      picks.picks,
      detachmentIds,
    ),
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

const NO_DETACHMENTS: readonly string[] = []

export type Combatant = ReturnType<typeof useCombatant>

function shareable(
  roster: CombatRoster | undefined,
  catalogueId: string,
  pick: KeyedPick | undefined,
  pickIndex: number,
  rules: Record<string, number>,
  preferences: Record<string, string>,
  picks: readonly KeyedPick[],
  detachmentIds: readonly string[],
): SimulatorSide | null {
  if ((roster && !roster.saved) || !catalogueId || !pick) return null
  const { key: _key, attachedTo: _attachedTo, note: _note, ...shared } = pick
  if (roster?.saved)
    return {
      catalogueId,
      pick: shared,
      rules,
      ...(Object.keys(preferences).length ? { preferences } : {}),
      roster: { ...roster.saved.source, pickIndex },
    }
  const members = picks.filter((member) => member !== pick && attachedHost(picks, member) === pick)
  const attached = members.map(({ key: _memberKey, attachedTo: host, ...member }) => {
    const joined = members.findIndex((other) => other.key === host)
    return joined < 0 ? member : { ...member, attachedTo: joined + 1 }
  })
  return {
    catalogueId,
    pick: shared,
    rules,
    ...(Object.keys(preferences).length ? { preferences } : {}),
    ...(attached.length ? { attached } : {}),
    ...(detachmentIds.length ? { detachmentIds: [...detachmentIds] } : {}),
  }
}
