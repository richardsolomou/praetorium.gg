import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { favouriteDetachmentKey, useFavouriteDetachments } from '../favouriteDetachments'
import { meQuery } from '../queries'

type Props = {
  catalogueId: string
  detachmentId: string
  name: string
  className?: string
}

/** The account-backed favourite action shared by every detachment surface. */
export function FavouriteDetachmentToggle({ catalogueId, detachmentId, name, className = 'size-7' }: Props) {
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const { favourites, toggleFavourite, pending } = useFavouriteDetachments()
  const favourite = favourites.has(favouriteDetachmentKey(catalogueId, detachmentId))
  const label = `${favourite ? 'Remove' : 'Add'} ${name} ${favourite ? 'from' : 'to'} favourite detachments`

  if (!me) {
    return (
      <Link
        to="/signin"
        search={{ next: path }}
        className={`grid shrink-0 place-items-center ${className}`}
        aria-label={`Sign in to add ${name} to favourite detachments`}
      >
        <Heart className="size-3.5 text-faint hover:text-dim" />
      </Link>
    )
  }

  return (
    <Toggle
      variant="default"
      size="sm"
      aria-label={label}
      pressed={favourite}
      disabled={pending.isPending && pending.variables?.detachmentId === detachmentId}
      onPressedChange={() => toggleFavourite(catalogueId, detachmentId)}
      className={`shrink-0 bg-transparent p-0 ${className}`}
    >
      <Heart className={`size-3.5 ${favourite ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
    </Toggle>
  )
}
