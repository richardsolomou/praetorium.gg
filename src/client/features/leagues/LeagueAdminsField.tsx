import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LEAGUE_ADMIN_MAX } from '../../../core/league'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { friendshipsQuery } from '../../queries'

type Person = { id: string; name: string; image: string | null }

/** The admins being chosen: `known` names the ones already saved, so a friendship that has since ended still shows them. */
export type AdminChoice = { selected: string[]; known: readonly Person[]; onChange: (ids: string[]) => void }

/** Friends the owner trusts to run the league beside them: start events, change settings, and manage players. */
export function LeagueAdminsField({ idPrefix, admins, disabled }: { idPrefix: string; admins: AdminChoice; disabled: boolean }) {
  const { data: friendships } = useQuery(friendshipsQuery())
  const friends: Person[] = friendships?.friends ?? []
  const people = new Map([...admins.known, ...friends].map((person) => [person.id, person]))
  const candidates = friends.filter((friend) => !admins.selected.includes(friend.id))
  const full = admins.selected.length >= LEAGUE_ADMIN_MAX
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-admin`}>Admins</Label>
      {admins.selected.length ? (
        <ul className="flex flex-wrap gap-2">
          {admins.selected.map((id) => {
            const person = people.get(id)
            return (
              <li key={id} className="flex min-w-0 items-center gap-2 border border-edge py-1 pr-1 pl-1 text-sm">
                <PlayerAvatar name={person?.name ?? '?'} image={person?.image ?? null} className="size-6 text-3xs" />
                <span className="max-w-40 truncate">{person?.name ?? 'Former friend'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="pointer-coarse:size-11"
                  aria-label={`Remove ${person?.name ?? 'this admin'} as an admin`}
                  disabled={disabled}
                  onClick={() => admins.onChange(admins.selected.filter((candidate) => candidate !== id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Select
        value=""
        disabled={disabled || full || !candidates.length}
        onValueChange={(id) => id && admins.onChange([...admins.selected, id])}
      >
        <SelectTrigger id={`${idPrefix}-admin`} className="h-11 w-full">
          <SelectValue>
            {() => (full ? 'No more admins' : candidates.length ? 'Add a friend as an admin' : 'Add friends to make them admins')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {candidates.map((friend) => (
            <SelectItem key={friend.id} value={friend.id}>
              {friend.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-dim">Admins start events, change settings, and manage players. Only you can delete the league.</p>
    </div>
  )
}
