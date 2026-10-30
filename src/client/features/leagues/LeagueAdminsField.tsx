import { useQuery } from '@tanstack/react-query'
import { LEAGUE_ADMIN_MAX } from '../../../core/league'
import { AdminsField, type AdminPerson } from '../../components/AdminsField'
import { friendshipsQuery } from '../../queries'

/** The admins being chosen: `known` names the ones already saved, so a friendship that has since ended still shows them. */
export type AdminChoice = { selected: string[]; known: readonly AdminPerson[]; onChange: (ids: string[]) => void }

/** Friends the owner trusts to run the league beside them: start events, change settings, and manage players. */
export function LeagueAdminsField({ idPrefix, admins, disabled }: { idPrefix: string; admins: AdminChoice; disabled: boolean }) {
  const { data: friendships } = useQuery(friendshipsQuery())
  return (
    <AdminsField
      id={`${idPrefix}-admin`}
      people={admins.known}
      candidates={friendships?.friends ?? []}
      selected={admins.selected}
      max={LEAGUE_ADMIN_MAX}
      disabled={disabled}
      onChange={admins.onChange}
      labels={{
        former: 'Former friend',
        add: 'Add a friend as an admin',
        none: 'Add friends to make them admins',
        hint: 'Admins change settings and manage players. Only you can delete it.',
      }}
    />
  )
}
