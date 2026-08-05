import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Copy, Download, Eye, Save, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Roster, Secondary, Stratagem } from '../../core/battle'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { deleteRoster, exportRoster, importRoster, saveRoster, setOwned } from '../../server/fns'
import { collectionQuery, factionsQuery, priceQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
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
}

type Pick = {
  key: number
  entryId: string
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
export function ListBuilder({ onAttach, pending = false, attached = false, prep, onRestorePrep }: Props) {
  const { data: available } = useQuery(factionsQuery())
  const [catalogueId, setCatalogueId] = useState('')
  // Picks carry their own key: the same datasheet may legitimately appear twice,
  // so position is the only thing that tells two of them apart.
  const [picked, setPicked] = useState<Pick[]>([])
  const [nextKey, setNextKey] = useState(0)
  const [limit, setLimit] = useState<number>(GAME_SIZES[1].limit)
  const [detachmentId, setDetachmentId] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [showing, setShowing] = useState<'picker' | 'loadout' | null>(null)

  const [savedId, setSavedId] = useState<string | undefined>()
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
    setDetachmentId(list.detachmentId ?? undefined)
    setLimit(list.limit)
    setPicked(list.picks.map((pick, at) => ({ ...pick, key: at })))
    setNextKey(list.picks.length)
    setSelected(null)
    if (list.prep) onRestorePrep(list.prep)
  }

  const save = useMutation({
    mutationFn: () =>
      saveRoster({
        data: {
          id: savedId,
          name: listName || 'Untitled list',
          catalogueId,
          detachmentId: detachmentId ?? null,
          limit,
          picks: picked.map(({ entryId, models, choices, spreads, toggles, attachedTo }) => ({
            entryId,
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
      setDetachmentId(imported.detachmentId ?? undefined)
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
          detachmentId,
          name: listName || 'Roster',
          units: picked.map(({ entryId, models, choices, spreads, toggles }) => ({ entryId, models, choices, spreads, toggles })),
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

  const { data: priced } = useQuery(
    priceQuery(
      catalogueId,
      detachmentId,
      picked.map(({ entryId, models, choices, spreads, toggles }) => ({ entryId, models, choices, spreads, toggles })),
    ),
  )

  if (!available) return null

  const faction = available.factions.find((entry) => entry.id === catalogueId)
  const over = Boolean(priced && priced.points > limit)
  // Named for you from what you picked. Editable, but never something you must type.
  const suggested = faction ? [faction.name.split(' - ').at(-1), priced?.detachment].filter(Boolean).join(' — ') : ''
  const listName = name.trim() || suggested
  // A list without one is not a legal army, so it cannot be attached.
  const needsDetachment = Boolean(faction?.detachments.length) && !detachmentId
  const units = priced?.units ?? []
  const selectedUnit = selected === null ? null : (units[selected] ?? null)

  const held: Record<string, number> = {}
  for (const pick of picked) held[pick.entryId] = (held[pick.entryId] ?? 0) + 1

  const add = (entryId: string) => {
    setPicked((current) => [...current, { key: nextKey, entryId }])
    setNextKey((current) => current + 1)
  }

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

  const toggle = (index: number, key: string, enabled: boolean) =>
    setPicked((current) =>
      current.map((pick, at) => (at === index ? { ...pick, toggles: { ...pick.toggles, [key]: enabled ? 1 : 0 } } : pick)),
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
        ...(priced.detachment ? [priced.detachment] : []),
        '',
        ...units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
      ].join('\n'),
      built: {
        catalogueId,
        revision: priced.revision,
        limit,
        detachment: priced.detachment,
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
    <Picker catalogueId={catalogueId} onAdd={add} inRoster={held} room={priced ? limit - priced.points : null} />
  ) : (
    <p className="p-2.5 text-xs text-faint">Pick a book first.</p>
  )

  const loadout = (
    <Loadout
      catalogueId={catalogueId}
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
          <div className="min-w-0">
            <label className="eyebrow block" htmlFor="faction">
              Faction
            </label>
            <Select
              value={catalogueId}
              onValueChange={(value: string | null) => {
                setCatalogueId(value ?? '')
                setPicked([])
                setDetachmentId(undefined)
                setSelected(null)
              }}
            >
              <SelectTrigger id="faction" className="h-6 w-full border-0 bg-transparent px-0 font-semibold text-azure uppercase">
                {/* The value is a catalogue id, so the trigger has to be told the name. */}
                <SelectValue placeholder="Pick a book">
                  {(value: unknown) => available.factions.find((entry) => entry.id === value)?.name ?? 'Pick a book'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.factions.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {faction?.detachments.length ? (
            <div className="min-w-0">
              <label className="eyebrow block" htmlFor="detachment">
                Detachment
              </label>
              <Select value={detachmentId ?? ''} onValueChange={(value: string | null) => setDetachmentId(value ?? undefined)}>
                <SelectTrigger id="detachment" className="h-6 w-full border-0 bg-transparent px-0 font-semibold text-azure uppercase">
                  <SelectValue placeholder="Pick one">
                    {(value: unknown) => faction.detachments.find((entry) => entry.id === value)?.name ?? 'Pick one'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {faction.detachments.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="min-w-0">
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
          {['11th edition', `${priced?.points ?? 0}/${limit} points`, `${units.length} ${units.length === 1 ? 'unit' : 'units'}`].join(
            ' • ',
          )}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="eyebrow cursor-pointer text-azure hover:text-bone" htmlFor="bring">
            <Upload className="mr-1 inline size-3" />
            Bring a list from another tool
          </label>
          <input
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
                  <button
                    type="button"
                    className="max-w-40 truncate px-2 py-0.5 text-xs hover:text-azure"
                    title={`${list.picks.length} units · ${list.limit} points · updated ${new Date(list.updatedAt).toLocaleDateString()}`}
                    onClick={() => loadSaved(list)}
                  >
                    {list.name}
                  </button>
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
                      selected={selected === index}
                      onSelect={() => {
                        setSelected(index)
                        setShowing('loadout')
                      }}
                      onRemove={() => drop(index)}
                      onDuplicate={() => duplicate(index)}
                      owned={collection.has(unit.entryId)}
                      onOwned={() => own.mutate({ entryId: unit.entryId, owned: !collection.has(unit.entryId) })}
                      onToggle={(key, enabled) => toggle(index, key, enabled)}
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
          {/* No aria-label: it would override the text and never announce the change. */}
          <Button variant="outline" size="sm" disabled={save.isPending || !listName || !units.length} onClick={() => save.mutate()}>
            <Save />
            {savedId ? 'Saved' : 'Save list'}
          </Button>
          <Button variant="outline" size="sm" disabled={take.isPending || !units.length} onClick={() => take.mutate()}>
            <Download />
            Export
          </Button>
          {onAttach ? (
            <Button
              size="sm"
              className="h-9 px-4"
              disabled={pending || !listName || !units.length || over || needsDetachment}
              onClick={attach}
            >
              {over && priced
                ? `${priced.points - limit} pts over`
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
