import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Copy, Download, Eye, Layers3, LoaderCircle, Plus, Trash2, TriangleAlert, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Roster, Secondary, Stratagem } from '../../core/battle'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { deleteRoster, exportRoster, importRoster, saveRoster, setOwned } from '../../server/fns'
import { collectionQuery, factionsQuery, priceQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { shelve, shortName } from './builder/factions'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Picker } from './builder/Picker'
import { Section } from './builder/Section'
import { Pane } from './builder/Pane'
import { UnitCard } from './builder/UnitCard'

type Props = {
  onAttach?: (roster: Roster) => void
  pending?: boolean
  attached?: boolean
  /** What the player has written down, so a saved list carries it and restores it. */
  prep: { stratagems: Stratagem[]; secondaries: Secondary[] }
  onRestorePrep: (prep: { stratagems: Stratagem[]; secondaries: Secondary[] }) => void
  initial?: {
    id: string
    name: string
    catalogueId: string
    detachmentIds: string[]
    limit: number
    picks: Omit<Pick, 'key'>[]
  }
  openImport?: boolean
}

type Pick = {
  key: number
  entryId: string
  catalogueId?: string
  models?: number
  choices?: Record<string, string>
  /** How many of each option a group holds, where a group holds more than one. */
  spreads?: Record<string, Record<string, number>>
  toggles?: Record<string, number>
  /** The key of the unit this one is attached to, when it is. */
  attachedTo?: number
}

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
export function ListBuilder({ onAttach, pending = false, attached = false, prep, onRestorePrep, initial, openImport = false }: Props) {
  const { data: available } = useQuery(factionsQuery())
  const [catalogueId, setCatalogueId] = useState(initial?.catalogueId ?? '')
  const [pickerCatalogueId, setPickerCatalogueId] = useState(initial?.catalogueId ?? '')
  // Picks carry their own key: the same datasheet may legitimately appear twice,
  // so position is the only thing that tells two of them apart.
  const [picked, setPicked] = useState<Pick[]>(() => initial?.picks.map((pick, key) => ({ ...pick, key })) ?? [])
  const [nextKey, setNextKey] = useState(initial?.picks.length ?? 0)
  const [limit, setLimit] = useState<number>(initial?.limit ?? GAME_SIZES[1].limit)
  const [detachmentIds, setDetachmentIds] = useState<string[]>(initial?.detachmentIds ?? [])
  const [name, setName] = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<number | null>(null)
  const [showing, setShowing] = useState<'picker' | 'loadout' | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (openImport) importInput.current?.click()
  }, [openImport])

  const [savedId, setSavedId] = useState<string | undefined>(initial?.id)
  const queryClient = useQueryClient()
  const { data: saved } = useQuery(savedRostersQuery())
  const { data: owned } = useQuery(collectionQuery())
  const collection = new Set(owned ?? [])
  const own = useMutation({
    mutationFn: (input: { entryId: string; owned: boolean }) => setOwned({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionQuery().queryKey }),
  })
  const refreshSaved = () => queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })

  const loadSaved = (list: NonNullable<typeof saved>[number], copy = false) => {
    setSavedId(copy ? undefined : list.id)
    setName(copy ? `Copy of ${list.name}` : list.name)
    setCatalogueId(list.catalogueId)
    setPickerCatalogueId(list.catalogueId)
    setDetachmentIds(list.detachmentIds)
    setLimit(list.limit)
    setPicked(list.picks.map((pick, at) => ({ ...pick, key: at })))
    setNextKey(list.picks.length)
    setSelected(null)
    if (list.prep) onRestorePrep(list.prep)
  }

  const faction = available?.factions.find((entry) => entry.id === catalogueId)
  const suggested = faction
    ? [shortName(faction.name), faction.detachments.find((entry) => entry.id === detachmentIds[0])?.name].filter(Boolean).join(' — ')
    : ''
  const listName = name.trim() || suggested
  const save = useMutation({
    scope: { id: 'roster-autosave' },
    mutationFn: (id: string) =>
      saveRoster({
        data: {
          id,
          name: listName || 'Untitled list',
          catalogueId,
          detachmentIds,
          limit,
          picks: picked.map(({ entryId, catalogueId: unitCatalogueId, models, choices, spreads, toggles, attachedTo }) => ({
            entryId,
            catalogueId: unitCatalogueId,
            models,
            choices,
            spreads,
            toggles,
            // Saved by position, because the keys are this session's own numbering.
            attachedTo: attachedTo === undefined ? undefined : picked.findIndex((pick) => pick.key === attachedTo),
          })),
          prep,
        },
      }),
    onSuccess: ({ id }) => {
      setSavedId(id)
      void refreshSaved()
    },
  })

  useEffect(() => {
    if (!catalogueId || !picked.length || !listName) return
    const id = savedId ?? crypto.randomUUID()
    if (!savedId) setSavedId(id)
    save.mutate(id)
    // The mutation reads the complete rendered draft. A later render queues behind
    // this one, so the final request always contains the newest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogueId, detachmentIds, limit, listName, picked, prep, savedId])

  /**
   * Reading a roster file. `.ros` is text; `.rosz` is a zip, so it travels as base64
   * and the server takes the XML out of it.
   */
  const bring = useMutation({
    mutationFn: async (file: File) => {
      const zipped = file.name.toLowerCase().endsWith('.rosz')
      const body = zipped ? btoa(String.fromCodePoint(...new Uint8Array(await file.arrayBuffer()))) : await file.text()
      return importRoster({ data: { file: body } })
    },
    onSuccess: (imported) => {
      if (imported.catalogueId) setCatalogueId(imported.catalogueId)
      if (imported.catalogueId) setPickerCatalogueId(imported.catalogueId)
      setDetachmentIds(imported.detachmentIds)
      setName(imported.name)
      setPicked(imported.units.map((unit, at) => ({ key: at, ...unit })))
      setNextKey(imported.units.length)
      setSavedId(undefined)
    },
  })

  /** Hands the list to another tool, in the format every one of them reads. */
  const take = useMutation({
    mutationFn: () =>
      exportRoster({
        data: {
          catalogueId,
          detachmentIds,
          limit,
          name: listName || 'Roster',
          units: picked.map(({ entryId, catalogueId: unitCatalogueId, models, choices, spreads, toggles, attachedTo }) => ({
            entryId,
            catalogueId: unitCatalogueId,
            models,
            choices,
            spreads,
            toggles,
            attachedTo: attachedTo === undefined ? undefined : picked.findIndex((candidate) => candidate.key === attachedTo),
          })),
        },
      }),
    onSuccess: ({ filename, xml }) => {
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoster({ data: { id } }),
    onSuccess: () => {
      setSavedId(undefined)
      void refreshSaved()
    },
  })

  const { data: priced } = useQuery({
    ...priceQuery(
      catalogueId,
      detachmentIds,
      limit,
      picked.map(({ entryId, catalogueId: unitCatalogueId, models, choices, spreads, toggles }) => ({
        entryId,
        catalogueId: unitCatalogueId,
        models,
        choices,
        spreads,
        toggles,
      })),
    ),
    placeholderData: keepPreviousData,
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
  // A list without one is not a legal army, so it cannot be attached.
  const needsDetachment = Boolean(faction?.detachments.length) && !detachmentIds.length
  const overDetachmentPoints = Boolean(priced?.detachmentPointsOver)
  const units = priced?.units ?? []
  const selectedUnit = selected === null ? null : (units[selected] ?? null)

  const held: Record<string, number> = {}
  for (const pick of picked) held[pick.entryId] = (held[pick.entryId] ?? 0) + 1

  const add = (entryId: string) => {
    setPicked((current) => [...current, { key: nextKey, entryId, catalogueId: pickerCatalogueId || catalogueId }])
    setNextKey((current) => current + 1)
  }

  const toggleDetachment = (id: string, checked: boolean) =>
    setDetachmentIds((current) => (checked ? (current.includes(id) ? current : [...current, id]) : current.filter((entry) => entry !== id)))

  const resize = (index: number, models: number) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, models } : pick)))

  const choose = (index: number, key: string, optionId: string) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, choices: { ...pick.choices, [key]: optionId } } : pick)))

  /** How many of each option a group holds, leaving the unit's other groups alone. */
  const spread = (index: number, key: string, counts: Record<string, number>) =>
    setPicked((current) =>
      current.map((pick, at) =>
        at === index ? { ...pick, spreads: { ...pick.spreads, [key]: { ...pick.spreads?.[key], ...counts } } } : pick,
      ),
    )

  const toggle = (index: number, key: string, toggleName: string, enabled: boolean) =>
    setPicked((current) =>
      current.map((pick, at) => {
        const toggles = { ...pick.toggles }
        if (toggleName === 'Warlord' && enabled) {
          for (const candidate of units[at]?.toggles ?? []) if (candidate.name === toggleName) toggles[candidate.key] = 0
        }
        return at === index ? { ...pick, toggles: { ...toggles, [key]: enabled ? 1 : 0 } } : { ...pick, toggles }
      }),
    )

  const drop = (index: number) => {
    setPicked((current) => {
      const going = current[index]
      // Anything standing with it is left standing alone rather than pointing at a
      // unit that is no longer in the list.
      const kept: Pick[] = []
      for (const [at, pick] of current.entries()) {
        if (at === index) continue
        kept.push(pick.attachedTo === going?.key ? { ...pick, attachedTo: undefined } : pick)
      }
      return kept
    })
    setSelected(null)
  }

  const duplicate = (index: number) => {
    const source = picked[index]
    if (!source) return
    setPicked((current) => [...current.slice(0, index + 1), { ...source, key: nextKey }, ...current.slice(index + 1)])
    setNextKey((current) => current + 1)
  }

  const join = (index: number, targetKey: number | undefined) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, attachedTo: targetKey } : pick)))

  /**
   * The attachment rows on one unit's card: what it has joined, and what has joined
   * it. Both sides of the same fact, so each card can be read on its own.
   */
  const joinedRows = (index: number) => {
    const rows: { label: string; name: string; action: string; onAct: () => void }[] = []
    const pick = picked[index]
    const unit = units[index]
    if (!pick || !unit) return rows

    if (pick.attachedTo !== undefined) {
      const hostIndex = picked.findIndex((candidate) => candidate.key === pick.attachedTo)
      const host = units[hostIndex]
      if (host) {
        rows.push({
          label: unit.attachment?.kind === 'leader' ? 'Leading' : 'Supporting',
          name: host.name,
          action: 'Remove',
          onAct: () => join(index, undefined),
        })
      }
    }

    for (const [at, candidate] of picked.entries()) {
      if (candidate.attachedTo !== pick.key) continue
      const guest = units[at]
      if (!guest) continue
      rows.push({
        label: guest.attachment?.kind === 'leader' ? 'Leader' : 'Support',
        name: guest.name,
        action: 'Detach',
        onAct: () => join(at, undefined),
      })
    }
    return rows
  }

  /**
   * The units in the list this one may join: named by its own rules, present in the
   * roster, and not already holding it. A unit it is already attached to is not
   * offered again, which is what stops the row and the offer both being on screen.
   */
  const joinable = (index: number) => {
    const pick = picked[index]
    const unit = units[index]
    if (!pick || !unit?.attachment || pick.attachedTo !== undefined) return []
    const wanted = new Set(unit.attachment.targets.map((target) => target.trim().toLowerCase()))
    return picked.flatMap((candidate, at) =>
      at !== index && wanted.has((units[at]?.name ?? '').trim().toLowerCase()) ? [{ key: candidate.key, name: units[at]?.name ?? '' }] : [],
    )
  }

  const attach = () => {
    if (!priced || !onAttach) return
    onAttach({
      name: listName,
      // The readable form travels with the list so an opponent can see it whatever
      // the other instance has synced.
      text: [
        `${priced.points} / ${limit} pts`,
        ...priced.detachments.map(
          (detachment, index) => `${index ? 'Detachment' : 'Primary detachment'}: ${detachment.name} (${detachment.points ?? '?'} DP)`,
        ),
        '',
        ...units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
      ].join('\n'),
      built: {
        catalogueId,
        revision: priced.revision,
        limit,
        detachment: priced.detachment,
        detachments: priced.detachments,
        detachmentPointBudget: priced.detachmentPointBudget,
        disposition: priced.disposition,
        selections: priced.selections,
        // Keys are fixed here because the battle log points at them.
        units: units.map((unit, index) => ({
          key: `${index}-${unit.entryId}`,
          name: unit.name,
          points: unit.points,
          models: unit.size.models,
        })),
      },
    })
  }

  const picker = faction ? (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2.5">
        <label className="eyebrow block" htmlFor="force">
          Force
        </label>
        <Select
          value={pickerCatalogueId || catalogueId}
          onValueChange={(value: string | null) => setPickerCatalogueId(value ?? catalogueId)}
        >
          <SelectTrigger id="force" className="mt-1 w-full">
            <SelectValue>
              {(value: unknown) => {
                const entry = available.factions.find((each) => each.id === value)
                return entry ? shortName(entry.name) : 'Pick a force'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-(--anchor-width) max-w-[min(90vw,24rem)]">
            {shelve(available.factions).map((shelf) => (
              <SelectGroup key={shelf.lineage}>
                <SelectLabel>{shelf.lineage}</SelectLabel>
                {shelf.factions.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {shortName(entry.name)}
                    {entry.id === catalogueId ? ' (primary)' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1">
        <Picker catalogueId={pickerCatalogueId || catalogueId} onAdd={add} inRoster={held} room={priced ? limit - priced.points : null} />
      </div>
    </div>
  ) : (
    <p className="p-2.5 text-xs text-faint">Pick a book first.</p>
  )

  const loadoutCatalogueId = selected === null ? catalogueId : (picked[selected]?.catalogueId ?? catalogueId)
  const loadout = (
    <Loadout
      catalogueId={loadoutCatalogueId}
      catalogueSlug={available.factions.find((entry) => entry.id === loadoutCatalogueId)?.slug ?? loadoutCatalogueId}
      unit={selectedUnit}
      onChoose={(key, optionId) => selected !== null && choose(selected, key, optionId)}
      onSpread={(key, counts) => selected !== null && spread(selected, key, counts)}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken">
      <header className="border-b border-edge px-3 py-2">
        <Input
          id="listname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={ROSTER_NAME_MAX_LENGTH}
          placeholder={suggested || 'Named from your picks'}
          aria-label="List name"
          className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-[0.02em] uppercase focus-visible:ring-0"
        />

        {/*
         * Faction, detachment and battle size read as the values they are rather
         * than as three form controls, because on a phone the header competes with
         * the roster for the screen and the roster is what is being read.
         */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-7">
          <div className="order-1 min-w-0">
            <label className="eyebrow block" htmlFor="faction">
              Faction
            </label>
            <Select
              value={catalogueId}
              onValueChange={(value: string | null) => {
                setCatalogueId(value ?? '')
                setPickerCatalogueId(value ?? '')
                setPicked([])
                setDetachmentIds([])
                setSelected(null)
              }}
            >
              <SelectTrigger id="faction" className="h-6 w-full border-0 bg-transparent px-0 font-semibold text-azure uppercase">
                {/* The value is a catalogue id, so the trigger has to be told the name. */}
                <SelectValue placeholder="Pick a book">
                  {(value: unknown) => {
                    const entry = available.factions.find((each) => each.id === value)
                    return entry ? shortName(entry.name) : 'Pick a book'
                  }}
                </SelectValue>
              </SelectTrigger>
              {/* The lineage every name carries is the heading here rather than
                  nineteen repeated characters on each row, and the list is as wide
                  as its longest name rather than as wide as the column. */}
              <SelectContent className="w-auto min-w-(--anchor-width) max-w-[min(90vw,24rem)]">
                {shelve(available.factions).map((shelf) => (
                  <SelectGroup key={shelf.lineage}>
                    <SelectLabel>{shelf.lineage}</SelectLabel>
                    {shelf.factions.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {shortName(entry.name)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {faction?.detachments.length ? (
            <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:min-w-64">
              <span className="eyebrow block">Detachments</span>
              <div className="mt-1 space-y-1">
                {detachmentIds.map((id, index) => {
                  const entry = faction.detachments.find((candidate) => candidate.id === id)
                  if (!entry) return null
                  return (
                    <div key={id} className="flex min-h-8 items-center gap-2 border border-edge-strong bg-raised px-2 py-1">
                      <Layers3 className="size-3 shrink-0 text-azure" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase">{entry.name}</span>
                      {index === 0 ? <span className="eyebrow text-azure">Primary</span> : null}
                      {entry.reference?.points == null ? null : <span className="chip">{entry.reference.points} DP</span>}
                      <Button variant="ghost" size="icon" aria-label={`Remove ${entry.name}`} onClick={() => toggleDetachment(id, false)}>
                        <X />
                      </Button>
                    </div>
                  )
                })}
                {detachmentIds.length < 3 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Add detachment"
                      className="flex h-8 w-full items-center gap-2 border border-dashed border-edge-strong px-2 text-xs font-semibold text-azure uppercase"
                    >
                      <Plus className="size-3" aria-hidden /> Add detachment
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80 rounded-none border border-edge-strong bg-raised ring-0">
                      {faction.detachments
                        .filter((entry) => !detachmentIds.includes(entry.id))
                        .map((entry) => (
                          <DropdownMenuItem
                            key={entry.id}
                            onClick={() => toggleDetachment(entry.id, true)}
                            className="rounded-none text-xs uppercase focus:bg-edge"
                          >
                            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                            {entry.reference?.points == null ? null : <span className="chip">{entry.reference.points} DP</span>}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {priced?.detachmentError ? (
                  <p role="alert" className="flex max-w-80 gap-1.5 text-xs text-destructive">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {priced.detachmentError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="order-2 min-w-0 sm:order-3">
            <label className="eyebrow block" htmlFor="size">
              Battle size
            </label>
            <Select value={String(limit)} onValueChange={(value: string | null) => setLimit(Number(value ?? GAME_SIZES[1].limit))}>
              <SelectTrigger id="size" className="h-6 w-full border-0 bg-transparent px-0 font-semibold uppercase">
                <SelectValue>
                  {(value: unknown) => GAME_SIZES.find((entry) => String(entry.limit) === value)?.name ?? 'Pick a size'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GAME_SIZES.map((entry) => (
                  <SelectItem key={entry.limit} value={String(entry.limit)}>
                    {entry.name} — {entry.limit} pts
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="mt-1 text-xs text-faint">
          {[
            '11th edition',
            `${priced?.points ?? 0}/${limit} points`,
            priced?.detachmentPointBudget === null || priced?.detachmentPointBudget === undefined
              ? null
              : detachmentIds.length <= 1
                ? `${priced.detachmentPointsSpent} DP detachment`
                : `${priced.detachmentPointsSpent}/${priced.detachmentPointBudget} DP allowance`,
            `${units.length} ${units.length === 1 ? 'unit' : 'units'}`,
          ]
            .filter(Boolean)
            .join(' • ')}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="eyebrow cursor-pointer text-azure hover:text-bone" htmlFor="bring">
            <Upload className="mr-1 inline size-3" />
            Bring a list from another tool
          </label>
          <Input
            ref={importInput}
            id="bring"
            type="file"
            accept=".ros,.rosz"
            disabled={bring.isPending}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) bring.mutate(file)
              event.target.value = ''
            }}
          />
          {saved?.length ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow">Your lists</span>
              {saved.map((list) => (
                <span key={list.id} className="flex items-center border border-edge bg-card">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="max-w-40 truncate rounded-none px-2 py-0.5 text-xs hover:bg-transparent hover:text-azure"
                    title={`${list.picks.length} units · ${list.limit} points · updated ${new Date(list.updatedAt).toLocaleDateString()}`}
                    onClick={() => loadSaved(list)}
                  >
                    {list.name}
                  </Button>
                  <Button
                    render={<Link to="/r/$id" params={{ id: list.id }} />}
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    aria-label={`View ${list.name}`}
                  >
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    aria-label={`Copy ${list.name}`}
                    onClick={() => loadSaved(list, true)}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    aria-label={`Delete ${list.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(list.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              ))}
            </span>
          ) : null}
        </div>

        {bring.error ? <p className="mt-1 text-xs text-destructive">{errorMessage(bring.error)}</p> : null}
        {bring.data?.unknown.length ? (
          <p className="mt-1 text-xs text-destructive">Could not place: {bring.data.unknown.join(', ')}</p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <Pane variant="picker" open={showing === 'picker'} title="Add units" onClose={() => setShowing(null)}>
          {picker}
        </Pane>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {units.length || faction ? (
            GROUPS.map(({ id, plural, empty }) => {
              const rows = units.map((unit, index) => ({ unit, index })).filter(({ unit }) => unit.group === id)
              return (
                <Section key={id} title={plural} count={rows.length} empty={empty}>
                  {rows.map(({ unit, index }) => (
                    <UnitCard
                      key={picked[index]?.key ?? unit.entryId}
                      unit={unit}
                      force={
                        picked[index]?.catalogueId === catalogueId
                          ? undefined
                          : available.factions.find((entry) => entry.id === picked[index]?.catalogueId)?.name
                      }
                      selected={selected === index}
                      onSelect={() => {
                        setSelected(index)
                        setShowing('loadout')
                      }}
                      onRemove={() => drop(index)}
                      onDuplicate={() => duplicate(index)}
                      owned={collection.has(unit.entryId)}
                      onOwned={() => own.mutate({ entryId: unit.entryId, owned: !collection.has(unit.entryId) })}
                      onToggle={(key, toggleName, enabled) => toggle(index, key, toggleName, enabled)}
                      onResize={(models) => resize(index, models)}
                      joined={joinedRows(index)}
                      canJoin={joinable(index)}
                      onJoin={(targetKey) => join(index, targetKey)}
                    />
                  ))}
                </Section>
              )
            })
          ) : (
            <p className="py-6 text-sm text-faint">Pick a book to start building.</p>
          )}

          {priced?.errors.length ? (
            <ul className="mb-4 space-y-1 border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
              {priced.errors.slice(0, 8).map((error) => (
                <li key={`${error.entryId}-${error.message}`}>
                  {error.entryName}: {error.message}
                </li>
              ))}
            </ul>
          ) : null}

          {priced?.unhandled.length ? (
            <div className="mb-4 border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded">
              <p className="font-semibold uppercase">Could not validate every catalogue rule</p>
              <ul className="mt-1 list-inside list-disc">
                {priced.unhandled.slice(0, 8).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Pane variant="loadout" open={showing === 'loadout' && Boolean(selectedUnit)} title="Loadout" onClose={() => setShowing(null)}>
          {loadout}
        </Pane>
      </div>

      <footer className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-edge bg-panel px-3 py-2">
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
          <span data-stat="points" className={`readout text-xl font-bold ${over ? 'text-destructive' : ''}`}>
            {priced?.points ?? 0}/{limit}
          </span>
          <span className="eyebrow">points</span>
        </span>

        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowing('picker')} disabled={!faction}>
          Add units
        </Button>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <output className="inline-flex items-center gap-1 text-xs text-dim" aria-live="polite">
            {save.isPending ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3 text-achieved" aria-hidden />
            )}
            {save.isPending ? 'Saving' : savedId ? 'Saved automatically' : 'Autosaves after the first unit'}
          </output>
          <Button variant="outline" size="sm" disabled={take.isPending || !units.length} onClick={() => take.mutate()}>
            <Download />
            Export
          </Button>
          {onAttach ? (
            <Button
              size="sm"
              className="h-9 px-4"
              disabled={pending || !listName || !units.length || over || needsDetachment || overDetachmentPoints}
              onClick={attach}
            >
              {over && priced
                ? `${priced.points - limit} pts over`
                : overDetachmentPoints && priced && priced.detachmentPointBudget !== null
                  ? 'Invalid detachments'
                  : needsDetachment
                    ? 'Pick a detachment first'
                    : attached
                      ? 'Replace my list'
                      : 'Attach this list'}
            </Button>
          ) : null}
        </span>
      </footer>
    </div>
  )
}
