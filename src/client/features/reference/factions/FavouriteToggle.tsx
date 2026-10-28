import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { meQuery } from '../../../queries'

/** A heart that favourites `name` into `list`, or leads a visitor to sign in first. */
export function FavouriteToggle({
  name,
  list,
  favourite,
  pending,
  loading = false,
  className = 'size-7',
  onToggle,
}: {
  name: string
  list: string
  favourite: boolean
  pending: boolean
  loading?: boolean
  className?: string
  onToggle: () => void
}) {
  const { data: me } = useQuery(meQuery())

  if (!me) return <SignInToFavourite name={name} list={list} className={className} />

  if (loading) return <Skeleton className={cn('shrink-0', className)} aria-label={`Loading favourite status for ${name}`} />

  return (
    <Toggle
      variant="default"
      size="sm"
      aria-label={`${favourite ? 'Remove' : 'Add'} ${name} ${favourite ? 'from' : 'to'} ${list}`}
      pressed={favourite}
      disabled={pending}
      onPressedChange={onToggle}
      className={cn('shrink-0 bg-transparent p-0', className)}
    >
      <Heart className={`size-3.5 ${favourite ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
    </Toggle>
  )
}

/** Only a visitor's heart follows the address, so a signed-in list of hearts does not redraw on every navigation. */
function SignInToFavourite({ name, list, className }: { name: string; list: string; className: string }) {
  const path = useRouterState({ select: (state) => state.location.href })
  return (
    <Link
      to="/sign-in"
      search={{ next: path }}
      rel="nofollow"
      className={cn('grid shrink-0 place-items-center', className)}
      aria-label={`Sign in to add ${name} to ${list}`}
    >
      <Heart className="size-3.5 text-faint hover:text-dim" />
    </Link>
  )
}
