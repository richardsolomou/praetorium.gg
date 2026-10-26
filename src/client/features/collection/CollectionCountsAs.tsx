import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_COUNTS_AS } from '../../../core/collection'
import { toggled } from '../../../core/collections'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { collectionCountsAsQuery } from '../../queries'
import { useCollectionCountsAsMutation } from '../../useCollection'
import { matchesSearch } from '../../text'

type Sheet = { id: string; name: string }

/** The other datasheets a player says these models also count as, such as a magnetised kit's builds; nothing shows without any. */
export function CollectionCountsAs({ entryId, candidates }: { entryId: string; candidates: readonly Sheet[] }) {
  const { data } = useQuery(collectionCountsAsQuery())
  const saved = data?.[entryId] ?? []
  const names = candidates.filter((sheet) => saved.includes(sheet.id)).map((sheet) => sheet.name)
  return names.length ? (
    <p data-counts-as className="text-xs break-words text-dim">
      Can also be <span className="text-bone">{names.join(', ')}</span>
    </p>
  ) : null
}

/** Chooses what else one datasheet's models count as; the card menu opens it. */
export function CountsAsDialog({
  datasheet,
  candidates,
  onClose,
}: {
  datasheet: { id: string; name: string } | null
  candidates: readonly Sheet[]
  onClose: () => void
}) {
  const { data } = useQuery(collectionCountsAsQuery())
  return datasheet ? (
    <CountsAsChoice
      key={datasheet.id}
      entryId={datasheet.id}
      name={datasheet.name}
      candidates={candidates}
      saved={data?.[datasheet.id] ?? []}
      onClose={onClose}
    />
  ) : null
}

function CountsAsChoice({
  entryId,
  name,
  candidates,
  saved,
  onClose,
}: {
  entryId: string
  name: string
  candidates: readonly Sheet[]
  saved: readonly string[]
  onClose: () => void
}) {
  const mutation = useCollectionCountsAsMutation()
  // Links to datasheets the current rules no longer list stay chosen, since they cannot be shown to untick.
  const [chosen, setChosen] = useState(() => new Set(saved))
  const [search, setSearch] = useState('')
  const shown = candidates.filter((sheet) => matchesSearch(sheet.name, search))
  const full = chosen.size >= MAX_COUNTS_AS
  const toggle = (id: string, on: boolean) => setChosen((current) => toggled(current, id, on))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>What else can these {name} models be?</DialogTitle>
          <DialogDescription>
            Tick the datasheets these models can stand in for, such as the other builds of a magnetised kit. Your rosters count each model
            once, wherever it goes. This never changes points or legality.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            aria-label="Search this army’s datasheets"
            placeholder="Search this army…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {full ? <p className="text-xs text-dim">You can choose up to {MAX_COUNTS_AS} datasheets.</p> : null}
          <ul className="divide-y divide-edge border border-edge">
            {shown.map((sheet) => (
              <li key={sheet.id}>
                <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-parchment"
                    checked={chosen.has(sheet.id)}
                    disabled={full && !chosen.has(sheet.id)}
                    onChange={(event) => toggle(sheet.id, event.target.checked)}
                  />
                  <span className="min-w-0 break-words">{sheet.name}</span>
                </label>
              </li>
            ))}
            {shown.length ? null : <li className="px-3 py-2 text-sm text-dim">No datasheet in this army matches.</li>}
          </ul>
          {mutation.error ? <Problem error={mutation.error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => void mutation.mutateAsync({ entryId, countsAs: [...chosen] }).then(onClose, () => undefined)}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
