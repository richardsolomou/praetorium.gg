import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Flag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { collectionPhotoPath } from '../../../contracts/collection'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { removeCollectionPhotoAsAdmin, reportCollectionPhoto } from '../../functions'
import { meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { PhotoLike } from './PhotoLike'

export type SharedPhoto = { photoId: string; owner: { id: string; name: string } }

/** A player's photo at full size, which other signed-in players can report and administrators can remove. */
export function PhotoViewer({
  entryId,
  name,
  photo,
  onClose,
}: {
  entryId: string
  name: string
  photo: SharedPhoto | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const report = useMutation({
    mutationFn: (photoId: string) => reportCollectionPhoto({ data: { photoId, reason } }),
  })
  const remove = useMutation({
    mutationFn: (photoId: string) => removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSuccess: () => {
      onClose()
      return queryClient.invalidateQueries({ queryKey: ['datasheet-photos'] })
    },
  })
  const close = () => {
    setReporting(false)
    setReason('')
    report.reset()
    remove.reset()
    onClose()
  }
  const reportable = Boolean(me && photo && me.id !== photo.owner.id)
  const error = report.error ?? remove.error
  return (
    <Dialog open={Boolean(photo)} onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {photo ? (
              <>
                From{' '}
                <Link
                  to="/users/$userId"
                  params={{ userId: photo.owner.id }}
                  search={{ tab: 'collection' }}
                  className="text-info underline"
                >
                  {photo.owner.name}
                </Link>
                ’s collection
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {photo ? (
            <img
              src={collectionPhotoPath(photo.photoId)}
              alt={`${name} from ${photo.owner.name}’s collection`}
              className="max-h-[65dvh] w-full border border-edge bg-sunken object-contain"
            />
          ) : null}
          {reporting && !report.isSuccess ? (
            <div className="space-y-2">
              <label htmlFor="photo-report" className="text-sm font-semibold">
                What is wrong with this photo?
              </label>
              <Textarea id="photo-report" value={reason} maxLength={500} rows={2} onChange={(event) => setReason(event.target.value)} />
            </div>
          ) : null}
          {report.isSuccess ? <output className="text-sm text-achieved">Thanks. An administrator will review it.</output> : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          ) : null}
        </DialogBody>
        {photo ? (
          <DialogFooter>
            <span className="mr-auto">
              <PhotoLike entryId={entryId} photoId={photo.photoId} name={name} />
            </span>
            {me?.role === 'admin' ? (
              <Button
                variant="ghost"
                className="text-dim hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(photo.photoId)}
              >
                <Trash2 /> Remove photo
              </Button>
            ) : null}
            {reportable && !report.isSuccess ? (
              reporting ? (
                <Button variant="outline" disabled={report.isPending} onClick={() => report.mutate(photo.photoId)}>
                  <Flag /> {report.isPending ? 'Sending…' : 'Send report'}
                </Button>
              ) : (
                <Button variant="ghost" className="text-dim" onClick={() => setReporting(true)}>
                  <Flag /> Report
                </Button>
              )
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
