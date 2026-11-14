import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlayerTint } from '../battleColours'
import { Link } from '@tanstack/react-router'
import { Bell, Check, ChevronRight, QrCode } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { BattleView } from '../../../../core/battleView'
import { isPracticeSeat } from '../../../../core/newBattle'
import { battleInvitePath } from '../../../../core/notifications'
import { Choice } from '../../../components/Choice'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { PlayerAvatar } from '../../../components/PlayerAvatar'
import { Problem } from '../../../components/Problem'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { seatOption } from '../../../components/Seats'
import { useQrCode } from '../../../components/useQrCode'
import {
  inviteToBattle,
  playBothSides,
  removeBattlePlayer,
  sealedEventBattleOptions,
  shareBattle,
  stopSharingBattle,
} from '../../../functions'
import { useNativeShare } from '../../../nativeBridge'
import { disambiguatedPlayerLabels } from '../../../playerLabels'
import { battleDraftQuery, battleQuery, opponentsQuery } from '../../../queries'
import { useOrigin } from '../../../useOrigin'
import { shareButtonLabel, useShareLink } from '../../../useShareLink'
import { cn } from '@/lib/utils'
import { tint } from '../battleTints'

type Way = 'link' | 'friend' | 'both'
type Draft = NonNullable<ReturnType<typeof useDraft>['data']>

/** The draft state of a battle, read again whenever `table` changes; invalidating the battle's key reaches every version. */
export const useDraft = (token: string, table = '') => {
  const query = battleDraftQuery(token)
  return useQuery({ ...query, queryKey: [...query.queryKey, table] })
}

/** Reads the table and its draft state again after someone joins or leaves. */
export const refreshTable = (queryClient: QueryClient, token: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey }),
    queryClient.invalidateQueries({ queryKey: battleDraftQuery(token).queryKey }),
  ])

/** Shares the battle's link, which the face-off and this step both offer. */
export function useShareBattle(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => shareBattle({ data: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: battleDraftQuery(token).queryKey }),
  })
}

/** Whether the viewer started this battle and holds every other place in it themselves. */
export const playsEverySide = (view: BattleView) =>
  view.viewerId === view.creatorId && view.players.length > 1 && view.players.every((player) => player.isViewer || isPracticeSeat(player))

/** Gives every place the viewer plays back to the link, which the step and each played place's card offer. */
export function useInvitePlayersInstead(view: BattleView, onDone: () => Promise<unknown>) {
  return useMutation({
    mutationFn: async () => {
      for (const player of view.players.filter((candidate) => !candidate.isViewer && isPracticeSeat(candidate)))
        await removeBattlePlayer({ data: { token: view.token, playerId: player.id } })
    },
    onSettled: onDone,
  })
}

/** Fills every open place with one the viewer plays, which the step offers and an ally added while playing every side needs. */
export function usePlayEverySide(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => playBothSides({ data: { token } }),
    onSuccess: () => refreshTable(queryClient, token),
  })
}

/**
 * Who else is at the table and how the open places get filled: a link anyone signs in through, a friend's
 * notification, or the viewer playing the other side themselves.
 */
