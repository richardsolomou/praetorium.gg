import { useQuery } from '@tanstack/react-query'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { Stepper } from '../../components/Stepper'
import { collectionCountsQuery } from '../../queries'
import { useCollectionCountMutation } from '../../useCollection'

/** A datasheet joins the collection holding one model; removing it, not counting down, takes it out. */
export function CollectionCount({ entryId, name }: { entryId: string; name: string }) {
  const { data: counts, isPending } = useQuery(collectionCountsQuery())
  const mutation = useCollectionCountMutation()
  const count = counts?.[entryId] ?? 1
  const save = (models: number) => mutation.mutate({ entryId, models })
  return (
    <Stepper
      label={`${name} models`}
      countLabel={`${name} models owned`}
      count={count}
      loading={isPending}
      onRemove={!isPending && count > 1 ? () => save(count - 1) : undefined}
      onAdd={!isPending && count < MAX_COLLECTION_MODELS ? () => save(count + 1) : undefined}
      choices={Array.from({ length: Math.min(MAX_COLLECTION_MODELS, count + 20) }, (_, index) => index + 1)}
      onChoose={save}
    />
  )
}
