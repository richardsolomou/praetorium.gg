import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMatch, useNavigate, useRouterState } from '@tanstack/react-router'
import { SlidersHorizontal, Swords } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { attachedUnitCount, attachmentHost } from '../../../core/attachedUnits'
import type { BuiltRoster, FormatRuleId, Secondary, Stratagem } from '../../../core/battle'
import { enforces, type OptionalRuleId, ROSTER_NAME_MAX_LENGTH, waivedFormatRules } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { useAbilityReminders } from './useAbilityReminders'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import type { Datasheet } from '../../../contracts/catalogue'
import { rosterMatchup, type SimulatorRosterSource } from '../../../contracts/simulatorState'
import { factionIndexQuery, factionQuery, meQuery, setupPriceQuery, unitsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { Loadout } from './builder/Loadout'
import { changedDraftSpreadCounts, withDraftSpreadCounts } from './builder/loadoutModel'
import { Picker, type PickerFilter } from './builder/Picker'
import { shownKind } from './builder/pickerRows'
import { SaveLoadoutDialog } from './builder/SaveLoadoutDialog'
import { Pane } from './builder/Pane'
import { useRosterPanes } from './builder/useRosterPanes'
import { UnitAnnotations } from './builder/UnitAnnotations'
import { UnitPhoto } from './builder/UnitPhoto'
import { useDetachmentRules } from './builder/useDetachmentRules'
import { canAddCopy, unitLimitMessage, usePicks } from './builder/usePicks'
import type { RosterSetup, RosterSetupFaction } from './RosterSetupDialog'
import { RosterExportDialog } from './RosterExportDialog'
import { RosterExchangeDialog } from './RosterExchangeDialog'
import { type RosterShareChoices, RosterShareDialog } from './RosterShareDialog'
import { useOrigin } from '../../useOrigin'
import { RosterLoanDialog } from './RosterLoanDialog'
import { RosterBody, RosterHeader, RosterOutline, RosterShell } from './RosterPresentation'
import { useWorkspaceState, WAIVERS_STATE } from './workspaceState'
import { type AttachDirection, useCardRelationships } from './RosterUnitCard'
import type { AttachChoice } from './builder/UnitCard'
import { RosterGradesDialog } from './RosterGradesDialog'
import { currentRulesFor } from '../../../core/currentRules'
import { OutdatedSealedEventRosters } from './OutdatedSealedEventRosters'
import { DueSealedEventRosters } from './DueSealedEventRosters'
import { type RosterDraft, rosterSetupOf } from './rosterDraft'
import { RosterBuilderFooter } from './RosterBuilderFooter'
import { type RosterVariant, RosterVariantMenu } from './RosterVariantMenu'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { type CatalogueEdition, rulesVersionDetails } from '../../../core/catalogueEdition'
import { armyAvailability } from './armyAvailability'
import { RosterCombatDialog } from '../simulator/RosterCombatDialog'
import { RosterPrintPack, type RosterPrintInput } from './RosterPrintPack'
import type { CombatRoster } from '../simulator/useCombatant'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAccountPrompt } from './AccountPrompt'
import { useNewBattle } from '../battles/NewBattle'
import { toggled, withMember } from '../../../core/collections'
import { usePrintWhenReady } from './usePrintWhenReady'
import { factionDisposition } from '../../components/rosterSetup'
import { pointsOver } from './builder/PointsChip'
import { useRosterAutosave } from './useRosterAutosave'
import { useRosterPrice } from './useRosterPrice'
import { useRosterActions } from './useRosterActions'
import { useRosterEdits } from './useRosterEdits'
import { RosterActionsMenu } from './RosterActionsMenu'
import { RosterHeaderNotices } from './RosterHeaderNotices'
import { rosterCards, RosterUnitShelves } from './RosterUnitShelves'
import { LoadoutPaneActions } from './LoadoutPaneActions'
import { useRosterSetupEditor } from './useRosterSetupEditor'
import { useReminderEditor } from './useReminderEditor'
import { ArmyUnavailable } from './ArmyUnavailable'

