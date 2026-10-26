import { Link } from '@tanstack/react-router'

/** Who a listed roster belongs to, linking to their profile. */
export function OwnerLink({ owner }: { owner: { id: string; name: string } }) {
  return (
    <Link to="/users/$userId" params={{ userId: owner.id }} className="font-semibold text-info hover:text-bone">
      {owner.name}
    </Link>
  )
}
