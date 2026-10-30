import { sameSet } from '../../../core/collections'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import {
  effectiveSealedEventAllowances,
  isTeamFormat,
  sealedEventTableShape,
  SEALED_EVENT_DEFAULT_ROSTER_LIMIT,
} from '../../../core/sealedEvent'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { createHiddenListGame, createSealedEvent, setSealedEventAdmins, updateSealedEvent } from '../../functions'
import { sealedEventQuery, sealedEventReadsKey, sealedEventsQuery, meQuery } from '../../queries'
import { sealedEventFormValid, SealedEventFormFields, type SealedEventFormValue } from './SealedEventForm'
import { eventLink, sealedEventNoun, type SealedEvent } from './sealedEvent'
import { Problem } from '../../components/Problem'

/**
 * `create` opens a tournament, or a group's hidden-list game when given the group's token, and `edit` changes one. Both are
 * the same form, so every setting lives in one place.
 */
type SealedEventSettingsMode = { kind: 'create'; groupToken?: string } | { kind: 'edit'; token: string }

const SAVE = ['sealed-event-settings']

export function SealedEventSettingsDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: SealedEventSettingsMode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saving = useIsMutating({ mutationKey: SAVE }) > 0
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      {!open ? null : mode.kind === 'create' ? (
        <SettingsForm mode={mode} sealedEvent={null} onClose={close} />
      ) : (
        <CurrentSettings mode={mode} token={mode.token} onClose={close} />
      )}
    </Dialog>
  )
}

/** Reads the sealed event on every open, because the form keeps its starting values and a cached copy can predate the save that just closed. */
function CurrentSettings({ mode, token, onClose }: { mode: SealedEventSettingsMode; token: string; onClose: () => void }) {
  const { data: sealedEvent, isFetchedAfterMount } = useQuery({ ...sealedEventQuery(token), refetchOnMount: 'always' })
  if (sealedEvent && isFetchedAfterMount) return <SettingsForm mode={mode} sealedEvent={sealedEvent} onClose={onClose} />
  const { noun } = sealedEventNoun(sealedEvent ?? {})
  return (
    <DialogContent aria-busy size="md">
      <DialogHeader>
        <DialogTitle className="text-2xl">Edit {noun}</DialogTitle>
        <DialogDescription>Loading the {noun}’s current settings…</DialogDescription>
      </DialogHeader>
    </DialogContent>
  )
}

/** An older event's form starts from what it accepts in effect, and saving it unchanged leaves it unrecorded. */
const currentAllowances = (sealedEvent: SealedEvent) =>
  effectiveSealedEventAllowances(
    sealedEventTableShape(sealedEvent.format),
    sealedEvent.rosterLimit ?? SEALED_EVENT_DEFAULT_ROSTER_LIMIT,
    sealedEvent.allowances,
  )

