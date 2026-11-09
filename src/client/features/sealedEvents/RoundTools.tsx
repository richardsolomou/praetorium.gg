import { useMutation } from '@tanstack/react-query'
import { ArrowLeftRight, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { SearchableSelect } from '../../components/SearchableSelect'
import { setRoundTimer, swapTableSeats } from '../../functions'
import { useSealedEventRefresh } from './sealedEvent'

const DEFAULT_ROUND_MINUTES = '180'

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  return `${hours}:${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** What everyone counts down to, and the organizer's start, extend and stop. */
export function RoundClock({
  token,
  eventToken,
  endsAt,
  organizes,
}: {
  token: string
  eventToken: string
  endsAt: number | null
  organizes: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  const [minutes, setMinutes] = useState(DEFAULT_ROUND_MINUTES)
  const refresh = useSealedEventRefresh(token)
  useEffect(() => {
    if (endsAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [endsAt])
  const set = useMutation({
    mutationFn: (change: { minutes: number | null; fromEnd: number | null }) => setRoundTimer({ data: { token, eventToken, ...change } }),
    onSettled: refresh,
  })
  if (endsAt === null && !organizes) return null
  const valid = /^\d{1,3}$/.test(minutes) && Number(minutes) > 0
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-round-clock>
      {endsAt !== null ? (
        <p className="readout text-lg font-semibold text-bone" aria-label="Time left in this round">
          <Timer className="mr-1.5 inline size-4" aria-hidden />
          {now >= endsAt ? 'Time' : clock(endsAt - now)}
        </p>
      ) : null}
      {organizes && endsAt === null ? (
        <>
          <Label htmlFor="round-minutes" className="text-sm text-dim">
            Round length, minutes
          </Label>
          <Input
            id="round-minutes"
            inputMode="numeric"
            className="h-9 w-20"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={set.isPending || !valid}
            onClick={() => set.mutate({ minutes: Number(minutes), fromEnd: null })}
          >
            <Timer /> Start the clock
          </Button>
        </>
      ) : null}
      {organizes && endsAt !== null ? (
        <>
          <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => set.mutate({ minutes: 10, fromEnd: endsAt })}>
            Add 10 minutes
          </Button>
          <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => set.mutate({ minutes: null, fromEnd: null })}>
            Stop
          </Button>
        </>
      ) : null}
      {set.error ? <Problem error={set.error} /> : null}
    </div>
  )
}

/** Moves two players between tables before their battles start, for keeping clubmates apart or fixing the day's mix-ups. */
export function SwapSeats({
  token,
  eventToken,
  players,
}: {
  token: string
  eventToken: string
  players: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const refresh = useSealedEventRefresh(token)
  const swap = useMutation({
    mutationFn: () => swapTableSeats({ data: { token, eventToken, players: [first, second] } }),
    onSuccess: async () => {
      await refresh()
      setFirst('')
      setSecond('')
      setOpen(false)
    },
  })
  const groups = [{ label: '', items: players }]
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => (swap.reset(), setOpen(true))}>
        <ArrowLeftRight /> Swap players
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Swap players</DialogTitle>
            <DialogDescription>
              They trade tables for this round. Only tables that haven’t started can change, and any battlefield set for them is cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label htmlFor="swap-first">Player</Label>
              <SearchableSelect
                id="swap-first"
                groups={groups}
                value={first}
                onValueChange={setFirst}
                placeholder="Choose a player"
                searchPlaceholder="Search players…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="swap-second">Swaps with</Label>
              <SearchableSelect
                id="swap-second"
                groups={groups}
                value={second}
                onValueChange={setSecond}
                placeholder="Choose a player"
                searchPlaceholder="Search players…"
              />
            </div>
            {swap.error ? <Problem error={swap.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button disabled={swap.isPending || !first || !second || first === second} onClick={() => swap.mutate()}>
              {swap.isPending ? 'Swapping…' : 'Swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
