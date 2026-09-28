import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Circle, Clipboard, EllipsisVertical, LockKeyholeOpen, Pencil, Share2, UserMinus, UserPlus, X } from 'lucide-react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  alliedLeagueRosterLimit,
  leagueMinimumPlaces,
  leaguePlacesSeat,
  leagueRevealChecklist,
  leagueRosterSplit,
  leagueTableShape,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_MEMBER_MAX,
  type LeagueEntryView,
  type LeagueRevealCheck,
} from '../../../core/league'
import { TABLE_SHAPE_LABELS } from '../../../core/tableShape'
import {
  admitLeagueEntries,
  assignLeagueRosterRequirement,
  assignLeagueTeam,
  createLeagueEvent,
  makeLeagueRecurring,
  moderateLeagueEntry,
  openLeague,
  revealLeague,
  unsealLeagueRoster,
  updateLeague,
  updateLeagueEvent,
} from '../../../server/functions'
import { useDateFormatting } from '../../dates'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { errorMessage } from '../../queryClient'
import { useOrigin } from '../../useOrigin'
import { inviteFeedbackText, useInviteShare, type LeagueActionsController } from './LeagueActions'
import { EntrantGroup, EntrantList, EntrantRow, SectionHeading, sealStatus, sideGroups, ViewRosterButton } from './LeagueEntrants'
import { LeagueEventRuleFields, ROSTER_RULE, type LeagueEventRuleValue } from './LeagueEventRuleFields'
import { doublesTeams, formatNames, namesPhrase, soloOrAllied, useLeagueRefresh, type League } from './leagueEvent'

export function LeagueConsole({
  league,
  token,
  actions,
  onPlayerView,
}: {
  league: League
  token: string
  actions: LeagueActionsController
  onPlayerView: () => void
}) {
  const refresh = useLeagueRefresh(token)
  const eventToken = league.eventToken
  const [removing, setRemoving] = useState<LeagueEntryView | null>(null)
  const [reassigning, setReassigning] = useState<{ entry: LeagueEntryView; requiredLimit: number } | null>(null)
  const [unsealing, setUnsealing] = useState<LeagueEntryView | null>(null)
  const [revealing, setRevealing] = useState(false)
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
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token, eventToken } }),
    onSuccess: async () => {
      setRevealing(false)
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
  const latest = league.events[0]?.token === eventToken
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
        <ViewRosterButton token={token} eventToken={eventToken} userId={entry.userId} label={label(entry)} />
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
              {members.map((entry) => (
                <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={sealStatus(entry, revealed)}>
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
                </EntrantRow>
              ))}
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
                return (
                  <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={sealStatus(entry, revealed)}>
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
                  </EntrantRow>
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
            {team.members.map((entry) => (
              <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={sealStatus(entry, revealed)}>
                {removeButton(entry)}
                {revealedControls(entry)}
                {moderateError(entry)}
              </EntrantRow>
            ))}
          </EntrantList>
        </EntrantGroup>
      ))}
    </div>
  ) : (
    <EntrantList>
      {accepted.map((entry) => (
        <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={sealStatus(entry, revealed)}>
          {removeButton(entry)}
          {revealedControls(entry)}
          {moderateError(entry)}
        </EntrantRow>
      ))}
    </EntrantList>
  )

  return (
    <div className="space-y-6">
      {revealed ? (
        <RevealedPanel league={league} onPlayerView={onPlayerView} />
      ) : (
        <RevealPanel
          league={league}
          checks={leagueRevealChecklist(league, league.entries)}
          nameOf={nameOf}
          onReveal={() => {
            reveal.reset()
            setRevealing(true)
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
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
                {pending.map((entry) => (
                  <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail="Asked to join">
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
                  </EntrantRow>
                ))}
              </EntrantList>
              {acceptAll.error ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {errorMessage(acceptAll.error)}
                </p>
              ) : null}
            </section>
          ) : null}

          <section data-onboarding="league-entrants">
            <SectionHeading title="Entrants" count={accepted.length} />
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
                  {rejected.map((entry) => (
                    <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail="Turned away">
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
                    </EntrantRow>
                  ))}
                </EntrantList>
              </div>
            </details>
          ) : null}
        </div>

        <aside className="space-y-3">
          {!revealed && latest ? <InvitePanel league={league} /> : null}
          {latest ? <EventRulePanel league={league} token={token} /> : null}
          <SettingsPanel league={league} onEdit={actions.openEdit} />
        </aside>
      </div>

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
              {accepted.length === 1 ? 'The sealed list becomes' : `All ${accepted.length} sealed lists become`} readable to everyone who
              can open this league, entrants can start battles, and the event closes to new players.{' '}
              {pending.length ? `${pending.length} request${pending.length === 1 ? '' : 's'} still waiting will be turned down. ` : ''}
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
    </div>
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

