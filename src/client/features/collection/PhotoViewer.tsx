import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Flag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { collectionPhotoPath } from '../../../contracts/collection'
import { removeCollectionPhotoAsAdmin, reportCollectionPhoto } from '../../functions'
import { collectionProfileKey, datasheetPhotosKey, meQuery } from '../../queries'
import { useCollectionPhotoRemoval } from '../../useCollection'
import { PhotoLike } from './PhotoLike'
import { PhotoLightbox } from './PhotoLightbox'
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
  onPrevious,
  onNext,
}: {
  entryId: string
  name: string
  photo: SharedPhoto | null
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
}) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const report = useMutation({
    mutationFn: (photoId: string) => reportCollectionPhoto({ data: { photoId, reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: datasheetPhotosKey() }),
  })
  const own = Boolean(me && photo && me.id === photo.owner.id)
  const removeOwn = useCollectionPhotoRemoval()
  const removeAsAdmin = useMutation({
    mutationFn: (photoId: string) => removeCollectionPhotoAsAdmin({ data: { photoId } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: datasheetPhotosKey() }),
        queryClient.invalidateQueries({ queryKey: collectionProfileKey() }),
      ]),
  })
  const remove = own ? removeOwn : removeAsAdmin
  const reset = () => {
    setReporting(false)
    setReason('')
    setConfirming(false)
    report.reset()
    remove.reset()
  }
  const close = () => {
    reset()
    onClose()
  }
  /** A report or error belongs to the photo it was made about. */
  const step = (go?: () => void) =>
    go &&
    (() => {
      reset()
      go()
    })
  const reportable = Boolean(me && photo && !own)
  const error = report.error ?? remove.error
  return (
    <PhotoLightbox
      open={Boolean(photo)}
      onClose={close}
      title={name}
      description={
        photo ? (
          <>
            From{' '}
            <Link to="/users/$userId" params={{ userId: photo.owner.id }} search={{ tab: 'collection' }} className="text-info underline">
              {photo.owner.name}
            </Link>
            ’s collection
          </>
        ) : null
      }
      src={photo ? collectionPhotoPath(photo.photoId) : null}
      alt={photo ? `${name} from ${photo.owner.name}’s collection` : ''}
      onPrevious={step(onPrevious)}
      onNext={step(onNext)}
      footer={
        photo ? (
          <>
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
          </>
        ) : null
      }
    >
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
    </PhotoLightbox>
  )
}
