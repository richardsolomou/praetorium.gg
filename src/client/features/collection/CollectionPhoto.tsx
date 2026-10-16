import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../contracts/collection'
import { MAX_DATASHEET_PHOTOS } from '../../../core/collectionPhotos'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { collectionPhotosQuery, meQuery } from '../../queries'
import { PhotoDropZone } from './PhotoDropZone'
import { PhotoViewer } from './PhotoViewer'

/** A collection row's photo: its first thumbnail, or a camera when there is none, opening the player's photos of that datasheet. */
export function CollectionPhoto({ entryId, name }: { entryId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const { data: photos } = useQuery(collectionPhotosQuery())
  const own = photos?.[entryId] ?? []
  return (
    <>
      <button
        type="button"
        className="relative grid size-16 shrink-0 place-items-center overflow-hidden border border-edge bg-sunken text-faint hover:border-info hover:text-info"
        aria-label={own.length ? `Photos of your ${name}` : `Add photos of your ${name}`}
        onClick={() => setOpen(true)}
      >
        {own[0] ? <img src={collectionPhotoPath(own[0])} alt="" className="size-full object-cover" /> : <Camera className="size-5" />}
        {own.length > 1 ? (
          <span className="readout absolute right-0 bottom-0 bg-sunken/90 px-1 text-xs text-bone">{own.length}</span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your {name}</DialogTitle>
            <DialogDescription>
              Add up to {MAX_DATASHEET_PHOTOS} photos you took. Anyone who can see your collection sees them on your profile, on this
              datasheet’s page and in their rosters.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <OwnPhotos entryId={entryId} name={name} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The player's photos of a datasheet, each opening the viewer that removes it, followed by space to add more. */
export function OwnPhotos({ entryId, name, className = 'grid-cols-3' }: { entryId: string; name: string; className?: string }) {
  const { data: me } = useQuery(meQuery())
  const { data: photos } = useQuery({ ...collectionPhotosQuery(), enabled: Boolean(me) })
  const [viewing, setViewing] = useState<string | null>(null)
  if (!me) return null
  const own = photos?.[entryId] ?? []
  return (
    <div className={`grid gap-2 ${className}`} data-own-photos>
      {own.map((photoId, index) => (
        <button
          key={photoId}
          type="button"
          className="block border border-edge hover:border-info"
          aria-label={`Your photo ${index + 1} of ${name}`}
          onClick={() => setViewing(photoId)}
        >
          <img src={collectionPhotoPath(photoId)} alt="" className="aspect-square w-full bg-sunken object-cover" />
        </button>
      ))}
      <PhotoDropZone entryId={entryId} name={name} className="aspect-square" />
      <PhotoViewer
        entryId={entryId}
        name={name}
        photo={viewing ? { photoId: viewing, owner: { id: me.id, name: me.name } } : null}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
