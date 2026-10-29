import { GuideHelp } from '../onboarding/GuideHelp'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronRight, Link2, Plus, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { posthog } from 'posthog-js'
import { isFetchNetworkFailure } from '../../networkErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, type TableShape } from '../../../core/tableShape'
import { PROFILE_NAME_MAX_LENGTH } from '../../../core/profileName'
import { createBattle, leagueBattleOptions, submit } from '../../functions'
import { battleQuery, opponentsQuery } from '../../queries'
import { useStartBattle } from './useStartBattle'
import { disambiguatedPlayerLabels } from '../../playerLabels'
import { advanceOnboarding } from '../onboarding/onboarding'
import { useNativeShare } from '../../nativeBridge'
import { InviteQr, SHARED_LABEL, useFriendInvite } from '../friends/friendInvite'
import { seatedPlayers, seatsFor, type Seat, type SoloPairRole } from '../../seats'
import { Choice } from '../../components/Choice'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import { MANUAL_TRACKING_LIMITS } from '../battle/manualTracking'
import { SeatMatchup, SeatRows, seatLabel, seatOption } from '../../components/Seats'
import type { SearchableGroup } from '../../components/SearchableSelect'
import { Problem } from '../../components/Problem'

/** A seat this player may fill: a friend, or one of the instance's practice opponents. */
type Opponent = { id: string; name: string; image: string | null; automated: boolean }

/** What a seat holds while a guest is chosen for it; no account id contains a space. */
const guestChoice = (seat: Seat) => `guest ${seat.id}`

/**
 * Who may fill a seat, with the people first and the seats nobody signs in to after.
 *
 * Grouped rather than badged: a practice opponent is not a friend with a label on it,
 * it is a different kind of chair, and the heading says so once instead of every row
 * repeating it. A guest sits only across the table, where the creator plays them.
 */
function seatOptions(
  seat: Seat,
  opponents: readonly Opponent[],
  labels: ReadonlyMap<string, string>,
  taken: ReadonlySet<string | null>,
): SearchableGroup[] {
  const free = opponents.filter((opponent) => !taken.has(opponent.id))
  return [
    { label: 'Friends', items: free.filter((opponent) => !opponent.automated).map((opponent) => seatOption(opponent, labels)) },
    {
      label: 'No account',
      items:
        seat.side === 'theirs'
          ? [{ label: 'Guest', value: guestChoice(seat), icon: <UserRound className="size-6 p-1 text-dim" aria-hidden /> }]
          : [],
    },
    { label: 'Practice opponents', items: free.filter((opponent) => opponent.automated).map((opponent) => seatOption(opponent, labels)) },
  ].filter((group) => group.items.length)
}

/**
 * Battle creation seats named players; setup chooses size and mission pack. Practice opponents occupy ordinary seats.
 *
 * Started from a saved roster, the battle opens with that roster already on the creator's seat; started from a
 * friend, it opens as a 1v1 with them already across the table. `open` lets a menu that cannot hold the dialog's own
 * button open it instead.
 */
