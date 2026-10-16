import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { collectionAvailability, MAX_COLLECTION_MODELS } from '../../../core/collection'
import { ModelCounter } from '../../components/ModelCounter'
import { collectionInventoryQuery } from '../../queries'
import { useCollectionCountMutation } from '../../useCollection'

export function CollectionCount({ entryId, name }: { entryId: string; name: string }) {
  const { data: counts, isPending } = useQuery(collectionInventoryQuery())
  const available = collectionAvailability(counts ?? [])
  const entry = counts?.find((candidate) => candidate.entryId === entryId)
  const mutation = useCollectionCountMutation()
  if (!isPending && !entry && available[entryId])
    return (
      <Link to="/collection" className="text-sm text-info underline">
        Shared models · manage collection
      </Link>
    )
  if (entry?.groups)
    return (
      <span className="readout text-sm text-bone">
        {entry.models} {entry.models === 1 ? 'model' : 'models'}
      </span>
    )
  return (
    <ModelCounter
      count={isPending ? null : (entry?.models ?? 1)}
      label={name}
      inputLabel={`${name} models owned`}
      max={MAX_COLLECTION_MODELS}
      onChange={(models) => mutation.mutateAsync({ entryId, models })}
    />
  )
}
