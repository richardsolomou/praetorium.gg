import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlayerAvatar } from './PlayerAvatar'

export type AdminPerson = { id: string; name: string; image: string | null }

/** Chooses up to `max` admins from `candidates`; `people` also names admins who are no longer candidates. */
export function AdminsField({
  id,
  people,
  candidates,
  selected,
  max,
  disabled,
  onChange,
  labels,
}: {
  id: string
  people: readonly AdminPerson[]
  candidates: readonly AdminPerson[]
  selected: readonly string[]
  max: number
  disabled: boolean
  onChange: (ids: string[]) => void
  labels: { former: string; add: string; none: string; hint: string }
}) {
  const known = new Map([...people, ...candidates].map((person) => [person.id, person]))
  const available = candidates.filter((candidate) => !selected.includes(candidate.id))
  const full = selected.length >= max
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Admins</Label>
      {selected.length ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((adminId) => {
            const person = known.get(adminId)
            return (
              <li key={adminId} className="flex min-w-0 items-center gap-2 border border-edge py-1 pr-1 pl-1 text-sm">
                <PlayerAvatar name={person?.name ?? '?'} image={person?.image ?? null} className="size-6 text-3xs" />
                <span className="max-w-40 truncate">{person?.name ?? labels.former}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="pointer-coarse:size-11"
                  aria-label={`Remove ${person?.name ?? 'this admin'} as an admin`}
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((candidate) => candidate !== adminId))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Select value="" disabled={disabled || full || !available.length} onValueChange={(next) => next && onChange([...selected, next])}>
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue>{() => (full ? 'No more admins' : available.length ? labels.add : labels.none)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {available.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-dim">{labels.hint}</p>
    </div>
  )
}