export function CreateBattle({
  rosterId,
  opponentId,
  open: shown,
  onOpenChange,
}: { rosterId?: string; opponentId?: string; open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = shown !== undefined
  const open = controlled ? shown : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const source = rosterId ? { source: 'roster' as const } : opponentId ? { source: 'friend' as const } : {}
  const opponentQuery = useQuery({ ...opponentsQuery(), enabled: open })
  const opponents = opponentQuery.data ?? []
  // A chair apiece rather than a list, so filling the second before the first cannot
  // leave a hole where the request expects a player.
  const [theirIds, setTheirIds] = useState<(string | null)[]>([null, null])
  const [allyId, setAllyId] = useState<string | null>(null)
  const [guestNames, setGuestNames] = useState<Record<string, string>>({})
  const [shape, setShape] = useState<TableShape>('1v1')
  const [soloPairRole, setSoloPairRole] = useState<SoloPairRole>('solo')
  const [tracking, setTracking] = useState<'guided' | 'manual'>('guided')
  const [leagueMatches, setLeagueMatches] = useState<Awaited<ReturnType<typeof leagueBattleOptions>>>([])
  const seats = seatsFor(shape, soloPairRole)
  const seatedIn = (seat: Seat) => (seat.side === 'yours' ? allyId : (theirIds[seat.at] ?? null))
  const guestIn = (seat: Seat) => seatedIn(seat) === guestChoice(seat)
  const guestName = (seat: Seat) => (guestNames[seat.id] ?? '').trim()
  const seated = seats.every((seat) => seatedIn(seat) && (!guestIn(seat) || guestName(seat)))
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { defaultMissionPackId, openBattle } = useStartBattle()
  /** Setup still offers the choice of army, so a roster the battle refuses here is only a step left to do there. */
  const bringRoster = async (token: string, id: string) => {
    try {
      const screen = await queryClient.query(battleQuery(token))
      if (screen?.kind !== 'battle') return
      const attached = await submit({
        data: { token, expectedSeq: screen.view.seq, command: { kind: 'attach-saved-roster', rosterId: id } },
      })
      queryClient.setQueryData(battleQuery(token).queryKey, attached.screen)
    } catch (error) {
      // The battle exists either way, and its setup shows the seat without an army.
      posthog.capture('battle_roster_attach_failed', { reason: isFetchNetworkFailure(error) ? 'network' : 'error' })
    }
  }
  const create = useMutation({
    onMutate: (casual: boolean) =>
      posthog.capture('battle_creation_submitted', { format: shape, casual, manual: tracking === 'manual', ...source }),
    onError: () => posthog.capture('battle_creation_failed', { format: shape, reason: 'request', ...source }),
    mutationFn: async (casual: boolean) => {
      const players = seatedPlayers(seats, (seat) => (guestIn(seat) ? null : seatedIn(seat)))
      const guests = seats.filter(guestIn).map(guestName)
      const playerData = {
        ...(players.opponentIds.length ? { opponentIds: players.opponentIds } : {}),
        ...(players.allyId ? { allyId: players.allyId } : {}),
      }
      // A league seats only its entrants, so a table with a guest at it has no league match to offer.
      if (!casual && !guests.length) {
        const matches = await leagueBattleOptions({ data: playerData })
        if (matches.length) return { kind: 'league' as const, matches }
      }
      const missionPackId = tracking === 'manual' ? null : await defaultMissionPackId()
      let battle
      try {
        battle = await createBattle({
          data: {
            ...playerData,
            ...(guests.length ? { guestNames: guests } : {}),
            limit: null,
            missionPackId,
            casual,
            manual: tracking === 'manual',
          },
        })
      } catch (error) {
        if (!casual && !guests.length) {
          const matches = await leagueBattleOptions({ data: playerData })
          if (matches.length) return { kind: 'league' as const, matches }
        }
        throw error
      }
      if (rosterId) await bringRoster(battle.token, rosterId)
      return { kind: 'battle' as const, battle }
    },
    onSuccess: async (result) => {
      if (result.kind === 'league') {
        setLeagueMatches(result.matches)
        return
      }
      setOpen(false)
      return openBattle(result.battle.token)
    },
  })
  const changeIntent = () => {
    create.reset()
    setLeagueMatches([])
  }
  const changeOpen = (next: boolean) => {
    if (create.isPending) return
    setOpen(next)
  }
  // Counted when the dialog appears, whichever control opened it.
  useEffect(() => {
    if (!open) return
    posthog.capture('battle_creation_started', source)
    create.reset()
    setLeagueMatches([])
    if (opponentId) {
      setShape('1v1')
      setTheirIds([opponentId, null])
    }
    // Only the opening matters; `source`, `opponentId` and the mutation are stable for one dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const labels = disambiguatedPlayerLabels(opponents)
  const labelFor = (seat: Seat) => (guestIn(seat) ? guestName(seat) || 'Guest' : seatLabel(seatedIn(seat), labels, opponents))

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {controlled ? null : (
        <DialogTrigger
          render={<Button data-onboarding="create-battle" onClick={() => advanceOnboarding('battle', 'battle-start', 'battle-format')} />}
        >
          <Plus /> New battle
        </DialogTrigger>
      )}
      <DialogContent>
        {leagueMatches.length ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">You are both in a tournament</DialogTitle>
              <DialogDescription>
                Pick the tournament to play it there: the sealed lists go on the table for you, and the result counts in its table.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-2">
                {leagueMatches.map((match) => (
                  <button
                    key={match.eventToken}
                    type="button"
                    className="flex w-full items-center gap-3 border border-edge bg-sunken p-3 text-left hover:border-info hover:bg-raised disabled:cursor-wait disabled:opacity-70"
                    disabled={create.isPending}
                    onClick={() =>
                      navigate({
                        to: '/tournaments/$token',
                        params: { token: match.token },
                        search: { event: match.eventToken, start: true },
                      })
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold uppercase">{match.name}</span>
                      <span className="block text-xs text-dim">Play it here</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-parchment" aria-hidden />
                  </button>
                ))}
              </div>
              {create.error ? <Problem error={create.error} /> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" disabled={create.isPending} onClick={() => setLeagueMatches([])}>
                Back
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
              <GuideHelp task="battle" step="battle-format">
                Battle setup guide
              </GuideHelp>
              <DialogDescription>
                Choose who is playing. A guest is an opponent without an account; a practice opponent lets you play both sides alone.
                {rosterId ? ' You bring this roster.' : null}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Choice
                onboarding="battle-format"
                label="Battle format"
                value={shape}
                options={TABLE_SHAPES.map((candidate) => ({ value: candidate, ...TABLE_SHAPE_LABELS[candidate] }))}
                columns={3}
                onChange={(next) => {
                  changeIntent()
                  setShape(next)
                }}
              />
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
                <div aria-label="Loading players" className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ) : opponentQuery.error ? null : (
                <>
                  <SeatRows
                    onboarding="battle-seats"
                    idPrefix="battle"
                    seats={seats}
                    seatedIn={seatedIn}
                    groupsFor={(seat, taken) => seatOptions(seat, opponents, labels, taken)}
                    onPick={(seat, id) => {
                      changeIntent()
                      if (seat.side === 'yours') return setAllyId(id)
                      setTheirIds((current) => current.map((held, at) => (at === seat.at ? id : held)))
                    }}
                    renderDetail={(seat) =>
                      guestIn(seat) ? (
                        <div className="mt-2 space-y-1">
                          <Label htmlFor={`battle-${seat.id}-guest`}>Guest’s name</Label>
                          <Input
                            id={`battle-${seat.id}-guest`}
                            value={guestNames[seat.id] ?? ''}
                            maxLength={PROFILE_NAME_MAX_LENGTH}
                            autoComplete="off"
                            className="h-11"
                            onChange={(event) => {
                              changeIntent()
                              setGuestNames((current) => ({ ...current, [seat.id]: event.target.value }))
                            }}
                          />
                          <p className="text-xs text-dim">
                            You play their side, or share a link so they play it on their own device. The game counts in your record but not
                            on the leaderboard unless they sign up and claim it, and their name shows to anyone who can watch it.
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  {opponents.some((opponent) => !opponent.automated) ? null : <InviteOpponent />}
                </>
              )}
              <SeatMatchup onboarding="battle-sides" seats={seats} labelFor={labelFor} />
              <div>
                <Choice
                  label="Tracking"
                  value={tracking}
                  options={[
                    { value: 'guided', name: 'Guided', detail: 'Mission cards, scoring prompts and caps' },
                    { value: 'manual', name: 'Manual', detail: 'Keep score yourself' },
                  ]}
                  columns={2}
                  onChange={(next) => {
                    changeIntent()
                    setTracking(next)
                  }}
                />
                {tracking === 'manual' ? <p className="mt-1.5 text-xs text-dim">{MANUAL_TRACKING_LIMITS}</p> : null}
              </div>
              {create.error || opponentQuery.error ? <Problem error={create.error ?? opponentQuery.error} /> : null}
            </DialogBody>
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
  const shareLabel = useNativeShare() ? 'Share invite link' : 'Copy invite link'

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
        <span className="mr-auto">Playing a friend? Invite them, then pick them here.</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={invite.busy} onClick={() => void invite.share()}>
            {invite.feedback ? <Check /> : <Link2 />}
            {invite.creating ? 'Creating…' : invite.feedback ? SHARED_LABEL[invite.feedback] : shareLabel}
          </Button>
          {invite.url ? <InviteQr url={invite.url} disabled={invite.busy} size="sm" /> : null}
        </div>
      </div>
      {invite.problem ? <Problem className="text-xs">{invite.problem}</Problem> : null}
    </div>
  )
}
