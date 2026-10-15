import { useQuery } from '@tanstack/react-query'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { collectionPhotoPath } from '../../../contracts/collection'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { collectionPhotosQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useCollectionPhotoMutation } from '../../useCollection'

/** A collection row's photo: a thumbnail, or a camera when there is none, opening a dialog to add, replace or remove it. */
export function CollectionPhoto({ entryId, name }: { entryId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const { data: photos } = useQuery(collectionPhotosQuery())
  const photoId = photos?.[entryId]
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="overflow-hidden text-faint hover:text-info"
        aria-label={photoId ? `Photo of your ${name}` : `Add a photo of your ${name}`}
        onClick={() => setOpen(true)}
      >
        {photoId ? <img src={collectionPhotoPath(photoId)} alt="" className="size-full object-cover" /> : <Camera />}
      </Button>
      <CollectionPhotoDialog entryId={entryId} name={name} photoId={photoId} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function CollectionPhotoDialog({
  entryId,
  name,
  photoId,
  open,
  onOpenChange,
}: {
  entryId: string
  name: string
  photoId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const { mutate, isPending, error, reset } = useCollectionPhotoMutation()
  const change = (file: File | null) => {
    mutate({ entryId, file })
    if (fileInput.current) fileInput.current.value = ''
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your {name}</DialogTitle>
          <DialogDescription>
            Only add photos you took. Anyone who can see your collection sees this photo on your profile, on this datasheet’s page and in
            their rosters.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {photoId ? (
            <img
              src={collectionPhotoPath(photoId)}
              alt={`The ${name} in this collection`}
              className="max-h-[60dvh] w-full border border-edge bg-sunken object-contain"
            />
          ) : (
            <p className="grid place-items-center gap-2 border border-dashed border-edge-strong bg-sunken/60 px-4 py-10 text-center text-sm text-dim">
              <Camera className="size-6 text-faint" aria-hidden />
              No photo yet
            </p>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error, 'The photo could not be saved.')}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={`Choose a photo of your ${name}`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) change(file)
            }}
          />
          {photoId ? (
            <Button variant="ghost" className="text-dim hover:text-destructive" disabled={isPending} onClick={() => change(null)}>
              <Trash2 /> Remove photo
            </Button>
          ) : null}
          <Button variant="outline" disabled={isPending} onClick={() => fileInput.current?.click()}>
            <ImagePlus /> {isPending ? 'Saving…' : photoId ? 'Replace photo' : 'Add photo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
