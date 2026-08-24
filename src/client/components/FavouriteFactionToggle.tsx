import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { useFavouriteFactions } from '../favouriteFactions'
import { meQuery } from '../queries'

type Props = {
  catalogueId: string
  name: string
  className?: string
}

/** The account-backed favourite action shared by every faction surface. */
export function FavouriteFactionToggle({ catalogueId, name, className = 'size-7' }: Props) {
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const { favourites, toggleFavourite } = useFavouriteFactions()
  const favourite = favourites.has(catalogueId)
  const label = `${favourite ? 'Remove' : 'Add'} ${name} ${favourite ? 'from' : 'to'} favourites`

  if (!me) {
    return (
      <Link
        to="/sign-in"
        search={{ next: path }}
        className={`grid shrink-0 place-items-center ${className}`}
        aria-label={`Sign in to add ${name} to favourites`}
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
      onPressedChange={() => toggleFavourite(catalogueId)}
      className={`shrink-0 bg-transparent p-0 ${className}`}
    >
      <Heart className={`size-3.5 ${favourite ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
    </Toggle>
  )
}