function RevealPanel({
  league,
  checks,
  nameOf,
  onReveal,
}: {
  league: League
  checks: LeagueRevealCheck[]
  nameOf: (userId: string) => string
  onReveal: () => void
}) {
  const remaining = checks.filter((check) => !check.done).length
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  return (
    <section
      data-onboarding="league-rosters"
      aria-labelledby="league-reveal-heading"
      className={`border bg-panel p-4 sm:p-5 ${remaining ? 'border-edge' : 'border-parchment/60'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
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
          onClick={onReveal}
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
    </section>
  )
}

function RevealedPanel({ league, onPlayerView }: { league: League; onPlayerView: () => void }) {
  const dates = useDateFormatting()
  const sealed = league.entries.filter((entry) => entry.status === 'accepted' && entry.submitted).length
  return (
    <section className="border border-achieved/40 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-xl font-bold text-achieved uppercase">Rosters revealed</h2>
          <p className="mt-1 max-w-2xl text-sm text-dim">
            {league.revealedAt ? `${dates.date(league.revealedAt)} · ` : ''}
            {sealed === 1 ? '1 list' : `${sealed} lists`} open. Players start battles from the Event tab.
          </p>
        </div>
        <Button size="lg" variant="outline" className="max-sm:w-full pointer-coarse:h-11" onClick={onPlayerView}>
          Open the Event tab
        </Button>
      </div>
    </section>
  )
}

function Panel({ title, onboarding, children }: { title: string; onboarding?: 'league-format'; children: ReactNode }) {
  return (
    <section data-onboarding={onboarding} className="border border-edge bg-panel p-4">
      <h2 className="rubric">{title}</h2>
      {children}
    </section>
  )
}

function InvitePanel({ league }: { league: League }) {
  const origin = useOrigin()
  const invite = useInviteShare(league)
  return (
    <Panel title="Invite players">
      <p className="mt-1 text-xs text-dim">
        {league.visibility === 'private' ? 'Unlisted, so this link is the way in.' : 'Also listed on the leagues page.'}
      </p>
      <p className="mt-3 h-5 truncate text-sm text-bone" title={origin ? `${origin}/leagues/${league.token}` : undefined}>
        {origin ? `${origin.replace(/^https?:\/\//, '')}/leagues/${league.token}` : null}
      </p>
      <Button className="mt-2 w-full pointer-coarse:h-11" variant="outline" disabled={!origin} onClick={() => void invite.share()}>
        {invite.feedback === 'shared' ? <Share2 /> : invite.feedback === 'copied' ? <Check /> : <Clipboard />}
        {invite.feedback === 'shared' ? 'Invite shared' : invite.feedback === 'copied' ? 'Invite link copied' : 'Share invite'}
      </Button>
      <p aria-live="polite" className={`mt-2 text-xs ${invite.feedback === 'error' ? 'text-destructive' : 'sr-only'}`}>
        {invite.feedback ? inviteFeedbackText(invite.feedback) : ''}
      </p>
    </Panel>
  )
}

function SettingsPanel({ league, onEdit }: { league: League; onEdit: () => void }) {
  return (
    <Panel title="League settings">
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-dim">Visibility</dt>
        <dd>{league.visibility === 'private' ? 'Private link' : 'Public'}</dd>
        <dt className="text-dim">Joining</dt>
        <dd>{league.admission === 'approval' ? 'You approve each player' : 'Automatic'}</dd>
        <dt className="text-dim">Places</dt>
        <dd>{league.playerLimit === null ? 'No limit' : league.playerLimit}</dd>
      </dl>
      <Button className="mt-3 w-full pointer-coarse:h-11" variant="outline" size="sm" onClick={onEdit}>
        <Pencil /> Edit league
      </Button>
    </Panel>
  )
}

/**
 * The current event's format while nobody has sealed against it, and the next event's once
 * this one is revealed. Either way the league's place count is raised here when the chosen
 * shape needs more seats than it allows, rather than sending the organizer off to settings.
 */
function EventRulePanel({ league, token }: { league: League; token: string }) {
  const refresh = useLeagueRefresh(token)
  const navigate = useNavigate()
  const revealed = Boolean(league.revealedAt)
  const format = leagueTableShape(league.format)
  const sealed = league.entries.some((entry) => entry.submitted)
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<LeagueEventRuleValue>({ format, rosterLimit: league.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT })
  const [places, setPlaces] = useState<number | null>(league.playerLimit)
  // A next event starts with nobody in it, so only the open event's entrants hold places.
  const seated = revealed ? 0 : accepted
  const needed = leagueMinimumPlaces(value.format, seated)
  const short = !leaguePlacesSeat(value.format, league.playerLimit, seated)
  const save = useMutation({
    mutationFn: async () => {
      // Saving the league overwrites every setting, so a raised limit goes onto the league as it is now rather than this page's copy.
      const current = short ? await openLeague({ data: { token, eventToken: league.eventToken } }) : null
      if (short && !current) throw new Error('This league no longer exists.')
      const details = current && {
        token,
        name: current.name,
        description: current.description,
        visibility: current.visibility,
        admission: current.admission,
      }
      if (details) await updateLeague({ data: { ...details, playerLimit: places } })
      try {
        if (!revealed) {
          await updateLeagueEvent({ data: { token, eventToken: league.eventToken, ...value } })
          return null
        }
        await makeLeagueRecurring({ data: { token } })
        return (await createLeagueEvent({ data: { token, ...value } })).eventToken
      } catch (error) {
        // Put the limit back so a refused format leaves the league as it was; a failed restore still surfaces the refusal, which is the error to act on.
        if (details && current) await updateLeague({ data: { ...details, playerLimit: current.playerLimit } }).catch(() => undefined)
        throw error
      }
    },
    onSuccess: async (created) => {
      setEditing(false)
      await refresh()
      if (created) await navigate({ to: '/leagues/$token', params: { token }, search: { event: created } })
    },
    onError: refresh,
  })
  const open = () => {
    save.reset()
    // Changing the open event starts from what it plays now; a fresh event starts from the default,
    // because the league's places may no longer seat the last event's shape.
    setValue(
      revealed
        ? { format: '1v1', rosterLimit: LEAGUE_DEFAULT_ROSTER_LIMIT }
        : { format, rosterLimit: league.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT },
    )
    setPlaces(league.playerLimit)
    setEditing(true)
  }
  // A shape the league's limit cannot seat starts its limit at the fewest places that do.
  const chooseRule = (rule: LeagueEventRuleValue) => {
    setValue(rule)
    setPlaces((current) =>
      leaguePlacesSeat(rule.format, current, seated) ? current : leagueMinimumPlaces(rule.format, Math.max(current ?? 0, seated)),
    )
  }
  const next = league.eventCount + 1
  const placesValid = !short || leaguePlacesSeat(value.format, places, seated)

  if (revealed)
    return (
      <Panel title="Next event">
        <p className="mt-1 text-sm text-dim">Starts empty. Everyone joins and seals again, including you.</p>
        {editing ? (
          <RuleForm
            value={value}
            places={short ? { value: places, needed, even: value.format === '2v2', onChange: setPlaces } : null}
            pending={save.isPending}
            error={save.error}
            submit={save.isPending ? 'Opening…' : `Open event ${next}`}
            disabled={!placesValid}
            onChange={chooseRule}
            onCancel={() => setEditing(false)}
            onSubmit={() => save.mutate()}
          />
        ) : (
          <Button className="mt-3 w-full pointer-coarse:h-11" onClick={open}>
            Set up event {next}
          </Button>
        )}
      </Panel>
    )

  return (
    <Panel title="Format and points" onboarding="league-format">
      <p className="mt-2 font-semibold">
        {TABLE_SHAPE_LABELS[format].name}
        {league.rosterLimit ? ` · ${leagueRosterSplit(format, league.rosterLimit) ?? `${league.rosterLimit.toLocaleString()} points`}` : ''}
      </p>
      <p className="text-xs text-dim">{ROSTER_RULE[format]}</p>
      {editing ? (
        <RuleForm
          value={value}
          places={short ? { value: places, needed, even: value.format === '2v2', onChange: setPlaces } : null}
          warning={accepted ? 'Clears every size and team you’ve handed out.' : undefined}
          pending={save.isPending}
          error={save.error}
          submit={save.isPending ? 'Saving…' : 'Save format'}
          disabled={!placesValid}
          onChange={chooseRule}
          onCancel={() => setEditing(false)}
          onSubmit={() => save.mutate()}
        />
      ) : (
        <>
          <Button className="mt-3 w-full pointer-coarse:h-11" variant="outline" size="sm" disabled={sealed} onClick={open}>
            <Pencil /> Change format and points
          </Button>
          <p className="mt-2 text-xs text-dim">{sealed ? 'Locked now that a list is sealed.' : 'Locks once the first list is sealed.'}</p>
        </>
      )}
    </Panel>
  )
}

function RuleForm({
  value,
  places,
  warning,
  pending,
  error,
  submit,
  disabled,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: LeagueEventRuleValue
  places: { value: number | null; needed: number; even: boolean; onChange: (places: number | null) => void } | null
  warning?: string
  pending: boolean
  error: Error | null
  submit: string
  disabled: boolean
  onChange: (value: LeagueEventRuleValue) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <form
      className="mt-3 space-y-4 border-t border-edge pt-3"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <LeagueEventRuleFields value={value} disabled={pending} stacked onChange={onChange} />
      {places ? (
        <div className="space-y-1.5">
          <Label htmlFor="league-event-places">Player limit</Label>
          <Input
            id="league-event-places"
            type="number"
            min={places.needed}
            step={places.even ? 2 : 1}
            max={LEAGUE_MEMBER_MAX}
            value={places.value ?? ''}
            disabled={pending}
            onChange={(event) => places.onChange(event.target.value ? Number(event.target.value) : null)}
          />
          <p className="text-xs text-parchment">
            Needs at least {places.needed}
            {places.even ? ', in pairs' : ''}. Saving raises the league’s limit.
          </p>
        </div>
      ) : null}
      {warning ? <p className="text-xs text-parchment">{warning}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 pointer-coarse:h-11" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 pointer-coarse:h-11" disabled={pending || disabled}>
          {submit}
        </Button>
      </div>
    </form>
  )
}
