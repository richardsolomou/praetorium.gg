import { useQuery } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { collectionCountsQuery, collectionPhotosQuery } from '../../queries'
import { useCollectionMutation } from '../../useCollection'

/** Removing a datasheet deletes its count and photos, so it is confirmed by naming what will be lost. */
export function RemoveFromCollection({ datasheet, onClose }: { datasheet: { id: string; name: string } | null; onClose: () => void }) {
  const { data: counts } = useQuery(collectionCountsQuery())
  const { mutate: setOwned } = useCollectionMutation()
  const { data: photos } = useQuery(collectionPhotosQuery())
  const models = datasheet ? (counts?.[datasheet.id] ?? 1) : 0
  const photoCount = datasheet ? (photos?.[datasheet.id]?.length ?? 0) : 0
  return (
    <AlertDialog open={Boolean(datasheet)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {datasheet?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Your count of {models} {models === 1 ? 'model' : 'models'}
            {photoCount ? ` and your ${photoCount === 1 ? 'photo' : `${photoCount} photos`}` : ''} will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (datasheet) setOwned({ entryId: datasheet.id, owned: false })
              onClose()
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