type Props = {
  /** What the player has written down, so a saved list carries it and restores it. */
  prep: { stratagems: Stratagem[]; secondaries: Secondary[]; remindersEnabled?: boolean }
  initial: {
    id: string
    name: string
    automaticName?: boolean
    catalogueId: string
    detachmentIds: string[]
    disposition: string | null
    limit: number
    pointsBudget?: number | null
    picks: RosterPick[]
    waivedRules: FormatRuleId[]
    optionalRules?: OptionalRuleId[]
    borrowedDetachmentId?: string | null
    visibility: RosterVisibility
    source: RosterSource
    /** When the server wrote this copy; a list nobody has saved has none. */
    updatedAt?: number
    archived?: boolean
  }
  initialFaction?: RosterSetupFaction | null
  snapshotEdition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'> | null
  /**
   * A list as a battle froze it.
   *
   * The cards, the total and the detachments are the ones that were fielded rather
   * than whatever the catalogue says today, and the price is only asked for when a
   * unit is opened — a frozen list may be read on an instance that cannot price it
   * at all.
   */
  frozen?: FrozenRoster
  /** The owner's variant group this list belongs to, the base first. */
  variants?: readonly RosterVariant[]
  /** How this variant's saved row differs from its base's. */
  differences?: NamedRosterDifferences | null
  /** The readable roster this one was duplicated from. */
  copiedFrom?: { id: string; name: string; ownerId: string; ownerName: string } | null
  /** The friend lending this reader the roster, who can take it back or have it returned. */
  lentBy?: { id: string; name: string } | null
  editable?: boolean
  /** The owner's own lock: the list reads as it does to anyone else, while unlocking and copying stay on offer. */
  locked?: boolean
  print?: boolean
  /** A battle token may entitle a read-only viewer to resolve a private roster. */
  battle?: string
  /** Another player's list, which the standalone simulator can reopen, so Simulate defends with it there. */
  simulatorSource?: SimulatorRosterSource
  /** Resolve read-only details by saved id; false when the supplied picks are themselves the snapshot. */
  resolvePersistedRoster?: boolean
  /**
   * A visitor's list, which no account holds yet.
   *
   * Every draft goes to `onDraftChange` instead of the server, and saving it is
   * `onSave`'s: the one thing a visitor cannot do here is keep the list.
   */
  guest?: {
    onDraftChange: (draft: RosterDraft) => boolean
    onReviewedChange: (draft: RosterDraft, source: RosterDraft) => boolean
    onSave: () => void
  }
  /** A datasheet a reference page asked to add, once this roster's limits say whether it can. */
  requested?: { entryId: string; onSettled: () => void }
}

export type FrozenRoster = {
  units: BuiltRoster['units']
  points: number
  detachments: readonly { id?: string; name: string; points?: number | null }[]
}

const READ_ONLY_PREFERENCE = 'praetorium.roster-read-only'
const NO_VARIANTS: readonly RosterVariant[] = []

/**
 * Building a list from the catalogue rather than pasting one.
 *
 * Three panes: the book on the left, the roster in the middle, the selected unit's
 * loadout on the right. On a phone the roster is the whole screen and the other two
 * arrive as sheets, because the roster is the thing being read and the other two are
 * things being done to it.
 *
 * The price and the legality both come from the server, because the catalogue is
 * 90MB and the browser has no business holding it.
 */
