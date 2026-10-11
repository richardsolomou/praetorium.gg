import { useId } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { setCollectionPublished } from '../../functions'
import { collectionProfileQuery } from '../../queries'

export function CollectionSharing({ userId, published }: { userId: string; published: boolean }) {
  const switchId = useId()
  const client = useQueryClient()
  const query = collectionProfileQuery(userId)
  const mutation = useMutation({
    mutationFn: (next: boolean) => setCollectionPublished({ data: { published: next } }),
    onSuccess: (next) => client.setQueryData(query.queryKey, (previous) => (previous ? { ...previous, published: next } : previous)),
    onSettled: () => client.invalidateQueries({ queryKey: query.queryKey }),
  })
  return (
    <div className="border border-edge bg-panel p-3">
      <label htmlFor={switchId} className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold text-bone">Show collection on profile</span>
          <span className="block text-xs text-dim">Anyone can see your model counts when this is on.</span>
        </span>
        <Switch id={switchId} checked={published} disabled={mutation.isPending} onCheckedChange={(next) => mutation.mutate(next)} />
      </label>
      {mutation.isError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Could not change sharing. Try again.
        </p>
      ) : null}
    </div>
  )
}
