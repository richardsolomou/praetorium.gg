import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, EllipsisVertical, LogOut, Send, Shuffle, Swords, Trash2, Trophy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GROUP_LEAGUE_PLAYERS_MIN, leagueFixtureOverdue } from '../../../core/groupLeague'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'
import {
  deleteGroupLeague,
  drawGroupLeague,
  joinGroupLeague,
  leaveGroupLeague,
  publishGroupLeague,
  setGroupLeagueDeadline,
  type groupLeague,
} from '../../functions'
import { groupLeagueQuery } from '../../queries'
import { countLabel, formatList } from '../../text'
import { useNow } from '../../useNow'
import { SealedEventResults } from '../sealedEvents/SealedEventResults'
import { useGroupRefresh, usePlayGroupGame, type Group } from './group'
import { useMoment, inputMoment, momentFromInput } from '../../dates'

type League = NonNullable<Awaited<ReturnType<typeof groupLeague>>>
type Fixture = League['fixtures'][number]

/** A group's round robin: an organizer's prompt to start one, the draft everyone can join, or the published fixtures and table. */
export function GroupLeague({ group, viewerId, member }: { group: Group; viewerId: string | null; member: boolean }) {
  const { data: league } = useQuery(groupLeagueQuery(group.token))
  if (league === undefined) return null
  if (league === null) return group.organizer ? <NoLeague group={group} /> : null
  return league.published ? (
    <PublishedLeague group={group} league={league} viewerId={viewerId} />
  ) : (
    <DraftLeague group={group} league={league} viewerId={viewerId} member={member} />
  )
}

function NoLeague({ group }: { group: Group }) {
  const refresh = useGroupRefresh(group.token)
  const draw = useMutation({ mutationFn: () => drawGroupLeague({ data: { token: group.token } }), onSettled: refresh })
  return (
    <section data-group-league>
      <SectionHeading title="League" />
      <p className="text-sm text-dim">
        Run a round robin: every member who joins plays every other member once. You review the draw before you publish it.
      </p>
      <Button variant="outline" className="mt-3" disabled={draw.isPending} onClick={() => draw.mutate()}>
        <Trophy /> Start a league
      </Button>
      {draw.error ? <Problem error={draw.error} className="mt-2" /> : null}
    </section>
  )
}

