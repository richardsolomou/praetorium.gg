import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Link2 } from 'lucide-react'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { createBattle, leagueBattleOptions } from '../../functions'
import { battlesQuery, gameReferencesQuery, opponentsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { advanceOnboarding } from '../onboarding/onboarding'
import { InviteQr, SHARED_LABEL, useFriendInvite } from '../friends/friendInvite'
import { seatedPlayers, seatsFor, type Seat, type SoloPairRole } from '../../seats'
import { Choice } from '../../components/Choice'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../../components/Seats'
import type { SearchableGroup } from '../../components/SearchableSelect'

/** How each shape seats the table, which is the whole question this dialog asks. */
const SEATING: Record<TableShape, string> = {
  '1v1': 'One player on each side',
  '2v1': 'One player faces a two-player team',
  '2v2': 'Two players on each side',
}

/** A seat this player may fill: a friend, or one of the instance's practice opponents. */
type Opponent = { id: string; name: string; image: string | null; automated: boolean }

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

/** Battle creation seats named players; setup chooses size and mission pack. Practice opponents occupy ordinary seats. */
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
  const [leagueMatches, setLeagueMatches] = useState<Awaited<ReturnType<typeof leagueBattleOptions>>>([])
  const seats = seatsFor(shape, soloPairRole)
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const seated = seats.every(seatedIn)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    onMutate: (casual: boolean) => posthog.capture('battle_creation_submitted', { format: shape, casual }),
    onError: () => posthog.capture('battle_creation_failed', { format: shape, reason: 'request' }),
    mutationFn: async (casual: boolean) => {
      const players = seatedPlayers(seats, seatedIn)
      const playerData = {
        opponentIds: players.opponentIds,
        ...(players.allyId ? { allyId: players.allyId } : {}),
      }
      if (!casual) {
        const matches = await leagueBattleOptions({ data: playerData })
        if (matches.length) return { kind: 'league' as const, matches }
      }
      const references = await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' })
      let battle
      try {
        battle = await createBattle({
          data: {
            ...playerData,
            limit: null,
            missionPackId: references?.packs[0]?.id ?? null,
            casual,
          },
        })
      } catch (error) {
        if (!casual) {
          const matches = await leagueBattleOptions({ data: playerData })
          if (matches.length) return { kind: 'league' as const, matches }
        }
        throw error
      }
      return { kind: 'battle' as const, battle }
    },
    onSuccess: async (result) => {
      if (result.kind === 'league') {
        setLeagueMatches(result.matches)
        return
      }
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      return navigate({ to: '/battles/$token', params: { token: result.battle.token } })
    },
  })
  const changeIntent = () => {
    create.reset()
    setLeagueMatches([])
  }
  const changeOpen = (next: boolean) => {
    if (create.isPending) return
    if (next && !open) {
      posthog.capture('battle_creation_started')
    }
    changeIntent()
    setOpen(next)
  }
  const labels = disambiguatedPlayerLabels(opponents)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button data-onboarding="create-battle" onClick={() => advanceOnboarding('battle', 'battle-start', 'battle-format')} />}
      >
        New battle
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto p-4 sm:max-w-md">
        {leagueMatches.length ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">You are both in a league event</DialogTitle>
              <DialogDescription>
                Pick the event to play it there: the sealed lists go on the table for you, and the battle joins the event history.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {leagueMatches.map((match) => (
                <button
                  key={match.eventToken}
                  type="button"
                  className="flex w-full items-center gap-3 border border-edge bg-sunken p-3 text-left hover:border-info hover:bg-raised disabled:cursor-wait disabled:opacity-70"
                  disabled={create.isPending}
                  onClick={() =>
                    navigate({
                      to: '/leagues/$token',
                      params: { token: match.token },
                      search: { event: match.eventToken, start: true },
                    })
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold uppercase">{match.name}</span>
                    <span className="block text-xs text-dim">Event {match.eventNumber} · play it here</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-parchment" aria-hidden />
                </button>
              ))}
            </div>
            {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
            <DialogFooter>
              <Button variant="outline" disabled={create.isPending} onClick={() => setLeagueMatches([])}>
                Go back
              </Button>
              <Button variant="outline" disabled={create.isPending} onClick={() => create.mutate(true)}>
                {create.isPending ? 'Creating…' : 'Play it casually'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Start a battle</DialogTitle>
              <DialogDescription>Choose who is playing. A practice opponent lets you control both sides on your own.</DialogDescription>
            </DialogHeader>
            <div>
              <Choice
                onboarding="battle-format"
                label="Game format"
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
            ) : opponentQuery.error ? null : (
              <>
                {opponents.length ? (
                  <SeatRows
                    onboarding="battle-seats"
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
                ) : null}
                {opponents.some((opponent) => !opponent.automated) ? null : <InviteOpponent />}
              </>
            )}
            {opponents.length ? (
              <SeatMatchup onboarding="battle-sides" seats={seats} labelFor={(seat) => seatLabel(seatedIn(seat), labels, opponents)} />
            ) : null}
            {create.error || opponentQuery.error ? (
              <p className="text-sm text-destructive">{errorMessage(create.error ?? opponentQuery.error)}</p>
            ) : null}
            <p className="text-xs text-dim">
              Choose saved armies for both sides in setup. One device can record the whole game.{' '}
              <Link
                to="/guides/$guideId"
                params={{ guideId: 'track-a-battle' }}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline"
              >
                Read the battle guide
              </Link>
              .
            </p>
            <DialogFooter>
              <Button variant="outline" disabled={create.isPending} onClick={() => changeOpen(false)}>
                Cancel
              </Button>
              <Button
                data-onboarding="battle-create"
                disabled={!seated || opponentQuery.isPending || create.isPending}
                onClick={() => create.mutate(false)}
              >
                {create.isPending ? 'Checking…' : 'Start battle'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Until a player has a friend, the way to seat a real opponent is to invite one. */
function InviteOpponent() {
  const invite = useFriendInvite()

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
        <span className="mr-auto">Playing a friend? Invite them, then pick them here.</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={invite.busy} onClick={() => void invite.share()}>
            {invite.feedback ? <Check /> : <Link2 />}
            {invite.creating ? 'Creating…' : invite.feedback ? SHARED_LABEL[invite.feedback] : 'Share invite link'}
          </Button>
          {invite.url ? <InviteQr url={invite.url} disabled={invite.busy} size="sm" /> : null}
        </div>
      </div>
      {invite.problem ? <p className="text-xs text-destructive">{invite.problem}</p> : null}
    </div>
  )
}
