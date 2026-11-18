import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, EllipsisVertical, Timer, LogOut, Repeat, Send, Shuffle, Swords, Trash2, Trophy, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GROUP_LEAGUE_PLAYERS_MIN, leagueFixtureOverdue } from '../../../core/groupLeague'
import { ClockLimitChoice, clockLimitLabel } from '../../components/ClockLimitChoice'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'
import {
  deleteGroupLeague,
  drawGroupLeague,
  groupPastLeague,
  joinGroupLeague,
  leaveGroupLeague,
  nextGroupLeague,
  publishGroupLeague,
  reportFixtureResult,
  setGroupLeagueClock,
  setGroupLeagueDeadline,
  type groupLeague,
} from '../../functions'
import { groupLeagueQuery, groupPastLeaguesQuery } from '../../queries'
import { countLabel, formatList } from '../../text'
import { useNow } from '../../useNow'
import { EnterScore } from '../sealedEvents/ReportTableResult'
import { SealedEventResults } from '../sealedEvents/SealedEventResults'
import { leagueOutcome, useGroupRefresh, usePlayGroupGame, type Group } from './group'
import { LeagueLists, LeagueSealing, leaguePoints, SealLeagueList, StartLeagueDialog } from './GroupLeagueLists'
import { useMoment, inputMoment, momentFromInput } from '../../dates'
import { DropdownMenuItem } from '../../components/Menu'
import { nameColour } from '../../playerName'

type League = NonNullable<Awaited<ReturnType<typeof groupLeague>>>
type Fixture = League['fixtures'][number]

/** A group's round robin: an organizer's prompt to start one, the draft everyone can join, or the published fixtures and table. */
export function GroupLeague({ group, viewerId, member }: { group: Group; viewerId: string | null; member: boolean }) {
  const { data: league } = useQuery(groupLeagueQuery(group.token))
  if (league === undefined) return null
  return (
    <>
      {league === null ? (
        group.organizer ? (
          <NoLeague group={group} />
        ) : null
      ) : league.published ? (
        <PublishedLeague group={group} league={league} viewerId={viewerId} />
      ) : (
        <DraftLeague group={group} league={league} viewerId={viewerId} member={member} />
      )}
      <PastLeagues group={group} />
    </>
  )
}

