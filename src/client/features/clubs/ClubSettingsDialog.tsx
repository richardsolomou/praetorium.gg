import { sameSet } from '../../../core/collections'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CLUB_ADMIN_MAX, CLUB_DESCRIPTION_MAX_LENGTH, CLUB_NAME_MAX_LENGTH } from '../../../core/club'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import { Choice } from '../../components/Choice'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { AdminsField } from '../../components/AdminsField'
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
  const members =
    club?.members
      .filter((member) => member.status === 'accepted' && member.userId !== club.ownerId)
      .map((member) => ({ id: member.userId, name: member.name, image: member.image })) ?? []
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
          {club && isOwner ? (
            <AdminsField
              id="club-admin"
              people={members}
              candidates={members}
              selected={adminIds}
              max={CLUB_ADMIN_MAX}
              disabled={disabled}
              onChange={setAdminIds}
              labels={{
                former: 'Former member',
                add: 'Add a member as an admin',
                none: 'Members can become admins once they join',
                hint: 'Admins can edit the club and manage members. Only you can delete it.',
              }}
            />
          ) : null}
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
