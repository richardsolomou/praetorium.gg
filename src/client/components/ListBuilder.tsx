import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Crown, Download, EllipsisVertical, Pencil, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import posthog from 'posthog-js'
import { useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Secondary, Stratagem } from '../../core/battle'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import { exportRoster, saveRoster } from '../../server/functions'
import { collectionQuery, factionsQuery, invalidateSavedRosters, priceQuery } from '../queries'
import { useCollectionMutation } from '../useCollection'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { shortName } from './builder/factions'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Stepper } from './builder/LoadoutControls'
import { Picker, type PickerFilter } from './builder/Picker'
import { Section } from './builder/Section'
import { Pane } from './builder/Pane'
import { UnitCard } from './builder/UnitCard'
import { survivingUnits } from './builder/pricePlaceholder'
import { attachmentRows, joinableUnits } from './builder/attachments'
import { pickEditor, usePicks } from './builder/usePicks'
import { RosterSetupDialog, type RosterSetup } from './RosterSetupDialog'
import { RosterExportDialog } from './RosterExportDialog'
import { readWorkspaceState, writeWorkspaceState } from './workspaceState'
import { FactionLabel } from './FactionMark'

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
    visibility: RosterVisibility
    source: RosterSource
  }
  editable?: boolean
  /** A battle token may entitle a read-only viewer to resolve a private roster. */
  battle?: string
  /** Resolve read-only details by saved id; false when the supplied picks are themselves the snapshot. */
  resolvePersistedRoster?: boolean
}