/** Ended leagues stay readable, so a group can run one after another and look back on them. */
function PastLeagues({ group }: { group: Group }) {
  const [opened, setOpened] = useState<string | null>(null)
  const { data: leagues } = useQuery(groupPastLeaguesQuery(group.token))
  const { data: table } = useQuery({
    queryKey: [...groupLeagueQuery(group.token).queryKey, 'past', opened],
    enabled: opened !== null,
    queryFn: () => groupPastLeague({ data: { token: group.token, leagueId: opened! } }),
  })
  const moment = useMoment()
  if (!leagues?.length) return null
  return (
    <section data-past-leagues className="mt-6">
      <SectionHeading title="Past leagues" count={leagues.length} />
      <ul className="space-y-1">
        {leagues.map((past) => (
          <li key={past.id}>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto min-h-8 max-w-full justify-start py-1.5 text-left whitespace-normal"
              aria-expanded={opened === past.id}
              onClick={() => setOpened(opened === past.id ? null : past.id)}
            >
              {past.winners.length ? <Trophy aria-hidden className="text-parchment" /> : null}
              <span>
                {past.winners.length
                  ? `${formatList(past.winners)} ${past.winners.length > 1 ? 'shared it' : 'won'} · ended ${moment(past.endedAt)}`
                  : `Ended ${moment(past.endedAt)}`}
                {` · ${countLabel(past.players, 'player')}`}
              </span>
            </Button>
            {opened === past.id && table ? (
              <SealedEventResults
                event={`${group.name} league`}
                title="Final table"
                rows={table.table}
                format="league"
                partial={false}
                entries={table.players}
                label={(player) => (player.withdrawn ? `${player.name} (withdrawn)` : player.name)}
              />
            ) : null}
            {opened === past.id && table?.game ? <LeagueLists group={group} game={table.game} viewerId={null} /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function NoLeague({ group }: { group: Group }) {
  const [starting, setStarting] = useState(false)
  return (
    <section data-group-league>
      <SectionHeading title="League" />
      <p className="text-sm text-dim">
        Run a round robin: every member who joins plays every other member once. You review the draw before you publish it.
      </p>
      <Button variant="outline" className="mt-3" onClick={() => setStarting(true)}>
        <Trophy /> Start a league
      </Button>
      {starting ? <StartLeagueDialog group={group} open={starting} onClose={() => setStarting(false)} /> : null}
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
        {league.game
          ? `Lists are sealed to ${leaguePoints(league.game)} and revealed when the league is published. ${count ? '' : 'Nobody has sealed a list yet. '}`
          : count
            ? `${formatList(league.players.map((player) => player.name))} ${count === 1 ? 'has joined' : 'have joined'}. `
            : 'Nobody has joined yet. '}
        {!league.organizer
          ? 'Everyone who joins before the organizers publish the league plays every other player once.'
          : !ready
            ? `At least ${GROUP_LEAGUE_PLAYERS_MIN} players need to join before you can publish.`
            : `${countLabel(rounds, 'round')}: each player meets every other once${count % 2 ? ' and sits out one round' : ''}. Only organizers see the draw until it’s published.`}
      </p>
      {league.game && count ? <LeagueSealing group={group} league={league} game={league.game} viewerId={viewerId} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {member && league.game ? <SealLeagueList group={group} game={league.game} sealed={joined} primary={!league.organizer} /> : null}
        {member && joined ? (
          <Button variant="outline" disabled={pending} onClick={() => leave.mutate()}>
            <LogOut /> Leave league
          </Button>
        ) : member && !league.game ? (
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
      <LeagueClock group={group} league={league} />
      {league.organizer && ready ? <Rounds group={group} league={league} viewerId={viewerId} now={0} /> : null}
      <ConfirmDialog
        open={confirming === 'publish'}
        title="Publish the league?"
        description={`${countLabel(count, 'player')}, ${countLabel(rounds, 'round')}. ${league.game ? 'Every sealed list is revealed. ' : ''}Nobody else can join, and the fixtures can’t be drawn again.`}
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
        description={`Everyone who joined comes off it${league.game ? ', with their sealed lists' : ''}. You can start another.`}
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
      {league.complete ? <LeagueComplete group={group} league={league} /> : null}
      <SealedEventResults
        event={`${group.name} league`}
        title={league.complete ? 'Final table' : 'League table'}
        rows={league.table}
        format="league"
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
          {league.complete ? '.' : '. Play rounds in any order.'}
        </p>
        <LeagueClock group={group} league={league} />
        <Rounds group={group} league={league} viewerId={viewerId} now={now} />
      </div>
      {league.game ? (
        <div data-league-lists>
          <SectionHeading title="Lists" />
          <p className="text-sm text-dim">Sealed to {leaguePoints(league.game)}. Every game is played with these.</p>
          <LeagueLists
            group={group}
            game={league.game}
            viewerId={viewerId}
            playerIds={league.complete ? undefined : league.players.map((player) => player.userId)}
          />
        </div>
      ) : null}
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

/**
 * A league with nothing left to play: who won, and for organizers the next league, which opens as a draft with the same
 * players so nobody has to join again.
 */
function LeagueComplete({ group, league }: { group: Group; league: League }) {
  const refresh = useGroupRefresh(group.token)
  const [confirming, setConfirming] = useState(false)
  const next = useMutation({
    mutationFn: () => nextGroupLeague({ data: { token: group.token } }),
    onSettled: refresh,
    onSuccess: () => setConfirming(false),
  })
  const members = new Set(group.members.filter((member) => member.status === 'accepted').map((member) => member.userId))
  const staying = league.players.filter((player) => !player.withdrawn && members.has(player.userId))
  return (
    <div data-league-complete className="part flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
      <Trophy aria-hidden className="size-6 shrink-0 text-parchment" />
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="text-lg leading-tight font-bold break-words uppercase">{leagueOutcome(league)}</h2>
        <p className="mt-1 text-sm text-dim">
          Every game is played, so the table below is final.
          {league.organizer ? ' Start the next league to run it again with the same players.' : null}
        </p>
      </div>
      {league.organizer ? (
        <Button className="pointer-coarse:h-11" onClick={() => (next.reset(), setConfirming(true))}>
          <Repeat /> Start the next league
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Start the next league?"
        description={
          league.game
            ? `This league ends and its final table moves to Past leagues. The next opens as a draft that seals lists to the same points and house rules${league.clockLimitMinutes ? ', with the same chess clock' : ''}. Everyone seals a new list to join, and you publish it once they have.`
            : `This league ends and its final table moves to Past leagues. The next opens as a draft with ${staying.length ? formatList(staying.map((player) => player.name)) : 'nobody'} already in${league.clockLimitMinutes ? ' and the same chess clock' : ''}. Anyone else in the group can join before you publish it.`
        }
        cancel="Not yet"
        confirm="Start the next league"
        pendingLabel="Starting…"
        pending={next.isPending}
        error={next.error}
        onClose={() => setConfirming(false)}
        onConfirm={() => next.mutate()}
      />
    </div>
  )
}

/** Every round's fixtures with its deadline; a draft's are the organizer's preview. */
function Rounds({ group, league, viewerId, now }: { group: Group; league: League; viewerId: string | null; now: number }) {
  const play = usePlayGroupGame(group.token, league.game?.token)
  const refresh = useGroupRefresh(group.token)
  const moment = useMoment()
  const [editing, setEditing] = useState<number | null>(null)
  const names = new Map(league.players.map((player) => [player.userId, player]))
  const playerName = (userId: string) => {
    const player = names.get(userId)
    return player ? <span style={nameColour({ id: userId, colour: player.colour })}>{player.name}</span> : 'A player'
  }
  const rounds = [...new Set(league.fixtures.map((fixture) => fixture.round))].toSorted((a, b) => a - b)
  const unsealed = (userId: string | null) => Boolean(userId && league.game && !league.game.sealedIds.includes(userId))
  const unsettled = (round: number) =>
    league.fixtures.some((fixture) => fixture.round === round && (fixture.status === 'open' || fixture.status === 'playing'))
  // Rounds play in any order, so the earliest with a game still to finish is current and later unfinished ones wait.
  const current = league.published ? rounds.find(unsettled) : undefined
  const gate = (round: number) => (!league.published ? 'pending' : round === current ? 'current' : unsettled(round) ? 'pending' : undefined)
  return (
    <div className="mt-4 space-y-3">
      {play.error ? <Problem error={play.error} /> : null}
      <div className="runner gap-3 [--gate-y:1.375rem]">
        {rounds.map((round) => {
          const deadline = league.deadlines[round - 1] ?? null
          return (
            <div key={round} data-league-round={round} data-gate={gate(round)} className="part">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-xl border-b border-edge bg-sunken/40 px-3 py-1.5">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-label uppercase">
                  <span className="part-tag part-tag-ghost">R{round}</span>
                  <span>Round {round}</span>
                </p>
                <div className="flex items-center gap-1 text-xs text-dim">
                  {deadline !== null ? <span>Due {moment(deadline)}</span> : null}
                  {league.organizer && league.published ? (
                    <Button variant="ghost" size="xs" onClick={() => setEditing(round)} aria-label={`Deadline for round ${round}`}>
                      <CalendarClock /> {deadline === null ? 'Set deadline' : 'Change'}
                    </Button>
                  ) : null}
                </div>
              </div>
              <ol className="divide-y divide-edge">
                {league.fixtures
                  .filter((fixture) => fixture.round === round)
                  .map((fixture) => (
                    <FixtureRow
                      key={fixture.table}
                      fixture={fixture}
                      name={playerName}
                      viewerId={viewerId}
                      waiting={unsealed(fixture.aId) || unsealed(fixture.bId)}
                      overdue={leagueFixtureOverdue(fixture.status, deadline, now)}
                      pending={play.isPending}
                      onPlay={(opponentId) => fixture.key && play.mutate({ opponentIds: [opponentId], fixture: fixture.key })}
                      onScore={
                        league.organizer && fixture.key
                          ? async (vp, missionPackId) => {
                              await reportFixtureResult({ data: { token: group.token, fixture: fixture.key, vp, missionPackId } })
                              await refresh()
                            }
                          : null
                      }
                    />
                  ))}
              </ol>
            </div>
          )
        })}
      </div>
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
  waiting,
  overdue,
  pending,
  onPlay,
  onScore,
}: {
  fixture: Fixture
  name: (userId: string) => ReactNode
  viewerId: string | null
  /** Whether a player's sealed list was unsealed, so the game waits for its replacement. */
  waiting: boolean
  overdue: boolean
  pending: boolean
  onPlay: (opponentId: string) => void
  /** How an organizer records a game played without tracking it here, or null for anyone else. */
  onScore: ((vp: [number, number], missionPackId: string | null) => Promise<unknown>) | null
}) {
  const own = fixture.aId === viewerId || fixture.bId === viewerId
  const opponent = fixture.aId === viewerId ? fixture.bId : fixture.aId
  const { battle, status } = fixture
  return (
    <li
      data-fixture={fixture.table}
      className={`flex min-h-12 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 last:rounded-b-xl ${own ? 'bg-parchment/5' : ''} ${status === 'void' ? 'text-faint' : ''}`}
    >
      <span className="min-w-0 flex-[1_1_10rem] font-semibold break-words">
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
        <Link
          to="/battles/$token"
          params={{ token: battle.token }}
          className="readout shrink-0 text-sm font-semibold text-bone hover:text-parchment"
        >
          {status === 'finished' ? `${battle.scores[0]} – ${battle.scores[1]}` : battle.status === 'playing' ? 'Playing' : 'Setting up'}
        </Link>
      ) : fixture.key && waiting ? (
        <span className="shrink-0 text-sm text-faint">Waiting for a list</span>
      ) : own && opponent && fixture.key ? (
        <Button size="sm" disabled={pending} onClick={() => onPlay(opponent)}>
          <Swords /> Start battle
        </Button>
      ) : fixture.key ? (
        <span className="shrink-0 text-sm text-faint">Not started</span>
      ) : null}
      {onScore && fixture.bId && (status === 'open' || status === 'playing') ? (
        <EnterScore
          title={`Round ${fixture.round}, game ${fixture.table} score`}
          label={`Enter score for round ${fixture.round}, game ${fixture.table}`}
          description="For a game that wasn’t tracked here. It counts for the league table but not the leaderboard."
          names={[name(fixture.aId), name(fixture.bId)]}
          save={onScore}
        />
      ) : null}
    </li>
  )
}

/** The chess clock every fixture plays to, which only organizers set; a league without one leaves it to each table. */
function LeagueClock({ group, league }: { group: Group; league: League }) {
  const [editing, setEditing] = useState(false)
  const minutes = league.clockLimitMinutes
  if (!minutes && !league.organizer) return null
  return (
    <div data-league-clock className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
      <span>{minutes ? `Chess clock: ${clockLimitLabel(minutes)}.` : 'Each table sets its own chess clock.'}</span>
      {league.organizer ? (
        <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
          <Timer /> {minutes ? 'Change' : 'Set chess clock'}
        </Button>
      ) : null}
      {editing ? <ClockDialog group={group} minutes={minutes} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}

function ClockDialog({ group, minutes, onClose }: { group: Group; minutes: number | null; onClose: () => void }) {
  const refresh = useGroupRefresh(group.token)
  const [value, setValue] = useState(minutes)
  const save = useMutation({
    mutationFn: () => setGroupLeagueClock({ data: { token: group.token, minutes: value } }),
    onSettled: refresh,
    onSuccess: onClose,
  })
  return (
    <ConfirmDialog
      title="League chess clock"
      description="Every fixture that hasn’t started plays to it, and its players can’t change it."
      cancel="Cancel"
      confirm="Save chess clock"
      pendingLabel="Saving…"
      pending={save.isPending}
      error={save.error}
      onClose={onClose}
      onConfirm={() => save.mutate()}
    >
      <ClockLimitChoice
        value={value}
        none={{ name: 'Players choose', detail: 'Each table sets its own' }}
        disabled={save.isPending}
        onChange={setValue}
      />
    </ConfirmDialog>
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
