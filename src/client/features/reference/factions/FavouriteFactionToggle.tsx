import { useFavouriteFactions } from '../../../favouriteFactions'
import { FavouriteToggle } from './FavouriteToggle'

/** The account-backed favourite action for a faction. */
export function FavouriteFactionToggle({ catalogueId, name }: { catalogueId: string; name: string }) {
  const { favourites, toggleFavourite, pending } = useFavouriteFactions()
  return (
    <FavouriteToggle
      name={name}
      list="favourites"
      favourite={favourites.has(catalogueId)}
      pending={pending.isPending && pending.variables?.catalogueId === catalogueId}
      onToggle={() => toggleFavourite(catalogueId)}
    />
  )
}