export function OpponentStep({
  view,
  open,
  draft,
  both,
}: {
  view: BattleView
  open: number
  draft: Draft | undefined
  both: ReturnType<typeof usePlayEverySide>
}) {
  const queryClient = useQueryClient()
  const token = view.token
  const refresh = () => refreshTable(queryClient, token)
  const { data: friends = [] } = useQuery(opponentsQuery())
  const people = friends.filter((friend) => !view.players.some((player) => player.id === friend.id))
  const share = useShareBattle(token)
  const stop = useMutation({ mutationFn: () => stopSharingBattle({ data: { token } }), onSuccess: refresh })
  const playingAll = playsEverySide(view)
  const invite = draft?.invite ?? null
  const [chosenWay, setWay] = useState<Way | null>(null)
  // A battle started from a friend opens on the invite already sent.
  const others = view.players.filter((player) => !player.isViewer)
  const removable = view.viewerId === view.creatorId
  // Playing both sides takes every open place, so it is offered only before anyone else has joined.
  const alone = view.players.length === 1 && open > 0
  const ways = [
    { value: 'link' as const, name: 'Share a link', detail: 'A QR code or link. They sign in and join.' },
    ...(people.length ? [{ value: 'friend' as const, name: 'Invite a friend', detail: 'They get a notification and join from it.' }] : []),
    ...(alone
      ? [{ value: 'both' as const, name: 'Play both sides', detail: 'You choose every army and play them all on this device.' }]
      : []),
  ]
  // A way the table no longer offers falls back to the link, and so does playing both sides once it is undone.
  const offered = chosenWay && ways.some((option) => option.value === chosenWay) && (chosenWay !== 'both' || both.isPending || both.error)
  const way = offered ? chosenWay : invite?.invited.length && people.length ? 'friend' : 'link'
  if (playingAll) return <PlayingEverySide view={view} pending={both.isPending} error={both.error} onStopped={refresh} />
  return (
    <div className="space-y-4">
      {others.length ? <Joined view={view} removable={removable} onRemoved={refresh} /> : null}
      {open ? (
        <>
          {ways.length > 1 ? (
            <Choice
              label="How they join"
              value={way}
              options={ways}
              columns={ways.length === 3 ? 3 : 2}
              disabled={both.isPending}
              onChange={(chosen) => {
                setWay(chosen)
                if (chosen === 'both') both.mutate(undefined, { onSuccess: () => posthog.capture('battle_both_sides_played') })
              }}
            />
          ) : null}
          {way === 'friend' ? (
            <InviteFriend token={token} people={people} invited={invite?.invited ?? []} onInvited={refresh} />
          ) : way === 'both' ? (
            both.error ? (
              <Problem error={both.error} />
            ) : (
              <output className="block text-sm text-dim">Setting up every side…</output>
            )
          ) : invite ? (
            <SharedLink invite={invite.invite} open={open} stopping={stop.isPending} onStop={() => stop.mutate()} />
          ) : (
            <Button className="h-11 w-full sm:w-auto" disabled={share.isPending} onClick={() => share.mutate()}>
              <QrCode /> Show the QR code and link
            </Button>
          )}
          {share.error ? <Problem error={share.error} /> : stop.error ? <Problem error={stop.error} /> : null}
        </>
      ) : null}
    </div>
  )
}

/** The viewer holds every place; going back to inviting players opens those places again. */
function PlayingEverySide({
  view,
  pending,
  error,
  onStopped,
}: {
  view: BattleView
  pending: boolean
  error: Error | null
  onStopped: () => Promise<unknown>
}) {
  const stop = useInvitePlayersInstead(view, onStopped)
  return (
    <div className="space-y-3">
      <p className="text-sm text-dim">
        You play every side and choose every army on this device. A battle you play alone stays out of your record and the leaderboard.
      </p>
      {pending ? <output className="block text-sm text-dim">Adding your place…</output> : null}
      {error ? <Problem error={error} /> : null}
      <Button variant="outline" size="sm" disabled={stop.isPending || pending} onClick={() => stop.mutate()}>
        Invite players instead
      </Button>
      {stop.error ? <Problem error={stop.error} /> : null}
    </div>
  )
}

