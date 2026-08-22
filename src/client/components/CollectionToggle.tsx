import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { collectionQuery, meQuery } from '../queries'
import { useCollectionMutation } from '../useCollection'

type Props = {
  entryId: string
  name: string
  className?: string
}

/** The account-backed collection action shared by every datasheet surface. */
export function CollectionToggle({ entryId, name, className = 'size-7' }: Props) {
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const { data: collection } = useQuery({ ...collectionQuery(), enabled: Boolean(me) })
  const mutation = useCollectionMutation()
  const entries: readonly string[] = collection ?? []
  const owned = entries.includes(entryId)
  const label = `${owned ? 'Remove' : 'Add'} ${name} ${owned ? 'from' : 'to'} your collection`

  if (!me) {
    return (
      <Link
        to="/signin"
        search={{ next: path }}
        className={`grid shrink-0 place-items-center ${className}`}
        aria-label={`Sign in to add ${name} to your collection`}
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
      pressed={owned}
      disabled={mutation.isPending && mutation.variables?.entryId === entryId}
      onPressedChange={(pressed) => mutation.mutate({ entryId, owned: pressed })}
      className={`shrink-0 bg-transparent p-0 ${className}`}
    >
      <Heart className={`size-3.5 ${owned ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
    </Toggle>
  )
}
