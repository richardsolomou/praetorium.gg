import { PlayerAvatar } from '../../components/PlayerAvatar'
import { nameColour } from '../../playerName'
import { SealedChip } from '../sealedEvents/SealedEventEntrants'
import { memberNameOf, type Group } from './group'

/** A member's row while lists are hidden: whether they have sealed, and the viewer's own list by name. */
export function SealingPlayer({
  group,
  userId,
  viewerId,
  sealed,
  list,
}: {
  group: Group
  userId: string
  viewerId: string | null
  sealed: boolean
  list: string | null
}) {
  const person = group.members.find((member) => member.userId === userId)
  const name = memberNameOf(group)(userId)
  return (
    <li data-person={name} className="flex min-h-14 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <PlayerAvatar name={name} image={person?.image ?? null} className="size-8 text-2xs" />
      <span className="min-w-0 flex-1 basis-24">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[0.9375rem] leading-tight font-bold" style={nameColour({ id: userId, colour: person?.colour })}>
            {name}
          </span>
          {userId === viewerId ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
        </span>
        {list ? <span className="mt-0.5 block truncate text-2xs text-dim">{list}</span> : null}
      </span>
      <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
        {sealed ? <SealedChip /> : <span className="shrink-0 text-sm text-faint">Choosing</span>}
      </span>
    </li>
  )
}
