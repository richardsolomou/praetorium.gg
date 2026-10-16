import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { collectionPhotoPath } from '../../../contracts/collection'
import { keepCollectionPhotoAsAdmin, removeCollectionPhotoAsAdmin } from '../../functions'
import { heldCollectionPhotosQuery, refreshAdminQueries } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useDateFormatting } from '../../dates'

/** Photos players reported, hidden from everyone but their owners until an administrator keeps or removes each one. */
export function AdminHeldPhotos() {
  const queryClient = useQueryClient()
  const dates = useDateFormatting()
  const held = useQuery(heldCollectionPhotosQuery())
  const decide = useMutation({
    mutationFn: ({ photoId, keep }: { photoId: string; keep: boolean }) =>
      keep ? keepCollectionPhotoAsAdmin({ data: { photoId } }) : removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => refreshAdminQueries(queryClient),
  })
  if (!held.data?.length && !held.error) return null
  return (
    <section className="mb-8">
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Reported photos</span>
        {held.data ? <span className="readout">{held.data.length}</span> : null}
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {held.data?.map((photo) => (
          <li key={photo.photoId} className="flex flex-col gap-2 border border-edge bg-sunken p-3">
            <img
              src={collectionPhotoPath(photo.photoId)}
              alt={`Reported from ${photo.owner.name}’s collection`}
              className="aspect-[4/3] w-full border border-edge bg-panel object-contain"
            />
            <p className="text-sm">
              <Link to="/users/$userId" params={{ userId: photo.owner.id }} search={{ tab: 'collection' }} className="text-info underline">
                {photo.owner.name}
              </Link>
              <span className="text-dim"> · added {dates.date(photo.at)}</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ photoId: photo.photoId, keep: true })}
              >
                <Check /> Keep
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-dim hover:text-destructive"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ photoId: photo.photoId, keep: false })}
              >
                <Trash2 /> Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {held.error || decide.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage(held.error ?? decide.error)}
        </p>
      ) : null}
    </section>
  )
}
