import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { GAME_SIZES } from '../../../core/battle'
import { createBattle } from '../../../server/functions'
import { battlesQuery, gameReferencesQuery, opponentsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { PlayerAvatar } from '../PlayerAvatar'
import { SearchableSelect, type SearchableGroup } from '../SearchableSelect'

/**
 * The shapes a battle can take, from the point of view of whoever is opening it.
 *
 * A 2v1 is one battle with two ways into it, because either seat may be the one at
 * the keyboard: the allied pair is the opener's own side or the side they face. The
 * points split across the pair whichever side it is.
 */
const FORMATS = [
  { key: 'duel', name: '1v1', detail: 'One army each' },
  { key: 'with-ally', name: '2v1', detail: 'You and an ally against one' },
  { key: 'against-pair', name: '1v2', detail: 'You against two allies' },
  { key: 'doubles', name: '2v2', detail: 'You and an ally against two' },
] as const

type Format = (typeof FORMATS)[number]['key']

/** A seat this player may fill: a friend, or one of the instance's practice opponents. */
type Opponent = { id: string; name: string; image: string | null; automated: boolean }

/** Which seats a format asks to be filled, in the order the table reads them. */
type Seat = { id: string; label: string; placeholder: string; side: 'yours' | 'theirs'; at: number }

const SEATS: Record<Format, Seat[]> = {
  duel: [{ id: 'battle-opponent', label: 'Opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 }],
  'with-ally': [
    { id: 'battle-ally', label: 'Your ally', placeholder: 'Choose your ally', side: 'yours', at: 0 },
    { id: 'battle-opponent', label: 'Opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
  ],
  'against-pair': [
    { id: 'battle-opponent', label: 'Opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
    { id: 'battle-opponent-ally', label: 'Their ally', placeholder: 'Choose their ally', side: 'theirs', at: 1 },
  ],
  doubles: [
    { id: 'battle-ally', label: 'Your ally', placeholder: 'Choose your ally', side: 'yours', at: 0 },
    { id: 'battle-opponent', label: 'First opponent', placeholder: 'Choose a player', side: 'theirs', at: 0 },
    { id: 'battle-opponent-ally', label: 'Second opponent', placeholder: 'Choose their ally', side: 'theirs', at: 1 },
  ],
}

/** The size a new battle opens at. Setup's first step is where the table changes it. */
const OPENING_LIMIT = GAME_SIZES.find((size) => size.limit === 2000)?.limit ?? GAME_SIZES[0].limit

/**
 * Who may fill a seat, with the people first and the seats nobody signs in to after.
 *
 * Grouped rather than badged: a practice opponent is not a friend with a label on it,
 * it is a different kind of chair, and the heading says so once instead of every row
 * repeating it.
 */
function seatOptions(opponents: readonly Opponent[], taken: ReadonlySet<string | null>): SearchableGroup[] {
  const free = opponents.filter((opponent) => !taken.has(opponent.id))
  const labels = disambiguatedPlayerLabels(opponents)
  const option = (opponent: Opponent) => ({
    label: labels.get(opponent.id) ?? opponent.name,
    value: opponent.id,
    icon: <PlayerAvatar name={opponent.name} image={opponent.image} className="size-5 text-[0.625rem]" />,
  })
  return [
    { label: 'Friends', items: free.filter((opponent) => !opponent.automated).map(option) },
    { label: 'Practice opponents', items: free.filter((opponent) => opponent.automated).map(option) },
  ].filter((group) => group.items.length)
}

/**
 * Opening a battle: who is in it, and nothing else.
 *
 * Practice is not a format of its own. A practice opponent is an account that holds
 * a seat and never signs in, so playing one is a 1v1 like any other — and a 2v1 with
 * one in it is a 2v1. Every format here is therefore just whoever is in the seats.
 *
 * The allied pair of a 2v1 can be either side, because whoever is at the keyboard
 * may be one of the two. Only the seating differs; the battle is the same one.
 *
 * How big the game is and which mission pack it plays are the first thing setup
 * asks, together, with everyone looking at it — so they are not asked twice. A new
 * battle opens at the default size and setup is where the table settles it.
 */
export function CreateBattle() {
  const [open, setOpen] = useState(false)
  const opponentQuery = useQuery({ ...opponentsQuery(), enabled: open })
  const opponents = opponentQuery.data ?? []
  // A chair apiece rather than a list, so filling the second before the first cannot
  // leave a hole where the request expects a player.
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  const [format, setFormat] = useState<Format>('duel')
  const seats = SEATS[format]
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const opponentIds = seats.filter((seat) => seat.side === 'theirs').flatMap((seat) => (seatedIn(seat) ? [seatedIn(seat)!] : []))
  const seated = seats.every(seatedIn)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: async () => {
      const references = await queryClient.ensureQueryData(gameReferencesQuery())
      return createBattle({
        data: {
          opponentIds,
          // Only a format that seats one names an ally, so switching away from it
          // cannot smuggle a stale pick into the request.
          ...(seats.some((seat) => seat.side === 'yours') && allyId ? { allyId } : {}),
          // What the table opens with, and what its first setup step is for changing.
          limit: OPENING_LIMIT,
          missionPackId: references?.packs[0]?.id ?? null,
        },
      })
    },
    onSuccess: async ({ token }) => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      return navigate({ to: '/battles/$token', params: { token } })
    },
  })
  const changeIntent = () => create.reset()
  const changeOpen = (next: boolean) => {
    if (create.isPending) return
    changeIntent()
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button />}>New battle</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-none border-edge bg-panel p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Start a battle</DialogTitle>
          <DialogDescription>Choose who is playing. A practice opponent needs no friend and no second device.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="eyebrow">Format</legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMATS.map((entry) => {
              const chosen = entry.key === format
              return (
                <Button
                  key={entry.key}
                  variant={chosen ? 'default' : 'outline'}
                  aria-pressed={chosen}
                  className={`h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left ${chosen ? 'bg-parchment text-parchment-ink hover:bg-parchment/80' : ''}`}
                  onClick={() => {
                    changeIntent()
                    setFormat(entry.key)
                  }}
                >
                  <span className="font-bold uppercase">{entry.name}</span>
                  <span
                    className={`text-[0.625rem] leading-tight font-normal whitespace-normal ${chosen ? 'text-parchment-ink/75' : 'text-dim'}`}
                  >
                    {entry.detail}
                  </span>
                </Button>
              )
            })}
          </div>
        </fieldset>
        {opponentQuery.isPending ? (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">Loading players…</p>
        ) : opponentQuery.error ? null : opponents.length ? (
          <div className="space-y-2">
            {seats.map((seat) => {
              // Nobody sits in two chairs, so a player picked elsewhere is not offered here.
              const taken = new Set(seats.filter((other) => other.id !== seat.id).map(seatedIn))
              const pick = (id: string) => {
                changeIntent()
                if (seat.side === 'yours') return setAllyId(id)
                setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
              }
              return (
                <div key={seat.id}>
                  <Label htmlFor={seat.id} className="eyebrow">
                    {seat.label}
                  </Label>
                  <SearchableSelect
                    id={seat.id}
                    ariaLabel={seat.label}
                    groups={seatOptions(opponents, taken)}
                    value={seatedIn(seat) ?? ''}
                    onValueChange={pick}
                    placeholder={seat.placeholder}
                    searchPlaceholder="Search players…"
                    className="mt-1 h-11 rounded-none border-edge bg-sunken"
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">This instance seats nobody you can play yet.</p>
        )}
        {create.error || opponentQuery.error ? (
          <p className="text-sm text-destructive">{errorMessage(create.error ?? opponentQuery.error)}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={create.isPending} onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!seated || opponentQuery.isPending || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