const READ_ONLY_PREFERENCE = 'praetorium.roster-read-only'

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
export function ListBuilder({ prep, initial, editable = true, battle, resolvePersistedRoster = true }: Props) {
  const { data: available } = useQuery(factionsQuery())
  const [catalogueId, setCatalogueId] = useState(initial.catalogueId)
  const { picks, setPicks, positioned, held } = usePicks(initial.picks)
  const [limit, setLimit] = useState(initial.limit)
  const [detachmentIds, setDetachmentIds] = useState<string[]>(initial.detachmentIds)
  const [disposition, setDisposition] = useState<string | null>(initial.disposition)
  const [name, setName] = useState(initial.name)
  const [visibility, setVisibility] = useState<RosterVisibility>(initial.visibility)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ catalogueId: string; entryId: string; name: string } | null>(null)
  const [showing, setShowing] = useState<'picker' | 'loadout' | null>(null)
  const [readOnly, setReadOnly] = useState(!editable)
  const [exportText, setExportText] = useState<string | null>(null)
  const workspacePath = `/rosters/${initial.id}`
  const [setupDraft, setSetupDraftState] = useState<RosterSetup | null>(null)
  const [wideWorkspace, setWideWorkspace] = useState(true)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFilters, setPickerFilters] = useState<Set<PickerFilter>>(new Set())
  const editingSetup = setupDraft !== null

  const setSetupDraft = (draft: RosterSetup | null) => {
    setSetupDraftState(draft)
    writeWorkspaceState(workspacePath, 'roster-setup', draft)
  }

  const savedId = initial.id
  const queryClient = useQueryClient()
  const { data: owned } = useQuery({ ...collectionQuery(), enabled: editable })
  const collection = new Set(owned ?? [])
  const own = useCollectionMutation()

  useEffect(() => setSetupDraftState(readWorkspaceState<RosterSetup>(workspacePath, 'roster-setup')), [workspacePath])
  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 1300px)')
    const sync = () => setWideWorkspace(media.matches)
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
  const togglePickerFilter = (filter: PickerFilter) =>
    setPickerFilters((current) => {
      const next = new Set(current)
      if (!next.delete(filter)) next.add(filter)
      return next
    })

  const faction = available?.factions.find((entry) => entry.id === catalogueId)
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
          visibility,
          source: initial.source,
        },
      }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })

  useEffect(() => {
    if (!editable || !catalogueId || !listName) return
    save.mutate()
    // The mutation reads the complete rendered draft. A later render queues behind
    // this one, so the final request always contains the newest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueId, detachmentIds, disposition, editable, limit, listName, picks, prep, visibility])

  /** Hands the list to another tool, in the format every one of them reads. */
  const take = useMutation({
    mutationFn: () =>
      exportRoster({
        data: { catalogueId, detachmentIds, disposition, limit, name: listName || 'Roster', units: positioned },
      }),
    onSuccess: ({ text }) => setExportText(text),
  })

  const { data: priced } = useQuery({
    ...priceQuery(catalogueId, detachmentIds, disposition, limit, positioned),
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

  if (!available) {
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
  const units = priced?.units ?? []
  const selectedUnit = selected === null ? null : (units[selected] ?? null)
  const selectedPick = selected === null ? null : (picks[selected] ?? null)
  const optimisticUnit =
    selectedUnit && selectedPick
      ? {
          ...selectedUnit,
          size: { ...selectedUnit.size, models: selectedPick.models ?? selectedUnit.size.models },
          // Counts are the evaluated result, never the pick that asked for them.
          // Taking a heavy weapon spends one of the squad's bodies, so a spread the
          // player set in one group can be answered by a different number in another;
          // showing what was asked for would keep insisting on the number that lost.
          choices: selectedUnit.choices.map((choice) => ({
            ...choice,
            chosen: Object.hasOwn(selectedPick.choices ?? {}, choice.key) ? (selectedPick.choices?.[choice.key] ?? '') : choice.chosen,
          })),
          toggles: selectedUnit.toggles.map((toggle) => ({
            ...toggle,
            selected: Object.hasOwn(selectedPick.toggles ?? {}, toggle.key) ? Boolean(selectedPick.toggles?.[toggle.key]) : toggle.selected,
          })),
        }
      : selectedUnit
  const inspectorView = editable && !readOnly ? 'edit' : 'readonly'
  const warlord = optimisticUnit?.toggles.find((toggle) => toggle.name === 'Warlord')

  const edit = pickEditor(setPicks, { catalogueId, units })

  const drop = (index: number) => {
    edit.drop(index)
    posthog.capture('roster_unit_removed', { unit_count: picks.length - 1 })
    setSelected(null)
  }

  const add = (entryId: string) => {
    edit.add(entryId)
    posthog.capture('roster_unit_added', { unit_count: picks.length + 1 })
  }

  const duplicate = (index: number) => {
    edit.duplicate(index)
    posthog.capture('roster_unit_duplicated', { unit_count: picks.length + 1 })
  }

  const join = (index: number, targetKey: number | undefined) => {
    edit.join(index, targetKey)
    posthog.capture('roster_attachment_updated', { attached: targetKey !== undefined })
  }

  const picker =
    editable && faction ? (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Picker
            catalogueId={catalogueId}
            onAdd={add}
            onPreview={(entryId, unitName) => {
              setPreview({ catalogueId, entryId, name: unitName })
              setSelected(null)
              setShowing('loadout')
            }}
            inRoster={held}
            room={priced ? limit - priced.points : null}
            battleSize={limit}
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
      onSwap={(key, count) => selected !== null && edit.swap(selected, key, count)}
      editable={editable && inspectorView === 'edit'}
      showOptions={inspectorView !== 'readonly'}
      persistedRoster={editable || !resolvePersistedRoster ? undefined : { id: savedId, ...(battle ? { battle } : {}) }}
      reference={
        <DatasheetPanel
          catalogueId={datasheetCatalogueId}
          factionSlug={available?.factions.find((entry) => entry.id === datasheetCatalogueId)?.slug ?? ''}
          entryId={selectedUnit?.entryId ?? null}
          detachmentIds={detachmentIds}
          picks={positioned}
          pickIndex={selected}
          showWeapons
          embedded
          hideSummary
        />
      }
    />
  )
  const datasheet = (
    <DatasheetPanel
      catalogueId={datasheetCatalogueId}
      factionSlug={available?.factions.find((entry) => entry.id === datasheetCatalogueId)?.slug ?? ''}
      entryId={preview?.entryId ?? selectedUnit?.entryId ?? null}
      detachmentIds={detachmentIds}
      picks={positioned}
      pickIndex={preview ? null : selected}
      showWeapons
    />
  )

  return (
    <div
      data-roster-builder
      data-saving={save.isPending}
      data-save-error={save.isError}
      className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken"
    >
      <header className="border-b border-edge px-3 py-2">
        <Input
          id="listname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={ROSTER_NAME_MAX_LENGTH}
          placeholder={suggested || 'Named from your picks'}
          aria-label="List name"
          readOnly={!editable}
          className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-[0.02em] uppercase focus-visible:ring-0"
        />

        {faction ? (
          <div className="flex min-w-0 items-center gap-2 text-xs text-dim">
            <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} className="truncate text-info hover:text-bone">
              <FactionLabel faction={faction} />
            </Link>
            <span aria-hidden>·</span>
            <Link to="/rosters" search={{ limit }} className="shrink-0 text-info hover:text-bone">
              {GAME_SIZES.find((size) => size.limit === limit)?.name ?? `${limit} points`}
            </Link>
            {detachmentIds.map((id) => {
              const detachment = faction.detachments.find((candidate) => candidate.id === id)
              return detachment ? (
                <span key={id} className="contents">
                  <span aria-hidden>·</span>
                  <Link
                    to="/factions/$catalogueId/reference/detachments/$detachmentId"
                    params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                    className="truncate hover:text-bone"
                  >
                    {detachment.name}
                  </Link>
                </span>
              ) : null
            })}
            {priced?.disposition ? (
              <span className="contents">
                <span aria-hidden>·</span>
                <span className="shrink-0">
                  {available.factions
                    .flatMap((entry) => entry.detachments)
                    .flatMap((entry) => entry.dispositions)
                    .find((entry) => entry.id === priced.disposition)?.name ?? priced.disposition}
                </span>
              </span>
            ) : null}
            <span className="ml-auto flex shrink-0 items-center gap-1" data-print-hide>
              {editable ? (
                <>
                  <label
                    htmlFor="roster-read-only"
                    className="flex items-center gap-1.5 text-xs font-semibold text-dim"
                    title="Show only this unit’s applied choices"
                  >
                    <Switch id="roster-read-only" checked={readOnly} onCheckedChange={setReadOnlyMode} aria-label="Read-only mode" />
                    Read-only
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Roster actions" className="grid size-7 place-items-center hover:text-bone">
                      <EllipsisVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setSetupDraft({ name: listName, catalogueId, detachmentIds, disposition, limit, visibility })}
                      >
                        <Pencil /> Edit roster setup
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={take.isPending || !units.length} onClick={() => take.mutate()}>
                        <Download /> Export GW text
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
            </span>
          </div>
        ) : null}

        {editable && priced?.dispositionError ? (
          <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {priced.dispositionError} Its detachments disagree, so a battle cannot pick a mission for it.
            <Button
              variant="ghost"
              size="xs"
              className="h-auto p-0 text-destructive underline hover:text-destructive"
              onClick={() => setSetupDraft({ name: listName, catalogueId, detachmentIds, disposition, limit, visibility })}
            >
              Choose one
            </Button>
          </p>
        ) : null}

        {editable && available && editingSetup ? (
          <RosterSetupDialog
            open={editingSetup}
            onOpenChange={(open) => !open && setSetupDraft(null)}
            factions={available.factions}
            value={setupDraft}
            onDraftChange={setSetupDraft}
            hasUnits={Boolean(picks.length)}
            onSave={(setup) => {
              const changedFaction = setup.catalogueId !== catalogueId
              setName(setup.name)
              setCatalogueId(setup.catalogueId)
              setDetachmentIds(setup.detachmentIds)
              setDisposition(setup.disposition)
              setLimit(setup.limit)
              setVisibility(setup.visibility)
              if (changedFaction) {
                edit.clear()
                setSelected(null)
              }
              setSetupDraft(null)
            }}
          />
        ) : null}
      </header>

      <div
        className={`flex min-h-0 flex-1 ${
          editable ? 'min-[1300px]:grid min-[1300px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.45fr)]' : ''
        }`}
      >
        {editable ? (
          <Pane
            variant="picker"
            open={wideWorkspace || showing === 'picker'}
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
            {picker}
          </Pane>
        ) : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3">
          {units.length ? (
            GROUPS.map(({ id, plural }) => {
              const rows = units
                .map((unit, index) => ({ unit, index }))
                .filter(({ unit }) => unit.group === id)
                .toSorted(
                  (left, right) =>
                    Number(collection.has(right.unit.entryId)) - Number(collection.has(left.unit.entryId)) ||
                    left.unit.name.localeCompare(right.unit.name),
                )
              return rows.length ? (
                <Section key={id} title={plural} count={rows.length}>
                  {rows.map(({ unit, index }) => (
                    <UnitCard
                      key={picks[index]?.key ?? unit.entryId}
                      unit={unit}
                      alliedFaction={
                        picks[index]?.catalogueId === catalogueId
                          ? undefined
                          : available.factions.find((entry) => entry.id === picks[index]?.catalogueId)
                      }
                      selected={selected === index}
                      onSelect={() => {
                        setPreview(null)
                        setSelected(index)
                        setShowing('loadout')
                      }}
                      onRemove={() => drop(index)}
                      onDuplicate={() => duplicate(index)}
                      owned={collection.has(unit.entryId)}
                      onOwned={() => own.mutate({ entryId: unit.entryId, owned: !collection.has(unit.entryId) })}
                      joined={attachmentRows(picks, units, index).map((row) => ({ ...row, onAct: () => join(row.detach, undefined) }))}
                      canJoin={joinableUnits(picks, units, index)}
                      onJoin={(targetKey) => join(index, targetKey)}
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
        </div>

        <Pane
          variant="loadout"
          open={showing === 'loadout' && Boolean(selectedUnit || preview)}
          threeColumn={editable}
          title={preview?.name ?? selectedUnit?.name ?? 'Unit'}
          ariaLabel={preview ? 'Datasheet' : 'Loadout'}
          onClose={() => setShowing(null)}
          actions={
            !preview && optimisticUnit ? (
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
            ) : undefined
          }
        >
          {preview ? datasheet : loadout}
        </Pane>
      </div>

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
      </footer>
      <RosterExportDialog text={exportText} onClose={() => setExportText(null)} />
    </div>
  )
}
