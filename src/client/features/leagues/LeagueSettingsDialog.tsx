import { sameSet } from '../../../core/collections'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { effectiveLeagueAllowances, leagueTableShape, LEAGUE_DEFAULT_ROSTER_LIMIT } from '../../../core/league'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { createClubGame, createLeague, setLeagueAdmins, updateLeague } from '../../functions'
import { leagueQuery, leagueReadsKey, leaguesQuery, meQuery } from '../../queries'
import { leagueFormValid, LeagueFormFields, type LeagueFormValue } from './LeagueForm'
import { eventLink, leagueNoun, type League } from './leagueEvent'
import { Problem } from '../../components/Problem'

/**
 * `create` opens a tournament, or a club's sealed game when given the club's token, and `edit` changes one. Both are
 * the same form, so every setting lives in one place.
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
  const { noun } = leagueNoun(league ?? {})
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
const currentAllowances = (league: League) =>
  effectiveLeagueAllowances(leagueTableShape(league.format), league.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT, league.allowances)

function SettingsForm({ mode, league, onClose }: { mode: LeagueSettingsMode; league: League | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const current = league ? leagueTableShape(league.format) : '1v1'
  const sealedGame = mode.kind === 'create' ? Boolean(mode.clubToken) : Boolean(league?.club)
  const { noun } = leagueNoun(mode.kind === 'create' ? { club: mode.clubToken } : (league ?? {}))
  const [value, setValue] = useState<LeagueFormValue>(() => ({
    name: league?.tournament?.name ?? '',
    description: league?.tournament?.description ?? '',
    visibility: league?.tournament?.visibility ?? 'public',
    admission: league?.tournament?.admission ?? 'automatic',
    playerLimit: league?.tournament?.playerLimit ?? null,
    format: current,
    rosterLimit: league?.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT,
    allowances: league ? [...currentAllowances(league)] : [],
    rounds: league?.rounds ?? null,
    pointsBudget: league?.pointsBudget ?? null,
    soloPoints: league?.soloPoints ?? null,
    allyPoints: league?.allyPoints ?? null,
    playsAt: league?.playsAt ?? null,
    sealBy: league?.sealBy ?? null,
  }))
  const { data: me } = useQuery(meQuery())
  // Whoever opens the form, owner or admin, is the organizer it asks about.
  const [ownerPlays, setOwnerPlays] = useState(
    () => !league || league.entries.some((entry) => entry.userId === me?.id && entry.status === 'accepted'),
  )
  const isOwner = Boolean(league?.tournament && me?.id === league.tournament.ownerId)
  const currentAdmins = league?.tournament?.admins.map((admin) => admin.id) ?? []
  const [adminIds, setAdminIds] = useState(currentAdmins)
  const adminsChanged = !sameSet(adminIds, currentAdmins)
  const seated =
    mode.kind === 'edit' && league && !league.revealedAt ? league.entries.filter((entry) => entry.status === 'accepted').length : 0
  const ruleLock =
    mode.kind !== 'edit' || !league
      ? null
      : league.revealedAt
        ? `The rosters are out; start a new ${noun} to play a different format.`
        : league.entries.some((entry) => entry.submitted)
          ? 'Locked now that a roster is sealed.'
          : null
  // A revealed event takes nobody new, so its limit no longer has to seat its shape.
  const limitFormat = mode.kind === 'edit' && league?.revealedAt ? null : value.format
  const shapeChanged = value.format !== current || value.rosterLimit !== league?.rosterLimit
  const ruleChanged =
    shapeChanged ||
    (league !== null &&
      (!sameSet(value.allowances, currentAllowances(league)) ||
        value.rounds !== league.rounds ||
        value.pointsBudget !== league.pointsBudget ||
        value.soloPoints !== league.soloPoints ||
        value.allyPoints !== league.allyPoints))
  const clearsAssignments =
    mode.kind === 'edit' &&
    shapeChanged &&
    league?.entries.some((entry) => entry.teamId || (league.format === '2v1' && entry.requiredLimit))

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_submitted', { format: value.format, club: sealedGame })
    },
    onError: () => {
      if (mode.kind === 'create') posthog.capture('league_creation_failed', { reason: 'request', club: sealedGame })
    },
    mutationFn: async () => {
      const { format, rosterLimit, allowances, rounds, pointsBudget, soloPoints, allyPoints, playsAt, sealBy, ...details } = value
      const schedule = { playsAt, sealBy }
      const points = { pointsBudget, soloPoints, allyPoints }
      if (mode.kind === 'create')
        return mode.clubToken
          ? createClubGame({
              data: {
                clubToken: mode.clubToken,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                format,
                rosterLimit,
                allowances,
                ...points,
                schedule,
              },
            })
          : createLeague({ data: { ...details, format, rosterLimit, allowances, rounds, ...points, schedule, ownerPlays } })
      await updateLeague({
        data: {
          token: mode.token,
          // A club's sealed game has no details of its own.
          ...(sealedGame ? {} : details),
          schedule,
          ...(ruleLock || !ruleChanged ? {} : { rule: { format, rosterLimit, allowances, rounds, ...points } }),
        },
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
      if (created)
        await navigate(
          eventLink({ token: created.token, club: mode.kind === 'create' && mode.clubToken ? { token: mode.clubToken } : null }),
        )
    },
  })

  const title = mode.kind === 'create' ? `New ${noun}` : `Edit ${noun}`
  const description =
    mode.kind === 'create' ? (
      mode.clubToken ? (
        'Members seal a list in secret, then you reveal them together. Its battles count on the club’s leaderboard.'
      ) : (
        <>
          Everyone seals a roster in secret, then you reveal them together.{' '}
          <Link to="/tournaments/sample" className="text-bone underline hover:text-info">
            See a sample tournament
          </Link>
        </>
      )
    ) : sealedGame ? (
      'Applies from now on. Nothing already sealed or played changes.'
    ) : (
      'Applies from now on. Nothing already sealed or played changes. Switching to Anyone who joins lets in everyone still waiting.'
    )
  const submit =
    mode.kind === 'create'
      ? save.isPending
        ? 'Creating…'
        : `${mode.clubToken ? 'Start' : 'Create'} ${noun}`
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
            tournament={!sealedGame}
            // A club game's players enter by sealing a list or taking a seat, its organizer included.
            ownerPlays={mode.kind === 'edit' || sealedGame ? undefined : ownerPlays}
            admins={
              mode.kind === 'edit' && isOwner && league?.tournament
                ? { selected: adminIds, known: league.tournament.admins, onChange: setAdminIds }
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
            data-onboarding="league-create"
            type="submit"
            disabled={save.isPending || !leagueFormValid(value, seated, limitFormat, !sealedGame)}
          >
            {submit}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
