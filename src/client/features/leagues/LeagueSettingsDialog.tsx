import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { leagueMinimumPlaces, leaguePlacesSeat, leagueTableShape, LEAGUE_DEFAULT_ROSTER_LIMIT } from '../../../core/league'
import { createLeague, createLeagueEvent, updateLeague } from '../../../server/functions'
import { leagueQuery, leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { leagueFormValid, LeagueFormFields, type LeagueFormValue } from './LeagueForm'
import type { League } from './leagueEvent'

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
    <DialogContent aria-busy className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-2xl">{mode.kind === 'next' ? 'Set up the next event' : 'Edit league'}</DialogTitle>
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
    admission: league?.admission ?? 'approval',
    playerLimit:
      mode.kind === 'next' && league && !leaguePlacesSeat(current, league.playerLimit)
        ? leagueMinimumPlaces(current, league.playerLimit ?? 0)
        : (league?.playerLimit ?? null),
    format: current,
    rosterLimit: league?.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT,
  }))
  const [ownerPlays, setOwnerPlays] = useState(
    () => !league || league.entries.some((entry) => entry.userId === league.ownerId && entry.status === 'accepted'),
  )
  // A fresh event starts with nobody in it, so only the open event's entrants hold places.
  const seated =
    mode.kind === 'edit' && league && !league.revealedAt ? league.entries.filter((entry) => entry.status === 'accepted').length : 0
  const ruleLock =
    mode.kind !== 'edit' || !league
      ? null
      : league.revealedAt
        ? 'This event is revealed; set up the next one to play a different format.'
        : league.entries.some((entry) => entry.submitted)
          ? 'Locked now that a list is sealed.'
          : null
  // A revealed event no longer holds the limit to its shape; the limit only governs the events after it.
  const limitFormat = mode.kind === 'edit' && league?.revealedAt ? null : value.format
  const ruleChanged = value.format !== current || value.rosterLimit !== league?.rosterLimit
  const clearsAssignments =
    mode.kind === 'edit' && ruleChanged && league?.entries.some((entry) => entry.teamId || (league.format === '2v1' && entry.requiredLimit))
  const next = (league?.eventCount ?? 0) + 1

  const save = useMutation({
    mutationKey: SAVE,
    mutationFn: async () => {
      const { format, rosterLimit, ...details } = value
      if (mode.kind === 'create') return createLeague({ data: { ...details, format, rosterLimit, ownerPlays } })
      if (mode.kind === 'next') {
        const created = await createLeagueEvent({ data: { token: mode.token, ...details, format, rosterLimit, ownerPlays } })
        return { token: mode.token, eventToken: created.eventToken }
      }
      await updateLeague({ data: { token: mode.token, ...details, ...(ruleLock ? {} : { rule: { format, rosterLimit } }) } })
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

  const title = mode.kind === 'create' ? 'New league' : mode.kind === 'next' ? `Set up event ${next}` : 'Edit league'
  const description =
    mode.kind === 'create'
      ? 'Sets up the league and opens its first event: players join, seal a hidden list, and every list is revealed together.'
      : mode.kind === 'next'
        ? 'Starts empty: everyone joins and seals again. Earlier events stay readable.'
        : 'Applies from now on. Nothing already sealed or played changes. Switching to automatic lets in anyone still waiting.'
  const eventLabel = `Event ${mode.kind === 'edit' ? league?.eventCount : mode.kind === 'next' ? next : 1}`
  const submit =
    mode.kind === 'create'
      ? save.isPending
        ? 'Creating…'
        : 'Create league'
      : mode.kind === 'next'
        ? save.isPending
          ? 'Opening…'
          : `Open event ${next}`
        : save.isPending
          ? 'Saving…'
          : 'Save changes'

  return (
    <DialogContent showCloseButton={!save.isPending} aria-busy={save.isPending} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-2xl">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <LeagueFormFields
          idPrefix={`${mode.kind}-league`}
          eventLabel={eventLabel}
          value={value}
          seated={seated}
          limitFormat={limitFormat}
          ruleLock={ruleLock}
          ownerPlays={mode.kind === 'edit' ? undefined : ownerPlays}
          disabled={save.isPending}
          onChange={setValue}
          onOwnerPlaysChange={setOwnerPlays}
        />
        {clearsAssignments ? (
          <p className="text-xs text-parchment">Changing the format clears every size and team you’ve handed out.</p>
        ) : null}
        {save.isPending ? <output className="sr-only">{submit}</output> : null}
        {save.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(save.error)}
          </p>
        ) : null}
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
