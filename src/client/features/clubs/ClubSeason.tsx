import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, EllipsisVertical, LogOut, Send, Shuffle, Swords, Trash2, Trophy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CLUB_SEASON_PLAYERS_MIN, seasonFixtureOverdue } from '../../../core/clubSeason'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'
import {
  deleteClubSeason,
  drawClubSeason,
  joinClubSeason,
  leaveClubSeason,
  publishClubSeason,
  setClubSeasonDeadline,
  type clubSeason,
} from '../../functions'
import { clubSeasonQuery } from '../../queries'
import { countLabel, formatList } from '../../text'
import { useNow } from '../../useNow'
import { LeagueResults } from '../leagues/LeagueResults'
import { useClubRefresh, usePlayClubGame, type Club } from './club'
import { useMoment, inputMoment, momentFromInput } from '../../dates'

type Season = NonNullable<Awaited<ReturnType<typeof clubSeason>>>
type Fixture = Season['fixtures'][number]

/** A club's round robin: an organizer's prompt to start one, the draft everyone can join, or the published fixtures and table. */
export function ClubSeason({ club, viewerId, member }: { club: Club; viewerId: string | null; member: boolean }) {
  const { data: season } = useQuery(clubSeasonQuery(club.token))
  if (season === undefined) return null
  if (season === null) return club.organizer ? <NoSeason club={club} /> : null
  return season.published ? (
    <PublishedSeason club={club} season={season} viewerId={viewerId} />
  ) : (
    <DraftSeason club={club} season={season} viewerId={viewerId} member={member} />
  )
}

function NoSeason({ club }: { club: Club }) {
  const refresh = useClubRefresh(club.token)
  const draw = useMutation({ mutationFn: () => drawClubSeason({ data: { token: club.token } }), onSettled: refresh })
  return (
    <section data-club-season>
      <SectionHeading title="Season" />
      <p className="text-sm text-dim">
        Run a round robin: every member who joins plays every other member once. You review the draw before you publish it.
      </p>
      <Button variant="outline" className="mt-3" disabled={draw.isPending} onClick={() => draw.mutate()}>
        <Trophy /> Start a season
      </Button>
      {draw.error ? <Problem error={draw.error} className="mt-2" /> : null}
    </section>
  )
}

