import { useQuery } from '@tanstack/react-query'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { meQuery } from '../../../queries'
import { FavouriteToggle } from './FavouriteToggle'

/** The account-backed favourite action for a datasheet; favourites list first. */
export function FavouriteDatasheetToggle({ entryId, name }: { entryId: string; name: string }) {
  const { data: me } = useQuery(meQuery())
  const { favourites, loading, toggleFavourite, pending } = useFavouriteDatasheets(Boolean(me))
  return (
    <FavouriteToggle
      name={name}
      list="favourite datasheets"
      favourite={favourites.has(entryId)}
      pending={pending.isPending && pending.variables?.entryId === entryId}
      loading={loading}
      className="size-11 rounded-lg"
      onToggle={() => toggleFavourite(entryId)}
    />
  )
}
