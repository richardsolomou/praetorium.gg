import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Link2, Share2, UserMinus, UserPlus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { alliedLeagueRosterLimit, type LeagueEntryView } from '../../../core/league'
import {
  addLeagueEntrants,
  admitLeagueEntries,
  assignLeagueRosterRequirement,
  assignLeagueTeam,
  moderateLeagueEntry,
} from '../../functions'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { friendshipsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useOrigin } from '../../useOrigin'
import { useNativeShare } from '../../nativeBridge'
import { inviteFeedbackText, useInviteShare } from './LeagueActions'
import { EntrantGroup, EntrantList, SectionHeading, sealStatus, sideGroups } from './LeagueEntrants'
import { LeagueSettingsDialog } from './LeagueSettingsDialog'
import { doublesTeams, formatNames, soloOrAllied, useLeagueRefresh, type League } from './leagueEvent'

/** Draws one entrant with whatever the reader may do about them; the organizer's controls ride in `controls`. */
export type EntrantRowRenderer = (entry: LeagueEntryView, detail: ReactNode, controls?: ReactNode) => ReactNode

/** The organizer's view of who is in an open event: requests to answer, entrants to size, pair or remove, and who was turned away. */
export function OrganizerEntrants({ league, token, row }: { league: League; token: string; row: EntrantRowRenderer }) {
  const refresh = useLeagueRefresh(token)
  const eventToken = league.eventToken
  const [removing, setRemoving] = useState<LeagueEntryView | null>(null)
  const [reassigning, setReassigning] = useState<{ entry: LeagueEntryView; requiredLimit: number } | null>(null)
  const [clearing, setClearing] = useState<{ userIds: string[]; sealed: LeagueEntryView[] } | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const moderate = useMutation({
    mutationFn: (input: { userId: string; status: 'accepted' | 'rejected' }) =>
      moderateLeagueEntry({ data: { token, eventToken, ...input } }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
  })
  const acceptAll = useMutation({
    mutationFn: (userIds: string[]) => admitLeagueEntries({ data: { token, eventToken, userIds } }),
    onSettled: refresh,
  })
  const assign = useMutation({
    mutationFn: (input: { userId: string; requiredLimit: number }) =>
      assignLeagueRosterRequirement({ data: { token, eventToken, ...input } }),
    onSuccess: async () => {
      setReassigning(null)
      await refresh()
    },
  })
  const assignTeam = useMutation({
    mutationFn: (userIds: string[]) => assignLeagueTeam({ data: { token, eventToken, userIds } }),
    onSuccess: async () => {
      setClearing(null)
      setPicked([])
      await refresh()
    },
  })

  const labels = disambiguatedPlayerLabels(league.entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const label = (entry: LeagueEntryView) => labels.get(entry.userId) ?? entry.name
  const nameOf = (userId: string) => labels.get(userId) ?? league.entries.find((entry) => entry.userId === userId)?.name ?? 'someone'
  const byJoin = [...league.entries].sort((left, right) => left.joinedAt - right.joinedAt)
  const accepted = byJoin.filter((entry) => entry.status === 'accepted')
  const pending = byJoin.filter((entry) => entry.status === 'pending')
  const rejected = byJoin.filter((entry) => entry.status === 'rejected')
  const teams = doublesTeams(accepted)
  // A picked player who was paired or removed since is dropped, so the picker never holds a place for a row it no longer shows.
  const unpairedIds = new Set(accepted.filter((entry) => !entry.teamId).map((entry) => entry.userId))
  const pickedLive = picked.filter((id) => unpairedIds.has(id))
  const openPlaces = league.playerLimit === null ? pending.length : Math.max(0, league.playerLimit - accepted.length)
  const sides = sideGroups(league)

  const requestAssignment = (entry: LeagueEntryView, requiredLimit: number) => {
    if (entry.requiredLimit === requiredLimit) return
    assign.reset()
    if (entry.submitted) setReassigning({ entry, requiredLimit })
    else assign.mutate({ userId: entry.userId, requiredLimit })
  }
  const requestTeam = (userIds: string[]) => {
    assignTeam.reset()
    const touched = new Set(
      accepted.filter((entry) => userIds.includes(entry.userId)).flatMap((entry) => (entry.teamId ? [entry.teamId] : [])),
    )
    const sealed = accepted.filter(
      (entry) => entry.submitted && (userIds.includes(entry.userId) || (entry.teamId && touched.has(entry.teamId))),
    )
    if (sealed.length) setClearing({ userIds, sealed })
    else assignTeam.mutate(userIds)
  }
  // A refusal is shown on the row it came from, unless a confirmation dialog is already showing it.
  const rowError = (error: Error | null, failedId: string | undefined, entry: LeagueEntryView) =>
    error && failedId === entry.userId ? (
      <p role="alert" className="w-full text-right text-xs text-destructive">
        {errorMessage(error)}
      </p>
    ) : null
  const moderateError = (entry: LeagueEntryView) => (removing ? null : rowError(moderate.error, moderate.variables?.userId, entry))
  // Removing an entrant is rare and recedes to an icon; the confirmation says the word.
  const removeButton = (entry: LeagueEntryView) => (
    <Button
      size="icon"
      variant="ghost"
      className="text-dim hover:text-destructive pointer-coarse:size-11"
      aria-label={`Remove ${label(entry)}`}
      disabled={moderate.isPending}
      onClick={() => {
        moderate.reset()
        setRemoving(entry)
      }}
    >
      <UserMinus />
    </Button>
  )

  const entrants = !accepted.length ? (
    <div className="border border-edge bg-panel px-5 py-9 text-center">
      <UserPlus className="mx-auto size-7 text-faint" />
      <p className="mt-3 font-bold uppercase">No entrants yet</p>
      <p className="mt-1 text-sm text-dim">Share the invite link to fill it.</p>
    </div>
  ) : league.format === '2v1' ? (
    <div className="space-y-4">
      {(['unsized', 'solo', 'allied'] as const).map((side) => {
        const members = accepted.filter((entry) => (soloOrAllied(league, entry) ?? 'unsized') === side)
        if (!members.length) return null
        return (
          <EntrantGroup key={side} group={side} title={sides[side].title} detail={sides[side].detail}>
            <EntrantList>
              {members.map((entry) =>
                row(
                  entry,
                  sealStatus(entry, false),
                  <>
                    {league.rosterLimit ? (
                      <SizeToggle
                        label={label(entry)}
                        side={soloOrAllied(league, entry)}
                        pending={assign.isPending}
                        onAssign={(next) =>
                          requestAssignment(entry, next === 'solo' ? league.rosterLimit! : alliedLeagueRosterLimit(league.rosterLimit!))
                        }
                      />
                    ) : null}
                    {removeButton(entry)}
                    {reassigning ? null : rowError(assign.error, assign.variables?.userId, entry)}
                    {moderateError(entry)}
                  </>,
                ),
              )}
            </EntrantList>
          </EntrantGroup>
        )
      })}
    </div>
  ) : league.format === '2v2' ? (
    <div className="space-y-4">
      {accepted.some((entry) => !entry.teamId) ? (
        <EntrantGroup
          group="unpaired"
          title="Waiting for a teammate"
          detail="Tick two players, then pair them."
          action={
            <Button
              size="sm"
              className="pointer-coarse:h-11"
              disabled={pickedLive.length !== 2 || assignTeam.isPending}
              onClick={() => requestTeam(pickedLive)}
            >
              {pickedLive.length === 2 ? `Pair ${formatNames(pickedLive.map(nameOf))}` : 'Pick two to pair'}
            </Button>
          }
        >
          <EntrantList>
            {accepted
              .filter((entry) => !entry.teamId)
              .map((entry) => {
                const checked = pickedLive.includes(entry.userId)
                return row(
                  entry,
                  sealStatus(entry, false),
                  <>
                    <label className="flex cursor-pointer items-center gap-2 px-1 text-xs font-semibold tracking-label text-dim uppercase pointer-coarse:min-h-11">
                      <input
                        type="checkbox"
                        className="size-5 accent-parchment"
                        aria-label={`Pick ${label(entry)} for a team`}
                        checked={checked}
                        disabled={!checked && pickedLive.length === 2}
                        onChange={() => setPicked(checked ? pickedLive.filter((id) => id !== entry.userId) : [...pickedLive, entry.userId])}
                      />
                      Pick
                    </label>
                    {removeButton(entry)}
                    {moderateError(entry)}
                  </>,
                )
              })}
          </EntrantList>
          {assignTeam.error && clearing === null ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {errorMessage(assignTeam.error)}
            </p>
          ) : null}
        </EntrantGroup>
      ) : null}
      {teams.map((team, index) => (
        <EntrantGroup
          key={team.id}
          group={`team-${index + 1}`}
          title={`Team ${index + 1}`}
          detail={formatNames(team.members.map(label))}
          action={
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-11"
              disabled={assignTeam.isPending}
              aria-label={`Unpair ${formatNames(team.members.map(label))}`}
              onClick={() => requestTeam([team.members[0]!.userId])}
            >
              <X /> Unpair
            </Button>
          }
        >
          <EntrantList>
            {team.members.map((entry) =>
              row(
                entry,
                sealStatus(entry, false),
                <>
                  {removeButton(entry)}
                  {moderateError(entry)}
                </>,
              ),
            )}
          </EntrantList>
        </EntrantGroup>
      ))}
    </div>
  ) : (
    <EntrantList>
      {accepted.map((entry) =>
        row(
          entry,
          sealStatus(entry, false),
          <>
            {removeButton(entry)}
            {moderateError(entry)}
          </>,
        ),
      )}
    </EntrantList>
  )

  return (
    <>
      {pending.length ? (
        <section>
          <SectionHeading
            title="Requests"
            count={pending.length}
            action={
              pending.length > 1 && openPlaces > 0 ? (
                <Button
                  size="sm"
                  className="pointer-coarse:h-11"
                  disabled={acceptAll.isPending || moderate.isPending}
                  onClick={() => acceptAll.mutate(pending.map((entry) => entry.userId))}
                >
                  <Check /> {openPlaces >= pending.length ? 'Accept all' : `Accept the first ${openPlaces}`}
                </Button>
              ) : null
            }
          />
          <EntrantList>
            {pending.map((entry) =>
              row(
                entry,
                'Asked to join',
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:h-11"
                    aria-label={`Accept ${label(entry)}`}
                    disabled={moderate.isPending || acceptAll.isPending}
                    onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                  >
                    <Check /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-dim hover:text-destructive pointer-coarse:h-11"
                    aria-label={`Turn away ${label(entry)}`}
                    disabled={moderate.isPending || acceptAll.isPending}
                    onClick={() => moderate.mutate({ userId: entry.userId, status: 'rejected' })}
                  >
                    <X /> Turn away
                  </Button>
                  {moderateError(entry)}
                </>,
              ),
            )}
          </EntrantList>
          {acceptAll.error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {errorMessage(acceptAll.error)}
            </p>
          ) : null}
        </section>
      ) : null}

      <section data-onboarding="league-entrants">
        <SectionHeading title="Entrants" count={accepted.length} action={<AddFriends league={league} token={token} />} />
        {entrants}
      </section>

      {rejected.length ? (
        <details className="group">
          <summary className="rubric flex cursor-pointer list-none items-baseline gap-2 border-b border-edge pb-2 hover:text-bone">
            Turned away <span className="readout text-faint">{rejected.length}</span>
            <span className="ml-auto text-xs font-normal tracking-normal normal-case group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs font-normal tracking-normal normal-case group-open:inline">Hide</span>
          </summary>
          <div className="mt-2">
            <EntrantList>
              {rejected.map((entry) =>
                row(
                  entry,
                  'Turned away',
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:h-11"
                      aria-label={`Let ${label(entry)} in`}
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                    >
                      <UserPlus /> Let in
                    </Button>
                    {moderateError(entry)}
                  </>,
                ),
              )}
            </EntrantList>
          </div>
        </details>
      ) : null}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (moderate.isPending) return
          if (!open) {
            moderate.reset()
            setRemoving(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={moderate.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? label(removing) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const teammate = removing?.teamId
                  ? accepted.find((entry) => entry.teamId === removing.teamId && entry.userId !== removing.userId)
                  : undefined
                return teammate && removing
                  ? `This also unpairs ${label(teammate)} and clears both their sealed lists. ${label(removing)} has to join again and seal another list to come back.`
                  : 'Their sealed list goes with them. They have to join again and seal another to come back.'
              })()}
            </AlertDialogDescription>
            {moderate.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(moderate.error)}
              </p>
            ) : null}
            {moderate.isPending ? <output className="sr-only">Removing entrant…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moderate.isPending}>Keep entrant</AlertDialogCancel>
            <AlertDialogAction
              disabled={moderate.isPending}
              onClick={() => removing && moderate.mutate({ userId: removing.userId, status: 'rejected' })}
            >
              {moderate.isPending ? 'Removing…' : 'Remove entrant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={reassigning !== null} onOpenChange={(open) => !assign.isPending && !open && setReassigning(null)}>
        <AlertDialogContent aria-busy={assign.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Change {reassigning ? label(reassigning.entry) : ''}’s roster size?</AlertDialogTitle>
            <AlertDialogDescription>
              Their sealed list is cleared. They have to seal one at the new size before you can reveal.
            </AlertDialogDescription>
            {assign.isPending ? <output className="sr-only">Changing roster size…</output> : null}
            {assign.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(assign.error)}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assign.isPending}>Keep current size</AlertDialogCancel>
            <AlertDialogAction
              disabled={assign.isPending}
              onClick={() => reassigning && assign.mutate({ userId: reassigning.entry.userId, requiredLimit: reassigning.requiredLimit })}
            >
              {assign.isPending ? 'Changing…' : 'Change size'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={clearing !== null}
        onOpenChange={(open) => {
          if (!assignTeam.isPending && !open) {
            assignTeam.reset()
            setClearing(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={assignTeam.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear sealed doubles rosters?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the sealed {clearing?.sealed.length === 1 ? 'list' : 'lists'} for{' '}
              {clearing ? formatNames(clearing.sealed.map(label)) : ''}. They have to seal another before you can reveal.
            </AlertDialogDescription>
            {assignTeam.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(assignTeam.error)}
              </p>
            ) : null}
            {assignTeam.isPending ? <output className="sr-only">Changing doubles team…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignTeam.isPending}>Keep current teams</AlertDialogCancel>
            <AlertDialogAction disabled={assignTeam.isPending} onClick={() => clearing && assignTeam.mutate(clearing.userIds)}>
              {assignTeam.isPending ? 'Clearing…' : 'Change team and clear rosters'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SizeToggle({
  label,
  side,
  pending,
  onAssign,
}: {
  label: string
  side: 'solo' | 'allied' | null
  pending: boolean
  onAssign: (side: 'solo' | 'allied') => void
}) {
  return (
    <fieldset className="inline-flex border border-edge-strong">
      <legend className="sr-only">Size for {label}</legend>
      {(['solo', 'allied'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={side === option}
          aria-label={`Assign ${label} ${option === 'solo' ? 'a solo' : 'an allied'} roster`}
          disabled={pending}
          className={`h-8 min-w-16 px-3 text-xs font-semibold tracking-label uppercase disabled:cursor-wait disabled:opacity-60 pointer-coarse:h-11 ${side === option ? 'bg-parchment text-parchment-ink' : 'text-dim hover:bg-raised hover:text-bone'}`}
          onClick={() => onAssign(option)}
        >
          {option}
        </button>
      ))}
    </fieldset>
  )
}

/** The organizer's way on once an event is revealed: the next event, set up in the same form as the first. */
export function NextEventPanel({ league }: { league: League }) {
  const [open, setOpen] = useState(false)
  const next = league.eventCount + 1
  return (
    <section className="border border-edge bg-panel p-4">
      <h2 className="rubric">Next event</h2>
      <p className="mt-1 text-xs text-dim">
        When this event’s games are done: everyone joins and seals a new list. This event keeps its lists and results.
      </p>
      <Button variant="outline" className="mt-3 w-full pointer-coarse:h-11" onClick={() => setOpen(true)}>
        Start event {next}
      </Button>
      <LeagueSettingsDialog mode={{ kind: 'next', token: league.token }} open={open} onOpenChange={setOpen} />
    </section>
  )
}

export function InvitePanel({ league }: { league: League }) {
  const origin = useOrigin()
  const invite = useInviteShare(league)
  const shareLabel = useNativeShare() ? 'Share invite' : 'Copy invite link'
  return (
    <section className="border border-edge bg-panel p-4">
      <h2 className="rubric">Invite players</h2>
      <p className="mt-1 text-xs text-dim">
        {league.visibility === 'private' ? 'Unlisted, so this link is the way in.' : 'Also listed on the leagues page.'}
      </p>
      <button
        type="button"
        aria-label={invite.feedback === 'copied' ? 'Invite link copied' : invite.feedback === 'shared' ? 'Invite shared' : shareLabel}
        disabled={!origin}
        className="group mt-3 block w-full border border-edge-strong bg-sunken text-left hover:border-info disabled:opacity-60"
        onClick={() => void invite.share()}
      >
        <span className="flex items-center gap-2.5 px-3 py-2.5">
          <Link2 className="size-4 shrink-0 text-info" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-xs text-dim">{origin ? `${origin.replace(/^https?:\/\//, '')}/leagues/` : '\u00a0'}</span>
            <span className="block truncate text-sm font-semibold text-bone">{league.token}</span>
          </span>
        </span>
        <span
          aria-hidden
          className={`flex items-center justify-center gap-1.5 border-t border-edge-strong px-3 py-2 text-xs font-semibold tracking-label uppercase group-hover:bg-raised pointer-coarse:min-h-11 ${invite.feedback === 'copied' || invite.feedback === 'shared' ? 'text-achieved' : 'text-parchment'}`}
        >
          {invite.feedback === 'copied' || invite.feedback === 'shared' ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
          {invite.feedback === 'copied' ? 'Link copied' : invite.feedback === 'shared' ? 'Invite shared' : shareLabel}
        </span>
      </button>
      <p aria-live="polite" className={`mt-2 text-xs ${invite.feedback === 'error' ? 'text-destructive' : 'sr-only'}`}>
        {invite.feedback ? inviteFeedbackText(invite.feedback) : ''}
      </p>
    </section>
  )
}

/** Enters friends in the open event directly, the way a battle seats them, within whatever places are left. */
function AddFriends({ league, token }: { league: League; token: string }) {
  const refresh = useLeagueRefresh(token)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: open })
  const accepted = new Set(league.entries.filter((entry) => entry.status === 'accepted').map((entry) => entry.userId))
  const candidates = (friendships?.friends ?? []).filter((friend) => !accepted.has(friend.id))
  const places = league.playerLimit === null ? null : Math.max(0, league.playerLimit - accepted.size)
  const add = useMutation({
    mutationFn: () => addLeagueEntrants({ data: { token, eventToken: league.eventToken, userIds: picked } }),
    onSuccess: async () => {
      setOpen(false)
      setPicked([])
      await refresh()
    },
  })
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="pointer-coarse:h-11"
        onClick={() => {
          add.reset()
          setPicked([])
          setOpen(true)
        }}
      >
        <UserPlus /> Add friends
      </Button>
      <Dialog open={open} onOpenChange={(next) => !add.isPending && setOpen(next)}>
        <DialogContent showCloseButton={!add.isPending} aria-busy={add.isPending}>
          <DialogHeader>
            <DialogTitle className="text-2xl">Add friends</DialogTitle>
            <DialogDescription>
              They are entered straight away, without asking to join.
              {places === null ? '' : ` ${places === 1 ? '1 place' : `${places} places`} left.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {!friendships ? (
              <p className="text-sm text-dim">Loading friends…</p>
            ) : !candidates.length ? (
              <p className="text-sm text-dim">
                {friendships.friends.length ? 'Every friend is already in this event.' : 'Add friends first, then enter them here.'}
              </p>
            ) : (
              <ul className="divide-y divide-edge border border-edge bg-panel">
                {candidates.map((friend) => {
                  const checked = picked.includes(friend.id)
                  return (
                    <li key={friend.id}>
                      <label className="flex cursor-pointer items-center gap-3 p-3 pointer-coarse:min-h-11">
                        <input
                          type="checkbox"
                          className="size-5 accent-parchment"
                          checked={checked}
                          disabled={add.isPending || (!checked && places !== null && picked.length >= places)}
                          onChange={() => setPicked(checked ? picked.filter((id) => id !== friend.id) : [...picked, friend.id])}
                        />
                        <PlayerAvatar name={friend.name} image={friend.image} className="size-8 text-3xs" />
                        <span className="min-w-0 truncate font-bold uppercase">{friend.name}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {add.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(add.error)}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={add.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={add.isPending || !picked.length} onClick={() => add.mutate()}>
              {add.isPending ? 'Adding…' : picked.length ? `Add ${picked.length} player${picked.length === 1 ? '' : 's'}` : 'Add players'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
