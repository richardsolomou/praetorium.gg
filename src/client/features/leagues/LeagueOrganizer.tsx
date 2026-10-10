import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Circle, EllipsisVertical, Link2, LockKeyholeOpen, Share2, UserMinus, UserPlus, X } from 'lucide-react'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { alliedLeagueRosterLimit, leagueRevealChecklist, type LeagueEntryView, type LeagueRevealCheck } from '../../../core/league'
import {
  addLeagueEntrants,
  admitLeagueEntries,
  assignLeagueRosterRequirement,
  assignLeagueTeam,
  moderateLeagueEntry,
  revealLeague,
  unsealLeagueRoster,
} from '../../functions'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { friendshipsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useOrigin } from '../../useOrigin'
import { inviteFeedbackText, useInviteShare } from './LeagueActions'
import { EntrantGroup, EntrantList, SectionHeading, sealStatus, sideGroups } from './LeagueEntrants'
import { LeagueSettingsDialog } from './LeagueSettingsDialog'
import { doublesTeams, formatNames, namesPhrase, soloOrAllied, useLeagueRefresh, type League } from './leagueEvent'

/** Draws one entrant with whatever the reader may do about them; the organizer's controls ride in `controls`. */
export type EntrantRowRenderer = (entry: LeagueEntryView, detail: ReactNode, controls?: ReactNode) => ReactNode

