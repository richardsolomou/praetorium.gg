import { useQuery } from '@tanstack/react-query'
import { ModelCounter } from '../../components/ModelCounter'
import { collectionCountsQuery, collectionProgressQuery } from '../../queries'
import { useCollectionProgressMutation } from '../../useCollection'
import { CollectionCount } from './CollectionCount'

/** Built models are some of those owned, and painted models some of those built, so each counter is bounded by the one before. */
export function CollectionEntryCounts({ entryId, name }: { entryId: string; name: string }) {
  const counts = useQuery(collectionCountsQuery())
  const { data: progress, isPending } = useQuery(collectionProgressQuery())
  const mutation = useCollectionProgressMutation()
  const models = counts.isPending ? null : (counts.data?.[entryId] ?? 1)
  const built = isPending || models === null ? null : (progress?.[entryId]?.built ?? 0)
  const painted = built === null ? null : (progress?.[entryId]?.painted ?? 0)
  return (
    <span className="@container block">
      <span className="grid grid-cols-1 gap-2 @[15rem]:grid-cols-3">
        <CollectionCount entryId={entryId} name={name} compact caption="Owned" />
        <ModelCounter
          count={built}
          label={`built ${name}`}
          inputLabel={`${name} models built`}
          min={0}
          max={models ?? 0}
          compact
          caption="Built"
          maxAction
          onChange={(next) => mutation.mutateAsync({ entryId, built: next, painted: Math.min(painted ?? 0, next) })}
        />
        <ModelCounter
          count={painted}
          label={`painted ${name}`}
          inputLabel={`${name} models painted`}
          min={0}
          max={built ?? 0}
          compact
          caption="Painted"
          maxAction
          onChange={(next) => mutation.mutateAsync({ entryId, built: built ?? 0, painted: next })}
        />
      </span>
    </span>
  )
}
