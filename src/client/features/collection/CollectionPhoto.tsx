import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Camera } from 'lucide-react'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../contracts/collection'
import { MAX_DATASHEET_PHOTOS, photosShowing } from '../../../core/collectionPhotos'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { collectionCountsAsQuery, collectionPhotoShowsQuery, collectionPhotosQuery, meQuery } from '../../queries'
import { PhotoDropZone } from './PhotoDropZone'
import { PhotoViewer } from './PhotoViewer'
import { usePhotoSteps } from './PhotoLightbox'

const noSheets: readonly { id: string; name: string }[] = []

/**
 * A collection row's photo: its first thumbnail, or a camera when there is none, opening the player's photos of that datasheet.
 *
 * A row whose models count as other datasheets lists each of them apart, so a photo of a magnetised build is filed as that build.
 * A datasheet the row no longer counts as keeps its section while photos are filed under it, without space to add more.
 */
export function CollectionPhoto({
  entryId,
  name,
  army = noSheets,
}: {
  entryId: string
  name: string
  army?: readonly { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const { data: photos } = useQuery(collectionPhotosQuery())
  const { data: shows } = useQuery(collectionPhotoShowsQuery())
  const { data: countsAs } = useQuery(collectionCountsAsQuery())
  const own = photos?.[entryId] ?? []
  const links = new Set(countsAs?.[entryId] ?? [])
  const filed = new Set(own.flatMap((photoId) => shows?.[photoId] ?? []))
  const variants = army.filter((sheet) => sheet.id !== entryId && (links.has(sheet.id) || filed.has(sheet.id)))
  return (
    <>
      <button
        type="button"
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden border border-edge bg-sunken text-faint hover:border-info hover:text-info"
        aria-label={own.length ? `Photos of your ${name}` : `Add photos of your ${name}`}
        onClick={() => setOpen(true)}
      >
        {own[0] ? (
          <img src={collectionPhotoPath(own[0], 'thumbnail')} alt="" className="size-full object-cover" />
        ) : (
          <Camera className="size-5" />
        )}
        {own.length > 1 ? (
          <span className="readout absolute right-0 bottom-0 bg-sunken/90 px-1 text-xs text-bone">{own.length}</span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your {name}</DialogTitle>
            <DialogDescription>
              Add up to {MAX_DATASHEET_PHOTOS} photos of your own models. Anyone who can see your collection sees them on your profile, on
              this datasheet’s page and in their rosters.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {variants.length ? (
              [{ id: entryId, name }, ...variants].map((sheet) => (
                <section key={sheet.id} aria-label={sheet.name} className="space-y-2">
                  <h3 className="eyebrow">{sheet.name}</h3>
                  <OwnPhotos entryId={sheet.id} name={sheet.name} addable={sheet.id === entryId || links.has(sheet.id)} />
                </section>
              ))
            ) : (
              <OwnPhotos entryId={entryId} name={name} />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The player's photos of a datasheet, each opening the viewer that removes it, followed by space to add more. */
export function OwnPhotos({
  entryId,
  name,
  className = 'grid-cols-3',
  addable = true,
}: {
  entryId: string
  name: string
  className?: string
  addable?: boolean
}) {
  const { data: me } = useQuery(meQuery())
  const { data: photos } = useQuery({ ...collectionPhotosQuery(), enabled: Boolean(me) })
  const { data: shows } = useQuery({ ...collectionPhotoShowsQuery(), enabled: Boolean(me) })
  const own = photosShowing(photos ?? {}, shows ?? {}, entryId)
  const viewing = usePhotoSteps(me ? own.map((photoId) => ({ photoId, owner: { id: me.id, name: me.name } })) : [])
  if (!me) return null
  return (
    <div className={cn('grid gap-2', className)} data-own-photos>
      {own.map((photoId, index) => (
        <button
          key={photoId}
          type="button"
          className="block border border-edge hover:border-info"
          aria-label={`Your photo ${index + 1} of ${name}`}
          onClick={() => viewing.open(photoId)}
        >
          <img src={collectionPhotoPath(photoId, 'thumbnail')} alt="" className="aspect-square w-full bg-sunken object-cover" />
        </button>
      ))}
      {addable ? <PhotoDropZone entryId={entryId} name={name} /> : null}
      <PhotoViewer
        entryId={entryId}
        name={name}
        photo={viewing.current}
        onClose={viewing.close}
        onPrevious={viewing.previous}
        onNext={viewing.next}
      />
    </div>
  )
}
