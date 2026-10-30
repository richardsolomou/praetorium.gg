import { sameSet } from '../../../core/collections'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GROUP_ADMIN_MAX, GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '../../../core/group'
import type { SealedEventAdmission, SealedEventVisibility } from '../../../core/sealedEvent'
import { Choice } from '../../components/Choice'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { AdminsField } from '../../components/AdminsField'
import { Problem } from '../../components/Problem'
import { createGroup, setGroupAdmins, updateGroup } from '../../functions'
import { groupKey, groupsKey } from '../../queries'
import type { Group } from './group'

type Details = { name: string; description: string; visibility: SealedEventVisibility; admission: SealedEventAdmission }

const SAVE = ['group-settings']

/** Without a group the dialog creates one; with one, it edits it, and its owner also chooses admins from the members. */
export function GroupSettingsDialog({
  group,
  ownerId,
  open,
  onOpenChange,
}: {
  group: Group | null
  ownerId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saving = useIsMutating({ mutationKey: SAVE }) > 0
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      {open ? (
        <SettingsForm group={group} isOwner={Boolean(group && ownerId === group.ownerId)} onClose={() => onOpenChange(false)} />
      ) : null}
    </Dialog>
  )
}

function SettingsForm({ group, isOwner, onClose }: { group: Group | null; isOwner: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [value, setValue] = useState<Details>(() => ({
    name: group?.name ?? '',
    description: group?.description ?? '',
    visibility: group?.visibility ?? 'public',
    admission: group?.admission ?? 'automatic',
  }))
  const currentAdmins = group?.members.filter((member) => member.role === 'admin').map((member) => member.userId) ?? []
  const [adminIds, setAdminIds] = useState(currentAdmins)
  const adminsChanged = !sameSet(adminIds, currentAdmins)
  const members =
    group?.members
      .filter((member) => member.status === 'accepted' && member.userId !== group.ownerId)
      .map((member) => ({ id: member.userId, name: member.name, image: member.image })) ?? []
  const save = useMutation({
    mutationKey: SAVE,
    mutationFn: async () => {
      if (!group) return createGroup({ data: value })
      await updateGroup({ data: { token: group.token, ...value } })
      if (isOwner && adminsChanged) await setGroupAdmins({ data: { token: group.token, userIds: adminIds } })
      return null
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: groupsKey() }),
        group ? queryClient.invalidateQueries({ queryKey: groupKey(group.token) }) : null,
      ]),
    onSuccess: async (created) => {
      onClose()
      if (created) await navigate({ to: '/groups/$token', params: { token: created.token } })
    },
  })
  const submit = group ? (save.isPending ? 'Saving…' : 'Save changes') : save.isPending ? 'Creating…' : 'Create group'
  const disabled = save.isPending
  return (
    <DialogContent showCloseButton={!save.isPending} aria-busy={save.isPending} size="md">
      <DialogHeader>
        <DialogTitle className="text-2xl">{group ? 'Edit group' : 'New group'}</DialogTitle>
        <DialogDescription>
          {group
            ? 'Switching to “Anyone who joins” lets in everyone waiting.'
            : 'Keep a running leaderboard for your group. A game counts when its players pick the group at setup.'}
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
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={value.name}
              maxLength={GROUP_NAME_MAX_LENGTH}
              required
              disabled={disabled}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-description">Details</Label>
            <Textarea
              id="group-description"
              value={value.description}
              maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
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
              { value: 'public', name: 'Public', detail: 'Listed on the groups page.' },
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
          {group && isOwner ? (
            <AdminsField
              id="group-admin"
              people={members}
              candidates={members}
              selected={adminIds}
              max={GROUP_ADMIN_MAX}
              disabled={disabled}
              onChange={setAdminIds}
              labels={{
                former: 'Former member',
                add: 'Add a member as an admin',
                none: 'Members can become admins once they join',
                hint: 'Admins can edit the group and manage members. Only you can delete it.',
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
