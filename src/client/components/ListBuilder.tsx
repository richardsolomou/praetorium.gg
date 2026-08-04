import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Minus, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Roster, Secondary, Stratagem } from '../../core/battle'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { deleteRoster, exportRoster, importRoster, saveRoster } from '../../server/fns'
import { factionsQuery, priceQuery, savedRostersQuery, unitsQuery } from '../queries'
import { errorMessage } from '../queryClient'

type Props = {
  onAttach: (roster: Roster) => void
  pending: boolean
  attached: boolean
  /** What the player has written down, so a saved list carries it and restores it. */
  prep: { stratagems: Stratagem[]; secondaries: Secondary[] }
  onRestorePrep: (prep: { stratagems: Stratagem[]; secondaries: Secondary[] }) => void
}

/** Base UI selects cannot hold an empty value, so declining a choice needs a token. */
const NONE = '__none__'

/**
 * Building a list from the catalogue rather than pasting one.
 *
 * Each unit is added as the smallest legal version of itself; changing loadouts
 * and squad sizes is not here yet, so what the player sees is the datasheet's
 * floor. The price and the legality both come from the server, because the
 * catalogue is 90MB and the browser has no business holding it.
 */
export function ListBuilder({ onAttach, pending, attached, prep, onRestorePrep }: Props) {
  const { data: available } = useQuery(factionsQuery())
  const [catalogueId, setCatalogueId] = useState('')
  const [query, setQuery] = useState('')
  // Picks carry their own key: the same datasheet may legitimately appear twice,
  // so position is the only thing that tells two of them apart.
  const [picked, setPicked] = useState<{ key: number; entryId: string; models?: number; choices?: Record<string, string> }[]>([])
  const [nextKey, setNextKey] = useState(0)
  const [limit, setLimit] = useState<number>(GAME_SIZES[1].limit)
  const [detachmentId, setDetachmentId] = useState<string | undefined>()
  const [name, setName] = useState('')

  const [savedId, setSavedId] = useState<string | undefined>()
  const queryClient = useQueryClient()
  const { data: saved } = useQuery(savedRostersQuery())
  const refreshSaved = () => queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })

  const save = useMutation({
    mutationFn: () =>
      saveRoster({
        data: {
          id: savedId,
          name: listName || 'Untitled list',
          catalogueId,
          detachmentId: detachmentId ?? null,
          limit,
          picks: picked.map(({ entryId, models, choices }) => ({ entryId, models, choices })),
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
      setName(imported.name)
      setPicked(imported.units.map((unit, at) => ({ key: at, entryId: unit.entryId, models: unit.models })))
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
          units: picked.map(({ entryId, models, choices }) => ({ entryId, models, choices })),
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

  const { data: found } = useQuery(unitsQuery(catalogueId, query))
  const { data: priced } = useQuery(
    priceQuery(
      catalogueId,
      detachmentId,
      picked.map(({ entryId, models, choices }) => ({ entryId, models, choices })),
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

  const resize = (index: number, models: number) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, models } : pick)))

  const choose = (index: number, key: string, optionId: string) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, choices: { ...pick.choices, [key]: optionId } } : pick)))

  return (
    <div className="space-y-4 rounded-lg border border-edge bg-panel p-4">
      {saved?.length ? (
        <div className="space-y-1.5">
          <p className="eyebrow">Your lists</p>
          <ul className="divide-y divide-edge rounded-md border border-edge">
            {saved.map((list) => (
              <li key={list.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:text-amber"
                  onClick={() => {
                    setSavedId(list.id)
                    setName(list.name)
                    setCatalogueId(list.catalogueId)
                    setDetachmentId(list.detachmentId ?? undefined)
                    setLimit(list.limit)
                    setPicked(list.picks.map((pick, at) => ({ key: at, ...pick })))
                    setNextKey(list.picks.length)
                    // Stratagems are typed once and travel with the list.
                    if (list.prep) onRestorePrep(list.prep)
                  }}
                >
                  {list.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${list.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(list.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="bring">Bring a list from another tool</Label>
        <div className="flex items-center gap-2">
          <input
            id="bring"
            type="file"
            accept=".ros,.rosz"
            disabled={bring.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) bring.mutate(file)
              event.target.value = ''
            }}
            className="min-w-0 flex-1 text-xs text-dim file:mr-2 file:rounded-md file:border file:border-edge file:bg-raised file:px-2 file:py-1 file:text-bone"
          />
          <Upload className="size-4 shrink-0 text-dim" />
        </div>
        {bring.error ? <p className="text-xs text-destructive">{errorMessage(bring.error)}</p> : null}
        {bring.data?.unknown.length ? <p className="text-xs text-destructive">Could not place: {bring.data.unknown.join(', ')}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="faction">Army</Label>
        <Select
          value={catalogueId}
          onValueChange={(value: string | null) => {
            setCatalogueId(value ?? '')
            setPicked([])
            setDetachmentId(undefined)
          }}
        >
          <SelectTrigger id="faction" className="w-full">
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

      <div className="space-y-2">
        <Label htmlFor="size">Game size</Label>
        <Select value={String(limit)} onValueChange={(value: string | null) => setLimit(Number(value ?? GAME_SIZES[1].limit))}>
          <SelectTrigger id="size" className="w-full">
            <SelectValue>
              {(value: unknown) => {
                const chosen = GAME_SIZES.find((entry) => String(entry.limit) === value)
                return chosen ? `${chosen.name} — ${chosen.limit} pts` : 'Pick a size'
              }}
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

      {faction?.detachments.length ? (
        <div className="space-y-2">
          <Label htmlFor="detachment">Detachment</Label>
          <Select value={detachmentId ?? ''} onValueChange={(value: string | null) => setDetachmentId(value ?? undefined)}>
            <SelectTrigger id="detachment" className="w-full">
              <SelectValue placeholder="Pick a detachment">
                {(value: unknown) => faction.detachments.find((entry) => entry.id === value)?.name ?? 'Pick a detachment'}
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

      {faction ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="search">Add a unit</Label>
            <Input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search datasheets" />
            {found?.length ? (
              <ul className="max-h-56 divide-y divide-edge overflow-y-auto rounded-md border border-edge">
                {found.map((unit) => (
                  <li key={unit.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-raised"
                      onClick={() => {
                        setPicked((current) => [...current, { key: nextKey, entryId: unit.id }])
                        setNextKey((current) => current + 1)
                      }}
                    >
                      <span className="truncate">{unit.name}</span>
                      <Plus className="size-4 shrink-0 text-dim" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-dim">{query ? 'Nothing by that name.' : 'Start typing to find a datasheet.'}</p>
            )}
          </div>

          {priced?.units.length ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">Your list</p>
                <p data-stat="points" className={`readout text-lg ${priced.points > limit ? 'text-destructive' : ''}`}>
                  {priced.points} / {limit} pts
                </p>
              </div>
              <ul className="divide-y divide-edge rounded-md border border-edge">
                {priced.units.map((unit, index) => (
                  <li key={picked[index]?.key ?? unit.entryId} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{unit.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {unit.size.resizable ? (
                          <span className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Fewer models in ${unit.name}`}
                              disabled={unit.size.models <= unit.size.min}
                              onClick={() => resize(index, unit.size.models - 1)}
                            >
                              <Minus />
                            </Button>
                            <span className="readout w-10 text-center text-xs" aria-label={`${unit.name} models`}>
                              {unit.size.models}
                            </span>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`More models in ${unit.name}`}
                              disabled={unit.size.models >= unit.size.max}
                              onClick={() => resize(index, unit.size.models + 1)}
                            >
                              <Plus />
                            </Button>
                          </span>
                        ) : null}
                        <span className="readout w-10 text-right text-dim">{unit.points}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${unit.name}`}
                          onClick={() => setPicked((current) => current.filter((_, at) => at !== index))}
                        >
                          <X />
                        </Button>
                      </span>
                    </div>

                    {unit.choices.length ? (
                      <div className="mt-2 space-y-1.5 border-l border-edge pl-3">
                        {unit.choices.map((choice) => (
                          <div key={choice.key} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 truncate text-xs text-dim">{choice.name}</span>
                            <Select
                              value={choice.chosen || NONE}
                              onValueChange={(value: string | null) => choose(index, choice.key, value === NONE ? '' : (value ?? ''))}
                            >
                              <SelectTrigger className="h-8 flex-1 text-xs" aria-label={`${unit.name} ${choice.name}`}>
                                <SelectValue>
                                  {(value: unknown) => choice.options.find((option) => option.id === value)?.name ?? 'Choose'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {choice.options.map((option) => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.name}
                                    {option.points ? ` (+${option.points})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {priced.errors.length ? (
                <ul className="space-y-1 text-xs text-destructive">
                  {priced.errors.slice(0, 8).map((error) => (
                    <li key={`${error.entryId}-${error.message}`}>
                      {error.entryName}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-dim">Nothing illegal about it.</p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="listname">List name</Label>
            <Input
              id="listname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={ROSTER_NAME_MAX_LENGTH}
              placeholder={suggested}
            />
          </div>

          <div className="flex gap-2">
            {/* No aria-label: it would override the text and never announce the change. */}
            <Button
              variant="outline"
              className="h-11"
              disabled={save.isPending || !listName || !priced?.units.length}
              onClick={() => save.mutate()}
            >
              <Save />
              {savedId ? 'Saved' : 'Save list'}
            </Button>
            <Button variant="outline" className="h-11" disabled={take.isPending || !priced?.units.length} onClick={() => take.mutate()}>
              <Download />
              Export
            </Button>
            <Button
              className="h-11 flex-1 text-base"
              disabled={pending || !listName || !priced?.units.length || over || needsDetachment}
              onClick={() => {
                if (!priced) return
                onAttach({
                  name: listName,
                  // The readable form travels with the list so an opponent can see it
                  // whatever the other instance has synced.
                  text: [
                    `${priced.points} / ${limit} pts`,
                    ...(priced.detachment ? [priced.detachment] : []),
                    '',
                    ...priced.units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
                  ].join('\n'),
                  built: {
                    catalogueId,
                    revision: priced.revision,
                    limit,
                    detachment: priced.detachment,
                    disposition: priced.disposition,
                    selections: priced.selections,
                    // Keys are fixed here because the battle log points at them.
                    units: priced.units.map((unit, index) => ({
                      key: `${index}-${unit.entryId}`,
                      name: unit.name,
                      points: unit.points,
                      models: unit.size.models,
                    })),
                  },
                })
              }}
            >
              {over && priced
                ? `${priced.points - limit} pts over`
                : needsDetachment
                  ? 'Pick a detachment first'
                  : attached
                    ? 'Replace my list'
                    : 'Attach this list'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
