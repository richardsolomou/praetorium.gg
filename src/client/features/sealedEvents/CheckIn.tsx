import { useMutation } from '@tanstack/react-query'
import { Check, UserX } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { checkInEntrant, dropNoShows, setTiebreak } from '../../functions'
import type { SealedEventEntryView } from '../../../core/sealedEvent'
import { useSealedEventRefresh } from './sealedEvent'

/** Who has arrived before round 1, so a no-show isn't paired. Optional: nobody has to use it for the round to be paired. */
export function CheckIn({
  token,
  eventToken,
  entries,
  viewerId,
  organizes,
  label,
}: {
  token: string
  eventToken: string
  entries: readonly SealedEventEntryView[]
  viewerId: string | null
  organizes: boolean
  label: (entry: SealedEventEntryView) => string
}) {
  const [confirming, setConfirming] = useState(false)
  const refresh = useSealedEventRefresh(token)
  const set = useMutation({
    mutationFn: (change: { userId: string; checkedIn: boolean }) => checkInEntrant({ data: { token, eventToken, ...change } }),
    onSettled: refresh,
  })
  const drop = useMutation({
    mutationFn: () => dropNoShows({ data: { token, eventToken } }),
    onSuccess: async () => {
      await refresh()
      setConfirming(false)
    },
  })
  const players = entries.filter((entry) => entry.status === 'accepted' && entry.submitted && !entry.dropped)
  const own = players.find((entry) => entry.userId === viewerId)
  if (!own && !organizes) return null
  const missing = players.filter((entry) => !entry.checkedIn)
  return (
    <div className="mb-4 space-y-2" data-check-in>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-dim">
          {players.length - missing.length} of {players.length} checked in
        </p>
        {own ? (
          <Button
            size="sm"
            variant={own.checkedIn ? 'secondary' : 'default'}
            disabled={set.isPending}
            onClick={() => set.mutate({ userId: own.userId, checkedIn: !own.checkedIn })}
          >
            <Check /> {own.checkedIn ? 'Checked in' : 'Check in'}
          </Button>
        ) : null}
        {organizes && missing.length && missing.length < players.length ? (
          <Button size="sm" variant="ghost" onClick={() => (drop.reset(), setConfirming(true))}>
            <UserX /> Drop {missing.length} not checked in
          </Button>
        ) : null}
      </div>
      {organizes ? (
        <ul className="flex flex-wrap gap-1.5">
          {players.map((entry) => (
            <li key={entry.userId}>
              <Button
                size="sm"
                variant={entry.checkedIn ? 'secondary' : 'outline'}
                disabled={set.isPending}
                aria-pressed={entry.checkedIn}
                onClick={() => set.mutate({ userId: entry.userId, checkedIn: !entry.checkedIn })}
              >
                {entry.checkedIn ? <Check /> : null} {label(entry)}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {set.error ? <Problem error={set.error} /> : null}
      <ConfirmDialog
        open={confirming}
        title={`Drop ${missing.length} not checked in?`}
        description="They won't be paired and can't rejoin."
        cancel="Keep them"
        confirm="Drop players"
        pendingLabel="Dropping…"
        pending={drop.isPending}
        error={drop.error}
        onClose={() => setConfirming(false)}
        onConfirm={() => drop.mutate()}
      />
    </div>
  )
}

/** Which tiebreak comes first, which the organizer settles before any result can favour one player. */
export function TiebreakChoice({ token, eventToken, scheduleFirst }: { token: string; eventToken: string; scheduleFirst: boolean }) {
  const refresh = useSealedEventRefresh(token)
  const set = useMutation({
    mutationFn: (next: boolean) => setTiebreak({ data: { token, eventToken, scheduleFirst: next } }),
    onSettled: refresh,
  })
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-tiebreak>
      <p className="text-sm text-dim">
        Ties break on {scheduleFirst ? 'strength of schedule, then victory points' : 'victory points, then strength of schedule'}.
      </p>
      <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => set.mutate(!scheduleFirst)}>
        {scheduleFirst ? 'Use victory points first' : 'Use strength of schedule first'}
      </Button>
      {set.error ? <Problem error={set.error} /> : null}
    </div>
  )
}
