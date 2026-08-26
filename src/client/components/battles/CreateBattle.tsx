import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { GAME_SIZES } from '../../../core/battle'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { createBattle } from '../../../server/functions'
import { battlesQuery, gameReferencesQuery, opponentsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { seatedPlayers, seatsFor, type Seat, type SoloPairRole } from '../../seats'
import { Choice } from '../Choice'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../Seats'
import type { SearchableGroup } from '../SearchableSelect'

/** How each shape seats the table, which is the whole question this dialog asks. */
const SEATING: Record<TableShape, string> = {
  '1v1': 'One player on each side',
  '2v1': 'One player faces a two-player team',
  '2v2': 'Two players on each side',
}

/** A seat this player may fill: a friend, or one of the instance's practice opponents. */
type Opponent = { id: string; name: string; image: string | null; automated: boolean }

/** The size a new battle opens at. Setup's first step is where the table changes it. */
const OPENING_LIMIT = GAME_SIZES.find((size) => size.limit === 2000)?.limit ?? GAME_SIZES[0].limit

/**
 * Who may fill a seat, with the people first and the seats nobody signs in to after.
 *
 * Grouped rather than badged: a practice opponent is not a friend with a label on it,
 * it is a different kind of chair, and the heading says so once instead of every row
 * repeating it.
 */
function seatOptions(
  opponents: readonly Opponent[],
  labels: ReadonlyMap<string, string>,
  taken: ReadonlySet<string | null>,
): SearchableGroup[] {
  const free = opponents.filter((opponent) => !taken.has(opponent.id))
  return [
    { label: 'Friends', items: free.filter((opponent) => !opponent.automated).map((opponent) => seatOption(opponent, labels)) },
    { label: 'Practice opponents', items: free.filter((opponent) => opponent.automated).map((opponent) => seatOption(opponent, labels)) },
  ].filter((group) => group.items.length)
}

/**
 * Opening a battle: who is in it, and nothing else.
 *
 * Practice is not a format of its own. A practice opponent is an account that holds
 * a seat and never signs in, so playing one is a 1v1 like any other — and a 2v1 with
 * one in it is a 2v1. Every shape here is therefore just whoever is in the seats.
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
  const [shape, setShape] = useState<TableShape>('1v1')
  const [soloPairRole, setSoloPairRole] = useState<SoloPairRole>('solo')
  const seats = seatsFor(shape, soloPairRole)
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const seated = seats.every(seatedIn)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: async () => {
      const references = await queryClient.ensureQueryData(gameReferencesQuery())
      const players = seatedPlayers(seats, seatedIn)
      return createBattle({
        data: {
          opponentIds: players.opponentIds,
          // Only a shape that seats one names an ally, so switching away from it
          // cannot smuggle a stale pick into the request.
          ...(players.allyId ? { allyId: players.allyId } : {}),
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
  const labels = disambiguatedPlayerLabels(opponents)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button />}>New battle</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-none border-edge bg-panel p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Start a battle</DialogTitle>
          <DialogDescription>Choose who is playing. A practice opponent needs no friend and no second device.</DialogDescription>
        </DialogHeader>
        <div>
          <Choice
            label="Table shape"
            value={shape}
            options={TABLE_SHAPES.map((candidate) => ({ value: candidate, ...TABLE_SHAPE_LABELS[candidate] }))}
            columns={3}
            onChange={(next) => {
              changeIntent()
              setShape(next)
            }}
          />
          <p className="mt-1.5 text-xs text-dim">{SEATING[shape]}.</p>
        </div>
        {shape === '2v1' ? (
          <Choice
            label="Your role"
            value={soloPairRole}
            options={[
              { value: 'solo', name: 'I’m solo', detail: 'Face two opponents' },
              { value: 'pair', name: 'I’m on the pair', detail: 'Bring an ally' },
            ]}
            columns={2}
            onChange={(role) => {
              changeIntent()
              setSoloPairRole(role)
            }}
          />
        ) : null}
        {opponentQuery.isPending ? (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">Loading players…</p>
        ) : opponentQuery.error ? null : opponents.length ? (
          <SeatRows
            idPrefix="battle"
            seats={seats}
            seatedIn={seatedIn}
            groupsFor={(_seat, taken) => seatOptions(opponents, labels, taken)}
            onPick={(seat, id) => {
              changeIntent()
              if (seat.side === 'yours') return setAllyId(id)
              setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
            }}
          />
        ) : (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">This instance seats nobody you can play yet.</p>
        )}
        {opponents.length ? <SeatMatchup seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, opponents)} /> : null}
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