/** The organizer's view of who is in the event: requests to answer, entrants to size, pair, remove or unseal, and who was turned away. */
export function OrganizerEntrants({ league, token, row }: { league: League; token: string; row: EntrantRowRenderer }) {
  const refresh = useLeagueRefresh(token)
  const eventToken = league.eventToken
  const [removing, setRemoving] = useState<LeagueEntryView | null>(null)
  const [reassigning, setReassigning] = useState<{ entry: LeagueEntryView; requiredLimit: number } | null>(null)
  const [unsealing, setUnsealing] = useState<LeagueEntryView | null>(null)
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
  const unseal = useMutation({
    mutationFn: (userId: string) => unsealLeagueRoster({ data: { token, eventToken, userId } }),
    onSuccess: async () => {
      setUnsealing(null)
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
  const revealed = Boolean(league.revealedAt)
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
  const removeButton = (entry: LeagueEntryView) =>
    revealed ? null : (
      // Removing an entrant is rare and recedes to an icon; the confirmation says the word.
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
  const revealedControls = (entry: LeagueEntryView) =>
    revealed && entry.submitted ? (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={`More for ${label(entry)}`} />}
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => {
                unseal.reset()
                setUnsealing(entry)
              }}
            >
              <LockKeyholeOpen /> Unseal roster
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : null

  const entrants = !accepted.length ? (
    <div className="border border-edge bg-panel px-5 py-9 text-center">
      <UserPlus className="mx-auto size-7 text-faint" />
      <p className="mt-3 font-bold uppercase">No entrants yet</p>
      <p className="mt-1 text-sm text-dim">{revealed ? 'Nobody was accepted into this event.' : 'Share the invite link to fill it.'}</p>
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
                  sealStatus(entry, revealed),
                  <>
                    {!revealed && league.rosterLimit ? (
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
                    {revealedControls(entry)}
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
      {accepted.some((entry) => !entry.teamId) && !revealed ? (
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
                  sealStatus(entry, revealed),
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
            revealed ? null : (
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
            )
          }
        >
          <EntrantList>
            {team.members.map((entry) =>
              row(
                entry,
                sealStatus(entry, revealed),
                <>
                  {removeButton(entry)}
                  {revealedControls(entry)}
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
          sealStatus(entry, revealed),
          <>
            {removeButton(entry)}
            {revealedControls(entry)}
            {moderateError(entry)}
          </>,
        ),
      )}
    </EntrantList>
  )

  return (
    <>
      {!revealed && pending.length ? (
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
        <SectionHeading title="Entrants" count={accepted.length} action={revealed ? null : <AddFriends league={league} token={token} />} />
        {entrants}
      </section>

      {!revealed && rejected.length ? (
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
      <AlertDialog
        open={unsealing !== null}
        onOpenChange={(open) => {
          if (unseal.isPending) return
          if (!open) {
            unseal.reset()
            setUnsealing(null)
          }
        }}
      >
        <AlertDialogContent aria-busy={unseal.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Unseal {unsealing ? label(unsealing) : ''}’s roster?</AlertDialogTitle>
            <AlertDialogDescription>
              Their revealed list is discarded and they can seal another one for this event. Battles already started keep the list they were
              created with.
            </AlertDialogDescription>
            {unseal.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(unseal.error)}
              </p>
            ) : null}
            {unseal.isPending ? <output className="sr-only">Unsealing roster…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unseal.isPending}>Keep it sealed</AlertDialogCancel>
            <AlertDialogAction disabled={unseal.isPending} onClick={() => unsealing && unseal.mutate(unsealing.userId)}>
              {unseal.isPending ? 'Unsealing…' : 'Unseal roster'}
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

const CHECK_TITLES: Record<LeagueRevealCheck['step'], string> = {
  places: 'Places',
  requests: 'Requests',
  sizes: 'Sizes',
  teams: 'Teams',
  lists: 'Sealed lists',
}

function checkDetail(check: LeagueRevealCheck, accepted: number, nameOf: (userId: string) => string) {
  const names = (userIds: string[]) => namesPhrase(userIds.map(nameOf))
  switch (check.step) {
    case 'places':
      if (check.done) return check.required === null ? `${check.accepted} accepted.` : `All ${check.required} filled.`
      return check.accepted === 0 ? 'Accept at least one player.' : `${check.accepted} of ${check.required} filled.`
    case 'requests':
      return check.done ? 'None waiting.' : `Answer ${names(check.waiting)}.`
    case 'sizes':
      if (check.done) return `${check.solo} solo, ${check.allied} allied.`
      if (check.waiting.length) return `Give ${names(check.waiting)} a size.`
      return check.solo === 0 ? 'Make one player solo.' : 'Make two players allied.'
    case 'teams':
      if (check.done) return `${accepted / 2} teams of two.`
      if (accepted < 4) return 'Doubles needs four players.'
      if (accepted % 2) return 'Doubles needs an even number of players.'
      return `Pair ${names(check.waiting)}.`
    case 'lists':
      if (check.done)
        return accepted === 0 ? 'Nobody to wait on yet.' : accepted === 1 ? 'The only list is sealed.' : `All ${accepted} sealed.`
      return `${accepted - check.waiting.length} of ${accepted} sealed. Waiting on ${names(check.waiting)}.`
  }
}

/** What still stands before the organizer can reveal, and the reveal itself once nothing does. */
export function OrganizerRevealPanel({ league, token }: { league: League; token: string }) {
  const refresh = useLeagueRefresh(token)
  const [revealing, setRevealing] = useState(false)
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token, eventToken: league.eventToken } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const labels = disambiguatedPlayerLabels(league.entries.map((entry) => ({ id: entry.userId, name: entry.name })))
  const nameOf = (userId: string) => labels.get(userId) ?? league.entries.find((entry) => entry.userId === userId)?.name ?? 'someone'
  const checks = leagueRevealChecklist(league, league.entries)
  const remaining = checks.filter((check) => !check.done).length
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  const pending = league.entries.filter((entry) => entry.status === 'pending').length
  return (
    <section
      data-onboarding="league-rosters"
      aria-labelledby="league-reveal-heading"
      className={`border bg-panel p-4 sm:p-5 ${remaining ? 'border-edge' : 'border-parchment/60'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <p className="eyebrow">You organize this event</p>
          <h2 id="league-reveal-heading" className="text-xl font-bold uppercase">
            {remaining ? `${remaining} step${remaining === 1 ? '' : 's'} before the reveal` : 'Ready to reveal'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-dim">Lists stay hidden, even from you. Revealing can’t be undone.</p>
        </div>
        <Button
          data-onboarding="league-reveal"
          size="lg"
          variant={remaining ? 'outline' : 'default'}
          className="max-sm:w-full pointer-coarse:h-11"
          disabled={remaining > 0}
          onClick={() => {
            reveal.reset()
            setRevealing(true)
          }}
        >
          Reveal all rosters
        </Button>
      </div>
      <ul aria-label="Reveal checklist" className="mt-4 grid gap-x-6 gap-y-3 border-t border-edge pt-4 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.step} data-check={check.step} className="flex min-w-0 gap-2.5">
            {check.done ? (
              <Check className="mt-0.5 size-4 shrink-0 text-achieved" strokeWidth={3} aria-label="Done" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-faint" aria-label="Not yet" />
            )}
            <div className="min-w-0">
              <p className={`text-sm font-semibold uppercase ${check.done ? 'text-dim' : 'text-bone'}`}>{CHECK_TITLES[check.step]}</p>
              <p className="text-xs break-words text-dim">{checkDetail(check, accepted, nameOf)}</p>
            </div>
          </li>
        ))}
      </ul>
      <AlertDialog
        open={revealing}
        onOpenChange={(open) => {
          if (reveal.isPending) return
          if (!open) reveal.reset()
          setRevealing(open)
        }}
      >
        <AlertDialogContent aria-busy={reveal.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reveal every roster?</AlertDialogTitle>
            <AlertDialogDescription>
              {accepted === 1 ? 'The sealed list becomes' : `All ${accepted} sealed lists become`} readable to everyone who can open this
              league, entrants can start battles, and the event closes to new players.{' '}
              {pending ? `${pending} request${pending === 1 ? '' : 's'} still waiting will be turned down. ` : ''}
              You cannot undo this.
            </AlertDialogDescription>
            {reveal.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(reveal.error)}
              </p>
            ) : null}
            {reveal.isPending ? <output className="sr-only">Revealing rosters…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reveal.isPending}>Keep rosters sealed</AlertDialogCancel>
            <AlertDialogAction disabled={reveal.isPending} onClick={() => reveal.mutate()}>
              {reveal.isPending ? 'Revealing…' : 'Reveal all rosters'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/** The organizer's way on once an event is revealed: the next one, set up in the same form as the first. */
export function NextEventPanel({ league }: { league: League }) {
  const [open, setOpen] = useState(false)
  const next = league.eventCount + 1
  return (
    <section className="border border-edge bg-panel p-4">
      <h2 className="rubric">Next event</h2>
      <p className="mt-1 text-xs text-dim">Starts empty. Everyone joins and seals again. This event stays readable.</p>
      <Button className="mt-3 w-full pointer-coarse:h-11" onClick={() => setOpen(true)}>
        Set up event {next}
      </Button>
      <LeagueSettingsDialog mode={{ kind: 'next', token: league.token }} open={open} onOpenChange={setOpen} />
    </section>
  )
}

export function InvitePanel({ league }: { league: League }) {
  const origin = useOrigin()
  const invite = useInviteShare(league)
  return (
    <section className="border border-edge bg-panel p-4">
      <h2 className="rubric">Invite players</h2>
      <p className="mt-1 text-xs text-dim">
        {league.visibility === 'private' ? 'Unlisted, so this link is the way in.' : 'Also listed on the leagues page.'}
      </p>
      <button
        type="button"
        aria-label={invite.feedback === 'copied' ? 'Invite link copied' : invite.feedback === 'shared' ? 'Invite shared' : 'Share invite'}
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
          {invite.feedback === 'copied' ? 'Link copied' : invite.feedback === 'shared' ? 'Invite shared' : 'Share invite'}
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
        <DialogContent showCloseButton={!add.isPending} aria-busy={add.isPending} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add friends</DialogTitle>
            <DialogDescription>
              They are entered straight away, without asking to join.
              {places === null ? '' : ` ${places === 1 ? '1 place' : `${places} places`} left.`}
            </DialogDescription>
          </DialogHeader>
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
