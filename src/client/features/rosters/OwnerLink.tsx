import { Link } from '@tanstack/react-router'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { nameColour } from '../../playerName'

/** Who a listed roster belongs to, behind their avatar, linking to their profile. */
export function OwnerLink({ owner }: { owner: { id: string; name: string; image?: string | null; colour?: string | null } }) {
  return (
    <Link
      to="/users/$userId"
      params={{ userId: owner.id }}
      className="ml-1 inline-flex items-center gap-1.5 align-middle font-semibold hover:underline"
      style={nameColour(owner)}
    >
      <PlayerAvatar name={owner.name} image={owner.image} className="size-5 text-3xs" />
      {owner.name}
    </Link>
  )
}
