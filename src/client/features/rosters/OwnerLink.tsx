import { Link } from '@tanstack/react-router'
import { nameColour } from '../../playerName'

/** Who a listed roster belongs to, linking to their profile. */
export function OwnerLink({ owner }: { owner: { id: string; name: string; colour?: string | null } }) {
  return (
    <Link to="/users/$userId" params={{ userId: owner.id }} className="font-semibold hover:underline" style={nameColour(owner)}>
      {owner.name}
    </Link>
  )
}
