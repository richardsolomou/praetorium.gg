import { useMutation } from '@tanstack/react-query'
import { Circle } from 'lucide-react'
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
import { leagueRevealChecklist, mayRevealLeague, type LeagueEntryView, type LeagueRevealCheck } from '../../../core/league'
import { revealLeague } from '../../functions'
import { errorMessage } from '../../queryClient'
import { namesPhrase, useLeagueRefresh, type League } from './leagueEvent'

/** What the organizer still has to do before every roster can open, said to everyone so nobody wonders what the wait is. */
const ORGANIZER_STEPS: Partial<Record<LeagueRevealCheck['step'], string>> = {
  places: 'let a player in',
  requests: 'answer the waiting requests',
  sizes: 'give everyone a solo or allied size',
  teams: 'pair everyone into teams of two',
}

/**
 * The group's countdown to the reveal: how many rosters are sealed and who is still owed.
 *
 * Everyone sees the same panel; the entrant list below says each player's status, so this one counts.
 * Once every check passes, the next-action card offers the reveal to the organizer and anyone playing.
 */
export function LeagueReadiness({
  league,
  viewerId,
  isOrganizer,
  label,
}: {
  league: League
  viewerId: string | null
  isOrganizer: boolean
  label: (entry: LeagueEntryView) => string
}) {
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const sealed = accepted.filter((entry) => entry.submitted)
  const waiting = accepted.filter((entry) => !entry.submitted)
  const checks = leagueRevealChecklist(league, league.entries)
  const ready = checks.every((check) => check.done)
  const organizerSteps = checks.flatMap((check) => {
    const step = check.step === 'teams' && league.format === '2v1' ? 'pair the allies' : ORGANIZER_STEPS[check.step]
    return !check.done && step ? [step] : []
  })
  const owing = checks.find((check) => check.step === 'dispositions')?.waiting ?? []
  const nameOf = (userId: string) => {
    const entry = league.entries.find((candidate) => candidate.userId === userId)
    return entry ? label(entry) : 'someone'
  }
  const ownEntry = viewerId ? league.entries.find((entry) => entry.userId === viewerId) : undefined
  const mayReveal = mayRevealLeague(isOrganizer, ownEntry ?? null)

  const openPlaces = league.playerLimit === null ? 0 : league.playerLimit - accepted.length
  const title = ready
    ? openPlaces > 0
      ? 'Everyone in has sealed'
      : 'Everyone has sealed'
    : accepted.length
      ? `${sealed.length} of ${accepted.length} rosters sealed`
      : 'Nobody is in yet'
  const revealNow = mayReveal ? 'You can open the rosters now' : 'Anyone playing can open the rosters now'
  const readyLine = openPlaces > 0 ? `${openPlaces} of ${league.playerLimit} places are still open. ${revealNow}.` : `${revealNow}.`
  const detail = [
    waiting.length ? `Waiting on ${namesPhrase(waiting.map(label))}.` : null,
    owing.length
      ? `${namesPhrase(owing.map(nameOf))} still ${owing.length === 1 ? 'needs' : 'need'} to choose their team’s Force Disposition.`
      : null,
    !isOrganizer && organizerSteps.length
      ? `${league.admins.length ? 'The organizers still need' : `${league.ownerName} still needs`} to ${namesPhrase(organizerSteps)}.`
      : null,
    ready ? readyLine : null,
  ]
    .filter(Boolean)
    .join(' ')
  // The organizer sees only what still stands in the way, in words; the bar and the entrant list already say who has sealed.
  const organizerChecks = isOrganizer
    ? checks.filter(
        (check): check is Exclude<LeagueRevealCheck, { step: 'lists' | 'dispositions' }> =>
          check.step !== 'lists' && check.step !== 'dispositions' && !check.done,
      )
    : []

  return (
    <section
      data-onboarding="league-rosters"
      data-league-readiness
      aria-labelledby="league-readiness-heading"
      className={`space-y-4 border bg-panel p-4 sm:p-5 ${ready ? 'border-achieved/50' : 'border-edge'}`}
    >
      <div>
        <p className="eyebrow text-dim">Before the reveal</p>
        <h2 id="league-readiness-heading" className="mt-1 text-xl leading-tight font-bold uppercase">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-dim">{detail || 'Rosters stay hidden, even from the organizer.'}</p>
      </div>
      {accepted.length ? (
        <div aria-hidden className="flex gap-1">
          {accepted.map((entry) => (
            <span key={entry.userId} className={`h-1.5 flex-1 rounded-full ${entry.submitted ? 'bg-achieved' : 'bg-edge-strong'}`} />
          ))}
        </div>
      ) : null}
      {organizerChecks.length ? (
        <ul aria-label="Before you can reveal" className="space-y-1.5">
          {organizerChecks.map((check) => (
            <li key={check.step} data-check={check.step} className="flex min-w-0 items-start gap-2 text-sm text-discarded">
              <Circle className="mt-1 size-3 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{checkDetail(check, league.format, accepted.length, nameOf)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** The one confirmation before an event's rosters open, which cannot be undone. */
export function RevealRostersDialog({
  league,
  token,
  open,
  onOpenChange,
}: {
  league: League
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const refresh = useLeagueRefresh(token)
  const reveal = useMutation({
    mutationFn: () => revealLeague({ data: { token, eventToken: league.eventToken } }),
    onSuccess: async () => {
      onOpenChange(false)
      await refresh()
    },
  })
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const pending = league.entries.filter((entry) => entry.status === 'pending').length
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (reveal.isPending) return
        if (!next) reveal.reset()
        onOpenChange(next)
      }}
    >
      <AlertDialogContent aria-busy={reveal.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Reveal every roster?</AlertDialogTitle>
          <AlertDialogDescription>
            {accepted.length === 1 ? 'The sealed roster opens' : `All ${accepted.length} sealed rosters open`} for everyone who can open
            this league, and nobody else can join this event.{' '}
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
          <AlertDialogCancel disabled={reveal.isPending}>Keep them sealed</AlertDialogCancel>
          <AlertDialogAction disabled={reveal.isPending} onClick={() => reveal.mutate()}>
            {reveal.isPending ? 'Revealing…' : 'Reveal all rosters'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** What the organizer still has to do for one unmet check. */
function checkDetail(
  check: Exclude<LeagueRevealCheck, { step: 'lists' | 'dispositions' }>,
  format: League['format'],
  accepted: number,
  nameOf: (userId: string) => string,
) {
  const names = (userIds: string[]) => namesPhrase(userIds.map(nameOf))
  switch (check.step) {
    case 'places':
      return 'Accept at least one player.'
    case 'requests':
      return `Answer ${names(check.waiting)}.`
    case 'sizes':
      if (check.waiting.length) return `Give ${names(check.waiting)} a size.`
      return check.solo === 0 ? 'Make one player solo.' : 'Make two players allied.'
    case 'teams':
      if (format === '2v1') return `Pair ${names(check.waiting)} with another ally.`
      if (accepted < 4) return 'Doubles needs four players.'
      if (accepted % 2) return 'Doubles needs an even number of players.'
      return `Pair ${names(check.waiting)}.`
  }
}
