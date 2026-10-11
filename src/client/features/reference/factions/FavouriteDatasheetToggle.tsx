import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { meQuery } from '../../../queries'

type Props = {
  entryId: string
  name: string
  className?: string
}

/** The account-backed favourite action shared by every datasheet surface; favourites list first. */
export function FavouriteDatasheetToggle({ entryId, name, className = 'size-7' }: Props) {
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const { favourites, loading, toggleFavourite, pending } = useFavouriteDatasheets(Boolean(me))
  const favourite = favourites.has(entryId)
  const label = `${favourite ? 'Remove' : 'Add'} ${name} ${favourite ? 'from' : 'to'} favourite datasheets`

  if (!me) {
    return (
      <Link
        to="/sign-in"
        search={{ next: path }}
        rel="nofollow"
        className={`grid shrink-0 place-items-center ${className}`}
        aria-label={`Sign in to add ${name} to favourite datasheets`}
      >
        <Heart className="size-3.5 text-faint hover:text-dim" />
      </Link>
    )
  }

  if (loading) return <Skeleton className={`shrink-0 ${className}`} aria-label={`Loading favourite status for ${name}`} />

  return (
    <Toggle
      variant="default"
      size="sm"
      aria-label={label}
      pressed={favourite}
      disabled={pending.isPending && pending.variables?.entryId === entryId}
      onPressedChange={() => toggleFavourite(entryId)}
      className={`shrink-0 bg-transparent p-0 ${className}`}
    >
      <Heart className={`size-3.5 ${favourite ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
    </Toggle>
  )
}
