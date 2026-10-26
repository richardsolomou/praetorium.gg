import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadedWords } from '../../sourceText'
import { Link, useMatch, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Calculator,
  Copy,
  Crown,
  HandHelping,
  Download,
  EllipsisVertical,
  GitBranchPlus,
  Group,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Printer,
  QrCode,
  SlidersHorizontal,
  Swords,
  TriangleAlert,
} from 'lucide-react'
import { posthog } from 'posthog-js'
import { toast } from 'sonner'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MENU_ITEM, MenuSection } from '../../components/MenuSection'
import { attachedUnitCount, attachmentHost } from '../../../core/attachedUnits'
import { type AttachmentRow, joiningKind } from '../../../core/attachmentRows'
import type { BuiltRoster, FormatRuleId, Secondary, Stratagem } from '../../../core/battle'
import { canTransport, enforces, type OptionalRuleId, ROSTER_NAME_MAX_LENGTH, waivedFormatRules } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { joinedUnits } from '../../../core/unitLoadouts'
import { frozenUnits } from '../../../core/rosterSnapshot'
import {
  armyReminder,
  fieldedReminders,
  reminderKey,
  reminderTimingCountsByUnit,
  suggestReminderTimings,
  suggestReminderWhileDestroyed,
  type ReminderSubject,
} from '../../../core/reminders'
import { useAbilityReminders } from './useAbilityReminders'
import type { RosterSource, RosterVisibility } from '../../../core/savedRoster'
import { modelCountChoices } from '../../../core/unitSize'
import type { Datasheet } from '../../../contracts/catalogue'
import { rosterMatchup, type SimulatorRosterSource } from '../../../contracts/simulatorState'
import { copyRoster, endRosterLoan, exportRoster, saveRoster, setRosterLocked } from '../../functions'
import { shareLink, useNativeShare } from '../../nativeBridge'
import {
  factionIndexQuery,
  factionQuery,
  invalidateSavedRosters,
  meQuery,
  playerDefaultsQuery,
  reminderAbilitiesQuery,
  rostersLentToMeQuery,
  setupPriceQuery,
  unitBattleDetailsQuery,
  unitsQuery,
} from '../../queries'
import { errorMessage } from '../../queryClient'
import type { RosterSetupReview } from './rosterSetupReview'
import { requireReviewedRoster } from '../../offline/reviewedRoster'
import { localEngine } from '../../offline/localRuntime'
import { useSettled } from '../../useSettled'
import { readStoredValue, writeStoredValue } from '../../storedValue'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { Loadout } from './builder/Loadout'
import { Stepper } from '../../components/Stepper'
import { changedDraftSpreadCounts, withDraftSpreadCounts } from './builder/loadoutModel'
import { Picker, type PickerFilter } from './builder/Picker'
import { shownKind } from './builder/pickerRows'
import { SaveLoadoutDialog } from './builder/SaveLoadoutDialog'
import { Section } from './builder/Section'
import { AttachedUnitBlock } from './builder/AttachedUnitBlock'
import { rosterShelves, unitRoleRows } from './builder/shelves'
import { keepRosterArrangement } from './rosterArrangement'
import { Pane } from './builder/Pane'
import { useRosterPanes } from './builder/useRosterPanes'
import { UnitCard } from './builder/UnitCard'
import { UnitAnnotations } from './builder/UnitAnnotations'
import { cardEmbark, editedPicks, embarkCards, embarkRows, NO_EMBARK, putBacks } from './builder/embarkModel'
import { UnitPhoto } from './builder/UnitPhoto'
import { useDetachmentRules } from './builder/useDetachmentRules'
import { samePriceContext, survivingUnits } from './builder/pricePlaceholder'
import {
  type AttachLink,
  batchFits,
  canAddCopy,
  heldWith,
  settledWarlord,
  unitLimitMessage,
  pickEditor,
  requestedUnit,
  usePicks,
} from './builder/usePicks'
import { RosterSetupDialog, type RosterSetup, type RosterSetupFaction } from './RosterSetupDialog'
import { RosterExportDialog, type RosterTextExport } from './RosterExportDialog'
import { RosterExchangeDialog, type RosterExchangeCode } from './RosterExchangeDialog'
import { RosterLoanDialog } from './RosterLoanDialog'
import { encodeRosterExchange } from '../../../core/rosterExchange'
import { RosterBody, RosterHeader, RosterOutline, RosterShell, RosterUnits } from './RosterPresentation'
import { saveFailureReason } from './saveFailure'
import { advanceOnboarding } from '../onboarding/onboarding'
import { SETUP_STATE, useWorkspaceState, WAIVERS_STATE } from './workspaceState'
import { FullDatasheetLink, FullDatasheetLinkLoading } from './FullDatasheetLink'
import { type AttachDirection, AttachedUnitActions, BuilderUnitCard, useCardRelationships } from './RosterUnitCard'
import type { AttachChoice } from './builder/UnitCard'
import { RosterDataChanges } from './RosterDataChanges'
import { RosterRulesNotice } from './RosterRulesNotice'
import { RosterReadiness } from './RosterReadiness'
import { convertAsVariantOf } from './rosterLibrary'
import { currentRulesFor } from '../../../core/currentRules'
import { OutdatedLeagueRosters } from './OutdatedLeagueRosters'
import { DueLeagueRosters } from './DueLeagueRosters'
import { draftKey, exportInput, NO_PREP, type RosterDraft, rosterDraftOf, rosterSetupOf, savedDraft } from './rosterDraft'
import { RosterBuilderFooter } from './RosterBuilderFooter'
import { type RosterVariant, RosterVariantMenu } from './RosterVariantMenu'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { type CatalogueEdition, rulesVersionDetails } from '../../../core/catalogueEdition'
import { currentCatalogueFamilyId, currentEntryId } from '../../../core/retiredCatalogueIds'
import { armyAvailability } from './armyAvailability'
import { ReminderEditorDialog, type ReminderDraft } from './ReminderEditorDialog'
import { RosterCombatDialog } from '../simulator/RosterCombatDialog'
import { RosterPrintPack, type RosterPrintInput } from './RosterPrintPack'
import type { CombatRoster } from '../simulator/useCombatant'
import { countLabel } from '../../text'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAccountPrompt } from './AccountPrompt'
import { CreateBattle } from '../battles/CreateBattle'
import { guestDraftOf, peekGuestDraft, writeGuestDraft } from './guestDraft'
import { withMember } from '../../../core/collections'
import { usePrintWhenReady } from './usePrintWhenReady'
import { hasWarlordToggle } from '../../../core/unitChoices'
import { factionDisposition } from '../../components/rosterSetup'
import { PointsChip } from './builder/PointsChip'
import { remember } from '../../../core/collections'

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
const NO_UNITS = [] as const
const NO_VARIANTS: readonly RosterVariant[] = []
const NO_JOINED: { label: string; name: string }[] = []
const NO_CHOICES: AttachChoice[] = []
const NO_ROWS: AttachmentRow[] = []
/** Kept per relationships' rows, so a card whose relationships are unchanged gets the same rows and does not redraw. */
const ROLE_ROWS = new WeakMap<readonly AttachmentRow[], AttachmentRow[]>()
const roleRowsOf = (joined: readonly AttachmentRow[]) => remember(ROLE_ROWS, joined, () => unitRoleRows(joined))

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
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null)
  const abilityAlerts = useAbilityReminders(Boolean(guest))
  const resetAbilityAlert = abilityAlerts.reset
  const [combatRoster, setCombatRoster] = useState<CombatRoster | null>(null)
  const [compareTargets, setCompareTargets] = useState(false)
  const [reference, setReference] = useState<{ entryId: string; route: Datasheet['referenceRoute'] | undefined } | null>(null)
  const [readOnly, setReadOnly] = useState(!editable)
  const [exportText, setExportText] = useState<RosterTextExport | null>(null)
  const [exchangeCode, setExchangeCode] = useState<RosterExchangeCode | null>(null)
  const [lending, setLending] = useState(false)
  const [returning, setReturning] = useState(false)
  const [startingBattle, setStartingBattle] = useState(false)
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
  const [setupDraft, setSetupDraft] = useWorkspaceState<RosterSetup>(workspacePath, SETUP_STATE)
  const [setupMode, setSetupMode] = useState<'edit' | 'convert'>('edit')
  const [dismissedWaivers, dismissWaivers] = useWorkspaceState<string>(workspacePath, WAIVERS_STATE)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilters, setPickerFilters] = useState<Set<PickerFilter>>(new Set())
  const editingSetup = setupDraft !== null
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
  const building = editable && !readOnly
  const keptArrangement = useMatch({ from: '/rosters/$id/', shouldThrow: false })?.loaderData?.arrangement
  const [arrangement, setArrangement] = useState(keptArrangement ?? 'attached')
  const frozenReference = Boolean(frozen) || (!editable && !resolvePersistedRoster)
  const pickerOpen = editable && (wideWorkspace || showing === 'picker')
  const pickerEnabled = workspaceMeasured && pickerOpen

  const savedId = initial.id
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!editable) return
    setReadOnly(readStoredValue(READ_ONLY_PREFERENCE) === 'true')
  }, [editable])

  const setReadOnlyMode = (next: boolean) => {
    setReadOnly(next)
    writeStoredValue(READ_ONLY_PREFERENCE, String(next))
    // Viewing is reading the list as anybody else would, and the picker is not part of that.
    if (next && showing === 'picker') closePane()
  }
  const toggleWaivedRule = useCallback(
    (rule: FormatRuleId) => setSetup((current) => ({ ...current, waivedRules: withMember(current.waivedRules, rule) })),
    [],
  )
  const togglePickerFilter = useCallback(
    (filter: PickerFilter) =>
      setPickerFilters((current) => {
        const next = new Set(current)
        if (!next.delete(filter)) next.add(filter)
        return next
      }),
    [],
  )

  const listName = name.trim()
  const storedPrep = useMemo(
    () => ({ stratagems: savedPrep.stratagems, secondaries: savedPrep.secondaries, remindersEnabled: true }),
    [savedPrep],
  )
  const draft = rosterDraftOf({ ...setup, name }, { id: savedId || undefined, picks: annotated, prep: storedPrep, source: initial.source })
  const currentDraftKey = draftKey(draft)
  // The last draft sent, starting from the row the list was opened from. A list nobody
  // has saved yet has no row, so its first draft is always sent.
  const [openedAs] = useState(() => (savedId ? draftKey(savedDraft(initial, prep)) : null))
  const lastSaved = useRef(openedAs)
  const lastApplied = useRef(openedAs)
  // A refetch can settle this save while the page still holds the copy from before it,
  // so a copy is only adopted if the server wrote it at or after the newest save.
  const savedAt = useRef(initial.updatedAt ?? 0)
  const save = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: async () => {
      const { updatedAt } = await saveRoster({ data: draft })
      return { key: currentDraftKey, updatedAt }
    },
    onSuccess: async ({ key, updatedAt }) => {
      lastApplied.current = key
      savedAt.current = Math.max(savedAt.current, updatedAt)
      // A queued save reaches the server later; its acknowledgement refreshes saved rosters then.
      if (!localEngine()) await invalidateSavedRosters(queryClient)
    },
    // What the row holds is unknown after a failure, so the next draft is sent whatever it is.
    onError: (error) => {
      lastSaved.current = null
      posthog.capture('roster_save_failed', { reason: saveFailureReason(error) })
    },
  })

  // Held steppers and typed names change many times a second; the settled values
  // trigger one save per pause while the mutation still reads the newest draft.
  const settledPicks = useSettled(annotated)
  const settledListName = useSettled(listName)
  useEffect(() => {
    if (!savedId) return
    const incoming = draftKey(savedDraft(initial, prep))
    if (incoming === lastApplied.current || (initial.updatedAt ?? 0) < savedAt.current) return
    if (save.isPending || currentDraftKey !== lastSaved.current || settledListName !== listName || settledPicks !== annotated) return

    lastApplied.current = incoming
    lastSaved.current = incoming
    resetPicks(initial.picks)
    adoptSetup(rosterSetupOf(initial))
    setSavedPrep(prep)
  }, [annotated, currentDraftKey, initial, listName, prep, resetPicks, save.isPending, savedId, settledListName, settledPicks])
  const saveDraft = () => {
    if (!editable || !catalogueId) return
    if (currentDraftKey === lastSaved.current) return
    lastSaved.current = currentDraftKey
    if (guest) guest.onDraftChange(draft)
    else save.mutate()
  }
  // Leaving inside a settle pause would otherwise drop the last edit, and a seal right after would read the list without it.
  const saveDraftOnLeave = useRef(saveDraft)
  saveDraftOnLeave.current = saveDraft
  useEffect(() => () => saveDraftOnLeave.current(), [])
  useEffect(() => {
    saveDraft()
    // The mutation reads the complete rendered draft. A later render queues behind
    // this one, so the final request always contains the newest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, settledListName, settledPicks, setup, storedPrep])

  const take = useMutation({
    mutationFn: () =>
      exportRoster({
        data: exportInput({ ...setup, picks: annotated }, shownName || 'Roster'),
      }),
    onSuccess: (exported) => setExportText(exported),
  })

  const exchange = useMutation({
    mutationFn: async () => {
      const exchangeName = shownName || 'Roster'
      const code = await encodeRosterExchange({ ...setup, name: exchangeName, points: priced?.points ?? null, picks: annotated })
      return { name: exchangeName, code }
    },
    onSuccess: (code) => setExchangeCode(code),
  })

  const returnLoan = useMutation({
    mutationFn: () => endRosterLoan({ data: { id: savedId, borrowerId: me!.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rostersLentToMeQuery().queryKey })
      await navigate({ to: '/rosters' })
    },
  })

  const account = useAccountPrompt()
  // A saved list is copied on the server, which records where the copy came from; a fielded army is copied as shown,
  // and a visitor's copy becomes the one list their device keeps.
  const duplicateRoster = useMutation({
    mutationFn: async () => {
      if (savedId && !battle && me) return copyRoster({ data: { id: savedId, variant: false } })
      const copy = {
        ...setup,
        name: listName ? `Copy of ${listName}`.slice(0, ROSTER_NAME_MAX_LENGTH) : '',
        picks: annotated,
        prep: storedPrep,
        source: initial.source,
      }
      if (me)
        return saveRoster({
          data: { ...copy, visibility: (await queryClient.query({ ...playerDefaultsQuery(), staleTime: 'static' })).rosterVisibility },
        })
      const kept = guestDraftOf({ ...copy, visibility: 'private' })
      if (!writeGuestDraft(kept)) throw new Error('This browser is not keeping lists.')
      return { id: kept.id }
    },
    onSuccess: async ({ id }) => {
      posthog.capture('roster_duplicated', { unit_count: attachedUnitCount(picks), shared: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  // Queued behind the autosave, so the variant copies the row the page last sent.
  const createVariant = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (id: string) => copyRoster({ data: { id, variant: true } }),
    onSuccess: async ({ id }) => {
      posthog.capture('roster_duplicated', { unit_count: attachedUnitCount(picks), variant: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })
  // Queued behind the autosave, so a lock never lands between an edit and its save.
  const lockRoster = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (next: boolean) => setRosterLocked({ data: { id: savedId, locked: next } }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })
  // Between an edit settling and its save starting, nothing is pending yet, so an
  // unconfirmed draft counts as saving too; otherwise the page reads saved for a render.
  const saving =
    !guest &&
    (save.isPending ||
      abilityAlerts.pending ||
      settledPicks !== annotated ||
      settledListName !== listName ||
      (editable && currentDraftKey !== lastApplied.current))
  const variantDisposition = factionDisposition(faction, disposition)

  const priceRequest = setupPriceQuery(setup, positioned, editable)
  const {
    data: priced,
    dataUpdatedAt: pricedAt,
    isPlaceholderData: pricePending,
    isPending: priceLoading,
    isError: priceFailed,
    refetch: retryPrice,
  } = useQuery({
    ...priceRequest,
    // A frozen list already carries its cards and its total; the price is only the
    // applied datasheet behind a unit somebody opened.
    enabled: Boolean(catalogueId) && (!frozen || selected !== null),
    /**
     * The last answer, with whatever the list has since let go of taken out of it.
     *
     * The total stays as it was until the new one lands, the same way an added unit
     * is not counted until then: a number one request behind corrects itself, and a
     * number this page worked out for itself could be wrong in ways it cannot know.
     */
    placeholderData: (previous, previousQuery) => {
      if (!previous || !samePriceContext(previousQuery?.queryKey, priceRequest.queryKey)) return undefined
      const kept = survivingUnits(previousQuery?.queryKey.at(-1), picks)
      if (!kept) return undefined
      if (kept.length === previous.units.length && kept.every((at, index) => at === index)) return previous
      const units = []
      for (const at of kept) {
        const unit = previous.units[at]
        if (!unit) break
        units.push(unit)
      }
      return { ...previous, units }
    },
  })
  const evaluatedPicks = useRef(new Map(picks.map((pick) => [pick.key, pick])))
  const evaluatedAt = useRef(0)
  useLayoutEffect(() => {
    if (!priced || pricePending || pricedAt <= evaluatedAt.current) return
    const regrouped = picks.length !== evaluatedPicks.current.size || picks.some((pick) => !evaluatedPicks.current.has(pick.key))
    evaluatedAt.current = pricedAt
    evaluatedPicks.current = new Map(picks.map((pick) => [pick.key, pick]))
    const warlord = editable ? settledWarlord(picks, priced.units, regrouped) : null
    if (warlord)
      setPicks((current) =>
        current.map((pick, at) => {
          const toggle = priced.units[at]?.toggles.find((candidate) => candidate.name === 'Warlord')
          return toggle ? { ...pick, toggles: { ...pick.toggles, [toggle.key]: at === warlord.index ? 1 : 0 } } : pick
        }),
      )
  }, [editable, picks, pricePending, priced, pricedAt, setPicks])

  const unitLimits = useMemo(
    () => new Map(!priceFailed ? priced?.unitLimits?.map((unit) => [unit.id, unit.limit]) : []),
    [priceFailed, priced?.unitLimits],
  )
  const units = priced?.units ?? NO_UNITS
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
      draft: Boolean(guest) || (editable && currentDraftKey !== lastApplied.current),
      picks: annotated,
      price: priced,
    })
  }, [annotated, currentDraftKey, editable, guest, priceLoading, pricePending, priced, savedId, setup, shownName, workspacePath])
  // Until the faction loads, a list that is not frozen draws a placeholder instead of its cards.
  const printReady = print && (Boolean(frozen) || Boolean(faction && priced && !pricePending && !priceLoading))
  useEffect(() => {
    if (!printReady || frozenReference || automaticPrint.current) return
    automaticPrint.current = true
    preparePrint()
  }, [frozenReference, preparePrint, printReady])
  usePrintWhenReady(printReady && frozenReference)
  const share = useMutation({
    mutationFn: async () => {
      // The link opens the saved roster, so unsaved edits land before it is handed out.
      if (editable && currentDraftKey !== lastApplied.current) await save.mutateAsync()
      return shareLink(`${window.location.origin}${workspacePath}`, shownName || 'Roster')
    },
    onSuccess: () => posthog.capture('roster_shared', { visibility_changed: false }),
    onError: (error) => posthog.captureException(error, { operation: 'roster_share' }),
  })
  const { reset: resetShare } = share
  useEffect(() => {
    if (!share.isSuccess) return
    const timer = setTimeout(resetShare, 4000)
    return () => clearTimeout(timer)
  }, [resetShare, share.isSuccess])
  const nativeShare = useNativeShare()
  const shareItem = (
    <DropdownMenuItem className={MENU_ITEM} disabled={share.isPending} onClick={() => share.mutate()}>
      <Link2 /> {nativeShare ? 'Share link' : 'Copy link'}
    </DropdownMenuItem>
  )
  const rosterLoading = !frozen && priceLoading && picks.length > 0
  const edit = useMemo(
    () => pickEditor(setPicks, { catalogueId, units, limits: pricePending ? undefined : unitLimits }, allocateKey),
    [allocateKey, catalogueId, pricePending, setPicks, unitLimits, units],
  )
  const carried = units.some(canTransport)
  const { data: battleDetails, isPlaceholderData: battleDetailsPending } = useQuery({
    ...unitBattleDetailsQuery(
      catalogueId,
      picks.map((pick) => pick.entryId),
    ),
    enabled: !frozen && carried,
    placeholderData: keepPreviousData,
  })
  const embarksPending = pricePending || battleDetailsPending
  // The picks the last judgement described, so the next one knows which units the player has since changed.
  const judgedPicks = useRef(picks)
  // Judged only once the price and details describe these picks, so positions line up.
  const currentEmbarks = useMemo(
    () =>
      !frozen && priced && battleDetails && !embarksPending
        ? embarkCards(
            frozenUnits(annotated, priced.units, battleDetails),
            (at) => picks[priced.units[at]!.key]!.key,
            editedPicks(judgedPicks.current, picks),
          )
        : null,
    [annotated, battleDetails, embarksPending, frozen, picks, priced],
  )
  if (currentEmbarks) judgedPicks.current = picks
  // The last judgement stays on screen while an edit is priced; it names units by key, so a press still means the same units.
  const shownEmbarks = useRef(currentEmbarks)
  if (currentEmbarks) shownEmbarks.current = currentEmbarks
  const frozenEmbarks = useMemo(() => (frozen ? embarkCards(frozen.units).cards : null), [frozen])
  // An edit that leaves a unit unable to start in its transport, such as a larger squad, puts it back on the battlefield.
  // No details at all means the army data could not be read, which says nothing about what fits.
  const going = useMemo(
    () => (currentEmbarks && battleDetails?.length ? putBacks(currentEmbarks.dropped, picks) : []),
    [battleDetails?.length, currentEmbarks, picks],
  )
  useEffect(() => {
    if (!building || !going.length) return
    edit.disembark(going.map(({ pick }) => pick.key))
    // Keyed by unit, so an effect that runs twice shows one toast.
    for (const { name: unit, transport, pick } of going) {
      toast(`${unit} no longer fits in ${transport}, so it starts on the battlefield.`, { id: `put-back-${pick.key}`, duration: 3000 })
    }
  }, [building, edit, going])
  const judged = shownEmbarks.current
  const embarks = carried && judged ? judged.cards : null
  const editor = useRef(edit)
  /**
   * What an edit reports is the list it leaves behind, read once the edit has landed.
   * The size of a list is not the number of picks in it, so no edit is a reliable
   * step of one: duplicating an attached character adds a pick to a unit that was
   * already there, and dropping the unit it joined leaves it standing on its own.
   */
  const reporting = useRef<{
    event: 'roster_unit_added' | 'roster_unit_removed' | 'roster_unit_duplicated'
    reference?: 'datasheet' | 'loadout'
  } | null>(null)
  useLayoutEffect(() => {
    editor.current = edit
    const report = reporting.current
    if (!report) return
    reporting.current = null
    posthog.capture(report.event, { unit_count: attachedUnitCount(picks), ...(report.reference ? { reference: report.reference } : {}) })
    if (report.event === 'roster_unit_added') advanceOnboarding('roster', 'roster-add', 'roster-list')
  }, [edit, picks])
  const drop = useCallback(
    (index: number) => {
      editor.current.drop(index)
      reporting.current = { event: 'roster_unit_removed' }
      setSelected(null)
    },
    [setSelected],
  )
  const [requestRefusal, setRequestRefusal] = useState<string | null>(null)
  const [queuedAdds, setQueuedAdds] = useState<
    { entryId: string; context: readonly unknown[]; link?: AttachLink; loadout?: readonly RosterPick[] }[]
  >([])
  const queueAdd = (entryId: string, extra: { link?: AttachLink; loadout?: readonly RosterPick[] }) => {
    setRequestRefusal(null)
    setQueuedAdds((current) => {
      const queuedPicks = current.flatMap((entry) => entry.loadout ?? [entry])
      const adding = extra.loadout ?? [{ entryId }]
      if (picks.length + queuedPicks.length + adding.length > 100 || !batchFits(adding, held, unitLimits, queuedPicks)) return current
      return [...current, { entryId, context: priceRequest.queryKey, ...extra }]
    })
  }
  const add = (entryId: string, link?: AttachLink) => queueAdd(entryId, link ? { link } : {})
  const applyLoadout = (loadout: readonly RosterPick[]) => {
    if (loadout[0]) queueAdd(loadout[0].entryId, { loadout })
  }
  const priceLoadouts = useCallback((loadouts: readonly RosterPick[]) => setupPriceQuery(setup, loadouts), [setup])
  useEffect(() => {
    const next = queuedAdds[0]
    if (!next) return
    if (!editable) {
      setQueuedAdds([])
      return
    }
    if (pricePending || priceLoading || priceFailed) return
    setQueuedAdds((current) => current.slice(1))
    if (!samePriceContext(next.context, priceRequest.queryKey)) return
    const wanted = next.loadout ?? [{ entryId: next.entryId }]
    const outcome = wanted
      .map((pick, at) => requestedUnit(pick.entryId, heldWith(held, wanted, at), unitLimits))
      .find((answer) => answer.kind === 'refused')
    if (outcome?.kind === 'refused') {
      setRequestRefusal(outcome.message)
      return
    }
    if (next.loadout) editor.current.apply(next.loadout)
    else editor.current.add(next.entryId, next.link)
    reporting.current = { event: 'roster_unit_added', ...(next.loadout ? { reference: 'loadout' as const } : {}) }
    if (next.link) posthog.capture('roster_attachment_updated', { attached: true })
  }, [editable, held, priceFailed, priceLoading, pricePending, priceRequest.queryKey, queuedAdds, unitLimits])
  const requestHandled = useRef(false)
  const requestedHeld = requested ? (held[requested.entryId] ?? 0) : 0
  const limitsKnown = Boolean(priced) && !pricePending && !priceFailed
  useEffect(() => {
    if (!requested || requestHandled.current) return
    if (locked) {
      requestHandled.current = true
      setRequestRefusal('This roster is locked. Unlock it to add units.')
      requested.onSettled()
      return
    }
    if (!editable) return
    const outcome = requestedUnit(requested.entryId, requestedHeld, limitsKnown ? unitLimits : null)
    if (outcome.kind === 'pending') return
    requestHandled.current = true
    if (outcome.kind === 'add') {
      editor.current.add(requested.entryId)
      reporting.current = { event: 'roster_unit_added', reference: 'datasheet' }
    } else {
      setRequestRefusal(outcome.message)
      posthog.capture('roster_unit_add_refused', { reason: outcome.reason, reference: 'datasheet' })
    }
    requested.onSettled()
  }, [editable, limitsKnown, locked, requested, requestedHeld, unitLimits])
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
  const duplicate = useCallback((index: number) => {
    editor.current.duplicate(index)
    reporting.current = { event: 'roster_unit_duplicated' }
  }, [])
  const [savingLoadout, setSavingLoadout] = useState<{ index: number; whole: boolean } | null>(null)
  const openSaveLoadout = useCallback((index: number) => setSavingLoadout({ index, whole: false }), [])
  const openSaveAttachedUnit = useCallback((index: number) => setSavingLoadout({ index, whole: true }), [])
  const { ask: askAccount } = account
  const askForLoadoutAccount = useCallback(() => askAccount('loadout'), [askAccount])
  const join = useCallback((index: number, targetKey: number | undefined) => {
    editor.current.join(index, targetKey)
    posthog.capture('roster_attachment_updated', { attached: targetKey !== undefined })
  }, [])
  const embark = useCallback((passengerKey: number, transportKey: number | undefined) => {
    editor.current.embark(passengerKey, transportKey)
    posthog.capture('roster_embark_updated', { embarked: transportKey !== undefined })
  }, [])
  const selection = useRef({ picks, updateLoadoutHistory, workspacePath })
  useLayoutEffect(() => {
    selection.current = { picks, updateLoadoutHistory, workspacePath }
  }, [picks, updateLoadoutHistory, workspacePath])
  const adding = useRef(add)
  useLayoutEffect(() => {
    adding.current = add
  })
  const detach = useCallback((index: number) => join(index, undefined), [join])
  const attach = useCallback(
    (index: number, direction: AttachDirection, choice: AttachChoice) => {
      const { picks: currentPicks } = selection.current
      const key = currentPicks[index]?.key
      if (key === undefined) return
      if (choice.kind === 'new') adding.current(choice.entryId, direction === 'join' ? { joinedBy: key } : { joins: key })
      else if (direction === 'join') join(index, choice.key)
      else {
        const joiner = currentPicks.findIndex((pick) => pick.key === choice.key)
        join(joiner, key)
      }
    },
    [join],
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
  const editReminder = useCallback(
    (subject: ReminderSubject) => {
      const key = reminderKey(subject)
      const description = loadedWords(subject.description ?? '') ?? ''
      resetAbilityAlert()
      setReminderDraft(
        abilityAlerts.settings.find((reminder) => reminder.key === key) ?? {
          key,
          ability: subject.name,
          description: subject.description ?? '',
          timings: suggestReminderTimings(description),
          ...(!armyReminder(subject) && suggestReminderWhileDestroyed(description) ? { whileDestroyed: true } : {}),
        },
      )
    },
    [abilityAlerts.settings, resetAbilityAlert],
  )
  const reminderControls = useMemo(
    () => ({
      active: (subject: ReminderSubject) => abilityAlerts.settings.some((reminder) => reminder.key === reminderKey(subject)),
      onSelect: editReminder,
    }),
    [abilityAlerts.settings, editReminder],
  )
  const { data: reminderAbilities } = useQuery({
    ...reminderAbilitiesQuery(catalogueId, detachmentIds, positioned),
    enabled: editable && abilityAlerts.settings.length > 0 && Boolean(catalogueId && positioned.length),
  })
  const reminderCountsByUnit = useMemo(
    () => reminderTimingCountsByUnit(fieldedReminders(abilityAlerts.settings, { detachmentIds, units }, reminderAbilities ?? [])),
    [abilityAlerts.settings, detachmentIds, reminderAbilities, units],
  )
  const { data: attachCandidates } = useQuery({
    ...unitsQuery(catalogueId, limit, waivedRules, detachmentIds),
    enabled: building && workspaceMeasured && Boolean(catalogueId),
    placeholderData: keepPreviousData,
  })
  const attachDiscovery = useMemo(
    () =>
      attachCandidates
        ? { candidates: attachCandidates.filter((unit) => shownKind(unit.nonMatchedPlay, pickerFilters)), held, limits: unitLimits }
        : null,
    [attachCandidates, pickerFilters, held, unitLimits],
  )
  const cardRelationships = useCardRelationships(picks, units, attachDiscovery, embarks)
  const openSetup = () => {
    setSetupMode('edit')
    setSetupDraft({ ...setup, name: listName })
  }
  const setupSave = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: async (review: RosterSetupReview) => {
      requireReviewedRoster(draft, review.source)
      if (guest) {
        if (!guest.onReviewedChange(review.candidate, review.source)) throw new Error('This browser could not keep the reviewed roster.')
        return { updatedAt: Date.now() }
      }
      return saveRoster({ data: review.candidate }, review.source, review.ownerId, review.serverSave)
    },
  })
  const applySetup = async (saved: RosterSetup, review?: RosterSetupReview, options?: { keepOriginal: boolean }) => {
    if (!review) throw new Error('Review the roster before saving changes.')
    if (options?.keepOriginal) {
      const { id } = await convertAsVariantOf(review)
      setSetupDraft(null)
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
      return
    }
    const { updatedAt } = await setupSave.mutateAsync(review)
    const key = draftKey(review.candidate)
    lastSaved.current = key
    lastApplied.current = key
    savedAt.current = Math.max(savedAt.current, updatedAt)
    const changedFaction = currentCatalogueFamilyId(saved.catalogueId) !== currentCatalogueFamilyId(catalogueId)
    resetPicks(review.candidate.picks)
    adoptSetup(saved)
    setSavedPrep(review.candidate.prep ?? NO_PREP)
    if (changedFaction) setSelected(null)
    setSetupDraft(null)
    await invalidateSavedRosters(queryClient)
  }
  const setupDialog =
    editable && editingSetup ? (
      <RosterSetupDialog
        mode={setupMode}
        sourceCatalogueId={catalogueId}
        open={editingSetup}
        onOpenChange={(open) => !open && setSetupDraft(null)}
        factionOptions={factionIndex?.factions ?? []}
        initialFaction={faction}
        value={setupDraft}
        onDraftChange={setSetupDraft}
        guest={Boolean(guest)}
        hasUnits={Boolean(picks.length)}
        reviewSource={draft}
        pending={saving || setupSave.isPending}
        namePlaceholder={label}
        canKeepOriginal={Boolean(savedId && !guest)}
        onSave={applySetup}
      />
    ) : null

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
  if (army !== 'ready') {
    const retired = army === 'replaced'
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center border border-edge bg-sunken p-8 text-center">
        <div>
          <p className="eyebrow">{retired ? 'Army book replaced' : 'Army data unavailable'}</p>
          <p className="mt-2 text-sm text-dim">
            {retired
              ? 'Choose a current faction and detachment to rebuild this roster.'
              : 'Army data could not be loaded. Your roster is unchanged.'}
          </p>
          {retired && editable ? <Button onClick={openSetup}>Choose current faction</Button> : null}
          {retired ? null : (
            <Button className="mt-4" onClick={() => void factionRead.refetch()}>
              Try again
            </Button>
          )}
        </div>
        {setupDialog}
      </div>
    )
  }

  const points = frozen ? frozen.points : (priced?.points ?? 0)
  const budget = pointsBudget ?? limit
  const over = enforces(waivedRules, 'points-limit') && (frozen ? frozen.points > budget : Boolean(priced && priced.points > budget))
  const illegal = Boolean(priced && (priced.errors.length || priced.detachmentError || priced.dispositionError))
  const cards = frozen
    ? frozen.units.map((unit, index) => ({
        index,
        key: unit.key,
        attachedTo: unit.attachedTo,
        // A frozen unit keeps how it joined only in the row naming the unit it joined.
        attaches: unit.joined?.some((row) => joiningKind(row.label) === 'support') ? ('support' as const) : undefined,
        name: unit.name,
        group: unit.group ?? ('other' as const),
        warlord: unit.warlord,
        joined: unit.joined ?? [],
        unit: {
          entryId: unit.entryId ?? unit.key,
          name: unit.name,
          points: unit.points,
          modelCount: unit.models,
          wargear: unit.wargear ?? [],
          attachment: null,
          enhancements: unit.enhancements ?? [],
          upgrades: unit.upgrades ?? [],
        },
      }))
    : units.map((unit, index) => ({
        index,
        key: picks[index]?.key ?? index,
        attachedTo: picks[index]?.attachedTo,
        attaches: unit.attachment?.kind,
        name: unit.name,
        group: unit.group,
        warlord: hasWarlordToggle(unit.toggles),
        joined: NO_JOINED,
        unit,
      }))
  const renderCard = ({ unit, index, joined, warlord }: (typeof cards)[number], inUnit = false) => {
    if (frozen)
      return (
        <UnitCard
          key={unit.entryId + index}
          unit={unit}
          warlord={warlord}
          nickname={frozen.units[index]?.nickname}
          note={frozen.units[index]?.note}
          joined={[
            ...(arrangement === 'attached' ? unitRoleRows(joined) : joined),
            ...embarkRows(cardEmbark(frozenEmbarks?.get(index) ?? NO_EMBARK, inUnit)),
          ]}
          selected={selected === index}
          onSelect={loadoutAvailable ? () => selectUnit(index) : undefined}
          editable={false}
        />
      )
    const relationships = cardRelationships.get(picks[index]?.key ?? -1)
    return (
      <BuilderUnitCard
        key={picks[index]?.key ?? unit.entryId}
        unit={unit}
        warlord={warlord}
        nickname={picks[index]?.nickname}
        note={picks[index]?.note}
        index={index}
        joined={relationships ? (arrangement === 'attached' ? roleRowsOf(relationships.joined) : relationships.joined) : NO_ROWS}
        canJoin={relationships?.canJoin ?? NO_CHOICES}
        canHost={relationships?.canHost ?? NO_CHOICES}
        embark={relationships?.embark ?? NO_EMBARK}
        inAttachedUnit={inUnit}
        alliedFaction={
          picks[index]?.catalogueId === catalogueId
            ? undefined
            : factionIndex?.factions.find((entry) => entry.id === picks[index]?.catalogueId)
        }
        selected={selected === index}
        alertCount={editable ? reminderCountsByUnit.get(index) : undefined}
        onSelect={selectUnit}
        onRemove={drop}
        onDuplicate={duplicate}
        canDuplicate={!pricePending && canAddCopy(unit.entryId, held[unit.entryId] ?? 0, unitLimits)}
        onSaveLoadout={pricePending ? undefined : guest ? askForLoadoutAccount : me ? openSaveLoadout : undefined}
        onSaveAttachedUnit={
          pricePending || !joinedUnits(picks, picks[index]?.key ?? -1, catalogueId).length
            ? undefined
            : guest
              ? askForLoadoutAccount
              : me
                ? openSaveAttachedUnit
                : undefined
        }
        onDetach={detach}
        onAttach={attach}
        onEmbark={embark}
        editable={building}
      />
    )
  }

  const displaySection = cards.some((card) => card.attachedTo !== undefined) ? (
    <>
      <DropdownMenuSeparator />
      <MenuSection label="Display">
        <DropdownMenuCheckboxItem
          className={MENU_ITEM}
          checked={arrangement === 'attached'}
          closeOnClick
          onCheckedChange={(checked) => {
            const next = checked ? 'attached' : 'role'
            setArrangement(next)
            keepRosterArrangement(next)
            posthog.capture('roster_arrangement_changed', { arrangement: next })
          }}
        >
          <Group /> Group attached units
        </DropdownMenuCheckboxItem>
      </MenuSection>
    </>
  ) : null

  // The shelves draw a card per datasheet; the header says how many units the list
  // brings, which is the same fold the library and the battle count it by.
  const fieldedUnitCount = frozen ? attachedUnitCount(frozen.units) : attachedUnitCount(picks)
  const selectedUnit = selected === null ? null : (units[selected] ?? null)
  const frozenSelected = frozen && selected !== null ? (frozen.units[selected] ?? null) : null
  // Frozen selections are what a datasheet is applied to; a log written without them
  // leaves cards that say what was fielded and nothing to open behind them.
  const loadoutAvailable = !frozen || picks.length > 0
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
  const inspectorView = building ? 'edit' : 'readonly'
  const warlord = optimisticUnit?.toggles.find((toggle) => toggle.name === 'Warlord')
  // A unit the data requires as Warlord holds the crown, so no other unit can claim it and it cannot be given up.
  const requiredWarlord = units.find((unit) =>
    unit.toggles.some((toggle) => toggle.name === 'Warlord' && toggle.required && toggle.selected),
  )
  const inspectedEntryId = preview?.entryId ?? optimisticUnit?.entryId ?? null
  const referenceRoute = reference?.entryId === inspectedEntryId ? reference.route : undefined
  const limitFailure = priceFailed ? (
    <div role="alert" className="border-b border-edge px-3 py-2 text-xs text-discarded">
      Could not check unit limits.{' '}
      <Button variant="link" size="sm" onClick={() => void retryPrice()}>
        Retry
      </Button>
    </div>
  ) : null
  const picker =
    editable && faction ? (
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
            room={priced && enforces(waivedRules, 'points-limit') ? budget - priced.points : null}
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
    ) : (
      <p className="p-2.5 text-xs text-faint">Pick a book first.</p>
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
      editable={editable && inspectorView === 'edit'}
      controlsDisabled={loadoutConstraintsPending}
      showOptions={inspectorView !== 'readonly'}
      persistedRoster={editable || !resolvePersistedRoster ? undefined : { id: savedId, ...(battle ? { battle } : {}) }}
      reminders={building && selected !== null ? reminderControls : undefined}
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
          hideSummary
          onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
          onReferenceRoute={setReference}
          abilityReminders={building && selected !== null ? reminderControls : undefined}
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
      picks={positioned}
      pickIndex={preview ? null : selected}
      onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
      onReferenceRoute={setReference}
      abilityReminders={building && !preview && selected !== null ? reminderControls : undefined}
      detachmentRules={preview ? undefined : detachmentRules}
    />
  )

  if (printInput) return <RosterPrintPack input={printInput} onClose={() => setPrintInput(null)} />

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
    setCombatRoster({ ...setup, picks: positioned, pickIndex })
  }

  const testTargets = !frozen ? (
    <DropdownMenuItem
      className={MENU_ITEM}
      disabled={!positioned.length || pricePending || priceLoading}
      onClick={() => openCombat(0, true)}
    >
      <Calculator /> Test targets
    </DropdownMenuItem>
  ) : null

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
          editable ? (
            <>
              {variantMenu}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Roster actions" />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <MenuSection label="Play">
                    {savedId && !guest ? (
                      <DropdownMenuItem
                        className={MENU_ITEM}
                        disabled={saving || !positioned.length}
                        onClick={() => setStartingBattle(true)}
                      >
                        <Swords /> Start a battle
                      </DropdownMenuItem>
                    ) : guest ? (
                      <DropdownMenuItem className={MENU_ITEM} onClick={() => account.ask('battle')}>
                        <Swords /> Start a battle
                      </DropdownMenuItem>
                    ) : null}
                    {testTargets}
                  </MenuSection>
                  <DropdownMenuSeparator />
                  <MenuSection label="Setup">
                    <DropdownMenuItem className={MENU_ITEM} onClick={openSetup}>
                      <Pencil /> Edit roster setup
                    </DropdownMenuItem>
                  </MenuSection>
                  {savedId || guest ? (
                    <>
                      <DropdownMenuSeparator />
                      <MenuSection label="Copies and access">
                        {savedId && !guest ? (
                          <>
                            <DropdownMenuItem
                              className={MENU_ITEM}
                              disabled={saving || createVariant.isPending}
                              onClick={() => createVariant.mutate(savedId)}
                            >
                              <GitBranchPlus /> Create variant
                            </DropdownMenuItem>
                            <DropdownMenuItem className={MENU_ITEM} onClick={() => setLending(true)}>
                              <HandHelping /> Lend to a friend
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className={MENU_ITEM}
                              disabled={saving || lockRoster.isPending}
                              onClick={() => lockRoster.mutate(true)}
                            >
                              <Lock /> Lock roster
                            </DropdownMenuItem>
                          </>
                        ) : guest ? (
                          // Offered as an account offers them, so a visitor finds out what signing up adds.
                          <>
                            <DropdownMenuItem className={MENU_ITEM} onClick={() => account.ask('variant')}>
                              <GitBranchPlus /> Create variant
                            </DropdownMenuItem>
                            <DropdownMenuItem className={MENU_ITEM} onClick={() => account.ask('lend')}>
                              <HandHelping /> Lend to a friend
                            </DropdownMenuItem>
                            <DropdownMenuItem className={MENU_ITEM} onClick={() => account.ask('lock')}>
                              <Lock /> Lock roster
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </MenuSection>
                    </>
                  ) : null}
                  <DropdownMenuSeparator />
                  <MenuSection label="Share">
                    {visibility !== 'private' ? shareItem : null}
                    <DropdownMenuItem className={MENU_ITEM} disabled={take.isPending || !positioned.length} onClick={() => take.mutate()}>
                      <Download /> Export text
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM}
                      disabled={exchange.isPending || !positioned.length}
                      onClick={() => exchange.mutate()}
                    >
                      <QrCode /> Exchange code
                    </DropdownMenuItem>
                    <DropdownMenuItem className={MENU_ITEM} disabled={!priced || pricePending || priceLoading} onClick={preparePrint}>
                      <Printer /> Print
                    </DropdownMenuItem>
                  </MenuSection>
                  {displaySection}
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div>
                      <ToggleGroup
                        value={[readOnly ? 'view' : 'build']}
                        onValueChange={(value) => {
                          if (value[0] === 'view' || value[0] === 'build') setReadOnlyMode(value[0] === 'view')
                        }}
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-label="Roster mode"
                      >
                        <ToggleGroupItem
                          value="build"
                          className="border-primary/60 text-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                        >
                          Build
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="view"
                          className="border-primary/60 text-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                        >
                          View
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  }
                />
                <TooltipContent side="bottom">View hides editing controls and simplifies cards and loadouts.</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              {locked ? variantMenu : null}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Roster actions" />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  {locked || testTargets ? (
                    <>
                      <MenuSection label="Play">
                        {locked ? (
                          <DropdownMenuItem className={MENU_ITEM} disabled={!positioned.length} onClick={() => setStartingBattle(true)}>
                            <Swords /> Start a battle
                          </DropdownMenuItem>
                        ) : null}
                        {testTargets}
                      </MenuSection>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <MenuSection label={locked ? 'Copies and access' : 'Copies'}>
                    {locked ? (
                      <>
                        <DropdownMenuItem className={MENU_ITEM} disabled={lockRoster.isPending} onClick={() => lockRoster.mutate(false)}>
                          <LockOpen /> Unlock roster
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={MENU_ITEM}
                          disabled={createVariant.isPending}
                          onClick={() => createVariant.mutate(savedId)}
                        >
                          <GitBranchPlus /> Create variant
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={MENU_ITEM}
                          disabled={duplicateRoster.isPending}
                          onClick={() => duplicateRoster.mutate()}
                        >
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className={MENU_ITEM} onClick={() => setLending(true)}>
                          <HandHelping /> Lend to a friend
                        </DropdownMenuItem>
                      </>
                    ) : me ? (
                      <DropdownMenuItem
                        className={MENU_ITEM}
                        disabled={duplicateRoster.isPending || !positioned.length}
                        onClick={() => duplicateRoster.mutate()}
                      >
                        <Copy /> Duplicate to my rosters
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className={MENU_ITEM}
                        disabled={duplicateRoster.isPending || !positioned.length}
                        onClick={() => (peekGuestDraft() ? account.ask('another-roster') : duplicateRoster.mutate())}
                      >
                        <Copy /> Duplicate to this device
                      </DropdownMenuItem>
                    )}
                  </MenuSection>
                  <DropdownMenuSeparator />
                  <MenuSection label="Share">
                    {visibility !== 'private' && !battle ? shareItem : null}
                    <DropdownMenuItem className={MENU_ITEM} disabled={take.isPending || !positioned.length} onClick={() => take.mutate()}>
                      <Download /> Export text
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM}
                      disabled={exchange.isPending || !positioned.length}
                      onClick={() => exchange.mutate()}
                    >
                      <QrCode /> Exchange code
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={MENU_ITEM}
                      disabled={!frozenReference && (!priced || pricePending || priceLoading)}
                      onClick={frozenReference ? () => window.print() : preparePrint}
                    >
                      <Printer /> Print
                    </DropdownMenuItem>
                  </MenuSection>
                  {displaySection}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      >
        {locked ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-dim">
            <Lock className="size-3 shrink-0" aria-hidden />
            Locked. Unlock to edit, or create a variant.
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0"
              disabled={lockRoster.isPending}
              onClick={() => lockRoster.mutate(false)}
            >
              Unlock
            </Button>
          </p>
        ) : null}
        {lockRoster.isError ? <Problem error={lockRoster.error} className="mt-1 text-xs" /> : null}
        {!editable && duplicateRoster.isError ? (
          <Problem className="mt-1 text-xs">That roster could not be duplicated. Try again.</Problem>
        ) : null}
        {createVariant.isError ? <Problem className="mt-1 text-xs">The variant could not be created. Try again.</Problem> : null}
        {share.isError ? (
          <Problem className="mt-1 text-xs">Could not share the link: {errorMessage(share.error)}</Problem>
        ) : (
          <output className="mt-1 block text-xs text-dim empty:hidden">
            {share.isPending
              ? nativeShare
                ? 'Sharing link…'
                : 'Copying link…'
              : share.data === 'shared'
                ? 'Link shared.'
                : share.data === 'copied'
                  ? 'Link copied.'
                  : null}
          </output>
        )}
        {exchange.isError ? (
          <Problem className="mt-1 text-xs">Could not make an exchange code: {errorMessage(exchange.error)}</Problem>
        ) : null}
        {requestRefusal ? (
          <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-discarded">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            The unit was not added. {requestRefusal}
          </p>
        ) : null}
        {copiedFrom ? (
          <p data-roster-copied-from className="mt-1 text-xs text-dim">
            Copied from{' '}
            <Link to="/rosters/$id" params={{ id: copiedFrom.id }} className="text-info hover:text-parchment">
              {copiedFrom.name}
            </Link>{' '}
            by{' '}
            <Link to="/users/$userId" params={{ userId: copiedFrom.ownerId }} className="text-info hover:text-parchment">
              {copiedFrom.ownerName}
            </Link>
          </p>
        ) : null}
        {lentBy && savedId && me ? (
          <div data-roster-lent-by className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            <span>
              Lent to you by{' '}
              <Link to="/users/$userId" params={{ userId: lentBy.id }} className="text-info hover:text-parchment">
                {lentBy.name}
              </Link>
              . You can field it in your battles.
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                returnLoan.reset()
                setReturning(true)
              }}
            >
              Return it
            </Button>
            <ConfirmDialog
              open={returning}
              title={`Return ${lentBy.name}’s roster?`}
              description={`You can no longer field it in your battles. Only ${lentBy.name} can lend it to you again.`}
              cancel="Keep it"
              confirm="Return it"
              pendingLabel="Returning…"
              destructive
              pending={returnLoan.isPending}
              error={returnLoan.error}
              onClose={() => setReturning(false)}
              onConfirm={() => returnLoan.mutate()}
            />
          </div>
        ) : null}
        {savedId && !frozen ? <RosterDataChanges rosterId={savedId} /> : null}
        {!frozen ? (
          <RosterRulesNotice
            edition={faction?.edition}
            current={currentRules ? rulesVersionDetails(currentRules).name : null}
            onConvert={
              editable
                ? () => {
                    openSetup()
                    setSetupMode('convert')
                  }
                : undefined
            }
          />
        ) : null}
        {editable && priced?.detachmentError ? (
          <Problem className="mt-1 flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {priced.detachmentError}
            <Button variant="ghost" size="xs" className="h-auto p-0 text-destructive underline hover:text-destructive" onClick={openSetup}>
              Review setup
            </Button>
          </Problem>
        ) : null}
        {editable && priced?.dispositionError ? (
          <Problem className="mt-1 flex items-center gap-1.5 text-xs">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {priced.dispositionError} Its detachments disagree, so a battle cannot pick a mission for it.
            <Button variant="ghost" size="xs" className="h-auto p-0 text-destructive underline hover:text-destructive" onClick={openSetup}>
              Choose one
            </Button>
          </Problem>
        ) : null}

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
          <div className="contents min-[1300px]:flex min-[1300px]:min-h-0 min-[1300px]:min-w-0">
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

        <RosterUnits onboarding="roster-list">
          {cards.length ? (
            <>
              {rosterShelves<(typeof cards)[number]>(cards, arrangement).map(({ id, plural, count, entries }) => (
                <Section key={id} title={plural} count={count} points={entries.flat().reduce((total, card) => total + card.unit.points, 0)}>
                  {entries.map((members) => {
                    const host = members[0]!
                    return members.length > 1 ? (
                      <AttachedUnitBlock
                        key={host.key}
                        name={host.name}
                        nickname={(frozen ? frozen.units[host.index] : picks[host.index])?.nickname}
                        bodyguard={renderCard(host, true)}
                        actions={
                          frozen ? (
                            <AttachedUnitActions
                              host={host.index}
                              name={host.name}
                              embark={frozenEmbarks?.get(host.index) ?? NO_EMBARK}
                              canHost={[]}
                              editable={false}
                            />
                          ) : (
                            <AttachedUnitActions
                              host={host.index}
                              name={host.name}
                              embark={cardRelationships.get(picks[host.index]?.key ?? -1)?.embark ?? NO_EMBARK}
                              canHost={cardRelationships.get(picks[host.index]?.key ?? -1)?.canHost ?? NO_CHOICES}
                              editable={building}
                              onAttach={attach}
                              onEmbark={embark}
                            />
                          )
                        }
                      >
                        {members.slice(1).map((member) => renderCard(member, true))}
                      </AttachedUnitBlock>
                    ) : (
                      renderCard(host)
                    )
                  })}
                </Section>
              ))}
            </>
          ) : rosterLoading ? (
            <output className="block py-3" aria-label="Loading roster units">
              <span className="sr-only">Loading roster units…</span>
              <Skeleton className="mb-3 h-4 w-28" />
              <span className="grid gap-2">
                {picks.map((pick) => (
                  <Skeleton key={pick.key} className="h-24" />
                ))}
              </span>
            </output>
          ) : faction || frozen ? (
            building ? (
              <div className="space-y-3 py-6">
                <h2 className="text-xl">Add your first unit</h2>
                <p className="max-w-sm text-sm text-dim">
                  Search for a unit you own or want to field. Then choose its model count and equipment in Loadout.
                </p>
                <Button variant="outline" className="min-[1300px]:hidden" onClick={openPicker}>
                  Choose a unit
                </Button>
              </div>
            ) : (
              <p className="py-6 text-sm text-faint">This roster has no units.</p>
            )
          ) : (
            <p className="py-6 text-sm text-faint">Pick a book to start building.</p>
          )}
          {me && !frozen && !guest && !print && units.length ? (
            <RosterReadiness
              units={units.map((unit) => ({
                entryId: currentEntryId(unit.entryId, catalogueId),
                name: unit.name,
                models: unit.size.models,
              }))}
            />
          ) : null}
        </RosterUnits>

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
              <>
                {preview && building ? (
                  <Button
                    size="sm"
                    className="px-2"
                    disabled={!canAddCopy(preview.entryId, held[preview.entryId] ?? 0, unitLimits)}
                    onClick={() => add(preview.entryId)}
                  >
                    <Plus className="size-3" />
                    Add to list
                  </Button>
                ) : optimisticUnit ? (
                  <span className="flex max-w-full shrink-0 flex-wrap items-center justify-start gap-1.5 @max-[30rem]:gap-1">
                    {warlord && inspectorView === 'edit' ? (
                      <button
                        type="button"
                        title={
                          requiredWarlord
                            ? `${requiredWarlord.name} must be your Warlord`
                            : `${warlord.selected ? 'Remove' : 'Make'} ${optimisticUnit.name} Warlord`
                        }
                        aria-label={`${warlord.selected ? 'Remove' : 'Make'} ${optimisticUnit.name} Warlord`}
                        aria-pressed={warlord.selected}
                        disabled={Boolean(requiredWarlord)}
                        className={`chip gap-1 ${warlord.selected ? 'text-info' : requiredWarlord ? 'cursor-not-allowed text-faint' : 'hover:border-info hover:text-bone'}`}
                        onClick={() => selected !== null && edit.toggle(selected, warlord.key, warlord.name, !warlord.selected)}
                      >
                        <Crown className={`size-3.5 ${warlord.selected ? 'fill-current' : ''}`} />
                        Warlord
                      </button>
                    ) : null}
                    {warlord?.selected && inspectorView === 'readonly' ? (
                      <span className="chip gap-1 text-info">
                        <Crown className="size-3.5 fill-current" /> Warlord
                      </span>
                    ) : null}
                    <PointsChip points={optimisticUnit.points} />
                    {optimisticUnit.size.resizable && inspectorView === 'edit' ? (
                      <Stepper
                        label={`models in ${optimisticUnit.name}`}
                        countLabel={`${optimisticUnit.name} models`}
                        count={optimisticUnit.size.models}
                        onRemove={
                          optimisticUnit.size.models > optimisticUnit.size.min
                            ? () =>
                                selected !== null &&
                                edit.resize(
                                  selected,
                                  (models) => optimisticUnit.size.options?.findLast((size) => size < models) ?? models - 1,
                                )
                            : undefined
                        }
                        onAdd={
                          optimisticUnit.size.models < optimisticUnit.size.max
                            ? () =>
                                selected !== null &&
                                edit.resize(selected, (models) => optimisticUnit.size.options?.find((size) => size > models) ?? models + 1)
                            : undefined
                        }
                        choices={modelCountChoices(optimisticUnit.size)}
                        onChoose={(models) => selected !== null && edit.resize(selected, () => models)}
                      />
                    ) : (
                      <span className="chip normal-case">{countLabel(optimisticUnit.size.models, 'model')}</span>
                    )}
                  </span>
                ) : frozenSelected ? (
                  // The list as fought, before the price behind it has said anything.
                  <span className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 @max-[30rem]:gap-1">
                    <PointsChip points={frozenSelected.points} />
                    <span className="chip normal-case">{countLabel(frozenSelected.models, 'model')}</span>
                  </span>
                ) : null}
                {!frozen && !preview && selected !== null ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Simulate combat"
                          disabled={!selectedUnit || pricePending || priceLoading}
                          onClick={() => openCombat(selected, false)}
                        />
                      }
                    >
                      <Calculator aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent role="tooltip" side="bottom">
                      Simulate combat
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {inspectedEntryId && referenceRoute !== null ? (
                  referenceRoute ? (
                    <FullDatasheetLink route={referenceRoute} />
                  ) : (
                    <FullDatasheetLinkLoading />
                  )
                ) : null}
              </>
            }
          >
            {preview ? (
              <>
                {limitFailure}
                {!priceFailed && unitLimitMessage(preview.entryId, held[preview.entryId] ?? 0, unitLimits) ? (
                  <output className="block border-b border-edge px-3 py-2 text-xs text-discarded">
                    {unitLimitMessage(preview.entryId, held[preview.entryId] ?? 0, unitLimits)}
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
        canAddUnits={Boolean(faction)}
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
        leagueWarning={
          (editable || locked) && savedId && me ? (
            <>
              <OutdatedLeagueRosters rosterId={savedId} saved={!save.isPending && currentDraftKey === lastApplied.current} />
              <DueLeagueRosters
                limit={limit}
                pointsBudget={pointsBudget}
                saved={!save.isPending && currentDraftKey === lastApplied.current}
              />
            </>
          ) : null
        }
      />
      <RosterExportDialog exported={exportText} onClose={() => setExportText(null)} />
      <RosterExchangeDialog exchange={exchangeCode} onClose={() => setExchangeCode(null)} />
      {account.prompt}
      {savedId && (editable || locked) && !guest ? (
        <>
          <RosterLoanDialog rosterId={savedId} open={lending} onClose={() => setLending(false)} />
          <CreateBattle rosterId={savedId} open={startingBattle} onOpenChange={setStartingBattle} />
        </>
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
      {reminderDraft ? (
        <ReminderEditorDialog
          key={reminderDraft.key}
          draft={reminderDraft}
          full={!abilityAlerts.fits(reminderDraft.key)}
          error={abilityAlerts.error}
          onClose={() => setReminderDraft(null)}
          onSave={(reminder) =>
            void abilityAlerts.save(reminder).then(
              () => setReminderDraft(null),
              () => {},
            )
          }
          onRemove={
            abilityAlerts.settings.some((reminder) => reminder.key === reminderDraft.key)
              ? () =>
                  void abilityAlerts.remove(reminderDraft.key).then(
                    () => setReminderDraft(null),
                    () => {},
                  )
              : undefined
          }
        />
      ) : null}
    </RosterShell>
  )
}