function DraftLeague({ group, league, viewerId, member }: { group: Group; league: League; viewerId: string | null; member: boolean }) {
  const refresh = useGroupRefresh(group.token)
  const [confirming, setConfirming] = useState<'publish' | 'discard' | null>(null)
  const done = { onSettled: refresh, onSuccess: () => setConfirming(null) }
  const join = useMutation({ mutationFn: () => joinGroupLeague({ data: { token: group.token } }), onSettled: refresh })
  const leave = useMutation({ mutationFn: () => leaveGroupLeague({ data: { token: group.token } }), onSettled: refresh })
  const draw = useMutation({ mutationFn: () => drawGroupLeague({ data: { token: group.token } }), onSettled: refresh })
  const publish = useMutation({
    mutationFn: (seed: number) =>
      publishGroupLeague({ data: { token: group.token, seed, playerIds: league.players.map((player) => player.userId) } }),
    ...done,
  })
  const discard = useMutation({ mutationFn: () => deleteGroupLeague({ data: { token: group.token } }), ...done })
  const joined = league.players.some((player) => player.userId === viewerId)
  const count = league.players.length
  const rounds = new Set(league.fixtures.map((fixture) => fixture.round)).size
  const ready = count >= GROUP_LEAGUE_PLAYERS_MIN
  const pending = join.isPending || leave.isPending || draw.isPending
  const error = join.error ?? leave.error ?? draw.error
  return (
    <section data-group-league>
      <SectionHeading title="League" action={<span className="chip">Draft</span>} />
      <p className="text-sm text-dim">
        {count
          ? `${formatList(league.players.map((player) => player.name))} ${count === 1 ? 'has' : 'have'} joined. `
          : 'Nobody has joined yet. '}
        {!league.organizer
          ? 'Everyone who joins before the organizers publish the league plays every other player once.'
          : !ready
            ? `At least ${GROUP_LEAGUE_PLAYERS_MIN} players need to join before you can publish.`
            : `${countLabel(rounds, 'round')}: each player meets every other once${count % 2 ? ' and sits out one round' : ''}. Only organizers see the draw until it’s published.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {member && joined ? (
          <Button variant="outline" disabled={pending} onClick={() => leave.mutate()}>
            <LogOut /> Leave league
          </Button>
        ) : member ? (
          <Button variant={league.organizer ? 'outline' : 'default'} disabled={pending} onClick={() => join.mutate()}>
            <UserPlus /> Join league
          </Button>
        ) : null}
        {league.organizer ? (
          <>
            {ready ? (
              <Button variant="outline" disabled={pending} onClick={() => draw.mutate()}>
                <Shuffle /> Draw again
              </Button>
            ) : null}
            <Button disabled={pending || !ready} onClick={() => (publish.reset(), setConfirming('publish'))}>
              <Send /> Publish
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => (discard.reset(), setConfirming('discard'))}>
              <Trash2 /> Discard
            </Button>
          </>
        ) : null}
      </div>
      {error ? <Problem error={error} className="mt-2" /> : null}
      {league.organizer && ready ? <Rounds group={group} league={league} viewerId={viewerId} now={0} className="mt-4" /> : null}
      <ConfirmDialog
        open={confirming === 'publish'}
        title="Publish the league?"
        description={`${countLabel(count, 'player')}, ${countLabel(rounds, 'round')}. Nobody else can join, and the fixtures can’t be drawn again.`}
        cancel="Keep reviewing"
        confirm="Publish"
        pendingLabel="Publishing…"
        pending={publish.isPending}
        error={publish.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => league.seed !== null && publish.mutate(league.seed)}
      />
      <ConfirmDialog
        open={confirming === 'discard'}
        title="Discard this league?"
        description="Everyone who joined comes off it. You can start another."
        cancel="Keep"
        confirm="Discard"
        pendingLabel="Discarding…"
        destructive
        pending={discard.isPending}
        error={discard.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => discard.mutate()}
      />
    </section>
  )
}

function PublishedLeague({ group, league, viewerId }: { group: Group; league: League; viewerId: string | null }) {
  const refresh = useGroupRefresh(group.token)
  const now = useNow(league.deadlines)
  const [confirming, setConfirming] = useState<'withdraw' | 'end' | null>(null)
  const done = { onSettled: refresh, onSuccess: () => setConfirming(null) }
  const withdraw = useMutation({ mutationFn: () => leaveGroupLeague({ data: { token: group.token } }), ...done })
  const end = useMutation({ mutationFn: () => deleteGroupLeague({ data: { token: group.token } }), ...done })
  const playing = league.players.some((player) => player.userId === viewerId && !player.withdrawn)
  const games = league.fixtures.filter((fixture) => fixture.bId !== null && fixture.status !== 'void')
  const finished = games.filter((fixture) => fixture.status === 'finished').length
  const overdue = games.filter((fixture) => leagueFixtureOverdue(fixture.status, league.deadlines[fixture.round - 1] ?? null, now)).length
  const menu =
    league.organizer || playing ? (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More for the league" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {playing ? (
            <DropdownMenuItem variant="destructive" onClick={() => (withdraw.reset(), setConfirming('withdraw'))}>
              <LogOut /> Withdraw from league
            </DropdownMenuItem>
          ) : null}
          {league.organizer ? (
            <DropdownMenuItem variant="destructive" onClick={() => (end.reset(), setConfirming('end'))}>
              <Trash2 /> End league
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null
  return (
    <section data-group-league className="space-y-6">
      <SealedEventResults
        event={`${group.name} league`}
        title="League table"
        rows={league.table}
        swiss
        partial={false}
        entries={league.players}
        label={(player) => (player.withdrawn ? `${player.name} (withdrawn)` : player.name)}
      />
      <div>
        <SectionHeading title="Fixtures" action={menu} />
        <p className="text-sm text-dim">
          {finished} of {countLabel(games.length, 'game')} played
          {overdue ? (
            <>
              {' · '}
              <span className="text-discarded">{overdue} overdue</span>
            </>
          ) : null}
          . Play rounds in any order.
        </p>
        <Rounds group={group} league={league} viewerId={viewerId} now={now} className="mt-4" />
      </div>
      <ConfirmDialog
        open={confirming === 'withdraw'}
        title="Withdraw from the league?"
        description="Your games still to play become void. Results you’ve already played stay on the table."
        cancel="Stay in"
        confirm="Withdraw"
        pendingLabel="Withdrawing…"
        destructive
        pending={withdraw.isPending}
        error={withdraw.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => withdraw.mutate()}
      />
      <ConfirmDialog
        open={confirming === 'end'}
        title="End the league?"
        description="This removes its fixtures and table. Its battles stay on the group leaderboard."
        cancel="Keep league"
        confirm="End league"
        pendingLabel="Ending…"
        destructive
        pending={end.isPending}
        error={end.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => end.mutate()}
      />
    </section>
  )
}

/** Every round's fixtures with its deadline; a draft's are the organizer's preview. */
function Rounds({
  group,
  league,
  viewerId,
  now,
  className,
}: {
  group: Group
  league: League
  viewerId: string | null
  now: number
  className?: string
}) {
  const play = usePlayGroupGame(group.token)
  const moment = useMoment()
  const [editing, setEditing] = useState<number | null>(null)
  const names = new Map(league.players.map((player) => [player.userId, player]))
  const rounds = [...new Set(league.fixtures.map((fixture) => fixture.round))].toSorted((a, b) => a - b)
  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {play.error ? <Problem error={play.error} /> : null}
      {rounds.map((round) => {
        const deadline = league.deadlines[round - 1] ?? null
        return (
          <div key={round} data-league-round={round}>
            <div className="mb-1.5 flex min-h-6 items-center justify-between gap-3">
              <p className="eyebrow">Round {round}</p>
              <div className="flex items-center gap-1 text-xs text-dim">
                {deadline !== null ? <span>Due {moment(deadline)}</span> : null}
                {league.organizer && league.published ? (
                  <Button variant="ghost" size="xs" onClick={() => setEditing(round)} aria-label={`Deadline for round ${round}`}>
                    <CalendarClock /> {deadline === null ? 'Set deadline' : 'Change'}
                  </Button>
                ) : null}
              </div>
            </div>
            <ol className="divide-y divide-edge border border-edge bg-panel">
              {league.fixtures
                .filter((fixture) => fixture.round === round)
                .map((fixture) => (
                  <FixtureRow
                    key={fixture.table}
                    fixture={fixture}
                    name={(userId) => names.get(userId)?.name ?? 'A player'}
                    viewerId={viewerId}
                    overdue={leagueFixtureOverdue(fixture.status, deadline, now)}
                    pending={play.isPending}
                    onPlay={(opponentId) => fixture.key && play.mutate({ opponentIds: [opponentId], fixture: fixture.key })}
                  />
                ))}
            </ol>
          </div>
        )
      })}
      {editing !== null ? (
        <DeadlineDialog group={group} round={editing} deadline={league.deadlines[editing - 1] ?? null} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function FixtureRow({
  fixture,
  name,
  viewerId,
  overdue,
  pending,
  onPlay,
}: {
  fixture: Fixture
  name: (userId: string) => string
  viewerId: string | null
  overdue: boolean
  pending: boolean
  onPlay: (opponentId: string) => void
}) {
  const own = fixture.aId === viewerId || fixture.bId === viewerId
  const opponent = fixture.aId === viewerId ? fixture.bId : fixture.aId
  const { battle, status } = fixture
  return (
    <li
      data-fixture={fixture.table}
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 ${own ? 'bg-raised' : ''} ${status === 'void' ? 'text-faint' : ''}`}
    >
      <span className="min-w-0 flex-1 font-semibold break-words">
        {name(fixture.aId)}
        {fixture.bId ? <span className="font-normal text-dim"> vs </span> : null}
        {fixture.bId ? name(fixture.bId) : null}
      </span>
      {overdue ? <span className="chip shrink-0 border-discarded/60 text-discarded">Overdue</span> : null}
      {status === 'bye' ? (
        <span className="chip shrink-0 text-dim">Bye</span>
      ) : status === 'void' ? (
        <span className="chip shrink-0 text-faint">Void</span>
      ) : battle ? (
        <Link to="/battles/$token" params={{ token: battle.token }} className="readout shrink-0 text-sm text-info hover:text-bone">
          {status === 'finished' ? `${battle.scores[0]} – ${battle.scores[1]}` : battle.status === 'playing' ? 'Playing' : 'Setting up'}
        </Link>
      ) : own && opponent && fixture.key ? (
        <Button size="sm" disabled={pending} onClick={() => onPlay(opponent)}>
          <Swords /> Start battle
        </Button>
      ) : fixture.key ? (
        <span className="shrink-0 text-sm text-faint">Not started</span>
      ) : null}
    </li>
  )
}

function DeadlineDialog({
  group,
  round,
  deadline,
  onClose,
}: {
  group: Group
  round: number
  deadline: number | null
  onClose: () => void
}) {
  const refresh = useGroupRefresh(group.token)
  const [value, setValue] = useState(inputMoment(deadline))
  const save = useMutation({
    mutationFn: () => setGroupLeagueDeadline({ data: { token: group.token, round, deadline: momentFromInput(value) } }),
    onSettled: refresh,
    onSuccess: onClose,
  })
  return (
    <ConfirmDialog
      title={`Round ${round} deadline`}
      description="Games still unfinished after it show as overdue. Nothing is scored for them."
      cancel="Cancel"
      confirm={value ? 'Save deadline' : 'Clear deadline'}
      pendingLabel="Saving…"
      pending={save.isPending}
      error={save.error}
      onClose={onClose}
      onConfirm={() => save.mutate()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="league-deadline">Finish by</Label>
        <Input id="league-deadline" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
    </ConfirmDialog>
  )
}
