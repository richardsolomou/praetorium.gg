import { collectionAvailability } from '../../../core/collection'
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
import { collectionInventoryQuery, collectionPhotosQuery } from '../../queries'
import { useCollectionMutation } from '../../useCollection'

export function RemoveFromCollection({ datasheet, onClose }: { datasheet: { id: string; name: string } | null; onClose: () => void }) {
  const inventory = useQuery(collectionInventoryQuery())
  const counts = collectionAvailability(inventory.data ?? [])
  const entry = inventory.data?.find((candidate) => candidate.entryId === datasheet?.id)
  const shared = Boolean(datasheet && !inventory.isPending && !entry && counts[datasheet.id])
  const { mutate: setOwned } = useCollectionMutation()
  const { data: photos } = useQuery(collectionPhotosQuery())
  const models = datasheet ? (entry?.models ?? counts[datasheet.id] ?? 1) : 0
  const photoCount = datasheet ? (photos?.[datasheet.id]?.length ?? 0) : 0
  return (
    <AlertDialog open={Boolean(datasheet)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {datasheet?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {shared ? (
              'These models are shared with another datasheet. Edit their model groups in Collection.'
            ) : (
              <>
                Your count of {models} {models === 1 ? 'model' : 'models'}
                {photoCount ? ` and your ${photoCount === 1 ? 'photo' : `${photoCount} photos`}` : ''} will be lost.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            disabled={inventory.isPending || shared}
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