export function ListBuilder({
  prep,
  initial,
  initialFaction,
  snapshotEdition,
  frozen,
  variants = NO_VARIANTS,
  differences = null,
  copiedFrom = null,
  lentBy = null,
  editable = true,
  locked = false,
  print = false,
  battle,
  simulatorSource,
  resolvePersistedRoster = true,
  guest,
  requested,
}: Props) {
  const navigate = useNavigate()
  const path = useRouterState({ select: (state) => state.location.href.split('#', 1)[0] ?? state.location.pathname })
  const { data: me } = useQuery(meQuery())
  const { data: factionIndex } = useQuery(factionIndexQuery())
  const { picks, setPicks, resetPicks, positioned, annotated, held, allocateKey } = usePicks(initial.picks)
  // Typing a name changes nothing that is priced, so it is held apart from the rest of the setup.
  const [{ name: openedName, ...openedSetup }] = useState(() => rosterSetupOf(initial))
  const [name, setName] = useState(openedName)
  const [setup, setSetup] = useState(openedSetup)
  const { catalogueId, detachmentIds, disposition, limit, pointsBudget, waivedRules, visibility } = setup
  const adoptSetup = ({ name: nextName, ...next }: RosterSetup) => {
    setName(nextName)
    setSetup(next)
  }
  const [savedPrep, setSavedPrep] = useState(prep)
  const previewLimitId = useId()
  const abilityAlerts = useAbilityReminders(Boolean(guest))
  const [combatRoster, setCombatRoster] = useState<CombatRoster | null>(null)
  const [compareTargets, setCompareTargets] = useState(false)
  const [reference, setReference] = useState<{ entryId: string; route: Datasheet['referenceRoute'] | undefined } | null>(null)
  const [lending, setLending] = useState(false)
  const [grading, setGrading] = useState(false)
  const startBattle = useNewBattle()
  const [deleting, setDeleting] = useState(false)
  const [printInput, setPrintInput] = useState<RosterPrintInput | null>(null)
  const automaticPrint = useRef(false)
  // A frozen list has no saved row to be keyed by, so it is keyed by where it is read.
  const workspacePath = initial.id ? `/rosters/${initial.id}` : path
  const {
    selected,
    setSelected,
    preview,
    setPreview,
    showing,
    setShowing,
    wideWorkspace,
    workspaceMeasured,
    paneHistory,
    closePane,
    openPicker,
    updateLoadoutHistory,
  } = useRosterPanes({ path, workspacePath, picks })
  const [dismissedWaivers, dismissWaivers] = useWorkspaceState<string>(workspacePath, WAIVERS_STATE)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilters, setPickerFilters] = useState<Set<PickerFilter>>(new Set())
  const factionRead = useQuery({
    ...factionQuery(catalogueId),
    enabled: Boolean(catalogueId) && initialFaction?.id !== catalogueId,
  })
  const { isLoading: factionLoading } = factionRead
  const faction = factionRead.data ?? (initialFaction?.id === catalogueId ? initialFaction : null)
  const detachmentRules = useDetachmentRules(catalogueId, faction?.detachments, detachmentIds)
  const currentRules = currentRulesFor(catalogueId, factionIndex?.factions ?? [])
  // View mode simplifies the owner's roster cards and loadouts without taking away
  // their unit picker. Other readers still get the roster without builder controls.
  // Storage holds the only copy of the choice, so a roster opens in the mode last chosen.
  const viewPreferred = useStoredValue(READ_ONLY_PREFERENCE) === 'true'
  const building = editable && !viewPreferred
  const keptArrangement = useMatch({ from: '/rosters/$id/', shouldThrow: false })?.loaderData?.arrangement
  const [arrangement, setArrangement] = useState(keptArrangement ?? 'attached')
  const frozenReference = Boolean(frozen) || (!editable && !resolvePersistedRoster)
  const pickerOpen = editable && (wideWorkspace || showing === 'picker')
  const pickerEnabled = workspaceMeasured && pickerOpen

  const savedId = initial.id

  const setReadOnlyMode = (next: boolean) => {
    writeStoredValue(READ_ONLY_PREFERENCE, String(next))
    // Viewing is reading the list as anybody else would, and the picker is not part of that.
    if (next && showing === 'picker') closePane()
  }
  const toggleWaivedRule = useCallback(
    (rule: FormatRuleId) => setSetup((current) => ({ ...current, waivedRules: withMember(current.waivedRules, rule) })),
    [],
  )
  const togglePickerFilter = useCallback((filter: PickerFilter) => setPickerFilters((current) => toggled(current, filter)), [])

  const listName = name.trim()
  const { draft, storedPrep, save, saving, applied, markSaved } = useRosterAutosave({
    initial,
    prep,
    name,
    setup,
    savedPrep,
    annotated,
    editable,
    guest,
    remindersPending: abilityAlerts.pending,
    reload: () => {
      resetPicks(initial.picks)
      adoptSetup(rosterSetupOf(initial))
      setSavedPrep(prep)
    },
  })

  const account = useAccountPrompt()
  const variantDisposition = factionDisposition(faction, disposition)

  const price = useRosterPrice({ setup, picks, positioned, editable, frozen: Boolean(frozen), selected, setPicks })
  const { priced, units, pricePending, priceLoading, priceFailed, retryPrice, unitLimits, limitUnlocks, evaluatedPicks } = price
  // Keep the saved automatic name visible while an edit is being priced.
  const storedAutomaticName = initial.automaticName ? initial.name : ''
  const label = pricePending ? storedAutomaticName || priced?.label || '' : priced?.label || storedAutomaticName
  const shownName = listName || label
  const preparePrint = useCallback(() => {
    if (!priced || pricePending || priceLoading) return
    setPrintInput({
      ...setup,
      name: shownName,
      url: savedId ? `${window.location.origin}${workspacePath}` : null,
      draft: Boolean(guest) || (editable && !applied()),
      picks: annotated,
      price: priced,
    })
  }, [annotated, applied, editable, guest, priceLoading, pricePending, priced, savedId, setup, shownName, workspacePath])
  // Until the faction loads, a list that is not frozen draws a placeholder instead of its cards.
  const printReady = print && (Boolean(frozen) || Boolean(faction && priced && !pricePending && !priceLoading))
  useEffect(() => {
    if (!printReady || frozenReference || automaticPrint.current) return
    automaticPrint.current = true
    preparePrint()
  }, [frozenReference, preparePrint, printReady])
  usePrintWhenReady(printReady && frozenReference)
  const actions = useRosterActions({
    savedId,
    battle,
    signedIn: Boolean(me),
    setup,
    setSetup,
    listName,
    shownName,
    points: priced?.points ?? null,
    picks,
    annotated,
    storedPrep,
    source: initial.source,
    workspacePath,
    editable,
    applied,
    saveDraft: () => save.mutateAsync(),
  })
  const { take, exchange, share, access, removeRoster } = actions
  const [sharing, setSharing] = useState(false)
  const origin = useOrigin()
  // An owner can change who opens a saved list, locked or not; a visitor is asked to sign up first.
  const ownsSaved = Boolean(savedId) && !battle && ((editable && !guest) || locked)
  const rosterShare: RosterShareChoices = {
    title: shownName || 'Roster',
    visibility,
    onVisibility: guest
      ? () => account.ask('share')
      : ownsSaved
        ? (next) => {
            if (next !== visibility) access.mutate(next)
          }
        : undefined,
    choosing: access.isPending ? access.variables : null,
    visibilityNote: guest ? 'Sign in to share it by link or publicly.' : undefined,
    visibilityError: access.isError ? access.error : undefined,
    link: savedId && !battle && origin ? `${origin}${workspacePath}` : null,
    onCopy: () => share.mutate(visibility === 'private'),
    copied: share.data ?? null,
    copying: share.isPending,
    copyProblem: share.isError ? `Could not share the link: ${errorMessage(share.error)}` : undefined,
    onExport: () => take.mutate(),
    exporting: take.isPending || !positioned.length,
    onExchange: () => exchange.mutate(),
    exchanging: exchange.isPending || !positioned.length,
    onPrint: frozenReference ? () => window.print() : preparePrint,
    printDisabled: !frozenReference && (!priced || pricePending || priceLoading),
  }
  const rosterLoading = !frozen && priceLoading && picks.length > 0
  const { edit, embarks, frozenEmbarks, drop, add, applyLoadout, duplicate, join, embark, requestRefusal } = useRosterEdits({
    picks,
    setPicks,
    annotated,
    held,
    allocateKey,
    catalogueId,
    price,
    frozen,
    building,
    editable,
    locked,
    requested,
    setSelected,
  })
  const priceLoadouts = useCallback((loadouts: readonly RosterPick[]) => setupPriceQuery(setup, loadouts), [setup])
  const inspect = useCallback(
    (previewCatalogueId: string, entryId: string, unitName: string) => {
      const nextPreview = { catalogueId: previewCatalogueId, entryId, name: unitName }
      setPreview(nextPreview)
      setSelected(null)
      setShowing('loadout')
      updateLoadoutHistory({ workspace: workspacePath, pane: 'loadout', preview: nextPreview })
    },
    [setPreview, setSelected, setShowing, updateLoadoutHistory, workspacePath],
  )
  const previewUnit = useCallback((entryId: string, unitName: string) => inspect(catalogueId, entryId, unitName), [catalogueId, inspect])
  // A preview reads as the list's next pick, so it shows what the detachment and the list would give it.
  // A full list has no room for one more, so its preview goes without.
  const previewPicks = useMemo(
    () =>
      preview && positioned.length < 100
        ? [
            ...positioned,
            preview.catalogueId === catalogueId
              ? { entryId: preview.entryId }
              : { entryId: preview.entryId, catalogueId: preview.catalogueId },
          ]
        : null,
    [catalogueId, positioned, preview],
  )
  const [savingLoadout, setSavingLoadout] = useState<{ index: number; whole: boolean } | null>(null)
  const openSaveLoadout = useCallback((index: number) => setSavingLoadout({ index, whole: false }), [setSavingLoadout])
  const openSaveAttachedUnit = useCallback((index: number) => setSavingLoadout({ index, whole: true }), [setSavingLoadout])
  const { ask: askAccount } = account
  const askForLoadoutAccount = useCallback(() => askAccount('loadout'), [askAccount])
  const selection = useRef({ picks, updateLoadoutHistory, workspacePath })
  useLayoutEffect(() => {
    selection.current = { picks, updateLoadoutHistory, workspacePath }
  }, [picks, updateLoadoutHistory, workspacePath])
  const detach = useCallback((index: number) => join(index, undefined), [join])
  const attach = useCallback(
    (index: number, direction: AttachDirection, choice: AttachChoice) => {
      const { picks: currentPicks } = selection.current
      const key = currentPicks[index]?.key
      if (key === undefined) return
      if (choice.kind === 'new') add(choice.entryId, direction === 'join' ? { joinedBy: key } : { joins: key })
      else if (direction === 'join') join(index, choice.key)
      else {
        const joiner = currentPicks.findIndex((pick) => pick.key === choice.key)
        join(joiner, key)
      }
    },
    [add, join],
  )
  const selectUnit = useCallback(
    (index: number) => {
      setPreview(null)
      setSelected(index)
      setShowing('loadout')
      const { picks: currentPicks, updateLoadoutHistory: updateHistory, workspacePath: currentWorkspace } = selection.current
      const selectedKey = currentPicks[index]?.key
      if (selectedKey !== undefined) updateHistory({ workspace: currentWorkspace, pane: 'loadout', selectedKey })
    },
    [setPreview, setSelected, setShowing],
  )
  const reminders = useReminderEditor({ abilityAlerts, editable, catalogueId, detachmentIds, positioned, units })
  const { data: attachCandidates } = useQuery({
    ...unitsQuery(catalogueId, limit, waivedRules, detachmentIds),
    enabled: building && workspaceMeasured && Boolean(catalogueId),
    placeholderData: keepPreviousData,
  })
  const budget = pointsBudget ?? limit
  const room = priced && enforces(waivedRules, 'points-limit') ? budget - priced.points : null
  const attachDiscovery = useMemo(
    () =>
      attachCandidates
        ? {
            candidates: attachCandidates.filter((unit) => shownKind(unit.nonMatchedPlay, pickerFilters)),
            held,
            limits: unitLimits,
            unlocks: limitUnlocks,
            room,
          }
        : null,
    [attachCandidates, pickerFilters, held, limitUnlocks, unitLimits, room],
  )
  const cardRelationships = useCardRelationships(picks, units, attachDiscovery, embarks)
  const { openSetup, convertSetup, setupDialog } = useRosterSetupEditor({
    workspacePath,
    editable,
    guest,
    savedId,
    setup,
    listName,
    label,
    faction,
    factions: factionIndex?.factions ?? [],
    hasUnits: Boolean(picks.length),
    draft,
    saving,
    markSaved,
    adopt: (saved, nextPicks, nextPrep) => {
      resetPicks(nextPicks)
      adoptSetup(saved)
      setSavedPrep(nextPrep)
    },
    onFactionChanged: () => setSelected(null),
  })

  // A frozen list carries everything its cards print, which is what lets an opponent
  // read it on an instance that has never loaded this catalogue.
  const army = frozen
    ? 'ready'
    : armyAvailability(
        catalogueId,
        { status: factionRead.status, faction },
        factionIndex?.factions.map((candidate) => candidate.id),
      )
  if (army === 'loading') return <RosterOutline />
  if (army !== 'ready')
    return (
      <ArmyUnavailable
        retired={army === 'replaced'}
        editable={editable}
        onChooseFaction={openSetup}
        onRetry={() => void factionRead.refetch()}
      >
        {setupDialog}
      </ArmyUnavailable>
    )

  const points = frozen ? frozen.points : (priced?.points ?? 0)
  const over = enforces(waivedRules, 'points-limit') && (frozen ? frozen.points > budget : Boolean(priced && priced.points > budget))
  const illegal = Boolean(priced && (priced.errors.length || priced.detachmentError || priced.dispositionError))
  const cards = rosterCards(frozen, units, picks)

  // The shelves draw a card per datasheet; the header says how many units the list
  // brings, which is the same fold the library and the battle count it by.
  const fieldedUnitCount = frozen ? attachedUnitCount(frozen.units) : attachedUnitCount(picks)
  const selectedUnit = selected === null ? null : (units[selected] ?? null)
  const frozenSelected = frozen && selected !== null ? (frozen.units[selected] ?? null) : null
  // Frozen selections are what a datasheet is applied to; a log written without them
  // leaves cards that say what was fielded and nothing to open behind them.
  const loadoutAvailable = !frozen || picks.length > 0
  // Frozen battle armies show what was recorded, never a fresh judgement of the list.
  const gradesAvailable = !frozen && !print
  const selectedPick = selected === null ? null : (picks[selected] ?? null)
  const selectedUnitLoading = selected !== null && !selectedUnit
  const evaluatedPick = selectedPick ? (evaluatedPicks.current.get(selectedPick.key) ?? null) : null
  const loadoutConstraintsPending = Boolean(
    selectedUnit && selectedPick?.models !== undefined && selectedPick.models !== selectedUnit.size.models,
  )
  const optimisticUnit =
    selectedUnit && selectedPick
      ? {
          ...selectedUnit,
          size: { ...selectedUnit.size, models: selectedPick.models ?? selectedUnit.size.models },
          // Pending counts build on the draft; the evaluated allocation wins once
          // it arrives because changing one group can rebalance another.
          choices: withDraftSpreadCounts(
            selectedUnit.choices.map((choice) => ({
              ...choice,
              chosen: Object.hasOwn(selectedPick.choices ?? {}, choice.key) ? (selectedPick.choices?.[choice.key] ?? '') : choice.chosen,
            })),
            pricePending ? changedDraftSpreadCounts(selectedPick.spreads, evaluatedPick?.spreads) : undefined,
          ),
          toggles: selectedUnit.toggles.map((toggle) => ({
            ...toggle,
            selected: Object.hasOwn(selectedPick.toggles ?? {}, toggle.key) ? Boolean(selectedPick.toggles?.[toggle.key]) : toggle.selected,
          })),
        }
      : selectedUnit
  const waivers = waivedFormatRules(limit, waivedRules, pointsBudget)
  /*
   * Dismissing says "I know", not "never tell me": the key is the set of waived
   * restrictions, so switching another one off says something the player has not
   * acknowledged yet and the warning comes back.
   */
  const waiverKey = waivers.map((rule) => rule.id).join(',')
  // A unit the data requires as Warlord holds the crown, so no other unit can claim it and it cannot be given up.
  const requiredWarlord = units.find((unit) =>
    unit.toggles.some((toggle) => toggle.name === 'Warlord' && toggle.required && toggle.selected),
  )
  const inspectedEntryId = preview?.entryId ?? optimisticUnit?.entryId ?? null
  const previewLimitMessage =
    preview && !priceFailed ? unitLimitMessage(preview.entryId, held[preview.entryId] ?? 0, unitLimits, limitUnlocks) : null
  const previewOver = preview && building ? pointsOver(attachCandidates?.find((unit) => unit.id === preview.entryId)?.points, room) : null
  const referenceRoute = reference?.entryId === inspectedEntryId ? reference.route : undefined
  const limitFailure = priceFailed ? (
    <div role="alert" className="border-b border-edge px-3 py-2 text-xs text-discarded">
      Could not check unit limits.{' '}
      <Button variant="link" size="sm" onClick={() => void retryPrice()}>
        Retry
      </Button>
    </div>
  ) : null
  const picker = (
    <div className="flex h-full flex-col">
      {limitFailure}
      <div className="min-h-0 flex-1">
        <Picker
          enabled={pickerEnabled}
          catalogueId={catalogueId}
          detachmentIds={detachmentIds}
          onAdd={add}
          onApplyLoadout={applyLoadout}
          priceLoadouts={priceLoadouts}
          onPreview={previewUnit}
          inRoster={held}
          limits={unitLimits}
          limitUnlocks={limitUnlocks}
          room={room}
          battleSize={limit}
          pointsBudget={pointsBudget}
          waivedRules={waivedRules}
          onWaiveToggle={toggleWaivedRule}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          active={pickerFilters}
          onFilterToggle={togglePickerFilter}
        />
      </div>
    </div>
  )

  const loadoutCatalogueId = selected === null ? catalogueId : (picks[selected]?.catalogueId ?? catalogueId)
  const datasheetCatalogueId = preview?.catalogueId ?? loadoutCatalogueId
  const loadout = (
    <Loadout
      catalogueId={loadoutCatalogueId}
      unit={optimisticUnit}
      loading={selectedUnitLoading}
      detachmentIds={detachmentIds}
      picks={positioned}
      pickIndex={selected}
      onChoose={(key, optionId) => selected !== null && edit.choose(selected, key, optionId)}
      onSpread={(key, update) => selected !== null && edit.spread(selected, key, update)}
      editable={building}
      controlsDisabled={loadoutConstraintsPending}
      showOptions={building}
      persistedRoster={editable || !resolvePersistedRoster ? undefined : { id: savedId, ...(battle ? { battle } : {}) }}
      reminders={building && selected !== null ? reminders.controls : undefined}
      header={
        building && selected !== null && selectedPick ? (
          <UnitAnnotations
            nickname={selectedPick.nickname}
            note={selectedPick.note}
            onChange={(field, value) => edit.annotate(selected, field, value)}
          />
        ) : undefined
      }
      footer={optimisticUnit ? <UnitPhoto entryId={optimisticUnit.entryId} name={optimisticUnit.name} /> : undefined}
      reference={
        <DatasheetPanel
          catalogueId={datasheetCatalogueId}
          entryId={selectedUnit?.entryId ?? null}
          detachmentIds={detachmentIds}
          picks={positioned}
          pickIndex={selected}
          embedded
          onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
          onReferenceRoute={setReference}
          abilityReminders={building && selected !== null ? reminders.controls : undefined}
          detachmentRules={detachmentRules}
        />
      }
    />
  )
  const datasheet = (
    <DatasheetPanel
      catalogueId={datasheetCatalogueId}
      entryId={preview?.entryId ?? selectedUnit?.entryId ?? null}
      detachmentIds={detachmentIds}
      picks={previewPicks ?? positioned}
      pickIndex={preview ? (previewPicks ? positioned.length : null) : selected}
      onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
      onReferenceRoute={setReference}
      abilityReminders={building && !preview && selected !== null ? reminders.controls : undefined}
      detachmentRules={detachmentRules}
    />
  )

  if (printInput) return <RosterPrintPack input={printInput} onClose={() => setPrintInput(null)} />

  const startBattleButton = positioned.length ? (
    <Button
      size="sm"
      variant="outline"
      aria-label="Start a battle"
      disabled={saving || startBattle.isPending}
      onClick={guest ? () => account.ask('battle') : () => startBattle.mutate({ rosterId: savedId ?? undefined })}
    >
      <Swords /> <span className="sm:hidden">Battle</span>
      <span className="max-sm:hidden">Start a battle</span>
    </Button>
  ) : null
  const variantMenu = savedId ? (
    <RosterVariantMenu
      current={savedId}
      variants={variants}
      differences={differences}
      setup={{
        factionName: faction?.displayName,
        detachmentName: (id) => faction?.detachments.find((entry) => entry.id === id)?.name,
        disposition: variantDisposition ? { id: variantDisposition.id, name: variantDisposition.name } : null,
      }}
      disabled={saving}
    />
  ) : null

  const openCombat = (pickIndex: number, compare: boolean) => {
    if (simulatorSource && !compare) {
      const host = attachmentHost(positioned, pickIndex)
      const { attachedTo: _attachedTo, note: _note, ...pick } = positioned[host]!
      void navigate({ to: '/simulator', search: { s: rosterMatchup(catalogueId, pick, simulatorSource, host) } })
      return
    }
    setCompareTargets(compare)
    setCombatRoster({
      ...setup,
      picks: positioned,
      pickIndex,
      ...(savedId ? { saved: { source: { id: savedId }, name: shownName || 'Roster' } } : {}),
    })
  }

  return (
    <RosterShell saving={saving} saveError={save.isError}>
      <RosterHeader
        name={name}
        nameId="listname"
        onNameChange={editable ? (event) => setName(event.target.value) : undefined}
        maxLength={ROSTER_NAME_MAX_LENGTH}
        placeholder={label || 'Named from what is in it'}
        faction={faction}
        edition={snapshotEdition}
        factionLoading={factionLoading}
        limit={limit}
        pointsBudget={pointsBudget}
        unitCount={fieldedUnitCount}
        modelCount={
          frozen
            ? frozen.units.reduce((count, unit) => count + unit.models, 0)
            : priced
              ? units.reduce((count, unit) => count + unit.size.models, 0)
              : undefined
        }
        detachments={
          frozen
            ? frozen.detachments
            : detachmentIds.flatMap((id) => {
                const detachment = faction?.detachments.find((candidate) => candidate.id === id)
                return detachment ? [{ id, name: detachment.name }] : []
              })
        }
        disposition={frozen ? disposition : priced?.disposition}
        waivers={waivers}
        actions={
          <RosterActionsMenu
            editable={editable}
            locked={locked}
            guest={Boolean(guest)}
            signedIn={Boolean(me)}
            savedId={savedId}
            saving={saving}
            building={building}
            hasUnits={positioned.length > 0}
            frozen={Boolean(frozen)}
            pricing={pricePending || priceLoading}
            gradesAvailable={gradesAvailable}
            hasAttachedUnits={cards.some((card) => card.attachedTo !== undefined)}
            arrangement={arrangement}
            setArrangement={setArrangement}
            ownsSaved={ownsSaved}
            archived={initial.archived}
            visibility={visibility}
            variantCount={variants.length}
            actions={actions}
            startBattle={startBattleButton}
            variantMenu={variantMenu}
            onAsk={account.ask}
            onSetup={openSetup}
            onShare={() => setSharing(true)}
            onLend={() => setLending(true)}
            onGrade={() => setGrading(true)}
            onDelete={() => setDeleting(true)}
            onTestTargets={() => openCombat(0, true)}
            onReadOnlyMode={setReadOnlyMode}
          />
        }
      >
        <RosterHeaderNotices
          editable={editable}
          locked={locked}
          frozen={Boolean(frozen)}
          savedId={savedId}
          signedInAs={me?.id}
          actions={actions}
          requestRefusal={requestRefusal}
          copiedFrom={copiedFrom}
          lentBy={lentBy}
          edition={faction?.edition}
          currentRules={currentRules ? rulesVersionDetails(currentRules).name : null}
          onSetup={openSetup}
          onConvert={editable ? convertSetup : undefined}
          detachmentError={priced?.detachmentError}
          dispositionError={priced?.dispositionError}
        />

        {setupDialog}
      </RosterHeader>

      <div className="hidden px-3 py-2 text-xs print:block">
        <p>
          {guest ? 'Draft on this device' : 'Roster'} · {points}/{budget} points
        </p>
        {!frozen && illegal ? <p>Resolve roster validation messages before playing this roster.</p> : null}
        {!frozen && over ? <p>Over the points limit.</p> : null}
        {!frozen && priced?.unhandled.length ? <p>Some restrictions could not be checked. Read the source rules before playing.</p> : null}
        {waivedRules.length ? <p>Some construction rules are waived; check the roster setup.</p> : null}
      </div>

      <RosterBody threeColumn={editable}>
        {editable ? (
          <div className="contents roster-wide:flex roster-wide:min-h-0 roster-wide:min-w-0">
            <Pane
              variant="picker"
              open={pickerOpen}
              drawer={!wideWorkspace}
              title="Add units"
              onClose={closePane}
              actions={
                selectedUnit ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setPreview(null)
                      setShowing('loadout')
                      if (selected !== null && picks[selected]) {
                        updateLoadoutHistory({ workspace: workspacePath, pane: 'loadout', selectedKey: picks[selected].key })
                      }
                    }}
                  >
                    <SlidersHorizontal /> Loadout
                  </Button>
                ) : null
              }
            >
              {pickerOpen ? picker : null}
            </Pane>
          </div>
        ) : null}

        <RosterUnitShelves
          cards={cards}
          arrangement={arrangement}
          frozen={frozen}
          frozenEmbarks={frozenEmbarks}
          picks={picks}
          units={units}
          catalogueId={catalogueId}
          factions={factionIndex?.factions}
          relationships={cardRelationships}
          selected={selected}
          loadoutAvailable={loadoutAvailable}
          editable={editable}
          building={building}
          loading={rosterLoading}
          showReadiness={Boolean(me && !frozen && !guest && !print)}
          reminderCounts={reminders.countsByUnit}
          pricePending={pricePending}
          held={held}
          unitLimits={unitLimits}
          limitUnlocks={limitUnlocks}
          onSelect={selectUnit}
          onRemove={drop}
          onDuplicate={duplicate}
          onSaveLoadout={pricePending ? undefined : guest ? askForLoadoutAccount : me ? openSaveLoadout : undefined}
          onSaveAttachedUnit={pricePending ? undefined : guest ? askForLoadoutAccount : me ? openSaveAttachedUnit : undefined}
          onDetach={detach}
          onAttach={attach}
          onEmbark={embark}
          onChooseUnit={openPicker}
        />

        {loadoutAvailable ? (
          <Pane
            variant="loadout"
            open={showing === 'loadout' && Boolean(selected !== null || preview)}
            threeColumn={editable}
            title={preview?.name ?? frozenSelected?.name ?? selectedUnit?.name ?? 'Unit'}
            ariaLabel={preview ? 'Datasheet' : 'Loadout'}
            backLabel={paneHistory?.pane === 'loadout' && paneHistory.returnToPicker ? 'Back to units' : undefined}
            onClose={closePane}
            actions={
              <LoadoutPaneActions
                preview={preview}
                building={building}
                frozen={Boolean(frozen)}
                canAdd={preview !== null && canAddCopy(preview.entryId, held[preview.entryId] ?? 0, unitLimits)}
                limitMessageId={previewLimitMessage ? previewLimitId : undefined}
                onAdd={add}
                unit={optimisticUnit}
                frozenUnit={frozenSelected}
                selected={selected}
                requiredWarlord={requiredWarlord}
                edit={edit}
                combatDisabled={!selectedUnit || pricePending || priceLoading}
                onCombat={(pickIndex) => openCombat(pickIndex, false)}
                showReference={Boolean(inspectedEntryId)}
                referenceRoute={referenceRoute}
              />
            }
          >
            {preview ? (
              <>
                {limitFailure}
                {previewLimitMessage ? (
                  <output id={previewLimitId} className="block border-b border-edge px-3 py-2 text-xs text-discarded">
                    {previewLimitMessage}
                  </output>
                ) : null}
                {previewOver !== null ? (
                  <output className="block border-b border-edge px-3 py-2 text-xs text-discarded">
                    {previewOver} pts over the points limit.
                  </output>
                ) : null}
                {datasheet}
              </>
            ) : (
              loadout
            )}
          </Pane>
        ) : null}
      </RosterBody>

      <RosterBuilderFooter
        loading={rosterLoading}
        over={over}
        illegal={illegal}
        points={points}
        limit={budget}
        hasUnits={Boolean(cards.length)}
        editable={editable}
        onAddUnits={openPicker}
        saveFailed={save.isError}
        saving={save.isPending}
        onRetrySave={() => save.mutate()}
        // Saving is only ever asked for here: the draft already follows every edit, and
        // this hands over the one the screen shows rather than the last settled one.
        onSave={
          guest
            ? () => {
                if (!guest.onDraftChange(draft)) return
                posthog.capture('guest_roster_save_started', { unit_count: attachedUnitCount(picks) })
                guest.onSave()
              }
            : undefined
        }
        errors={priced?.errors ?? []}
        onResetOptions={pricePending ? undefined : edit.resetUnavailable}
        unhandled={priced?.unhandled ?? []}
        frozen={Boolean(frozen)}
        waivers={waivers}
        waiversDismissed={dismissedWaivers === waiverKey}
        onDismissWaivers={() => dismissWaivers(waiverKey)}
        sealedEventWarning={
          (editable || locked) && savedId && me ? (
            <>
              <OutdatedSealedEventRosters rosterId={savedId} saved={!save.isPending && applied()} />
              <DueSealedEventRosters limit={limit} pointsBudget={pointsBudget} saved={!save.isPending && applied()} />
            </>
          ) : null
        }
      />
      <RosterShareDialog open={sharing} onClose={() => setSharing(false)} {...rosterShare} />
      <RosterExportDialog exported={actions.exportText} onClose={actions.closeExport} />
      <RosterExchangeDialog exchange={actions.exchangeCode} onClose={actions.closeExchange} />
      {gradesAvailable ? (
        <RosterGradesDialog open={grading} onClose={() => setGrading(false)} name={listName} setup={setup} picks={positioned} />
      ) : null}
      {account.prompt}
      {savedId && (editable || locked) && !guest ? (
        <>
          <RosterLoanDialog rosterId={savedId} open={lending} onClose={() => setLending(false)} />
        </>
      ) : null}
      {ownsSaved ? (
        <ConfirmDialog
          open={deleting}
          title={`Delete ${shownName || 'this roster'}?`}
          description="This removes the saved roster for good. Frozen copies in battles and tournaments are kept."
          cancel="Keep roster"
          confirm="Delete roster"
          pendingLabel="Deleting…"
          destructive
          pending={removeRoster.isPending}
          error={removeRoster.error}
          onClose={() => setDeleting(false)}
          onConfirm={() => removeRoster.mutate()}
        />
      ) : null}
      {savingLoadout !== null && picks[savingLoadout.index] ? (
        <SaveLoadoutDialog
          picks={picks}
          units={units}
          index={savingLoadout.index}
          whole={savingLoadout.whole}
          catalogueId={catalogueId}
          onClose={() => setSavingLoadout(null)}
        />
      ) : null}
      {combatRoster ? (
        <RosterCombatDialog roster={combatRoster} startWithRosters={compareTargets} onClose={() => setCombatRoster(null)} />
      ) : null}
      {reminders.dialog}
    </RosterShell>
  )
}
