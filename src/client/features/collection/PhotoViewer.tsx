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
import { useCollectionPhotoRemoval } from '../../useCollection'
import { PhotoLike } from './PhotoLike'
import { Problem } from '../../components/Problem'
import { ConfirmDialog } from '../../components/ConfirmDialog'

/** Below a tall photo on a phone, focus is what brings the report field into view; stable, so a re-render never pulls focus back. */
const focusOnMount = (field: HTMLElement | null) => field?.focus()

export type SharedPhoto = { photoId: string; owner: { id: string; name: string } }

/** A player's photo at full size, which its owner and administrators can remove and other signed-in players can report. */
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
  const [confirming, setConfirming] = useState(false)
  const report = useMutation({
    mutationFn: (photoId: string) => reportCollectionPhoto({ data: { photoId, reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasheet-photos'] }),
  })
  const own = Boolean(me && photo && me.id === photo.owner.id)
  const removeOwn = useCollectionPhotoRemoval()
  const removeAsAdmin = useMutation({
    mutationFn: (photoId: string) => removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['datasheet-photos'] }),
  })
  const remove = own ? removeOwn : removeAsAdmin
  const close = () => {
    setReporting(false)
    setReason('')
    setConfirming(false)
    report.reset()
    remove.reset()
    onClose()
  }
  const reportable = Boolean(me && photo && !own)
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
        <DialogBody className="content-center bg-sunken">
          {photo ? (
            <img
              src={collectionPhotoPath(photo.photoId)}
              alt={`${name} from ${photo.owner.name}’s collection`}
              className="mx-auto max-h-[calc(100dvh-13rem)] max-w-full object-contain"
            />
          ) : null}
          {reporting && !report.isSuccess ? (
            <div className="grid gap-2">
              <label htmlFor="photo-report" className="text-sm font-semibold">
                What is wrong with this photo?
              </label>
              <Textarea
                id="photo-report"
                ref={focusOnMount}
                value={reason}
                maxLength={500}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : null}
          {report.isSuccess ? <output className="text-sm text-achieved">Thanks. An administrator will review it.</output> : null}
          {error ? <Problem error={error} /> : null}
        </DialogBody>
        {photo ? (
          <DialogFooter className="flex-row items-center">
            <span className="mr-auto">
              <PhotoLike entryId={entryId} photoId={photo.photoId} name={name} />
            </span>
            {reporting && !report.isSuccess ? (
              <>
                <Button variant="ghost" className="text-dim" onClick={() => setReporting(false)}>
                  Cancel
                </Button>
                <Button variant="outline" disabled={report.isPending} onClick={() => report.mutate(photo.photoId)}>
                  <Flag /> {report.isPending ? 'Sending…' : 'Send report'}
                </Button>
              </>
            ) : (
              <>
                {reportable && !report.isSuccess ? (
                  <Button variant="ghost" className="text-dim" onClick={() => setReporting(true)}>
                    <Flag /> Report
                  </Button>
                ) : null}
                {own || me?.role === 'admin' ? (
                  <Button
                    variant="ghost"
                    className="text-dim hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => setConfirming(true)}
                  >
                    <Trash2 /> Remove photo
                  </Button>
                ) : null}
              </>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
      <ConfirmDialog
        open={confirming}
        title="Remove this photo?"
        description={
          own
            ? `It will be deleted from your collection, your profile and the ${name} datasheet.`
            : `It will be deleted from ${photo?.owner.name}’s collection for everyone.`
        }
        cancel="Keep"
        confirm="Remove"
        destructive
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          if (!photo) return
          remove.mutate(photo.photoId, { onSuccess: close })
          setConfirming(false)
        }}
      />
    </Dialog>
  )
}
