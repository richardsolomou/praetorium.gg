import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Roster } from '../../core/battle'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { factionsQuery, priceQuery, unitsQuery } from '../queries'

type Props = { onAttach: (roster: Roster) => void; pending: boolean; attached: boolean }

/**
 * Building a list from the catalogue rather than pasting one.
 *
 * Each unit is added as the smallest legal version of itself; changing loadouts
 * and squad sizes is not here yet, so what the player sees is the datasheet's
 * floor. The price and the legality both come from the server, because the
 * catalogue is 90MB and the browser has no business holding it.
 */
export function ListBuilder({ onAttach, pending, attached }: Props) {
  const { data: available } = useQuery(factionsQuery())
  const [catalogueId, setCatalogueId] = useState('')
  const [query, setQuery] = useState('')
  // Picks carry their own key: the same datasheet may legitimately appear twice,
  // so position is the only thing that tells two of them apart.
  const [picked, setPicked] = useState<{ key: number; entryId: string; models?: number }[]>([])
  const [nextKey, setNextKey] = useState(0)
  const [limit, setLimit] = useState<number>(GAME_SIZES[1].limit)
  const [detachmentId, setDetachmentId] = useState<string | undefined>()
  const [name, setName] = useState('')

  const { data: found } = useQuery(unitsQuery(catalogueId, query))
  const { data: priced } = useQuery(
    priceQuery(
      catalogueId,
      detachmentId,
      picked.map(({ entryId, models }) => ({ entryId, models })),
    ),
  )

  if (!available) return null

  const faction = available.factions.find((entry) => entry.id === catalogueId)
  const over = Boolean(priced && priced.points > limit)
  // A list without one is not a legal army, so it cannot be attached.
  const needsDetachment = Boolean(faction?.detachments.length) && !detachmentId

  const resize = (index: number, models: number) =>
    setPicked((current) => current.map((pick, at) => (at === index ? { ...pick, models } : pick)))

  return (
    <div className="space-y-4 rounded-lg border border-edge bg-panel p-4">
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
                  <li key={picked[index]?.key ?? unit.entryId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
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
            <Label htmlFor="listname">Name this army</Label>
            <Input
              id="listname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={ROSTER_NAME_MAX_LENGTH}
              placeholder={`${faction.name} strike force`}
            />
          </div>

          <Button
            className="h-11 w-full text-base"
            disabled={pending || !name.trim() || !priced?.units.length || over || needsDetachment}
            onClick={() => {
              if (!priced) return
              onAttach({
                name,
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
        </>
      ) : null}
    </div>
  )
}
