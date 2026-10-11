import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  collectionLotSchema,
  collectionRequirements,
  collectionShortages,
  type CollectionDemand,
  type CollectionLot,
  type CollectionLotUpdate,
} from '../../../core/collection'
import { updateCollectionLot } from '../../functions'
import { collectionQuery, collectionStockQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'

export function CollectionDialog({ open, onClose, demands }: { open: boolean; onClose: () => void; demands: readonly CollectionDemand[] }) {
  const stockQuery = useQuery({ ...collectionStockQuery(), enabled: open })
  const legacy = useQuery({ ...collectionQuery(), enabled: open })
  const stock = stockQuery.data ?? []
  const [draft, setDraft] = useState<CollectionLot | null>(null)
  const compared = collectionShortages(collectionRequirements(demands), stock)
  const builds = [...new Map(demands.filter((demand) => demand.key).map((demand) => [demand.key!, demand])).values()]
  const legacyEntries: readonly string[] = legacy.data ?? []
  const uncounted = demands.some(
    (demand) => legacyEntries.includes(demand.entryId) && !stock.some((lot) => demand.key && lot.builds.includes(demand.key)),
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(null)
          onClose()
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Physical collection</DialogTitle>
          <DialogDescription>
            Count individual physical models, including characters and vehicle hulls. Recorded stock is shared across all units in this
            roster.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-dim">
            Ownership does not change points or legality. Only select alternative builds your actual models can represent, with the listed
            equipment. Each shared model can supply one requirement at a time.
          </p>
          {uncounted ? (
            <p className="text-xs text-rust">
              Previously marked ownership has no recorded quantity. Enter actual model counts; those marks do not prove this roster is
              covered.
            </p>
          ) : null}
          {stockQuery.isPending ? (
            <p>Loading recorded stock…</p>
          ) : stockQuery.error ? (
            <p role="alert">{errorMessage(stockQuery.error)}</p>
          ) : (
            <>
              <section aria-label="Roster stock requirements" className="space-y-2">
                {compared.map((demand) => (
                  <div key={JSON.stringify([demand.entryId, demand.key])} className="border border-edge p-3 text-xs">
                    <p className="font-medium">{demand.name}</p>
                    <p className="text-dim">{demand.equipment}</p>
                    <p>
                      Needed {demand.models} · Recorded {demand.allocated} · Unaccounted {demand.missing}
                    </p>
                    {demand.key ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={Boolean(draft)}
                        onClick={() =>
                          setDraft({ id: crypto.randomUUID(), name: demand.name.slice(0, 120), models: 0, builds: [demand.key!] })
                        }
                      >
                        Record stock for {demand.name}
                      </Button>
                    ) : (
                      <p className="text-rust">
                        Check model and equipment allocation manually; this requirement cannot be matched automatically.
                      </p>
                    )}
                  </div>
                ))}
              </section>
              <section aria-label="Recorded physical stock" className="space-y-3">
                {[...(draft ? [draft] : []), ...stock.filter((lot) => lot.id !== draft?.id)].map((lot) => (
                  <StockEditor
                    key={lot.id}
                    lot={lot}
                    expected={stock.find((current) => current.id === lot.id) ?? null}
                    builds={builds}
                    onSaved={draft?.id === lot.id ? () => setDraft(null) : undefined}
                    onCancel={draft?.id === lot.id ? () => setDraft(null) : undefined}
                  />
                ))}
                {!stock.length && !draft ? (
                  <p className="text-xs text-dim">No model quantities recorded. This does not mean you own zero models.</p>
                ) : null}
              </section>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function StockEditor({
  lot,
  expected,
  builds,
  onSaved,
  onCancel,
}: {
  lot: CollectionLot
  expected: CollectionLot | null
  builds: readonly CollectionDemand[]
  onSaved?: () => void
  onCancel?: () => void
}) {
  const client = useQueryClient()
  const id = useId()
  const [name, setName] = useState(lot.name)
  const [models, setModels] = useState(String(lot.models))
  const [selected, setSelected] = useState(lot.builds)
  const [baseline, setBaseline] = useState(expected)
  const next = collectionLotSchema.safeParse({ ...lot, name, models: models.trim() ? Number(models) : NaN, builds: selected })
  const mutation = useMutation({
    mutationFn: (update: CollectionLotUpdate) => updateCollectionLot({ data: update }),
    onSuccess: async (_result, update) => {
      setBaseline(update.remove ? null : update.lot)
      await client.invalidateQueries({ queryKey: collectionStockQuery().queryKey })
      onSaved?.()
    },
  })
  return (
    <form
      aria-label={`Stock: ${lot.name}`}
      className="space-y-2 border border-edge p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (next.success) mutation.mutate({ lot: next.data, expected: baseline, remove: false })
      }}
    >
      <label htmlFor={`${id}-name`} className="block text-xs">
        Stock name
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={mutation.isPending}
        />
      </label>
      <label htmlFor={`${id}-models`} className="block text-xs">
        Physical model count
        <Input
          id={`${id}-models`}
          type="number"
          inputMode="numeric"
          min={0}
          max={10_000}
          step={1}
          value={models}
          disabled={mutation.isPending}
          onChange={(event) => setModels(event.target.value)}
        />
      </label>
      <fieldset className="space-y-1 text-xs" disabled={mutation.isPending}>
        <legend className="mb-1">This stock can supply</legend>
        {builds.map((build) => (
          <label key={build.key} className="flex min-h-11 items-start gap-2 py-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.includes(build.key!)}
              onChange={(event) =>
                setSelected((current) => (event.target.checked ? [...current, build.key!] : current.filter((key) => key !== build.key)))
              }
            />
            <span>
              {build.name}
              <span className="block text-dim">{build.equipment}</span>
            </span>
          </label>
        ))}
        {selected.some((key) => !builds.some((build) => build.key === key)) ? (
          <p className="text-dim">
            Other saved builds are retained. If rules or equipment changed, review this physical stock before adding its new build.
          </p>
        ) : null}
      </fieldset>
      {mutation.error ? (
        <p role="alert" className="text-xs text-rust">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      {!next.success ? (
        <p className="text-xs text-rust">Enter a name, a whole model count from 0 to 10,000, and 1 to 16 alternative builds.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" disabled={!next.success || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save stock'}
        </Button>
        {expected ? (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ lot, expected: baseline, remove: true })}
          >
            Remove stock
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
