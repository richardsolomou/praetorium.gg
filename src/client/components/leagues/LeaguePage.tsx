import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Clipboard, Eye, FileLock2, LockKeyhole, ShieldCheck, Swords, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PlayerAvatar } from '../PlayerAvatar'
import { errorMessage } from '../../queryClient'
import { battlesQuery, gameReferencesQuery, leagueQuery, leaguesQuery, meQuery, savedRostersQuery } from '../../queries'
import { createLeagueBattle, joinLeague, moderateLeagueEntry, revealLeague, submitLeagueRoster } from '../../../server/functions'
import { LEAGUE_MEMBER_MAX } from '../../../core/league'

export function LeaguePage({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: league } = useQuery(leagueQuery(token))
  const { data: rosters = [] } = useQuery(savedRostersQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const [choosing, setChoosing] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leagueQuery(token).queryKey }),
      queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
    ])
  }
  const join = useMutation({ mutationFn: () => joinLeague({ data: { token } }), onSuccess: refresh })
  const moderate = useMutation({
    mutationFn: (input: { userId: string; status: 'accepted' | 'rejected' }) => moderateLeagueEntry({ data: { token, ...input } }),
    onSuccess: async () => {
      setRemoving(null)
      await refresh()
    },
  })
  const submit = useMutation({
    mutationFn: (rosterId: string) => submitLeagueRoster({ data: { token, rosterId } }),
    onSuccess: async () => {
      setChoosing(false)
      await refresh()
    },
  })
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token } }),
    onSuccess: async () => {
      setRevealing(false)
      await refresh()
    },
  })
  const battle = useMutation({
    mutationFn: (opponentId: string) =>
      createLeagueBattle({ data: { token, opponentId, missionPackId: references?.packs[0]?.id ?? null } }),
    onSuccess: async ({ token: battleToken }) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token: battleToken } })
    },
  })
  if (!league) return null
  const isOwner = me?.id === league.ownerId
  const ownEntry = league.entries.find((entry) => entry.userId === me?.id)
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const pendingCount = league.entries.filter((entry) => entry.status === 'pending').length
  const registrationFull =
    league.admission === 'approval' && league.playerLimit !== null
      ? accepted.length >= league.playerLimit || league.occupiedCount >= LEAGUE_MEMBER_MAX
      : league.occupiedCount >= (league.playerLimit ?? LEAGUE_MEMBER_MAX)
  const readyToReveal =
    accepted.length > 0 &&
    accepted.every((entry) => entry.submitted) &&
    (league.playerLimit === null || accepted.length === league.playerLimit)
  const problem = join.error ?? moderate.error ?? battle.error

  return (
    <main className="w-full">
      <section className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-parchment">
                {league.revealedAt ? 'Rosters revealed' : registrationFull ? 'Registration full' : 'Registration open'}
              </p>
              <h1 className="mt-1 text-3xl">{league.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-dim">
                <span className="chip inline-flex items-center gap-1">
                  {league.visibility === 'private' ? <LockKeyhole className="size-3" /> : <Eye className="size-3" />}
                  {league.visibility === 'private' ? 'Private link' : 'Public'}
                </span>
                <span className="chip">{league.admission === 'approval' ? 'Approval required' : 'Automatic entry'}</span>
                <span className="chip">
                  {accepted.length}
                  {league.playerLimit ? ` / ${league.playerLimit}` : ''} accepted
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwner ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))
                  }}
                >
                  {copied ? <Check /> : <Clipboard />} {copied ? 'Copied' : 'Copy invite link'}
                </Button>
              ) : null}
              {!league.revealedAt && me && (!ownEntry || ownEntry.status === 'rejected') && !registrationFull ? (
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  <UserPlus /> {ownEntry ? 'Request to join again' : 'Join league'}
                </Button>
              ) : null}
              {!league.revealedAt && me && (!ownEntry || ownEntry.status === 'rejected') && registrationFull ? (
                <span className="chip self-center">League full</span>
              ) : null}
              {!league.revealedAt && !me ? (
                <Button render={<Link to="/sign-in" search={{ next: `/leagues/${token}` }} />}>Sign in to join</Button>
              ) : null}
            </div>
          </div>
          {league.description ? (
            <p className="mt-5 max-w-3xl whitespace-pre-wrap font-rules text-sm text-dim">{league.description}</p>
          ) : null}
          <div className="mt-5 flex items-center gap-2 text-sm text-dim">
            <PlayerAvatar name={league.ownerName} image={league.ownerImage} className="size-7 text-xs" />
            Organized by <span className="text-bone">{league.ownerName}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-5 px-3 py-5 sm:px-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <div className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
            <h2>Entrants</h2>
            <span className="readout">{accepted.length}</span>
          </div>
          {league.entries.length ? (
            <div className="divide-y divide-edge border border-edge bg-panel">
              {league.entries.map((entry) => (
                <div key={entry.userId} data-person={entry.name} className="flex flex-wrap items-center gap-3 p-3">
                  <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold uppercase">{entry.name}</p>
                    <p className="text-xs text-dim">{entryStatus(entry.status, entry.submitted, Boolean(league.revealedAt))}</p>
                  </div>
                  {isOwner && !league.revealedAt ? (
                    <div className="flex gap-1">
                      {entry.status !== 'accepted' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Accept ${entry.name}`}
                          disabled={moderate.isPending}
                          onClick={() => moderate.mutate({ userId: entry.userId, status: 'accepted' })}
                        >
                          <Check /> Accept
                        </Button>
                      ) : null}
                      {entry.status !== 'rejected' ? (
                        <Button
                          size="sm"
                          variant={entry.status === 'accepted' ? 'outline' : 'ghost'}
                          aria-label={`${entry.status === 'accepted' ? 'Remove' : 'Reject'} ${entry.name}`}
                          disabled={moderate.isPending}
                          onClick={() => {
                            if (entry.status === 'accepted') {
                              moderate.reset()
                              setRemoving({ userId: entry.userId, name: entry.name })
                            } else {
                              moderate.mutate({ userId: entry.userId, status: 'rejected' })
                            }
                          }}
                        >
                          <X /> {entry.status === 'accepted' ? 'Remove' : null}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {league.revealedAt && entry.status === 'accepted' && entry.submitted ? (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            to="/rosters/$id"
                            params={{ id: entry.userId }}
                            search={{ league: token }}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        <Eye /> View roster
                      </Button>
                      {ownEntry?.status === 'accepted' && entry.userId !== me?.id ? (
                        <Button size="sm" disabled={battle.isPending} onClick={() => battle.mutate(entry.userId)}>
                          <Swords /> Start battle
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-edge bg-panel px-5 py-9 text-center">
              <UserPlus className="mx-auto size-7 text-faint" />
              <p className="mt-3 font-bold uppercase">No entrants yet</p>
              <p className="mt-1 text-sm text-dim">Share this page to open registration.</p>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <section className="border border-edge bg-panel p-4">
            <div className="flex items-center gap-2">
              <FileLock2 className="size-5 text-parchment" />
              <h2 className="font-bold uppercase">Sealed rosters</h2>
            </div>
            <p className="mt-2 text-sm text-dim">
              A submitted roster is copied into this league. Editing or deleting the saved roster cannot change the sealed copy.
            </p>
            {ownEntry?.status === 'pending' ? (
              <p className="mt-3 text-sm text-parchment">Your request is waiting for organizer approval.</p>
            ) : null}
            {ownEntry?.status === 'rejected' ? <p className="mt-3 text-sm text-destructive">Your entry was not accepted.</p> : null}
            {ownEntry?.status === 'accepted' && !league.revealedAt ? (
              <Button className="mt-4 w-full" variant={ownEntry.submitted ? 'outline' : 'default'} onClick={() => setChoosing(true)}>
                {ownEntry.submitted ? 'Change roster' : 'Choose roster'}
              </Button>
            ) : null}
            {ownEntry?.submitted && !league.revealedAt ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-achieved">
                <ShieldCheck className="size-4" /> {ownEntry.rosterName ?? 'Roster'} submitted. You can replace it until reveal.
              </p>
            ) : null}
            {league.revealedAt ? (
              <p className="mt-3 text-sm text-achieved">Every accepted roster is now visible to anyone with this link.</p>
            ) : null}
          </section>
          {isOwner && !league.revealedAt ? (
            <section className="border border-edge bg-panel p-4">
              <h2 className="font-bold uppercase">Organizer</h2>
              <p className="mt-2 text-sm text-dim">
                Reveal closes registration and makes every accepted roster visible at once. It cannot be undone.
              </p>
              <Button className="mt-4 w-full" disabled={!readyToReveal} onClick={() => setRevealing(true)}>
                Reveal all rosters
              </Button>
              {!readyToReveal ? (
                <p className="mt-2 text-xs text-dim">
                  {accepted.length === 0
                    ? 'Accept at least one entrant first.'
                    : accepted.some((entry) => !entry.submitted)
                      ? missingRosterMessage(accepted.filter((entry) => !entry.submitted).length)
                      : league.playerLimit !== null && accepted.length < league.playerLimit
                        ? `${league.playerLimit - accepted.length} accepted place${league.playerLimit - accepted.length === 1 ? '' : 's'} still open.`
                        : 'The league is not ready to reveal.'}
                </p>
              ) : null}
            </section>
          ) : null}
          {problem ? <p className="text-sm text-destructive">{errorMessage(problem)}</p> : null}
        </aside>
      </div>

      <RosterChooser
        open={choosing}
        rosters={rosters}
        pending={submit.isPending}
        error={submit.error}
        onClose={() => setChoosing(false)}
        onChoose={(id) => submit.mutate(id)}
      />
      <AlertDialog open={revealing} onOpenChange={setRevealing}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Reveal every roster?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Registration closes immediately.{' '}
              {pendingCount ? `${pendingCount} pending request${pendingCount === 1 ? '' : 's'} will be rejected. ` : ''}
              Every accepted entrant’s sealed roster becomes visible, and this cannot be undone.
            </AlertDialogDescription>
            {reveal.error ? <p className="text-sm text-destructive">{errorMessage(reveal.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rosters sealed</AlertDialogCancel>
            <AlertDialogAction onClick={() => reveal.mutate()}>Reveal all rosters</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              Their submitted roster will be discarded. They must join again and submit another roster to return.
            </AlertDialogDescription>
            {moderate.error ? <p className="text-sm text-destructive">{errorMessage(moderate.error)}</p> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep entrant</AlertDialogCancel>
            <AlertDialogAction
              disabled={moderate.isPending}
              onClick={() => removing && moderate.mutate({ userId: removing.userId, status: 'rejected' })}
            >
              Remove entrant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function RosterChooser({
  open,
  rosters,
  pending,
  error,
  onClose,
  onChoose,
}: {
  open: boolean
  rosters: Awaited<ReturnType<NonNullable<ReturnType<typeof savedRostersQuery>['queryFn']>>>
  pending: boolean
  error: Error | null
  onClose: () => void
  onChoose: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Seal a roster</DialogTitle>
          <DialogDescription className="text-dim">
            This copies the roster into the league. You can submit another copy until the organizer reveals every list.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{errorMessage(error)}</p> : null}
        {rosters.length ? (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 border border-edge bg-sunken p-3 text-left hover:border-info hover:bg-raised"
                disabled={pending}
                onClick={() => onChoose(roster.id)}
              >
                <span>
                  <span className="block font-bold uppercase">{roster.name}</span>
                  <span className="mt-1 block text-xs text-dim">{roster.limit} points</span>
                </span>
                <FileLock2 className="size-4 shrink-0 text-parchment" />
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-edge p-5 text-center">
            <p className="text-sm text-dim">Build or import a roster before submitting.</p>
            <Button className="mt-3" render={<Link to="/rosters" />}>
              Go to rosters
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function entryStatus(status: 'pending' | 'accepted' | 'rejected', submitted: boolean, revealed: boolean) {
  if (status === 'pending') return 'Waiting for approval'
  if (status === 'rejected') return 'Not accepted'
  if (revealed) return submitted ? 'Roster revealed' : 'No roster submitted'
  return submitted ? 'Roster sealed' : 'Accepted · roster pending'
}

function missingRosterMessage(count: number) {
  return `${count} accepted roster${count === 1 ? '' : 's'} still missing.`
}
