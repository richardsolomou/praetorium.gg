import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { leagueMinimumPlaces, leaguePlacesSeat, leagueTableShape, LEAGUE_DEFAULT_ROSTER_LIMIT } from '../../../core/league'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { createLeague, createLeagueEvent, setLeagueAdmins, updateLeague } from '../../functions'
import { leagueQuery, leaguesQuery, meQuery } from '../../queries'
import { leagueFormValid, LeagueFormFields, type LeagueFormValue } from './LeagueForm'
import type { League } from './leagueEvent'
import { Problem } from '../../components/Problem'

/**
 * `create` opens a league with its first event, `edit` changes the league and its current event, and
 * `next` starts the event after a revealed one. All three are the same form, so every setting lives in one place.
 */
export type LeagueSettingsMode = { kind: 'create' } | { kind: 'edit'; token: string } | { kind: 'next'; token: string }

const SAVE = ['league-settings']

export function LeagueSettingsDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: LeagueSettingsMode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saving = useIsMutating({ mutationKey: SAVE }) > 0
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      {!open ? null : mode.kind === 'create' ? (
        <SettingsForm mode={mode} league={null} onClose={close} />
      ) : (
        <CurrentSettings mode={mode} token={mode.token} onClose={close} />
      )}
    </Dialog>
  )
}

/** Reads the league on every open, because the form keeps its starting values and a cached copy can predate the save that just closed. */
function CurrentSettings({ mode, token, onClose }: { mode: LeagueSettingsMode; token: string; onClose: () => void }) {
  const { data: league, isFetchedAfterMount } = useQuery({ ...leagueQuery(token), refetchOnMount: 'always' })
  if (league && isFetchedAfterMount) return <SettingsForm mode={mode} league={league} onClose={onClose} />
  return (
    <DialogContent aria-busy size="md">
      <DialogHeader>
        <DialogTitle className="text-2xl">{mode.kind === 'next' ? 'Start the next event' : 'Edit league'}</DialogTitle>
        <DialogDescription>Loading the league’s current settings…</DialogDescription>
      </DialogHeader>
    </DialogContent>
  )
}

function SettingsForm({ mode, league, onClose }: { mode: LeagueSettingsMode; league: League | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const current = league ? leagueTableShape(league.format) : '1v1'
  // A next event carries the last one's format forward, raising a limit set since that no longer seats it.
  const [value, setValue] = useState<LeagueFormValue>(() => ({
    name: league?.name ?? '',
    description: league?.description ?? '',
    visibility: league?.visibility ?? 'private',
    admission: league?.admission ?? 'automatic',
    playerLimit:
      mode.kind === 'next' && league && !leaguePlacesSeat(current, league.playerLimit)
        ? leagueMinimumPlaces(current, league.playerLimit ?? 0)
        : (league?.playerLimit ?? null),
    format: current,
    rosterLimit: league?.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT,
  }))
  const { data: me } = useQuery(meQuery())
  // Whoever opens the form, owner or admin, is the organizer it asks about.
  const [ownerPlays, setOwnerPlays] = useState(
    () => !league || league.entries.some((entry) => entry.userId === me?.id && entry.status === 'accepted'),
  )
  const isOwner = Boolean(league && me?.id === league.ownerId)
  const currentAdmins = league?.admins.map((admin) => admin.id) ?? []
  const [adminIds, setAdminIds] = useState(currentAdmins)
  const adminsChanged = adminIds.length !== currentAdmins.length || adminIds.some((id) => !currentAdmins.includes(id))
  // A fresh event starts with nobody in it, so only the open event's entrants hold places.
  const seated =
    mode.kind === 'edit' && league && !league.revealedAt ? league.entries.filter((entry) => entry.status === 'accepted').length : 0
  const ruleLock =
    mode.kind !== 'edit' || !league
      ? null
      : league.revealedAt
        ? 'The rosters are out; start the next event to play a different format.'
        : league.entries.some((entry) => entry.submitted)
          ? 'Locked now that a roster is sealed.'
          : null
  // A revealed event no longer holds the limit to its shape; the limit only governs the events after it.
  const limitFormat = mode.kind === 'edit' && league?.revealedAt ? null : value.format
  const ruleChanged = value.format !== current || value.rosterLimit !== league?.rosterLimit
  const clearsAssignments =
    mode.kind === 'edit' && ruleChanged && league?.entries.some((entry) => entry.teamId || (league.format === '2v1' && entry.requiredLimit))
  const next = (league?.eventCount ?? 0) + 1

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_submitted', { format: value.format })
    },
    onError: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_failed', { reason: 'request' })
    },
    mutationFn: async () => {
      const { format, rosterLimit, ...details } = value
      if (mode.kind === 'create') return createLeague({ data: { ...details, format, rosterLimit, ownerPlays } })
      if (mode.kind === 'next') {
        const created = await createLeagueEvent({ data: { token: mode.token, ...details, format, rosterLimit, ownerPlays } })
        return { token: mode.token, eventToken: created.eventToken }
      }
      await updateLeague({ data: { token: mode.token, ...details, ...(ruleLock ? {} : { rule: { format, rosterLimit } }) } })
      if (isOwner && adminsChanged) await setLeagueAdmins({ data: { token: mode.token, userIds: adminIds } })
      return null
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
        league ? queryClient.invalidateQueries({ queryKey: ['league', league.token] }) : null,
      ]),
    onSuccess: async (created) => {
      onClose()
      if (created) await navigate({ to: '/leagues/$token', params: { token: created.token }, search: { event: created.eventToken } })
    },
  })

  const title = mode.kind === 'create' ? 'New league' : mode.kind === 'next' ? `Start event ${next}` : 'Edit league'
  const description =
    mode.kind === 'create'
      ? 'Everyone seals a roster in secret, then you reveal them together.'
      : mode.kind === 'next'
        ? 'Starts empty: everyone joins and seals a new roster.'
        : 'Applies from now on. Nothing already sealed or played changes. Switching to Anyone who joins lets in everyone still waiting.'
  const submit =
    mode.kind === 'create'
      ? save.isPending
        ? 'Creating…'
        : 'Create league'
      : mode.kind === 'next'
        ? save.isPending
          ? 'Opening…'
          : `Start event ${next}`
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
          <LeagueFormFields
            idPrefix={`${mode.kind}-league`}
            optionsOpen={mode.kind === 'edit'}
            value={value}
            seated={seated}
            limitFormat={limitFormat}
            ruleLock={ruleLock}
            ownerPlays={mode.kind === 'edit' ? undefined : ownerPlays}
            admins={
              mode.kind === 'edit' && isOwner && league ? { selected: adminIds, known: league.admins, onChange: setAdminIds } : undefined
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
          <Button data-onboarding="league-create" type="submit" disabled={save.isPending || !leagueFormValid(value, seated, limitFormat)}>
            {submit}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
