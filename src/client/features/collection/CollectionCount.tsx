import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { CountButton } from '../../components/Stepper'
import { collectionCountsQuery } from '../../queries'
import { useCollectionCountMutation } from '../../useCollection'

export function CollectionCount({ entryId, name }: { entryId: string; name: string }) {
  const { data: counts, isPending } = useQuery(collectionCountsQuery())
  const mutation = useCollectionCountMutation()
  const count = counts?.[entryId] ?? 1
  const [draft, setDraft] = useState(String(count))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(String(count))
  }, [count])
  const value = Number(draft)
  const valid = draft.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= MAX_COLLECTION_MODELS
  const current = valid ? value : count
  const save = (models: number) => {
    setDraft(String(models))
    if (models !== count) mutation.mutate({ entryId, models }, { onError: () => setDraft(String(count)) })
  }
  return (
    <span className="grid shrink-0 grid-cols-[1.5rem_3.5rem_1.5rem] items-center gap-1">
      <CountButton label={`Fewer ${name} models`} decrease onClick={!isPending && current > 1 ? () => save(current - 1) : undefined} />
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_COLLECTION_MODELS}
        step={1}
        aria-label={`${name} models owned`}
        aria-busy={isPending}
        disabled={isPending}
        value={draft}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          focused.current = false
          if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return
          if (valid) save(value)
          else setDraft(String(count))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(String(count))
        }}
        className="readout h-6 w-14 rounded-sm border border-edge-strong bg-transparent px-1 text-center text-sm outline-none [appearance:textfield] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <CountButton
        label={`More ${name} models`}
        onClick={!isPending && current < MAX_COLLECTION_MODELS ? () => save(current + 1) : undefined}
      />
    </span>
  )
}
