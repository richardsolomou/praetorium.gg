import { useMutation } from '@tanstack/react-query'
import { useNow } from '../../useNow'
import { BellRing, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SEALED_EVENT_REMINDER_COOLDOWN_MS,
  sealedEventReminderRecipients,
  sealedEventRevealChecklist,
  sealedEventSealingClosed,
  mayRemindSealedEvent,
  mayRevealSealedEvent,
  type SealedEventEntryView,
  type SealedEventRevealCheck,
} from '../../../core/sealedEvent'
import { remindSealedEventEntrants, revealSealedEvent } from '../../functions'
import { entryRules, namesPhrase, useSealedEventRefresh, type SealedEvent } from './sealedEvent'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'
import { entrantLabels } from '../../playerLabels'
import { useMoment } from '../../dates'

/** What the organizer still has to do before every roster can open, said to everyone so nobody wonders what the wait is. */
const ORGANIZER_STEPS: Partial<Record<SealedEventRevealCheck['step'], string>> = {
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
export function SealedEventReadiness({
  token,
  sealedEvent,
  viewerId,
  isOrganizer,
  label,
}: {
  token: string
  sealedEvent: SealedEvent
  viewerId: string | null
  isOrganizer: boolean
  label: (entry: SealedEventEntryView) => string
}) {
  const accepted = sealedEvent.entries.filter((entry) => entry.status === 'accepted')
  const sealed = accepted.filter((entry) => entry.submitted)
  const waiting = accepted.filter((entry) => !entry.submitted)
  const now = useNow(sealedEvent.sealBy)
  const checks = sealedEventRevealChecklist(sealedEvent, sealedEvent.entries, now)
  const ready = checks.every((check) => check.done)
  const organizerSteps = checks.flatMap((check) => {
    const step = check.step === 'teams' && sealedEvent.format === '2v1' ? 'pair the allies' : ORGANIZER_STEPS[check.step]
    return !check.done && step ? [step] : []
  })
  const owing = checks.find((check) => check.step === 'dispositions')?.waiting ?? []
  const leaderless = checks.find((check) => check.step === 'warlords')?.waiting ?? []
  const nameOf = (userId: string) => {
    const entry = sealedEvent.entries.find((candidate) => candidate.userId === userId)
    return entry ? label(entry) : 'someone'
  }
  const ownEntry = viewerId ? sealedEvent.entries.find((entry) => entry.userId === viewerId) : undefined
  const mayReveal = mayRevealSealedEvent(isOrganizer, ownEntry ?? null)

  const { playerLimit } = entryRules(sealedEvent)
  const openPlaces = playerLimit === null ? 0 : playerLimit - accepted.length
  const title = ready
    ? openPlaces > 0
      ? 'Everyone in has sealed'
      : 'Everyone has sealed'
    : accepted.length
      ? `${sealed.length} of ${accepted.length} rosters sealed`
      : 'Nobody is in yet'
  const revealNow = mayReveal ? 'You can open the rosters now' : 'Anyone playing can open the rosters now'
  const readyLine = openPlaces > 0 ? `${openPlaces} of ${playerLimit} places are still open. ${revealNow}.` : `${revealNow}.`
  const detail = [
    waiting.length ? `Waiting on ${namesPhrase(waiting.map(label))}.` : null,
    owing.length
      ? `${namesPhrase(owing.map(nameOf))} still ${owing.length === 1 ? 'needs' : 'need'} to choose their team’s Force Disposition.`
      : null,
    leaderless.length
      ? `${namesPhrase(leaderless.map(nameOf))} still ${leaderless.length === 1 ? 'needs' : 'need'} to choose whose Warlord leads their team.`
      : null,
    !isOrganizer && organizerSteps.length
      ? `${sealedEvent.tournament && !sealedEvent.tournament.admins.length ? `${sealedEvent.tournament.ownerName} still needs` : 'The organizers still need'} to ${namesPhrase(organizerSteps)}.`
      : null,
    ready ? readyLine : null,
  ]
    .filter(Boolean)
    .join(' ')
  // The organizer sees only what still stands in the way, in words; the bar and the entrant list already say who has sealed.
  const unmet = isOrganizer
    ? checks.filter(
        (check): check is Exclude<SealedEventRevealCheck, { step: 'lists' | 'dispositions' | 'warlords' }> =>
          check.step !== 'lists' && check.step !== 'dispositions' && check.step !== 'warlords' && !check.done,
      )
    : []
  // Once only more players can help, sizing or pairing the ones already in leads nowhere, so the list stops there.
  const short = unmet.findIndex((check) => 'short' in check && check.short)
  const organizerChecks = short < 0 ? unmet : unmet.slice(0, short + 1)

  return (
    <section
      data-onboarding="sealed-event-rosters"
      data-sealed-event-readiness
      aria-labelledby="sealed-event-readiness-heading"
      className={`space-y-4 border bg-panel p-4 sm:p-5 ${ready ? 'border-achieved/50' : 'border-edge'}`}
    >
      <div>
        <p className="eyebrow text-dim">Before the reveal</p>
        <h2 id="sealed-event-readiness-heading" className="mt-1 text-xl leading-tight font-bold uppercase">
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
              <span className="min-w-0 break-words">{checkDetail(check, sealedEvent.format, nameOf)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {isOrganizer ? <RemindEntrants token={token} sealedEvent={sealedEvent} viewerId={viewerId} /> : null}
    </section>
  )
}

/** An organizer's nudge to the players still without a sealed list, spaced out so nobody hears about one deadline over and over. */
export function RemindEntrants({ token, sealedEvent, viewerId }: { token: string; sealedEvent: SealedEvent; viewerId: string | null }) {
  const moment = useMoment()
  const refresh = useSealedEventRefresh(token)
  const nextAt = sealedEvent.remindedAt === null ? null : sealedEvent.remindedAt + SEALED_EVENT_REMINDER_COOLDOWN_MS
  const now = useNow([sealedEvent.sealBy, nextAt])
  const waiting = sealedEventReminderRecipients(sealedEvent, sealedEvent.entries, now).filter((userId) => userId !== viewerId)
  const cooling = !mayRemindSealedEvent(sealedEvent.remindedAt, now)
  const remind = useMutation({
    mutationFn: () => remindSealedEventEntrants({ data: { token, eventToken: sealedEvent.eventToken } }),
    onSuccess: refresh,
  })
  if (sealedEvent.revealedAt !== null || sealedEventSealingClosed(sealedEvent, now) || (!waiting.length && sealedEvent.remindedAt === null))
    return null
  const labels = entrantLabels(sealedEvent.entries)
  const note = [
    waiting.length && !cooling ? `Notifies ${namesPhrase(waiting.map((userId) => labels.get(userId) ?? 'a player'))}.` : null,
    sealedEvent.remindedAt === null ? null : `Last reminder ${moment(sealedEvent.remindedAt)}.`,
    cooling && nextAt !== null && waiting.length ? `You can send another from ${moment(nextAt)}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div data-sealed-event-reminder className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button size="sm" variant="outline" disabled={!waiting.length || cooling || remind.isPending} onClick={() => remind.mutate()}>
          <BellRing /> {remind.isPending ? 'Reminding…' : 'Remind players'}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-dim">{note}</p>
      </div>
      {remind.error ? <Problem error={remind.error} /> : null}
    </div>
  )
}

/** The one confirmation before an event's rosters open, which cannot be undone. */
export function RevealRostersDialog({
  sealedEvent,
  token,
  open,
  onOpenChange,
}: {
  sealedEvent: SealedEvent
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const refresh = useSealedEventRefresh(token)
  const reveal = useMutation({
    mutationFn: () => revealSealedEvent({ data: { token, eventToken: sealedEvent.eventToken } }),
    onSuccess: async () => {
      onOpenChange(false)
      await refresh()
    },
  })
  const accepted = sealedEvent.entries.filter((entry) => entry.status === 'accepted')
  const pending = sealedEvent.entries.filter((entry) => entry.status === 'pending').length
  return (
    <ConfirmDialog
      open={open}
      title="Reveal every roster?"
      description={
        <>
          {accepted.length === 1 ? 'The sealed roster opens' : `All ${accepted.length} sealed rosters open`} for everyone who can open this
          page, and nobody else can join. {pending ? `${countLabel(pending, 'request')} still waiting will be turned down. ` : ''}
          You cannot undo this.
        </>
      }
      cancel="Keep them sealed"
      confirm="Reveal all rosters"
      pendingLabel="Revealing…"
      pending={reveal.isPending}
      error={reveal.error}
      onClose={() => {
        reveal.reset()
        onOpenChange(false)
      }}
      onConfirm={() => reveal.mutate()}
    >
      {reveal.isPending ? <output className="sr-only">Revealing rosters…</output> : null}
    </ConfirmDialog>
  )
}

/** What the organizer still has to do for one unmet check. */
export function checkDetail(
  check: Exclude<SealedEventRevealCheck, { step: 'lists' | 'dispositions' | 'warlords' }>,
  format: SealedEvent['format'],
  nameOf: (userId: string) => string,
) {
  const names = (userIds: string[]) => namesPhrase(userIds.map(nameOf))
  switch (check.step) {
    case 'places':
      return 'Accept at least one player.'
    case 'requests':
      return `Answer ${names(check.waiting)}.`
    case 'sizes':
      if (check.short) return 'Invite more players: a solo player and two allies need three.'
      if (check.waiting.length) return `Give ${names(check.waiting)} a size.`
      return check.solo === 0 ? 'Make one player solo.' : 'Make two players allied.'
    case 'teams':
      if (check.short) return 'Invite more players: doubles needs an even number, at least four.'
      if (format === '2v1') return `Pair ${names(check.waiting)} with another ally.`
      return `Pair ${names(check.waiting)}.`
  }
}
