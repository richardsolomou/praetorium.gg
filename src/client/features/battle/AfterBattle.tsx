import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BattleView } from '../../../core/battleView'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { createBattle } from '../../functions'
import { friendshipsQuery, playerProfileQuery } from '../../queries'
import { formatList } from '../../text'
import { useStartBattle } from '../battles/useStartBattle'
import { FriendAction } from '../friends/FriendAction'
import { recordSummary } from '../profile/recordSummary'
import { battleTable } from './rematch'

const FORMATS = { 2: '1v1', 3: '2v1', 4: '2v2' } as const

/**
 * What a seated account can do once a game between people is over: see where they now stand against their opponent,
 * befriend the people they played, and play them again.
 *
 * One quiet panel rather than three, and only the parts that apply, so the result stays the thing the screen is about.
 */
export function AfterBattle({ view }: { view: BattleView }) {
  const table = useMemo(() => battleTable(view), [view])
  const friendships = useQuery({ ...friendshipsQuery(), enabled: Boolean(table?.accounts.length) })
  const profile = useQuery({ ...playerProfileQuery(view.viewerId), enabled: Boolean(table?.rival) })
  const [rematching, setRematching] = useState(false)
  if (!table) return null
  const { accounts, rival, seats } = table
  const strangers = friendships.data ? accounts.filter((person) => !friendships.data.friends.some(({ id }) => id === person.id)) : []
  // Battle creation seats only friends, so the rematch waits until everyone at the table is one.
  const canRematch = seats !== null && (!accounts.length || (friendships.isSuccess && !strangers.length))
  const against = rival ? profile.data?.record.opponents.find(({ id }) => id === rival.id) : undefined
  const recording = rival !== null && (profile.isPending || against !== undefined)
  if (!recording && !canRematch && !strangers.length) return null

  return (
    <aside data-after-battle aria-label="After the battle" className="flex flex-wrap items-center gap-3 part p-4">
      <div className="min-w-0 flex-1 basis-60 space-y-0.5">
        {recording && !against ? (
          <Skeleton className="h-5 w-56" />
        ) : rival && against ? (
          <p className="text-sm font-semibold text-bone">
            {against.battles > 1 ? `Against ${rival.name}: ${recordSummary(against)}` : `Your first battle against ${rival.name}.`}{' '}
            <Link
              to="/users/$userId"
              params={{ userId: view.viewerId }}
              search={{ opponentId: rival.id }}
              className="font-normal whitespace-nowrap text-info hover:text-bone"
            >
              Your record
            </Link>
          </p>
        ) : (
          <p className="text-sm font-semibold text-bone">Play again?</p>
        )}
        <p className="text-xs text-dim">
          {canRematch
            ? 'A rematch seats the same players on the same sides. The mission is chosen again.'
            : strangers.length && seats
              ? 'Once you are friends, you can start a rematch from here.'
              : null}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-sm:[&>button]:h-11">
        {strangers.map((person) => (
          <FriendAction key={person.id} person={person} event="battle_friend_requested" />
        ))}
        {canRematch ? (
          <Button size="sm" onClick={() => setRematching(true)}>
            Rematch
          </Button>
        ) : null}
      </div>
      {rematching && seats ? <RematchDialog view={view} seats={seats} onClose={() => setRematching(false)} /> : null}
    </aside>
  )
}

type Seats = NonNullable<NonNullable<ReturnType<typeof battleTable>>['seats']>

function RematchDialog({ view, seats, onClose }: { view: BattleView; seats: Seats; onClose: () => void }) {
  const { defaultMissionPackId, bringRoster, openBattle } = useStartBattle()
  const manual = view.settings.manual === true
  const telemetry = { format: FORMATS[view.players.length as 2 | 3 | 4], casual: true, manual, source: 'rematch' }
  const rematch = useMutation({
    onMutate: () => posthog.capture('battle_creation_submitted', telemetry),
    onError: () => posthog.capture('battle_creation_failed', { ...telemetry, reason: 'request' }),
    mutationFn: async () => {
      const battle = await createBattle({
        data: {
          ...(seats.opponentIds.length ? { opponentIds: seats.opponentIds } : {}),
          ...(seats.allyId ? { allyId: seats.allyId } : {}),
          ...(seats.guestNames.length ? { guestNames: seats.guestNames } : {}),
          limit: null,
          missionPackId: manual ? null : await defaultMissionPackId(view.settings.missionPackId),
          // A rematch is a game between friends, never the next round of the event the first one belonged to.
          casual: true,
          manual,
        },
      })
      if (seats.rosterId) await bringRoster(battle.token, seats.rosterId)
      await openBattle(battle.token)
    },
    onSuccess: onClose,
  })
  const viewer = view.players.find((player) => player.isViewer)
  const others = view.players.filter((player) => !player.isViewer)
  const ownList = seats.rosterId ? viewer?.roster : null
  return (
    <ConfirmDialog
      title="Start a rematch?"
      description={
        <>
          A new battle with {formatList(others.map(({ name }) => name))}, on the same sides.{' '}
          {ownList ? `You bring your saved ${ownList.name} as it is now; ` : 'You choose your army in setup; '}
          the other armies are chosen again in setup.
          {seats.guestNames.length ? ' A guest playing on their own device needs the new battle’s link.' : null}
        </>
      }
      cancel="Cancel"
      confirm="Start rematch"
      pendingLabel="Starting…"
      pending={rematch.isPending}
      error={rematch.error}
      onClose={onClose}
      onConfirm={() => rematch.mutate()}
    />
  )
}