/** The players who have joined, whom the creator can remove until the battle starts. */
function Joined({ view, removable, onRemoved }: { view: BattleView; removable: boolean; onRemoved: () => Promise<unknown> }) {
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  return (
    <ul className="space-y-2">
      {view.players
        .filter((player) => !player.isViewer)
        .map((player) => (
          <li key={player.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm font-bold uppercase', tint(player.side).text)}>
              <PlayerAvatar name={player.name} image={player.image ?? null} className="size-6 text-xs" />
              <PlayerTint playerId={player.id} className="break-words">
                {player.name}
              </PlayerTint>
              {player.automated ? <span className="chip ml-1 align-middle text-dim normal-case">Played by you</span> : null}
            </span>
            {removable ? (
              <Button variant="outline" size="sm" onClick={() => setRemoving({ id: player.id, name: player.name })}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      <RemovePlayerDialog token={view.token} player={removing} onClose={() => setRemoving(null)} onRemoved={onRemoved} />
    </ul>
  )
}

/** The question asked before the creator takes a joined player out, from the Players step or the player's card. */
export function RemovePlayerDialog({
  token,
  player,
  onClose,
  onRemoved,
}: {
  token: string
  player: { id: string; name: string } | null
  onClose: () => void
  onRemoved: () => Promise<unknown>
}) {
  const remove = useMutation({
    mutationFn: (playerId: string) => removeBattlePlayer({ data: { token, playerId } }),
    onSuccess: async () => {
      onClose()
      await onRemoved()
    },
  })
  return (
    <ConfirmDialog
      open={player !== null}
      title={`Remove ${player?.name ?? 'them'}?`}
      description="Their place opens again and the link they used stops working. Share a new one to fill it."
      cancel="Keep them"
      confirm="Remove"
      destructive
      pending={remove.isPending}
      error={remove.error}
      onClose={() => {
        remove.reset()
        onClose()
      }}
      onConfirm={() => player && remove.mutate(player.id)}
    />
  )
}

function SharedLink({ invite, open, stopping, onStop }: { invite: string; open: number; stopping: boolean; onStop: () => void }) {
  const origin = useOrigin()
  const nativeShare = useNativeShare()
  const link = useShareLink('battle_link_shared')
  const url = origin ? `${origin}${battleInvitePath(invite)}` : null
  const { image, failed } = useQrCode(url, 176)
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      {image ? (
        <img src={image} alt="QR code to join the battle" className="mx-auto size-44 rounded-lg bg-white sm:mx-0" />
      ) : (
        <div className="mx-auto grid size-44 place-items-center rounded-lg border border-edge bg-sunken sm:mx-0">
          {failed ? (
            <span className="px-3 text-center text-xs text-dim">No QR code. Share the link instead.</span>
          ) : (
            <QrCode className="size-8 text-faint" aria-hidden />
          )}
        </div>
      )}
      <div className="min-w-0 space-y-3">
        <p className="text-sm text-pretty text-dim">
          {open > 1 ? 'Whoever opens it signs in and picks a side.' : 'Whoever opens it signs in, joins and lands here.'}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-lg border border-input bg-input/30 px-3 py-2.5 font-mono text-xs text-dim">
            {url ?? 'Preparing the link…'}
          </p>
          <Button
            variant="outline"
            className="h-10 shrink-0"
            disabled={!url}
            onClick={() => url && void link.share(url, 'Join my battle on Praetorium')}
          >
            {shareButtonLabel(link.shared, nativeShare, 'link')}
          </Button>
        </div>
        {link.problem ? <Problem error={link.problem} /> : null}
        <Button variant="ghost" size="sm" className="-mx-2 text-dim" disabled={stopping} onClick={onStop}>
          Stop sharing
        </Button>
      </div>
    </div>
  )
}

function InviteFriend({
  token,
  people,
  invited,
  onInvited,
}: {
  token: string
  people: { id: string; name: string; image: string | null }[]
  invited: { id: string; name: string }[]
  onInvited: () => Promise<unknown>
}) {
  // Opens on a friend already invited, such as one a battle was started for, so a shared tournament is offered for them too.
  const [friendId, setFriendId] = useState(invited[0]?.id ?? '')
  const send = useMutation({
    mutationFn: (id: string) => inviteToBattle({ data: { token, friendId: id } }),
    onSuccess: onInvited,
  })
  // A friend you share a tournament with may owe you that game instead, which is played from the tournament.
  const { data: tournaments = [] } = useQuery({
    queryKey: ['sealed-event-battle-options', friendId],
    queryFn: () => sealedEventBattleOptions({ data: { opponentIds: [friendId] } }),
    enabled: Boolean(friendId),
  })
  const labels = disambiguatedPlayerLabels(people)
  const sent = invited.some((friend) => friend.id === friendId)
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="battle-friend" className="eyebrow">
          Friend
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchableSelect
            id="battle-friend"
            ariaLabel="Friend"
            groups={[{ label: 'Friends', items: people.map((friend) => seatOption(friend, labels)) }]}
            value={friendId}
            onValueChange={setFriendId}
            placeholder="Choose a friend"
            searchPlaceholder="Search friends…"
            className="h-11 flex-1"
          />
          <Button className="h-11" disabled={!friendId || sent || send.isPending} onClick={() => send.mutate(friendId)}>
            {sent ? <Check /> : <Bell />} {sent ? 'Invited' : 'Send invite'}
          </Button>
        </div>
      </div>
      {send.error ? <Problem error={send.error} /> : null}
      {invited.length ? (
        <p className="text-xs text-dim">
          Invited {invited.map((friend) => friend.name).join(', ')}. They join from their notification; until then the place stays open.
        </p>
      ) : null}
      {tournaments.map((match) => (
        <Link
          key={match.eventToken}
          to="/tournaments/$token"
          params={{ token: match.token }}
          search={{ event: match.eventToken, start: true }}
          className="flex items-center gap-3 rounded-lg border border-edge bg-sunken p-3 hover:border-runner-hi hover:bg-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold uppercase">{match.name}</span>
            <span className="block text-xs text-dim">You are both in this tournament. Play your game there instead.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-parchment" aria-hidden />
        </Link>
      ))}
    </div>
  )
}
