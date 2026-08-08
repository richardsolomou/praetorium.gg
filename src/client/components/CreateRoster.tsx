import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAME_SIZES } from '../../core/battle'
import { saveRoster } from '../../server/functions'
import { priceQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'

type Faction = {
  id: string
  displayName: string
  detachments: { id: string; name: string; reference: { points: number | null } | null }[]
}

export function CreateRoster({ factions }: { factions: Faction[] }) {
  const [open, setOpen] = useState(false)
  const [catalogueId, setCatalogueId] = useState('')
  const [limit, setLimit] = useState<number>(GAME_SIZES[1].limit)
  const [detachmentIds, setDetachmentIds] = useState<string[]>([])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const faction = factions.find((candidate) => candidate.id === catalogueId)
  const { data: priced } = useQuery(priceQuery(catalogueId, detachmentIds, limit, []))
  const create = useMutation({
    mutationFn: () =>
      saveRoster({
        data: {
          name: [faction?.displayName, ...detachmentIds.map((id) => faction?.detachments.find((entry) => entry.id === id)?.name)]
            .filter(Boolean)
            .join(' — '),
          catalogueId,
          detachmentIds,
          limit,
          picks: [],
          prep: null,
        },
      }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })
      await navigate({ to: '/rosters/$id/edit', params: { id } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> Create editable roster
      </DialogTrigger>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Create roster</DialogTitle>
          <DialogDescription className="text-dim">Choose the army setup before adding units.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <div>
            <label className="eyebrow block" htmlFor="new-roster-faction">
              Faction
            </label>
            <Select
              value={catalogueId}
              onValueChange={(value: string | null) => {
                setCatalogueId(value ?? '')
                setDetachmentIds([])
              }}
            >
              <SelectTrigger id="new-roster-faction" className="mt-1 w-full">
                <SelectValue placeholder="Pick a faction">
                  {(value: unknown) => factions.find((candidate) => candidate.id === value)?.displayName ?? 'Pick a faction'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {factions.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="eyebrow block" htmlFor="new-roster-size">
              Battle size
            </label>
            <Select value={String(limit)} onValueChange={(value: string | null) => setLimit(Number(value ?? GAME_SIZES[1].limit))}>
              <SelectTrigger id="new-roster-size" className="mt-1 w-full">
                <SelectValue>
                  {(value: unknown) => {
                    const size = GAME_SIZES.find((candidate) => String(candidate.limit) === value)
                    return size ? `${size.name} — ${size.limit} pts` : 'Pick a battle size'
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GAME_SIZES.map((size) => (
                  <SelectItem key={size.limit} value={String(size.limit)}>
                    {size.name} — {size.limit} pts
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset disabled={!faction}>
            <legend className="eyebrow">Detachments</legend>
            <div className="mt-1 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
              {faction?.detachments.map((detachment) => {
                const selected = detachmentIds.includes(detachment.id)
                return (
                  <button
                    key={detachment.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDetachmentIds((current) =>
                        selected
                          ? current.filter((id) => id !== detachment.id)
                          : current.length < 3
                            ? [...current, detachment.id]
                            : current,
                      )
                    }
                    className={`flex min-h-10 items-center justify-between gap-2 border px-2 py-1.5 text-left text-xs font-semibold uppercase ${
                      selected ? 'border-azure bg-raised text-azure' : 'border-edge bg-sunken text-dim hover:border-edge-strong'
                    }`}
                  >
                    <span>{detachment.name}</span>
                    {detachment.reference?.points == null ? null : <span className="chip">{detachment.reference.points} DP</span>}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {priced?.detachmentError ? (
            <p role="alert" className="text-xs text-destructive">
              {priced.detachmentError}
            </p>
          ) : null}
          {create.error ? (
            <p role="alert" className="text-xs text-destructive">
              {errorMessage(create.error)}
            </p>
          ) : null}
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button type="submit" disabled={!catalogueId || !detachmentIds.length || Boolean(priced?.detachmentError) || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create roster'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