function DraftSeason({ club, season, viewerId, member }: { club: Club; season: Season; viewerId: string | null; member: boolean }) {
  const refresh = useClubRefresh(club.token)
  const [confirming, setConfirming] = useState<'publish' | 'discard' | null>(null)
  const done = { onSettled: refresh, onSuccess: () => setConfirming(null) }
  const join = useMutation({ mutationFn: () => joinClubSeason({ data: { token: club.token } }), onSettled: refresh })
  const leave = useMutation({ mutationFn: () => leaveClubSeason({ data: { token: club.token } }), onSettled: refresh })
  const draw = useMutation({ mutationFn: () => drawClubSeason({ data: { token: club.token } }), onSettled: refresh })
  const publish = useMutation({
    mutationFn: (seed: number) =>
      publishClubSeason({ data: { token: club.token, seed, playerIds: season.players.map((player) => player.userId) } }),
    ...done,
  })
  const discard = useMutation({ mutationFn: () => deleteClubSeason({ data: { token: club.token } }), ...done })
  const joined = season.players.some((player) => player.userId === viewerId)
  const count = season.players.length
  const rounds = new Set(season.fixtures.map((fixture) => fixture.round)).size
  const ready = count >= CLUB_SEASON_PLAYERS_MIN
  const pending = join.isPending || leave.isPending || draw.isPending
  const error = join.error ?? leave.error ?? draw.error
  return (
    <section data-club-season>
      <SectionHeading title="Season" action={<span className="chip">Draft</span>} />
      <p className="text-sm text-dim">
        {count
          ? `${formatList(season.players.map((player) => player.name))} ${count === 1 ? 'has' : 'have'} joined. `
          : 'Nobody has joined yet. '}
        {!season.organizer
          ? 'Everyone who joins before the organizers publish the season plays every other player once.'
          : !ready
            ? `At least ${CLUB_SEASON_PLAYERS_MIN} players need to join before you can publish.`
            : `${countLabel(rounds, 'round')}: each player meets every other once${count % 2 ? ' and sits out one round' : ''}. Only organizers see the draw until it’s published.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {member && joined ? (
          <Button variant="outline" disabled={pending} onClick={() => leave.mutate()}>
            <LogOut /> Leave season
          </Button>
        ) : member ? (
          <Button variant={season.organizer ? 'outline' : 'default'} disabled={pending} onClick={() => join.mutate()}>
            <UserPlus /> Join season
          </Button>
        ) : null}
        {season.organizer ? (
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
      {season.organizer && ready ? <Rounds club={club} season={season} viewerId={viewerId} now={0} className="mt-4" /> : null}
      <ConfirmDialog
        open={confirming === 'publish'}
        title="Publish the season?"
        description={`${countLabel(count, 'player')}, ${countLabel(rounds, 'round')}. Nobody else can join, and the fixtures can’t be drawn again.`}
        cancel="Keep reviewing"
        confirm="Publish"
        pendingLabel="Publishing…"
        pending={publish.isPending}
        error={publish.error}
        onClose={() => setConfirming(null)}
        onConfirm={() => season.seed !== null && publish.mutate(season.seed)}
      />
      <ConfirmDialog
        open={confirming === 'discard'}
        title="Discard this season?"
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

function PublishedSeason({ club, season, viewerId }: { club: Club; season: Season; viewerId: string | null }) {
  const refresh = useClubRefresh(club.token)
  const now = useNow(season.deadlines)
  const [confirming, setConfirming] = useState<'withdraw' | 'end' | null>(null)
  const done = { onSettled: refresh, onSuccess: () => setConfirming(null) }
  const withdraw = useMutation({ mutationFn: () => leaveClubSeason({ data: { token: club.token } }), ...done })
  const end = useMutation({ mutationFn: () => deleteClubSeason({ data: { token: club.token } }), ...done })
  const playing = season.players.some((player) => player.userId === viewerId && !player.withdrawn)
  const games = season.fixtures.filter((fixture) => fixture.bId !== null && fixture.status !== 'void')
  const finished = games.filter((fixture) => fixture.status === 'finished').length
  const overdue = games.filter((fixture) => seasonFixtureOverdue(fixture.status, season.deadlines[fixture.round - 1] ?? null, now)).length
  const menu =
    season.organizer || playing ? (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More for the season" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {playing ? (
            <DropdownMenuItem variant="destructive" onClick={() => (withdraw.reset(), setConfirming('withdraw'))}>
              <LogOut /> Withdraw from season
            </DropdownMenuItem>
          ) : null}
          {season.organizer ? (
            <DropdownMenuItem variant="destructive" onClick={() => (end.reset(), setConfirming('end'))}>
              <Trash2 /> End season
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null
  return (
    <section data-club-season className="space-y-6">
      <LeagueResults
        event={`${club.name} season`}
        title="Season table"
        rows={season.table}
        swiss
        partial={false}
        entries={season.players}
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
        <Rounds club={club} season={season} viewerId={viewerId} now={now} className="mt-4" />
      </div>
      <ConfirmDialog
        open={confirming === 'withdraw'}
        title="Withdraw from the season?"
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
        title="End the season?"
        description="This removes its fixtures and table. Its battles stay on the club leaderboard."
        cancel="Keep season"
        confirm="End season"
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
  club,
  season,
  viewerId,
  now,
  className,
}: {
  club: Club
  season: Season
  viewerId: string | null
  now: number
  className?: string
}) {
  const play = usePlayClubGame(club.token)
  const moment = useMoment()
  const [editing, setEditing] = useState<number | null>(null)
  const names = new Map(season.players.map((player) => [player.userId, player]))
  const rounds = [...new Set(season.fixtures.map((fixture) => fixture.round))].toSorted((a, b) => a - b)
  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {play.error ? <Problem error={play.error} /> : null}
      {rounds.map((round) => {
        const deadline = season.deadlines[round - 1] ?? null
        return (
          <div key={round} data-season-round={round}>
            <div className="mb-1.5 flex min-h-6 items-center justify-between gap-3">
              <p className="eyebrow">Round {round}</p>
              <div className="flex items-center gap-1 text-xs text-dim">
                {deadline !== null ? <span>Due {moment(deadline)}</span> : null}
                {season.organizer && season.published ? (
                  <Button variant="ghost" size="xs" onClick={() => setEditing(round)} aria-label={`Deadline for round ${round}`}>
                    <CalendarClock /> {deadline === null ? 'Set deadline' : 'Change'}
                  </Button>
                ) : null}
              </div>
            </div>
            <ol className="divide-y divide-edge border border-edge bg-panel">
              {season.fixtures
                .filter((fixture) => fixture.round === round)
                .map((fixture) => (
                  <FixtureRow
                    key={fixture.table}
                    fixture={fixture}
                    name={(userId) => names.get(userId)?.name ?? 'A player'}
                    viewerId={viewerId}
                    overdue={seasonFixtureOverdue(fixture.status, deadline, now)}
                    pending={play.isPending}
                    onPlay={(opponentId) => fixture.key && play.mutate({ opponentId, fixture: fixture.key })}
                  />
                ))}
            </ol>
          </div>
        )
      })}
      {editing !== null ? (
        <DeadlineDialog club={club} round={editing} deadline={season.deadlines[editing - 1] ?? null} onClose={() => setEditing(null)} />
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

function DeadlineDialog({ club, round, deadline, onClose }: { club: Club; round: number; deadline: number | null; onClose: () => void }) {
  const refresh = useClubRefresh(club.token)
  const [value, setValue] = useState(inputMoment(deadline))
  const save = useMutation({
    mutationFn: () => setClubSeasonDeadline({ data: { token: club.token, round, deadline: momentFromInput(value) } }),
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
        <Label htmlFor="season-deadline">Finish by</Label>
        <Input id="season-deadline" type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
    </ConfirmDialog>
  )
}
