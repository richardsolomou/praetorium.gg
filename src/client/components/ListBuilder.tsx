import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Check,
  Copy,
  Crown,
  Download,
  EllipsisVertical,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import posthog from 'posthog-js'
import { type ComponentProps, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { FormatRuleId, Secondary, Stratagem } from '../../core/battle'
import { type OptionalRuleId, ROSTER_NAME_MAX_LENGTH, waivedFormatRules } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { Datasheet } from '../../server/catalogue'
import { exportRoster, saveRoster } from '../../server/functions'
import { collectionQuery, factionIndexQuery, factionQuery, invalidateSavedRosters, meQuery, priceQuery } from '../queries'
import { type KeyedPick, picksAfterDetachmentChange } from '../rosterPicks'
import { useCollectionMutation } from '../useCollection'
import { useSettled } from '../useSettled'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { shortName } from './builder/factions'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Stepper } from './builder/LoadoutControls'
import { changedDraftSpreadCounts, withDraftSpreadCounts } from './builder/loadoutModel'
import { Picker, type PickerFilter } from './builder/Picker'
import { Section } from './builder/Section'
import { Pane } from './builder/Pane'
import { UnitCard } from './builder/UnitCard'
import { survivingUnits } from './builder/pricePlaceholder'
import { attachmentRows, joinableUnits } from './builder/attachments'
import { pickEditor, usePicks } from './builder/usePicks'
import { WaiverWarning } from './FormatWaivers'
import { RosterSetupDialog, type RosterSetup, type RosterSetupFaction } from './RosterSetupDialog'
import { RosterExportDialog } from './RosterExportDialog'
import { RosterBody, RosterHeader, RosterShell, RosterUnits } from './RosterPresentation'
import { readWorkspaceState, writeWorkspaceState } from './workspaceState'

type Props = {
  /** What the player has written down, so a saved list carries it and restores it. */
  prep: { stratagems: Stratagem[]; secondaries: Secondary[] }
  initial: {
    id: string
    name: string
    catalogueId: string
    detachmentIds: string[]
    disposition: string | null
    limit: number
    picks: RosterPick[]
    waivedRules: FormatRuleId[]
    optionalRules?: OptionalRuleId[]
    borrowedDetachmentId?: string | null
    visibility: RosterVisibility
    source: RosterSource
  }
  initialFaction?: RosterSetupFaction | null
  editable?: boolean
  /** A battle token may entitle a read-only viewer to resolve a private roster. */
  battle?: string
  /** Resolve read-only details by saved id; false when the supplied picks are themselves the snapshot. */
  resolvePersistedRoster?: boolean
}

