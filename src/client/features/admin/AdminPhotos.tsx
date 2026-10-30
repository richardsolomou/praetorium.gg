import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Heart, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { collectionPhotoPath } from '../../../contracts/collection'
import { keepCollectionPhotoAsAdmin, removeCollectionPhotoAsAdmin } from '../../functions'
import { adminCollectionPhotosQuery, heldCollectionPhotosQuery, refreshAdminQueries } from '../../queries'
import { useDateFormatting } from '../../dates'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { PhotoLightbox, usePhotoSteps } from '../collection/PhotoLightbox'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { countLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'

type AdminPhoto = {
  photoId: string
  name: string
  sheet: { catalogueId: string; slug: string; faction: string } | null
  at: number
  owner: { id: string; name: string }
  /** Reported again after an administrator kept it, and still shown meanwhile. */
  shown?: boolean
  /** Kept by an administrator after an earlier report. */
  kept?: boolean
  likes?: number
}

const NO_PHOTOS: AdminPhoto[] = []

/**
 * Reported photos, hidden from everyone but their owners until an administrator keeps or removes each one, above every
 * unreported upload, newest first, so one nobody has reported yet can still be removed.
 */
export function AdminPhotos() {
  const queryClient = useQueryClient()
  const held = useQuery(heldCollectionPhotosQuery())
  const recent = useInfiniteQuery(adminCollectionPhotosQuery())
  const heldPhotos = held.data
  const recentPhotos = recent.data?.pages.flatMap((page) => page.photos)
  const keep = useMutation({
    mutationFn: (photoId: string) => keepCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => refreshAdminQueries(queryClient),
  })
  const remove = useMutation({
    mutationFn: (photoId: string) => removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => refreshAdminQueries(queryClient),
  })
  const [removing, setRemoving] = useState<AdminPhoto | null>(null)
  const heldViewer = usePhotoSteps(heldPhotos ?? NO_PHOTOS)
  const recentViewer = usePhotoSteps(recentPhotos ?? NO_PHOTOS)
  const viewer = heldViewer.current ? heldViewer : recentViewer
  const viewing = viewer.current
  // Stepping past the last photo loaded asks for the next page, so the viewer can carry on through it.
  const atLoadedEnd = Boolean(recentViewer.current && !recentViewer.next)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = recent
  useEffect(() => {
    if (atLoadedEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [atLoadedEnd, hasNextPage, isFetchingNextPage, fetchNextPage])
  const pending = keep.isPending || remove.isPending
  const error = held.error ?? recent.error ?? keep.error
  /** Leaves the viewer on a neighbour of a photo that is about to leave its list. */
  const stepAway = (photo: AdminPhoto) => {
    if (viewing?.photoId === photo.photoId) (viewer.next ?? viewer.previous ?? viewer.close)()
  }
  const confirmRemoval = removing ? (
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
      onConfirm={() =>
        remove.mutate(removing.photoId, {
          onSuccess: () => {
            stepAway(removing)
            setRemoving(null)
          },
        })
      }
    />
  ) : null
  return (
    <div className="space-y-8">
      <PhotoSection
        id="reported-photos"
        title="Reported"
        description="A report hides a photo from everyone but its owner until you keep or remove it. One you kept before stays shown."
        empty="No reported photos are waiting for review."
        photos={heldPhotos}
        pending={pending}
        onView={heldViewer.open}
        onRemove={setRemoving}
        onKeep={(photoId) => keep.mutate(photoId)}
      />
      <PhotoSection
        id="recent-photos"
        title="Recently uploaded"
        description="Photos nobody has reported, newest first."
        empty="No photos have been uploaded yet."
        photos={recentPhotos}
        pending={pending}
        onView={recentViewer.open}
        onRemove={setRemoving}
      >
        {hasNextPage ? <LoadMore loading={isFetchingNextPage} onLoad={() => void fetchNextPage()} /> : null}
      </PhotoSection>
      {error ? <Problem error={error} /> : null}
      {viewing ? null : confirmRemoval}
      <PhotoLightbox
        open={Boolean(viewing)}
        onClose={viewer.close}
        title={viewing?.name}
        description={viewing ? <PhotoCredit photo={viewing} /> : null}
        src={viewing ? collectionPhotoPath(viewing.photoId) : null}
        alt={viewing ? `${viewing.name} from ${viewing.owner.name}’s collection` : ''}
        onPrevious={viewer.previous}
        onNext={viewer.next}
        footer={
          viewing ? (
            <>
              <span className="mr-auto">
                <PhotoFacts photo={viewing} />
              </span>
              <PhotoActions
                photo={viewing}
                pending={pending}
                onKeep={heldViewer.current ? () => keep.mutate(viewing.photoId, { onSuccess: () => stepAway(viewing) }) : undefined}
                onRemove={() => setRemoving(viewing)}
              />
            </>
          ) : null
        }
      >
        {viewing ? confirmRemoval : null}
        {keep.error ? <Problem error={keep.error} /> : null}
      </PhotoLightbox>
    </div>
  )
}

/** Whose photo it is, linking to their collection, and when it was uploaded. */
function PhotoCredit({ photo, stacked = false }: { photo: AdminPhoto; stacked?: boolean }) {
  const dates = useDateFormatting()
  return (
    <>
      <Link to="/users/$userId" params={{ userId: photo.owner.id }} search={{ tab: 'collection' }} className="text-info underline">
        {photo.owner.name}
      </Link>
      {stacked ? <br /> : ' · '}
      {dates.date(photo.at)}, {dates.time(photo.at)}
    </>
  )
}

/** The photo's review history and how many like it. */
function PhotoFacts({ photo }: { photo: AdminPhoto }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {photo.shown ? <span className="chip text-discarded">Kept before · still shown</span> : null}
      {photo.kept ? <span className="chip text-dim">Kept before</span> : null}
      {photo.likes ? (
        <span className="inline-flex items-center gap-1 text-xs text-dim" aria-label={countLabel(photo.likes, 'like')}>
          <Heart className="size-3" aria-hidden /> {photo.likes}
        </span>
      ) : null}
    </span>
  )
}

function PhotoActions({
  photo,
  pending,
  onKeep,
  onRemove,
}: {
  photo: AdminPhoto
  pending: boolean
  onKeep?: () => void
  onRemove: () => void
}) {
  return (
    <span className={`grid gap-1.5 ${onKeep ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {onKeep ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onKeep}
          aria-label={`Keep ${photo.name} from ${photo.owner.name}`}
        >
          <Check /> Keep
        </Button>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={onRemove}
        aria-label={`Remove ${photo.name} from ${photo.owner.name}`}
      >
        <Trash2 /> Remove
      </Button>
    </span>
  )
}

function PhotoSection({
  id,
  title,
  description,
  empty,
  photos,
  pending,
  onView,
  onRemove,
  onKeep,
  children,
}: {
  id: string
  title: string
  description: string
  empty: string
  photos: AdminPhoto[] | undefined
  pending: boolean
  onView: (photoId: string) => void
  onRemove: (photo: AdminPhoto) => void
  onKeep?: (photoId: string) => void
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id} title={title} />
      <p className="text-sm text-dim">{photos?.length === 0 ? empty : description}</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {photos?.map((photo) => (
          <li key={photo.photoId} className="flex min-w-0 flex-col border border-edge bg-sunken">
            <button
              type="button"
              className="group block"
              aria-label={`${photo.name} from ${photo.owner.name}’s collection`}
              onClick={() => onView(photo.photoId)}
            >
              <img
                src={collectionPhotoPath(photo.photoId, 'thumbnail')}
                alt=""
                loading="lazy"
                className="aspect-square w-full bg-panel object-contain group-hover:opacity-90"
              />
            </button>
            <div className="flex flex-1 flex-col gap-2 border-t border-edge p-2">
              <p className="min-w-0 text-sm">
                {photo.sheet ? (
                  <FactionReferenceLink
                    to="/factions/$catalogueId/datasheets/$entryId"
                    params={{ catalogueId: photo.sheet.catalogueId, entryId: photo.sheet.slug }}
                    className="block truncate font-semibold text-bone uppercase hover:text-info hover:underline"
                  >
                    {photo.name}
                  </FactionReferenceLink>
                ) : (
                  <span className="block truncate text-dim">{photo.name}</span>
                )}
                {photo.sheet ? <span className="block truncate text-xs text-dim">{photo.sheet.faction}</span> : null}
                <span className="mt-1 block truncate text-xs text-dim">
                  <PhotoCredit photo={photo} stacked />
                </span>
              </p>
              <PhotoFacts photo={photo} />
              <span className="mt-auto">
                <PhotoActions
                  photo={photo}
                  pending={pending}
                  onKeep={onKeep && (() => onKeep(photo.photoId))}
                  onRemove={() => onRemove(photo)}
                />
              </span>
            </div>
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}

/** Loads the next page as it scrolls into view, and on a click where scrolling cannot reach it. */
function LoadMore({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!button || loading) return
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && onLoad(), { rootMargin: '400px' })
    observer.observe(button)
    return () => observer.disconnect()
  }, [button, loading, onLoad])
  return (
    <Button ref={setButton} type="button" variant="outline" className="mt-3 w-full" disabled={loading} onClick={onLoad}>
      {loading ? 'Loading…' : 'Show more photos'}
    </Button>
  )
}
