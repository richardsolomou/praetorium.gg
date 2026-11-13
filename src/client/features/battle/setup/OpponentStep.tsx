import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell, Check, ChevronRight, QrCode } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { BattleView } from '../../../../core/battleView'
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

/** Shares the battle's link, which the face-off and this step both offer. */
export function useShareBattle(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => shareBattle({ data: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: battleDraftQuery(token).queryKey }),
  })
}

/**
 * Who else is at the table and how the open places get filled: a link anyone signs in through, a friend's
 * notification, or the viewer playing the other side themselves.
 */
export function OpponentStep({ view, open, draft }: { view: BattleView; open: number; draft: Draft | undefined }) {
  const queryClient = useQueryClient()
  const token = view.token
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey }),
      queryClient.invalidateQueries({ queryKey: battleDraftQuery(token).queryKey }),
    ])
  const { data: friends = [] } = useQuery(opponentsQuery())
  const people = friends.filter((friend) => !friend.automated && !view.players.some((player) => player.id === friend.id))
  const share = useShareBattle(token)
  const stop = useMutation({ mutationFn: () => stopSharingBattle({ data: { token } }), onSuccess: refresh })
  const both = useMutation({
    mutationFn: () => playBothSides({ data: { token } }),
    onSuccess: () => {
      posthog.capture('battle_both_sides_played')
      return refresh()
    },
  })
  const invite = draft?.invite ?? null
  const [chosenWay, setWay] = useState<Way | null>(null)
  // A battle started from a friend opens on the invite already sent.
  const others = view.players.filter((player) => !player.isViewer)
  const removable = Boolean(draft?.draft) && view.viewerId === view.creatorId
  // Playing both sides fills the one place across the table, so it is offered only in a battle of two.
  const alone = view.players.length === 1 && open === 1
  const ways = [
    { value: 'link' as const, name: 'Share a link', detail: 'A QR code or link. They sign in and join.' },
    ...(people.length ? [{ value: 'friend' as const, name: 'Invite a friend', detail: 'They get a notification and join from it.' }] : []),
    ...(alone ? [{ value: 'both' as const, name: 'Play both sides', detail: 'You play their side on this device.' }] : []),
  ]
  // A way the table no longer offers, such as playing both sides once an ally place opens, falls back to the link.
  const way =
    chosenWay && ways.some((option) => option.value === chosenWay) ? chosenWay : invite?.invited.length && people.length ? 'friend' : 'link'
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
                if (chosen === 'both') both.mutate()
              }}
            />
          ) : null}
          {way === 'friend' ? (
            <InviteFriend token={token} people={people} invited={invite?.invited ?? []} onInvited={refresh} />
          ) : way === 'both' ? (
            both.error ? (
              <Problem error={both.error} />
            ) : (
              <output className="block text-sm text-dim">Setting up their side…</output>
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

/** The players who have joined, whom the creator can remove while the battle is still a draft. */
function Joined({ view, removable, onRemoved }: { view: BattleView; removable: boolean; onRemoved: () => Promise<unknown> }) {
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const remove = useMutation({
    mutationFn: (playerId: string) => removeBattlePlayer({ data: { token: view.token, playerId } }),
    onSuccess: async () => {
      setRemoving(null)
      await onRemoved()
    },
  })
  return (
    <ul className="space-y-2">
      {view.players
        .filter((player) => !player.isViewer)
        .map((player) => (
          <li key={player.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm font-bold uppercase', tint(player.side).text)}>
              <PlayerAvatar name={player.name} image={player.image ?? null} className="size-6 text-xs" />
              <span className="break-words">{player.name}</span>
              {player.automated ? <span className="chip ml-1 align-middle text-dim normal-case">Played by you</span> : null}
            </span>
            {removable ? (
              <Button variant="outline" size="sm" onClick={() => setRemoving({ id: player.id, name: player.name })}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? 'them'}?`}
        description="Their place opens again and the link they used stops working. Share a new one to fill it."
        cancel="Keep them"
        confirm="Remove"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </ul>
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