const READ_ONLY_PREFERENCE = 'praetorium.roster-read-only'
/** Which set of waived restrictions this workspace has already been told about. */
const WAIVERS_DISMISSED = 'waivers-dismissed'
const NO_UNITS = [] as const

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
export function ListBuilder({ prep, initial, initialFaction, editable = true, battle, resolvePersistedRoster = true }: Props) {
  const navigate = useNavigate()
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const { data: factionIndex } = useQuery(factionIndexQuery())
  const [catalogueId, setCatalogueId] = useState(initial.catalogueId)
  const { picks, setPicks, positioned, held } = usePicks(initial.picks)
  const [limit, setLimit] = useState(initial.limit)
  const [detachmentIds, setDetachmentIds] = useState<string[]>(initial.detachmentIds)
  const [disposition, setDisposition] = useState<string | null>(initial.disposition)
  const [waivedRules, setWaivedRules] = useState<FormatRuleId[]>(initial.waivedRules)
  const [optionalRules, setOptionalRules] = useState<OptionalRuleId[]>(initial.optionalRules ?? [])
  const [borrowedDetachmentId, setBorrowedDetachmentId] = useState<string | null>(initial.borrowedDetachmentId ?? null)
  const [name, setName] = useState(initial.name)
  const [visibility, setVisibility] = useState<RosterVisibility>(initial.visibility)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ catalogueId: string; entryId: string; name: string } | null>(null)
  const [reference, setReference] = useState<{ entryId: string; route: Datasheet['referenceRoute'] } | null>(null)
  const [showing, setShowing] = useState<'picker' | 'loadout' | null>(null)
  const [readOnly, setReadOnly] = useState(!editable)
  const [exportText, setExportText] = useState<string | null>(null)
  const workspacePath = `/rosters/${initial.id}`
  const [setupDraft, setSetupDraftState] = useState<RosterSetup | null>(null)
  const [dismissedWaivers, setDismissedWaivers] = useState<string | null>(null)
  const [wideWorkspace, setWideWorkspace] = useState(true)
  const [workspaceMeasured, setWorkspaceMeasured] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilters, setPickerFilters] = useState<Set<PickerFilter>>(new Set())
  const editingSetup = setupDraft !== null
  const { data: loadedFaction } = useQuery({
    ...factionQuery(catalogueId),
    enabled: Boolean(catalogueId) && initialFaction?.id !== catalogueId,
  })
  const faction = loadedFaction ?? (initialFaction?.id === catalogueId ? initialFaction : null)
  const pickerOpen = wideWorkspace || showing === 'picker'
  const pickerEnabled = workspaceMeasured && pickerOpen

  const setSetupDraft = (draft: RosterSetup | null) => {
    setSetupDraftState(draft)
    writeWorkspaceState(workspacePath, 'roster-setup', draft)
  }

  const dismissWaivers = (key: string) => {
    setDismissedWaivers(key)
    writeWorkspaceState(workspacePath, WAIVERS_DISMISSED, key)
  }

  const savedId = initial.id
  const queryClient = useQueryClient()
  const { data: owned } = useQuery({ ...collectionQuery(), enabled: editable && pickerEnabled })
  const collection = useMemo(() => new Set(owned ?? []), [owned])
  const { mutate: mutateCollection } = useCollectionMutation()

  useEffect(() => setSetupDraftState(readWorkspaceState<RosterSetup>(workspacePath, 'roster-setup')), [workspacePath])
  useEffect(() => setDismissedWaivers(readWorkspaceState<string>(workspacePath, WAIVERS_DISMISSED)), [workspacePath])
  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 1300px)')
    const sync = () => {
      setWideWorkspace(media.matches)
      setWorkspaceMeasured(true)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    if (!editable) return
    setReadOnly(localStorage.getItem(READ_ONLY_PREFERENCE) === 'true')
  }, [editable])

  const setReadOnlyMode = (next: boolean) => {
    setReadOnly(next)
    localStorage.setItem(READ_ONLY_PREFERENCE, String(next))
  }
  const toggleWaivedRule = useCallback(
    (rule: FormatRuleId) =>
      setWaivedRules((current) => (current.includes(rule) ? current.filter((candidate) => candidate !== rule) : [...current, rule])),
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

  const suggested = faction
    ? [shortName(faction.name), faction.detachments.find((entry) => entry.id === detachmentIds[0])?.name].filter(Boolean).join(' — ')
    : ''
  const listName = name.trim() || suggested
  const save = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: () =>
      saveRoster({
        data: {
          id: savedId,
          name: listName || 'Untitled list',
          catalogueId,
          detachmentIds,
          disposition,
          limit,
          picks: positioned,
          prep,
          waivedRules,
          optionalRules,
          borrowedDetachmentId,
          visibility,
          source: initial.source,
        },
      }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })

  // Held steppers and typed names change many times a second; the settled values
  // trigger one save per pause while the mutation still reads the newest draft.
  const settledPicks = useSettled(positioned)
  const settledListName = useSettled(listName)
  useEffect(() => {
    if (!editable || !catalogueId || !settledListName) return
    save.mutate()
    // The mutation reads the complete rendered draft. A later render queues behind
    // this one, so the final request always contains the newest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    borrowedDetachmentId,
    optionalRules,
    catalogueId,
    detachmentIds,
    disposition,
    editable,
    limit,
    settledListName,
    settledPicks,
    prep,
    visibility,
    waivedRules,
  ])

  /** Hands the list to another tool, in the format every one of them reads. */
  const take = useMutation({
    mutationFn: () =>
      exportRoster({
        data: { catalogueId, detachmentIds, disposition, limit, name: listName || 'Roster', units: positioned, waivedRules },
      }),
    onSuccess: ({ text }) => setExportText(text),
  })

  const duplicateRoster = useMutation({
    mutationFn: () =>
      saveRoster({
        data: {
          name: `Copy of ${listName}`.slice(0, ROSTER_NAME_MAX_LENGTH),
          catalogueId,
          detachmentIds,
          disposition,
          limit,
          picks: positioned,
          prep,
          waivedRules,
          optionalRules,
          borrowedDetachmentId,
          visibility: 'private',
          source: initial.source,
        },
      }),
    onSuccess: async ({ id }) => {
      posthog.capture('roster_duplicated', { unit_count: positioned.length, shared: true })
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  const {
    data: priced,
    dataUpdatedAt: pricedAt,
    isPlaceholderData: pricePending,
  } = useQuery({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, positioned, waivedRules, borrowedDetachmentId, optionalRules),
    /**
     * The last answer, with whatever the list has since let go of taken out of it.
     *
     * The total stays as it was until the new one lands, the same way an added unit
     * is not counted until then: a number one request behind corrects itself, and a
     * number this page worked out for itself could be wrong in ways it cannot know.
     */
    placeholderData: (previous, previousQuery) => {
      if (!previous) return undefined
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
    evaluatedAt.current = pricedAt
    evaluatedPicks.current = new Map(picks.map((pick) => [pick.key, pick]))
  }, [picks, pricePending, priced, pricedAt])

  const units = priced?.units ?? NO_UNITS
  const edit = useMemo(() => pickEditor(setPicks, { catalogueId, units }), [catalogueId, setPicks, units])
  const editor = useRef({ edit, pickCount: picks.length })
  useLayoutEffect(() => {
    editor.current = { edit, pickCount: picks.length }
  }, [edit, picks.length])
  const drop = useCallback((index: number) => {
    editor.current.edit.drop(index)
    posthog.capture('roster_unit_removed', { unit_count: editor.current.pickCount - 1 })
    setSelected(null)
  }, [])
  const add = useCallback((entryId: string) => {
    editor.current.edit.add(entryId)
    posthog.capture('roster_unit_added', { unit_count: editor.current.pickCount + 1 })
  }, [])
  const inspect = useCallback((previewCatalogueId: string, entryId: string, unitName: string) => {
    setPreview({ catalogueId: previewCatalogueId, entryId, name: unitName })
    setSelected(null)
    setShowing('loadout')
  }, [])
  const previewUnit = useCallback((entryId: string, unitName: string) => inspect(catalogueId, entryId, unitName), [catalogueId, inspect])
  const duplicate = useCallback((index: number) => {
    editor.current.edit.duplicate(index)
    posthog.capture('roster_unit_duplicated', { unit_count: editor.current.pickCount + 1 })
  }, [])
  const join = useCallback((index: number, targetKey: number | undefined) => {
    editor.current.edit.join(index, targetKey)
    posthog.capture('roster_attachment_updated', { attached: targetKey !== undefined })
  }, [])
  const selectUnit = useCallback((index: number) => {
    setPreview(null)
    setSelected(index)
    setShowing('loadout')
  }, [])
  const setUnitOwned = useCallback(
    (entryId: string, nextOwned: boolean) => mutateCollection({ entryId, owned: nextOwned }),
    [mutateCollection],
  )
  const cardRelationships = useCardRelationships(picks, units)

  if (!faction) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center border border-edge bg-sunken p-8 text-center">
        <div>
          <p className="eyebrow">Catalogue unavailable</p>
          <p className="mt-2 text-sm text-dim">Catalogue data is syncing. Try this page again shortly.</p>
        </div>
      </div>
    )
  }

  const over = Boolean(priced && priced.points > limit)
  const selectedUnit = selected === null ? null : (units[selected] ?? null)
  const selectedPick = selected === null ? null : (picks[selected] ?? null)
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
  const waivers = waivedFormatRules(limit, waivedRules)
  /*
   * Dismissing says "I know", not "never tell me": the key is the set of waived
   * restrictions, so switching another one off says something the player has not
   * acknowledged yet and the warning comes back.
   */
  const waiverKey = waivers.map((rule) => rule.id).join(',')
  const inspectorView = editable && !readOnly ? 'edit' : 'readonly'
  const warlord = optimisticUnit?.toggles.find((toggle) => toggle.name === 'Warlord')
  const inspectedEntryId = preview?.entryId ?? optimisticUnit?.entryId ?? null
  const referenceRoute = reference?.entryId === inspectedEntryId ? reference.route : null
  const picker =
    editable && faction ? (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Picker
            enabled={pickerEnabled}
            catalogueId={catalogueId}
            onAdd={add}
            onPreview={previewUnit}
            inRoster={held}
            room={priced ? limit - priced.points : null}
            battleSize={limit}
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
      detachmentIds={detachmentIds}
      picks={positioned}
      pickIndex={selected}
      onChoose={(key, optionId) => selected !== null && edit.choose(selected, key, optionId)}
      onSpread={(key, counts) => selected !== null && edit.spread(selected, key, counts)}
      editable={editable && inspectorView === 'edit'}
      controlsDisabled={loadoutConstraintsPending}
      showOptions={inspectorView !== 'readonly'}
      persistedRoster={editable || !resolvePersistedRoster ? undefined : { id: savedId, ...(battle ? { battle } : {}) }}
      reference={
        <DatasheetPanel
          catalogueId={datasheetCatalogueId}
          entryId={selectedUnit?.entryId ?? null}
          detachmentIds={detachmentIds}
          picks={positioned}
          pickIndex={selected}
          showWeapons
          embedded
          hideSummary
          showRelationships={!readOnly}
          onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
          onReferenceRoute={setReference}
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
      showWeapons
      showRelationships={!readOnly}
      onRelationshipSelect={(entryId, unitName) => inspect(datasheetCatalogueId, entryId, unitName)}
      onReferenceRoute={setReference}
    />
  )

  return (
    <RosterShell saving={save.isPending || settledPicks !== positioned || settledListName !== listName} saveError={save.isError}>
      <RosterHeader
        name={name}
        nameId="listname"
        onNameChange={editable ? (event) => setName(event.target.value) : undefined}
        maxLength={ROSTER_NAME_MAX_LENGTH}
        placeholder={suggested || 'Named from your picks'}
        faction={faction}
        factionLoading={Boolean(catalogueId) && !faction}
        limit={limit}
        detachments={detachmentIds.flatMap((id) => {
          const detachment = faction.detachments.find((candidate) => candidate.id === id)
          return detachment ? [{ id, name: detachment.name }] : []
        })}
        disposition={priced?.disposition}
        waivers={waivers}
        actions={
          editable ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Roster actions" className="grid h-7 w-10 place-items-center hover:text-bone">
                  <EllipsisVertical className="size-4 translate-y-px" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem
                    onClick={() =>
                      setSetupDraft({
                        name: listName,
                        catalogueId,
                        detachmentIds,
                        disposition,
                        limit,
                        waivedRules,
                        optionalRules,
                        borrowedDetachmentId,
                        visibility,
                      })
                    }
                  >
                    <Pencil /> Edit roster setup
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={take.isPending || !units.length} onClick={() => take.mutate()}>
                    <Download /> Export GW text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  closeOnClick={false}
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
                <TooltipContent side="bottom">Build edits your roster. View shows only what’s selected.</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Roster actions" className="grid h-7 w-10 place-items-center hover:text-bone">
                <EllipsisVertical className="size-4 translate-y-px" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {me ? (
                  <DropdownMenuItem disabled={duplicateRoster.isPending} onClick={() => duplicateRoster.mutate()}>
                    <Copy /> Duplicate to my rosters
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem render={<Link to="/sign-in" search={{ next: path }} />}>
                    <Copy /> Sign in to duplicate
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={take.isPending || !units.length} onClick={() => take.mutate()}>
                  <Download /> Export GW text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      >
        {!editable && duplicateRoster.isError ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            That roster could not be duplicated. Try again.
          </p>
        ) : null}
        {editable && priced?.dispositionError ? (
          <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {priced.dispositionError} Its detachments disagree, so a battle cannot pick a mission for it.
            <Button
              variant="ghost"
              size="xs"
              className="h-auto p-0 text-destructive underline hover:text-destructive"
              onClick={() =>
                setSetupDraft({
                  name: listName,
                  catalogueId,
                  detachmentIds,
                  disposition,
                  limit,
                  waivedRules,
                  optionalRules,
                  borrowedDetachmentId,
                  visibility,
                })
              }
            >
              Choose one
            </Button>
          </p>
        ) : null}

        {editable && editingSetup ? (
          <RosterSetupDialog
            open={editingSetup}
            onOpenChange={(open) => !open && setSetupDraft(null)}
            factionOptions={factionIndex?.factions ?? []}
            initialFaction={faction}
            value={setupDraft}
            onDraftChange={setSetupDraft}
            hasUnits={Boolean(picks.length)}
            onSave={(setup) => {
              const changedFaction = setup.catalogueId !== catalogueId
              if (!changedFaction) {
                setPicks((current) => picksAfterDetachmentChange(current, units, detachmentIds, setup.detachmentIds))
              }
              setName(setup.name)
              setCatalogueId(setup.catalogueId)
              setDetachmentIds(setup.detachmentIds)
              setDisposition(setup.disposition)
              setLimit(setup.limit)
              setWaivedRules(setup.waivedRules)
              setOptionalRules(setup.optionalRules)
              setBorrowedDetachmentId(setup.borrowedDetachmentId)
              setVisibility(setup.visibility)
              if (changedFaction) {
                edit.clear()
                setSelected(null)
              }
              setSetupDraft(null)
            }}
          />
        ) : null}
      </RosterHeader>

      <RosterBody threeColumn={editable}>
        {editable ? (
          <div className="contents min-[1300px]:flex min-[1300px]:min-h-0 min-[1300px]:min-w-0">
            <Pane
              variant="picker"
              open={pickerOpen}
              drawer={!wideWorkspace}
              hideBelowDesktop
              title="Add units"
              onClose={() => setShowing(null)}
              actions={
                selectedUnit ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setPreview(null)
                      setShowing('loadout')
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

        <RosterUnits>
          {units.length ? (
            GROUPS.map(({ id, plural }) => {
              const rows = units
                .map((unit, index) => ({ unit, index }))
                .filter(({ unit }) => unit.group === id)
                .toSorted((left, right) => left.unit.name.localeCompare(right.unit.name))
              return rows.length ? (
                <Section key={id} title={plural} count={rows.length}>
                  {rows.map(({ unit, index }) => (
                    <BuilderUnitCard
                      key={picks[index]?.key ?? unit.entryId}
                      unit={unit}
                      index={index}
                      joined={cardRelationships.get(picks[index]?.key ?? -1)?.joined ?? []}
                      canJoin={cardRelationships.get(picks[index]?.key ?? -1)?.canJoin ?? []}
                      alliedFaction={
                        picks[index]?.catalogueId === catalogueId
                          ? undefined
                          : factionIndex?.factions.find((entry) => entry.id === picks[index]?.catalogueId)
                      }
                      selected={selected === index}
                      owned={collection.has(unit.entryId)}
                      onSelect={selectUnit}
                      onRemove={drop}
                      onDuplicate={duplicate}
                      onOwned={setUnitOwned}
                      onJoin={join}
                      editable={editable}
                    />
                  ))}
                </Section>
              ) : null
            })
          ) : faction ? (
            <p className="py-6 text-sm text-faint">{editable ? 'Pick a unit to start building.' : 'This roster has no units.'}</p>
          ) : (
            <p className="py-6 text-sm text-faint">Pick a book to start building.</p>
          )}
        </RosterUnits>

        <Pane
          variant="loadout"
          open={showing === 'loadout' && Boolean(selectedUnit || preview)}
          threeColumn={editable}
          title={preview?.name ?? selectedUnit?.name ?? 'Unit'}
          ariaLabel={preview ? 'Datasheet' : 'Loadout'}
          onClose={() => setShowing(null)}
          actions={
            <>
              {preview && editable ? (
                <Button size="sm" className="h-7 px-2 text-[0.6875rem]" onClick={() => add(preview.entryId)}>
                  <Plus className="size-3" />
                  Add to list
                </Button>
              ) : optimisticUnit ? (
                <span className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 @max-[30rem]:gap-1">
                  {warlord && inspectorView === 'edit' ? (
                    <Toggle
                      variant="outline"
                      size="sm"
                      title={`${warlord.selected ? 'Remove' : 'Make'} ${optimisticUnit.name} Warlord`}
                      aria-label={`${warlord.selected ? 'Remove' : 'Make'} ${optimisticUnit.name} Warlord`}
                      pressed={warlord.selected}
                      className={`!h-auto !min-h-0 !min-w-0 gap-1 rounded-sm !px-1.5 !py-px !text-[0.6875rem] !font-semibold !tracking-[0.06em] uppercase ${
                        warlord.selected
                          ? 'border-parchment bg-parchment/15 text-parchment'
                          : 'border-edge-strong text-dim hover:border-info hover:text-bone'
                      }`}
                      onPressedChange={(pressed) => selected !== null && edit.toggle(selected, warlord.key, warlord.name, pressed)}
                    >
                      <Crown className={warlord.selected ? 'fill-current' : undefined} />
                      Warlord
                    </Toggle>
                  ) : null}
                  {warlord?.selected && inspectorView === 'readonly' ? (
                    <span className="chip gap-1 text-info">
                      <Crown className="size-3.5 fill-current" /> Warlord
                    </span>
                  ) : null}
                  <span className="chip w-[4.5rem] justify-center text-info">{optimisticUnit.points} pts</span>
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
                                optimisticUnit.size.options?.findLast((size) => size < optimisticUnit.size.models) ??
                                  optimisticUnit.size.models - 1,
                              )
                          : undefined
                      }
                      onAdd={
                        optimisticUnit.size.models < optimisticUnit.size.max
                          ? () =>
                              selected !== null &&
                              edit.resize(
                                selected,
                                optimisticUnit.size.options?.find((size) => size > optimisticUnit.size.models) ??
                                  optimisticUnit.size.models + 1,
                              )
                          : undefined
                      }
                    />
                  ) : (
                    <span className="chip normal-case">{optimisticUnit.size.models} models</span>
                  )}
                </span>
              ) : null}
              {inspectedEntryId ? referenceRoute ? <FullDatasheetLink route={referenceRoute} /> : <FullDatasheetLinkLoading /> : null}
            </>
          }
        >
          {preview ? datasheet : loadout}
        </Pane>
      </RosterBody>

      <footer className="sticky bottom-0 z-20 border-t border-edge bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2">
            {over ? (
              <TriangleAlert className="size-5 text-destructive" aria-hidden />
            ) : (
              <Check className={`size-5 ${units.length ? 'text-achieved' : 'text-faint'}`} aria-hidden />
            )}
            {/*
             * The mark is the legality statement, and a mark alone says nothing to
             * anyone who cannot see it: it is the whole answer to "can I play this".
             */}
            <span className="sr-only">{over ? 'Over the points limit' : 'Within the points limit'}</span>
            <span data-stat="points" className={`readout text-xl font-bold ${over ? 'text-destructive' : 'text-info'}`}>
              {priced?.points ?? 0}/{limit}
            </span>
            <span className="eyebrow">points</span>
          </span>

          {editable ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto min-[1300px]:hidden"
              onClick={() => setShowing('picker')}
              disabled={!faction}
            >
              Add units
            </Button>
          ) : null}
        </div>
        {editable && save.isError ? (
          <div
            role="alert"
            className="mt-2 flex items-center gap-2 border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Your latest changes have not been saved.</span>
            <Button variant="outline" size="xs" onClick={() => save.mutate()} disabled={save.isPending}>
              Try again
            </Button>
          </div>
        ) : null}
        {priced?.errors.length ? (
          <ul className="mt-2 space-y-1 border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            {priced.errors.slice(0, 8).map((error) => (
              <li key={`${error.entryId}-${error.message}`}>
                {error.entryName}: {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        {priced?.unhandled.length ? (
          <div className="mt-2 border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded">
            <p className="font-semibold uppercase">Could not validate every catalogue rule</p>
            <ul className="mt-1 list-inside list-disc">
              {priced.unhandled.slice(0, 8).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* Under the errors, because a restriction switched off is why one of them is not there. */}
        {dismissedWaivers === waiverKey ? null : (
          <WaiverWarning rules={waivers} onDismiss={() => dismissWaivers(waiverKey)} editable={editable} />
        )}
      </footer>
      <RosterExportDialog text={exportText} onClose={() => setExportText(null)} />
    </RosterShell>
  )
}

type BuilderUnitCardProps = {
  unit: ComponentProps<typeof UnitCard>['unit']
  index: number
  joined: ReturnType<typeof attachmentRows>
  canJoin: ReturnType<typeof joinableUnits>
  alliedFaction: ComponentProps<typeof UnitCard>['alliedFaction']
  selected: boolean
  owned: boolean
  editable: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onDuplicate: (index: number) => void
  onOwned: (entryId: string, owned: boolean) => void
  onJoin: (index: number, targetKey: number | undefined) => void
}

const BuilderUnitCard = memo(function BuilderUnitCard({
  unit,
  index,
  joined,
  canJoin,
  alliedFaction,
  selected,
  owned,
  editable,
  onSelect,
  onRemove,
  onDuplicate,
  onOwned,
  onJoin,
}: BuilderUnitCardProps) {
  return (
    <UnitCard
      unit={unit}
      alliedFaction={alliedFaction}
      selected={selected}
      onSelect={() => onSelect(index)}
      onRemove={() => onRemove(index)}
      onDuplicate={() => onDuplicate(index)}
      owned={owned}
      onOwned={() => onOwned(unit.entryId, !owned)}
      joined={joined.map((row) => ({ ...row, onAct: () => onJoin(row.detach, undefined) }))}
      canJoin={canJoin}
      onJoin={(targetKey) => onJoin(index, targetKey)}
      editable={editable}
    />
  )
})

type CardRelationships = {
  joined: ReturnType<typeof attachmentRows>
  canJoin: ReturnType<typeof joinableUnits>
}

function useCardRelationships(picks: readonly KeyedPick[], units: Parameters<typeof attachmentRows>[1]) {
  const previous = useRef(new Map<number, CardRelationships>())
  const relationships = useMemo(() => {
    const next = new Map<number, CardRelationships>()
    for (const [index, pick] of picks.entries()) {
      const candidate = { joined: attachmentRows(picks, units, index), canJoin: joinableUnits(picks, units, index) }
      const current = previous.current.get(pick.key)
      next.set(pick.key, current && sameRelationships(current, candidate) ? current : candidate)
    }
    return next
  }, [picks, units])
  useLayoutEffect(() => {
    previous.current = relationships
  }, [relationships])
  return relationships
}

function sameRelationships(left: CardRelationships, right: CardRelationships) {
  return (
    left.joined.length === right.joined.length &&
    left.joined.every((row, index) => {
      const other = right.joined[index]
      return Boolean(
        other && row.label === other.label && row.name === other.name && row.action === other.action && row.detach === other.detach,
      )
    }) &&
    left.canJoin.length === right.canJoin.length &&
    left.canJoin.every((unit, index) => unit.key === right.canJoin[index]?.key && unit.name === right.canJoin[index]?.name)
  )
}

function FullDatasheetLink({ route }: { route: NonNullable<Datasheet['referenceRoute']> }) {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Link
            data-slot="full-datasheet-link"
            to="/factions/$catalogueId/datasheets/$entryId"
            params={{ catalogueId: route.catalogueId, entryId: route.slug }}
            target="_blank"
            rel="noreferrer"
            aria-label="Open full datasheet in a new tab"
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          />
        }
      >
        <ExternalLink />
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        Open full datasheet in a new tab
      </TooltipContent>
    </Tooltip>
  )
}

function FullDatasheetLinkLoading() {
  return (
    <span data-slot="full-datasheet-link" aria-hidden className={`${buttonVariants({ variant: 'ghost', size: 'icon-sm' })} text-faint`}>
      <ExternalLink />
    </span>
  )
}
