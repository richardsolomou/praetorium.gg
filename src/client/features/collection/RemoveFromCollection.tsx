import { useQuery } from '@tanstack/react-query'
import { collectionCountsQuery, collectionPhotosQuery, collectionProgressQuery } from '../../queries'
import { useCollectionMutation } from '../../useCollection'
import { ConfirmDialog } from '../../components/ConfirmDialog'

/** Removing a datasheet deletes its count and photos, so it is confirmed by naming what will be lost. */
export function RemoveFromCollection({ datasheet, onClose }: { datasheet: { id: string; name: string } | null; onClose: () => void }) {
  const { data: counts } = useQuery(collectionCountsQuery())
  const { mutate: setOwned } = useCollectionMutation()
  const { data: photos } = useQuery(collectionPhotosQuery())
  const { data: progress } = useQuery(collectionProgressQuery())
  const built = datasheet ? progress?.[datasheet.id] : undefined
  const models = datasheet ? (counts?.[datasheet.id] ?? 1) : 0
  const photoCount = datasheet ? (photos?.[datasheet.id]?.length ?? 0) : 0
  return (
    <ConfirmDialog
      open={Boolean(datasheet)}
      title={`Remove ${datasheet?.name}?`}
      description={
        <>
          Your count of {models} {models === 1 ? 'model' : 'models'}
          {built ? ` (${built.built} built, ${built.painted} painted)` : ''}
          {photoCount ? ` and your ${photoCount === 1 ? 'photo' : `${photoCount} photos`}` : ''} will be lost.
        </>
      }
      cancel="Keep"
      confirm="Remove"
      destructive
      onClose={onClose}
      onConfirm={() => {
        if (datasheet) setOwned({ entryId: datasheet.id, owned: false })
        onClose()
      }}
    />
  )
}
