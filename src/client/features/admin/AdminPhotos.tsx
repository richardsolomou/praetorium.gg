import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { collectionPhotoPath } from '../../../contracts/collection'
import { keepCollectionPhotoAsAdmin, removeCollectionPhotoAsAdmin } from '../../functions'
import { heldCollectionPhotosQuery, recentCollectionPhotosQuery, refreshAdminQueries } from '../../queries'
import { useDateFormatting } from '../../dates'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'

type AdminPhoto = { photoId: string; at: number; owner: { id: string; name: string }; shown?: boolean }

/**
 * Reported photos, hidden from everyone but their owners until an administrator keeps or removes each one, above the
 * newest unreported uploads so one nobody has reported yet can still be removed.
 */
export function AdminPhotos() {
  const queryClient = useQueryClient()
  const held = useQuery(heldCollectionPhotosQuery())
  const recent = useQuery(recentCollectionPhotosQuery())
  const keep = useMutation({
    mutationFn: (photoId: string) => keepCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => refreshAdminQueries(queryClient),
  })
  const remove = useMutation({
    mutationFn: (photoId: string) => removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => refreshAdminQueries(queryClient),
  })
  const [removing, setRemoving] = useState<AdminPhoto | null>(null)
  const pending = keep.isPending || remove.isPending
  const error = held.error ?? recent.error ?? keep.error
  return (
    <div className="space-y-8">
      <PhotoSection
        id="reported-photos"
        title="Reported"
        description="A report hides a photo from everyone but its owner until you keep or remove it. One you kept before stays shown."
        empty="No reported photos are waiting for review."
        photos={held.data}
        pending={pending}
        onRemove={setRemoving}
        onKeep={(photoId) => keep.mutate(photoId)}
      />
      <PhotoSection
        id="recent-photos"
        title="Recently uploaded"
        description="The newest photos nobody has reported, newest first."
        empty="No photos have been uploaded yet."
        photos={recent.data}
        pending={pending}
        onRemove={setRemoving}
      />
      {error ? <Problem error={error} /> : null}
      {removing ? (
        <ConfirmDialog
          title="Remove this photo?"
          description={`It will be deleted from ${removing.owner.name}’s collection for everyone.`}
          cancel="Cancel"
          confirm="Remove"
          pendingLabel="Removing…"
          destructive
          pending={remove.isPending}
          error={remove.error}
          onClose={() => {
            remove.reset()
            setRemoving(null)
          }}
          onConfirm={() => remove.mutate(removing.photoId, { onSuccess: () => setRemoving(null) })}
        />
      ) : null}
    </div>
  )
}

function PhotoSection({
  id,
  title,
  description,
  empty,
  photos,
  pending,
  onRemove,
  onKeep,
}: {
  id: string
  title: string
  description: string
  empty: string
  photos: AdminPhoto[] | undefined
  pending: boolean
  onRemove: (photo: AdminPhoto) => void
  onKeep?: (photoId: string) => void
}) {
  const dates = useDateFormatting()
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="rubric border-b border-edge pb-2">
        {title}
      </h2>
      <p className="mt-2 text-sm text-dim">{photos?.length === 0 ? empty : description}</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos?.map((photo) => (
          <li key={photo.photoId} className="flex min-w-0 flex-col border border-edge bg-sunken">
            <a href={collectionPhotoPath(photo.photoId)} target="_blank" rel="noreferrer" className="block">
              <img
                src={collectionPhotoPath(photo.photoId)}
                alt={`${title} from ${photo.owner.name}’s collection`}
                loading="lazy"
                className="aspect-square w-full bg-panel object-contain"
              />
            </a>
            <div className="flex flex-1 flex-col gap-2 border-t border-edge p-2">
              <p className="min-w-0 text-sm">
                <Link
                  to="/users/$userId"
                  params={{ userId: photo.owner.id }}
                  search={{ tab: 'collection' }}
                  className="block truncate text-info underline"
                >
                  {photo.owner.name}
                </Link>
                <span className="text-xs text-dim">
                  {dates.date(photo.at)}, {dates.time(photo.at)}
                </span>
              </p>
              {photo.shown ? <span className="chip self-start text-discarded">Kept before · still shown</span> : null}
              <div className="mt-auto flex flex-wrap gap-1">
                {onKeep ? (
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onKeep(photo.photoId)}>
                    <Check /> Keep
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-dim hover:text-destructive"
                  disabled={pending}
                  onClick={() => onRemove(photo)}
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
