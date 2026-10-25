import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { effectiveLeagueAllowances, leagueTableShape, LEAGUE_DEFAULT_ROSTER_LIMIT } from '../../../core/league'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { createLeague, setLeagueAdmins, updateLeague } from '../../functions'
import { leagueQuery, leagueReadsKey, leaguesQuery, meQuery } from '../../queries'
import { leagueFormValid, LeagueFormFields, type LeagueFormValue } from './LeagueForm'
import type { League } from './leagueEvent'
import { Problem } from '../../components/Problem'

/**
 * `create` opens a tournament, inside a club when given its token, and `edit` changes one. Both are the same form,
 * so every setting lives in one place.
 */
type LeagueSettingsMode = { kind: 'create'; clubToken?: string } | { kind: 'edit'; token: string }

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
        <DialogTitle className="text-2xl">Edit tournament</DialogTitle>
        <DialogDescription>Loading the tournament’s current settings…</DialogDescription>
      </DialogHeader>
    </DialogContent>
  )
}

/** An older event's form starts from what it accepts in effect, and saving it unchanged leaves it unrecorded. */
const currentAllowances = (league: League) =>
  effectiveLeagueAllowances(leagueTableShape(league.format), league.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT, league.allowances)

const sameAllowances = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id) => right.includes(id))

function SettingsForm({ mode, league, onClose }: { mode: LeagueSettingsMode; league: League | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const current = league ? leagueTableShape(league.format) : '1v1'
  const [value, setValue] = useState<LeagueFormValue>(() => ({
    name: league?.name ?? '',
    description: league?.description ?? '',
    visibility: league?.visibility ?? 'private',
    admission: league?.admission ?? 'automatic',
    playerLimit: league?.playerLimit ?? null,
    format: current,
    rosterLimit: league?.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT,
    allowances: league ? [...currentAllowances(league)] : [],
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
  const seated =
    mode.kind === 'edit' && league && !league.revealedAt ? league.entries.filter((entry) => entry.status === 'accepted').length : 0
  const ruleLock =
    mode.kind !== 'edit' || !league
      ? null
      : league.revealedAt
        ? 'The rosters are out; start a new tournament to play a different format.'
        : league.entries.some((entry) => entry.submitted)
          ? 'Locked now that a roster is sealed.'
          : null
  // A revealed event no longer holds the limit to its shape; the limit only governs the events after it.
  const limitFormat = mode.kind === 'edit' && league?.revealedAt ? null : value.format
  const shapeChanged = value.format !== current || value.rosterLimit !== league?.rosterLimit
  const ruleChanged = shapeChanged || (league !== null && !sameAllowances(value.allowances, currentAllowances(league)))
  const clearsAssignments =
    mode.kind === 'edit' &&
    shapeChanged &&
    league?.entries.some((entry) => entry.teamId || (league.format === '2v1' && entry.requiredLimit))

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_submitted', { format: value.format })
    },
    onError: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_failed', { reason: 'request' })
    },
    mutationFn: async () => {
      const { format, rosterLimit, allowances, ...details } = value
      if (mode.kind === 'create')
        return createLeague({ data: { ...details, format, rosterLimit, allowances, ownerPlays, clubToken: mode.clubToken } })
      await updateLeague({
        data: { token: mode.token, ...details, ...(ruleLock || !ruleChanged ? {} : { rule: { format, rosterLimit, allowances } }) },
      })
      if (isOwner && adminsChanged) await setLeagueAdmins({ data: { token: mode.token, userIds: adminIds } })
      return null
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
        league ? queryClient.invalidateQueries({ queryKey: leagueReadsKey(league.token) }) : null,
      ]),
    onSuccess: async (created) => {
      onClose()
      if (created) await navigate({ to: '/tournaments/$token', params: { token: created.token }, search: { event: created.eventToken } })
    },
  })

  const title = mode.kind === 'create' ? 'New tournament' : 'Edit tournament'
  const description =
    mode.kind === 'create'
      ? mode.clubToken
        ? 'Runs inside the club. Everyone seals a roster in secret, then you reveal them together.'
        : 'Everyone seals a roster in secret, then you reveal them together.'
      : 'Applies from now on. Nothing already sealed or played changes. Switching to Anyone who joins lets in everyone still waiting.'
  const submit = mode.kind === 'create' ? (save.isPending ? 'Creating…' : 'Create tournament') : save.isPending ? 'Saving…' : 'Save changes'

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
