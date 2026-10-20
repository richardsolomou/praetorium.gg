import { useQuery } from '@tanstack/react-query'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { ModelCounter } from '../../components/ModelCounter'
import { collectionCountsQuery } from '../../queries'
import { useCollectionCountMutation } from '../../useCollection'

export function CollectionCount({ entryId, name, stacked = false }: { entryId: string; name: string; stacked?: boolean }) {
  const { data: counts, isPending } = useQuery(collectionCountsQuery())
  const mutation = useCollectionCountMutation()
  return (
    <ModelCounter
      count={isPending ? null : (counts?.[entryId] ?? 1)}
      label={name}
      inputLabel={`${name} models owned`}
      max={MAX_COLLECTION_MODELS}
      stacked={stacked}
      onChange={(models) => mutation.mutateAsync({ entryId, models })}
    />
  )
}