function SettingsForm({
  mode,
  sealedEvent,
  onClose,
}: {
  mode: SealedEventSettingsMode
  sealedEvent: SealedEvent | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const current = sealedEvent ? sealedEventTableShape(sealedEvent.format) : '1v1'
  const hiddenListGame = mode.kind === 'create' ? Boolean(mode.groupToken) : Boolean(sealedEvent?.group)
  const { noun } = sealedEventNoun(mode.kind === 'create' ? { group: mode.groupToken } : (sealedEvent ?? {}))
  const [value, setValue] = useState<SealedEventFormValue>(() => ({
    name: sealedEvent?.tournament?.name ?? '',
    description: sealedEvent?.tournament?.description ?? '',
    visibility: sealedEvent?.tournament?.visibility ?? 'public',
    admission: sealedEvent?.tournament?.admission ?? 'automatic',
    playerLimit: sealedEvent?.tournament?.playerLimit ?? null,
    format: current,
    rosterLimit: sealedEvent?.rosterLimit ?? SEALED_EVENT_DEFAULT_ROSTER_LIMIT,
    allowances: sealedEvent ? [...currentAllowances(sealedEvent)] : [],
    rounds: sealedEvent?.rounds ?? null,
    pointsBudget: sealedEvent?.pointsBudget ?? null,
    soloPoints: sealedEvent?.soloPoints ?? null,
    allyPoints: sealedEvent?.allyPoints ?? null,
    sharedPoints: sealedEvent?.sharedPoints ?? false,
    playsAt: sealedEvent?.playsAt ?? null,
    sealBy: sealedEvent?.sealBy ?? null,
  }))
  const { data: me } = useQuery(meQuery())
  // Whoever opens the form, owner or admin, is the organizer it asks about.
  const [ownerPlays, setOwnerPlays] = useState(
    () => !sealedEvent || sealedEvent.entries.some((entry) => entry.userId === me?.id && entry.status === 'accepted'),
  )
  const isOwner = Boolean(sealedEvent?.tournament && me?.id === sealedEvent.tournament.ownerId)
  const currentAdmins = sealedEvent?.tournament?.admins.map((admin) => admin.id) ?? []
  const [adminIds, setAdminIds] = useState(currentAdmins)
  const adminsChanged = !sameSet(adminIds, currentAdmins)
  const seated =
    mode.kind === 'edit' && sealedEvent && !sealedEvent.revealedAt
      ? sealedEvent.entries.filter((entry) => entry.status === 'accepted').length
      : 0
  const ruleLock =
    mode.kind === 'edit' && sealedEvent?.revealedAt ? `The rosters are out; start a new ${noun} to play a different format.` : null
  const shapeLock =
    mode.kind === 'edit' && sealedEvent?.entries.some((entry) => entry.submitted)
      ? `Format and size are locked now that a list is sealed. ${isTeamFormat(current) ? 'Points per army and house rules' : 'House rules'} can still change, as long as every sealed list still fits them.`
      : null
  // A revealed event takes nobody new, so its limit no longer has to seat its shape.
  const limitFormat = mode.kind === 'edit' && sealedEvent?.revealedAt ? null : value.format
  const shapeChanged = value.format !== current || value.rosterLimit !== sealedEvent?.rosterLimit
  const ruleChanged =
    shapeChanged ||
    (sealedEvent !== null &&
      (!sameSet(value.allowances, currentAllowances(sealedEvent)) ||
        value.rounds !== sealedEvent.rounds ||
        value.pointsBudget !== sealedEvent.pointsBudget ||
        value.soloPoints !== sealedEvent.soloPoints ||
        value.allyPoints !== sealedEvent.allyPoints ||
        value.sharedPoints !== sealedEvent.sharedPoints))
  const clearsAssignments =
    mode.kind === 'edit' &&
    shapeChanged &&
    sealedEvent?.entries.some((entry) => entry.teamId || (sealedEvent.format === '2v1' && entry.requiredLimit))

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: () => {
      if (mode.kind === 'create') posthog.capture('sealed_event_creation_submitted', { format: value.format, group: hiddenListGame })
    },
    onError: () => {
      if (mode.kind === 'create') posthog.capture('sealed_event_creation_failed', { reason: 'request', group: hiddenListGame })
    },
    mutationFn: async () => {
      const { format, rosterLimit, allowances, rounds, pointsBudget, soloPoints, allyPoints, sharedPoints, playsAt, sealBy, ...details } =
        value
      const schedule = { playsAt, sealBy }
      const points = { pointsBudget, soloPoints, allyPoints, sharedPoints }
      if (mode.kind === 'create')
        return mode.groupToken
          ? createHiddenListGame({
              data: {
                groupToken: mode.groupToken,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                format,
                rosterLimit,
                allowances,
                ...points,
                schedule,
              },
            })
          : createSealedEvent({ data: { ...details, format, rosterLimit, allowances, rounds, ...points, schedule, ownerPlays } })
      await updateSealedEvent({
        data: {
          token: mode.token,
          // A group's hidden-list game has no details of its own.
          ...(hiddenListGame ? {} : details),
          schedule,
          ...(ruleLock || !ruleChanged ? {} : { rule: { format, rosterLimit, allowances, rounds, ...points } }),
        },
      })
      if (isOwner && adminsChanged) await setSealedEventAdmins({ data: { token: mode.token, userIds: adminIds } })
      return null
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sealedEventsQuery().queryKey }),
        sealedEvent ? queryClient.invalidateQueries({ queryKey: sealedEventReadsKey(sealedEvent.token) }) : null,
      ]),
    onSuccess: async (created) => {
      onClose()
      if (created)
        await navigate(
          eventLink({ token: created.token, group: mode.kind === 'create' && mode.groupToken ? { token: mode.groupToken } : null }),
        )
    },
  })

  const title = mode.kind === 'create' ? `New ${noun}` : `Edit ${noun}`
  const description =
    mode.kind === 'create' ? (
      mode.groupToken ? (
        'Members seal a list in secret, then you reveal them together. Its battles count on the group’s leaderboard.'
      ) : (
        <>
          Everyone seals a roster in secret, then you reveal them together.{' '}
          <Link to="/tournaments/sample" className="text-bone underline hover:text-info">
            See a sample tournament
          </Link>
        </>
      )
    ) : hiddenListGame ? (
      'Applies from now on. Nothing already sealed or played changes.'
    ) : (
      'Applies from now on. Nothing already sealed or played changes. Switching to Anyone who joins lets in everyone still waiting.'
    )
  const submit =
    mode.kind === 'create'
      ? save.isPending
        ? 'Creating…'
        : `${mode.groupToken ? 'Start' : 'Create'} ${noun}`
      : save.isPending
        ? 'Saving…'
        : 'Save changes'

  return (
    <DialogContent showCloseButton={!save.isPending} aria-busy={save.isPending} size="md">
      <DialogHeader>
        <DialogTitle className="text-2xl">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <DialogBody>
          <SealedEventFormFields
            idPrefix={`${mode.kind}-sealed-event`}
            optionsOpen={mode.kind === 'edit'}
            value={value}
            seated={seated}
            limitFormat={limitFormat}
            ruleLock={ruleLock}
            shapeLock={shapeLock}
            tournament={!hiddenListGame}
            // A group game's players enter by sealing a list or taking a seat, its organizer included.
            ownerPlays={mode.kind === 'edit' || hiddenListGame ? undefined : ownerPlays}
            admins={
              mode.kind === 'edit' && isOwner && sealedEvent?.tournament
                ? { selected: adminIds, known: sealedEvent.tournament.admins, onChange: setAdminIds }
                : undefined
            }
            disabled={save.isPending}
            onChange={setValue}
            onOwnerPlaysChange={setOwnerPlays}
          />
          {clearsAssignments ? (
            <p className="text-xs text-parchment">Changing the format clears every size and team you’ve handed out.</p>
          ) : null}
          {save.isPending ? <output className="sr-only">{submit}</output> : null}
          {save.error ? <Problem error={save.error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-onboarding="sealed-event-create"
            type="submit"
            disabled={save.isPending || !sealedEventFormValid(value, seated, limitFormat, !hiddenListGame)}
          >
            {submit}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
