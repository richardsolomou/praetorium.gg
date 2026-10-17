import { useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_COLLECTION_PUBLISHED } from '../../../core/collection'
import { setCollectionPublished } from '../../functions'
import { collectionProfileQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

export function CollectionSharing({ userId }: { userId: string }) {
  const switchId = useId()
  const client = useQueryClient()
  const query = collectionProfileQuery(userId)
  const { data, error } = useQuery(query)
  const save = useMutation({
    mutationFn: (next: boolean) => setCollectionPublished({ data: { published: next } }),
    onSuccess: (next) => client.setQueryData(query.queryKey, (previous) => (previous ? { ...previous, published: next } : previous)),
    onSettled: () => client.invalidateQueries({ queryKey: query.queryKey }),
  })
  return (
    <section id="collection-sharing" className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <h2 className="rubric border-b border-edge pb-2">Collection</h2>
        <p className="mt-2 text-sm text-dim">
          Your profile’s Collection tab lists your datasheets with their owned, built and painted counts, your photos and your wishlist.
        </p>
      </div>
      <label htmlFor={switchId} className="flex items-center justify-between gap-4 border border-edge bg-sunken p-3">
        <span>
          <span className="block text-sm font-semibold text-bone">Show collection on profile</span>
          <span className="block text-xs text-dim">Anyone can see it while this is on.</span>
        </span>
        <Switch
          id={switchId}
          checked={data?.published ?? DEFAULT_COLLECTION_PUBLISHED}
          disabled={!data || save.isPending}
          onCheckedChange={(next) => save.mutate(next)}
        />
      </label>
      {error || save.error ? <p className="text-sm text-destructive">{errorMessage(error ?? save.error)}</p> : null}
    </section>
  )
}
