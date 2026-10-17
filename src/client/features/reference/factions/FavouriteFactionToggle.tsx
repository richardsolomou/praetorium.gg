import { useFavouriteFactions } from '../../../favouriteFactions'
import { FavouriteToggle } from './FavouriteToggle'

/** The account-backed favourite action shared by every faction surface. */
export function FavouriteFactionToggle({ catalogueId, name, className }: { catalogueId: string; name: string; className?: string }) {
  const { favourites, toggleFavourite, pending } = useFavouriteFactions()
  return (
    <FavouriteToggle
      name={name}
      list="favourites"
      favourite={favourites.has(catalogueId)}
      pending={pending.isPending && pending.variables?.catalogueId === catalogueId}
      className={className}
      onToggle={() => toggleFavourite(catalogueId)}
    />
  )
}
