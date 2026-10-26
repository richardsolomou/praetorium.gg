import { favouriteDetachmentKey } from '../../../../core/favouriteDetachments'
import { useFavouriteDetachments } from '../../../favouriteDetachments'
import { FavouriteToggle } from './FavouriteToggle'

/** The account-backed favourite action shared by every detachment surface. */
export function FavouriteDetachmentToggle({
  catalogueId,
  detachmentId,
  name,
  className,
}: {
  catalogueId: string
  detachmentId: string
  name: string
  className?: string
}) {
  const { favourites, toggleFavourite, pending } = useFavouriteDetachments()
  return (
    <FavouriteToggle
      name={name}
      list="favourite detachments"
      favourite={favourites.has(favouriteDetachmentKey(catalogueId, detachmentId))}
      pending={pending.isPending && pending.variables?.detachmentId === detachmentId}
      className={className}
      onToggle={() => toggleFavourite(catalogueId, detachmentId)}
    />
  )
}
