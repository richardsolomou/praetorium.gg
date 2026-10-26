import { sameSet } from '../../../core/collections'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CLUB_ADMIN_MAX, CLUB_DESCRIPTION_MAX_LENGTH, CLUB_NAME_MAX_LENGTH } from '../../../core/club'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import { Choice } from '../../components/Choice'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { createClub, setClubAdmins, updateClub } from '../../functions'
import { clubKey, clubsKey } from '../../queries'
import type { Club } from './club'

type Details = { name: string; description: string; visibility: LeagueVisibility; admission: LeagueAdmission }

const SAVE = ['club-settings']

/** Without a club the dialog creates one; with one, it edits it, and its owner also chooses admins from the members. */
export function ClubSettingsDialog({
  club,
  ownerId,
  open,
  onOpenChange,
}: {
  club: Club | null
  ownerId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saving = useIsMutating({ mutationKey: SAVE }) > 0
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      {open ? <SettingsForm club={club} isOwner={Boolean(club && ownerId === club.ownerId)} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function SettingsForm({ club, isOwner, onClose }: { club: Club | null; isOwner: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [value, setValue] = useState<Details>(() => ({
    name: club?.name ?? '',
    description: club?.description ?? '',
    visibility: club?.visibility ?? 'public',
    admission: club?.admission ?? 'automatic',
  }))
  const currentAdmins = club?.members.filter((member) => member.role === 'admin').map((member) => member.userId) ?? []
  const [adminIds, setAdminIds] = useState(currentAdmins)
  const adminsChanged = !sameSet(adminIds, currentAdmins)
  const save = useMutation({
    mutationKey: SAVE,
    mutationFn: async () => {
      if (!club) return createClub({ data: value })
      await updateClub({ data: { token: club.token, ...value } })
      if (isOwner && adminsChanged) await setClubAdmins({ data: { token: club.token, userIds: adminIds } })
      return null
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: clubsKey() }),
        club ? queryClient.invalidateQueries({ queryKey: clubKey(club.token) }) : null,
      ]),
    onSuccess: async (created) => {
      onClose()
      if (created) await navigate({ to: '/clubs/$token', params: { token: created.token } })
    },
  })
  const submit = club ? (save.isPending ? 'Saving…' : 'Save changes') : save.isPending ? 'Creating…' : 'Create club'
  const disabled = save.isPending
  return (
    <DialogContent showCloseButton={!save.isPending} aria-busy={save.isPending} size="md">
      <DialogHeader>
        <DialogTitle className="text-2xl">{club ? 'Edit club' : 'New club'}</DialogTitle>
        <DialogDescription>
          {club
            ? 'Switching to “Anyone who joins” lets in everyone waiting.'
            : 'Keep a running leaderboard for your group. A game counts when its players pick the club at setup.'}
        </DialogDescription>
      </DialogHeader>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="club-name">Name</Label>
            <Input
              id="club-name"
              value={value.name}
              maxLength={CLUB_NAME_MAX_LENGTH}
              required
              disabled={disabled}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-description">Details</Label>
            <Textarea
              id="club-description"
              value={value.description}
              maxLength={CLUB_DESCRIPTION_MAX_LENGTH}
              rows={2}
              placeholder="Where and when you meet, and anything else members should know."
              disabled={disabled}
              onChange={(event) => setValue({ ...value, description: event.target.value })}
            />
          </div>
          <Choice
            label="Who can find it"
            value={value.visibility}
            columns={2}
            options={[
              { value: 'public', name: 'Public', detail: 'Listed on the clubs page.' },
              { value: 'private', name: 'Private link', detail: 'Only people you send it to.' },
            ]}
            disabled={disabled}
            onChange={(visibility) => setValue({ ...value, visibility })}
          />
          <Choice
            label="Who gets in"
            value={value.admission}
            columns={2}
            options={[
              { value: 'automatic', name: 'Anyone who joins' },
              { value: 'approval', name: 'You approve' },
            ]}
            disabled={disabled}
            onChange={(admission) => setValue({ ...value, admission })}
          />
          {club && isOwner ? <AdminsField club={club} selected={adminIds} disabled={disabled} onChange={setAdminIds} /> : null}
          {save.isPending ? <output className="sr-only">{submit}</output> : null}
          {save.error ? <Problem error={save.error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={disabled} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={disabled || !value.name.trim()}>
            {submit}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

function AdminsField({
  club,
  selected,
  disabled,
  onChange,
}: {
  club: Club
  selected: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const members = club.members.filter((member) => member.status === 'accepted' && member.userId !== club.ownerId)
  const people = new Map(members.map((member) => [member.userId, member]))
  const candidates = members.filter((member) => !selected.includes(member.userId))
  const full = selected.length >= CLUB_ADMIN_MAX
  return (
    <div className="space-y-1.5">
      <Label htmlFor="club-admin">Admins</Label>
      {selected.length ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const person = people.get(id)
            return (
              <li key={id} className="flex min-w-0 items-center gap-2 border border-edge py-1 pr-1 pl-1 text-sm">
                <PlayerAvatar name={person?.name ?? '?'} image={person?.image ?? null} className="size-6 text-3xs" />
                <span className="max-w-40 truncate">{person?.name ?? 'Former member'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="pointer-coarse:size-11"
                  aria-label={`Remove ${person?.name ?? 'this admin'} as an admin`}
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((candidate) => candidate !== id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Select value="" disabled={disabled || full || !candidates.length} onValueChange={(id) => id && onChange([...selected, id])}>
        <SelectTrigger id="club-admin" className="h-11 w-full">
          <SelectValue>
            {() => (full ? 'No more admins' : candidates.length ? 'Add a member as an admin' : 'Members can become admins once they join')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {candidates.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-dim">Admins can edit the club and manage members. Only you can delete it.</p>
    </div>
  )
}
