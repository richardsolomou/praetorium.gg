import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { leagueFixtureOverdue, leagueFixtureUnfinished } from '../../../core/groupLeague'
import type { GroupSummary } from '../../../core/groupSummary'
import { type BattleOutcome, type Standing } from '../../../core/standings'
import { battleOutcomeStage } from '../../battleStage'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { ProgressBar } from '../../components/ProgressBar'
import { SectionHeading } from '../../components/SectionHeading'
import { useDateFormatting, useMoment } from '../../dates'
import { nameColour } from '../../playerName'
import { groupPastLeaguesQuery, type groupLeagueQuery, type groupStandingsQuery, type QueryData } from '../../queries'
import { countLabel, formatList } from '../../text'
import type { Battle } from '../battles/battle'
import { BattleLines, ResultLetter } from '../battles/BattleLines'
import { leagueOutcome, type Group, type GroupTab } from './group'

type GroupTable = NonNullable<QueryData<typeof groupStandingsQuery>>
type League = NonNullable<QueryData<typeof groupLeagueQuery>>
type Member = Group['members'][number]

const STANDINGS_SHOWN = 5

function AllLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children} <ArrowRight />
    </Button>
  )
}

/** How much the group plays and with what, before anyone's place in it. */
export function GroupAtAGlance({ token, table }: { token: string; table: GroupTable }) {
  const { summary } = table
  if (!table.finished && !summary.live) return null
  const figures = [
    ['Games played', table.finished],
    ['Last 30 days', summary.recent],
    ['Active players', summary.active],
  ] as const
  return (
    <section aria-label="The group at a glance" data-group-glance className="part">
      <dl className="grid grid-cols-3 divide-x divide-edge">
        {figures.map(([label, value]) => (
          <div key={label} className="px-3 py-3 sm:px-4">
            <dt className="eyebrow text-dim">{label}</dt>
            <dd className="figure mt-1 text-2xl leading-none font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.live ? (
        <Link
          to="/groups/$token"
          params={{ token }}
          search={{ tab: 'battles', status: 'playing', period: '7d' }}
          className="flex min-h-11 items-center justify-between gap-3 border-t border-edge px-3 py-2 text-sm transition-colors hover:bg-raised sm:px-4"
        >
          <span className="flex items-center gap-2 font-bold text-parchment">
            <span aria-hidden className="line-segment w-3.5 [--line-colour:currentColor]" data-line="now" />
            {countLabel(summary.live, 'battle')} in play this week
          </span>
          <span className="flex items-center gap-1 text-dim">
            Watch <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      ) : null}
      {summary.factions.length ? (
        <div className="border-t border-edge px-3 py-3 sm:px-4">
          <p className="eyebrow text-dim">Most played</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {summary.factions.map(({ faction, seats }) => (
              <li key={faction.slug} className="flex min-w-0 items-center gap-1.5 text-sm">
                <FactionMark faction={faction} size="sm" />
                <span className="truncate">{faction.displayName}</span>
                <span className="readout text-xs text-faint">{seats}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/** The head of the leaderboard, and the reader's own row when it falls below it. */
export function StandingsSnapshot({ table, viewerId, onAll }: { table: GroupTable; viewerId: string | null; onAll: () => void }) {
  const rows = table.table.rows
  if (!rows.length) return null
  const head = rows.slice(0, STANDINGS_SHOWN)
  const own = rows.find((row) => row.id === viewerId)
  const shown = own && !head.includes(own) ? [...head, own] : head
  const place = new Map(rows.map((row, index) => [row.id, index + 1]))
  return (
    <section data-group-standings>
      <SectionHeading title="Standings" action={<AllLink onClick={onAll}>Leaderboard</AllLink>} />
      <ol className="divide-y divide-edge part">
        {shown.map((row) => (
          <StandingRow key={row.id} row={row} place={place.get(row.id)} form={table.summary.form[row.id] ?? []} you={row.id === viewerId} />
        ))}
      </ol>
    </section>
  )
}

function StandingRow({ row, place, form, you }: { row: Standing; place?: number; form: readonly BattleOutcome[]; you: boolean }) {
  return (
    <li className={cn('flex min-h-14 min-w-0 items-center gap-3 px-3 py-2', you && 'bg-raised')}>
      <span className="figure w-6 shrink-0 text-center text-lg font-bold text-dim">{place ?? '–'}</span>
      <Link to="/users/$userId" params={{ userId: row.id }} className="group flex min-w-0 flex-1 items-center gap-2.5">
        <PlayerAvatar name={row.name} image={row.image} className="size-8 shrink-0 text-2xs" />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-bold group-hover:underline" style={nameColour(row)}>
              {row.name}
            </span>
            {you ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
          </span>
          <span className="block text-xs text-dim">
            {recordLabel(row)} · {countLabel(row.battles, 'game')}
          </span>
        </span>
      </Link>
      <Form outcomes={form} />
      <span className="w-14 shrink-0 text-right">
        <span className="figure block text-lg leading-none font-bold">{place ? row.rating : '—'}</span>
        <span className="text-2xs text-faint">{place ? 'Rating' : 'Unplaced'}</span>
      </span>
    </li>
  )
}

/** Latest results newest first, read left to right like a form guide. */
function Form({ outcomes }: { outcomes: readonly BattleOutcome[] }) {
  if (!outcomes.length) return null
  return (
    <span
      className="hidden shrink-0 gap-1 sm:flex"
      aria-label={`Latest results: ${outcomes.map((outcome) => battleOutcomeStage(outcome).name).join(', ')}`}
    >
      {outcomes.map((outcome, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- A form guide's slots are positions: the newest result is always first.
        <ResultLetter key={index} outcome={outcome} />
      ))}
    </span>
  )
}

const LEAGUE_ROWS_SHOWN = 3

/** Won, drawn and lost, in the order every results table reads them. */
const recordLabel = ({ won, drawn, lost }: { won: number; drawn: number; lost: number }) => `${won}–${drawn}–${lost}`

/** The league tab in brief: a running league's progress and top of its table, a draft still taking players, and past leagues. */
export function LeagueOverview({
  token,
  league,
  members,
  now,
  onShow,
}: {
  token: string
  league: League | null | undefined
  members: readonly Member[]
  now: number
  onShow: (tab: GroupTab) => void
}) {
  const moment = useMoment()
  const { data: past } = useQuery(groupPastLeaguesQuery(token))
  const byId = new Map(members.map((member) => [member.userId, member]))
  const withdrawn = new Set(league?.players.filter((player) => player.withdrawn).map((player) => player.userId))
  const games = league?.published ? league.fixtures.filter((fixture) => fixture.status !== 'bye' && fixture.status !== 'void') : []
  const forming = league?.published === false
  if (!games.length && !forming && !past?.length) return null
  const played = games.filter((fixture) => fixture.status === 'finished').length
  const rounds = Math.max(0, ...games.map((fixture) => fixture.round))
  const round = games
    .filter((fixture) => leagueFixtureUnfinished(fixture.status))
    .reduce((low, fixture) => Math.min(low, fixture.round), Infinity)
  const deadline = Number.isFinite(round) ? (league?.deadlines[round - 1] ?? null) : null
  const overdue = games.filter((fixture) => leagueFixtureOverdue(fixture.status, league?.deadlines[fixture.round - 1] ?? null, now)).length
  const leaders = played ? (league?.table.slice(0, LEAGUE_ROWS_SHOWN) ?? []) : []
  return (
    <section data-group-league-overview>
      <SectionHeading
        title="League"
        detail={
          forming ? (
            <span className="chip">Forming</span>
          ) : games.length && !league?.complete ? (
            <span className="chip border-parchment/60 text-parchment">In progress</span>
          ) : null
        }
        action={
          <AllLink onClick={() => onShow('league')}>{league?.complete ? 'Final table' : games.length ? 'Fixtures' : 'League'}</AllLink>
        }
      />
      <div className="divide-y divide-edge part">
        {games.length ? (
          <div className="p-4">
            <ProgressBar
              label="League games played"
              value={played}
              max={games.length}
              status={
                <>
                  <span className="font-bold text-bone">{Number.isFinite(round) ? `Round ${round} of ${rounds}` : 'League complete'}</span>
                  {' · '}
                  {played} of {countLabel(games.length, 'game')} played
                  {overdue ? (
                    <>
                      {' · '}
                      <span className="text-discarded">{overdue} overdue</span>
                    </>
                  ) : deadline !== null && deadline > now ? (
                    ` · due ${moment(deadline)}`
                  ) : (
                    ''
                  )}
                </>
              }
            />
          </div>
        ) : null}
        {leaders.length ? (
          <ol aria-label="Top of the league table" className="divide-y divide-edge">
            {leaders.map((row, index) => {
              const member = byId.get(row.userId)
              return (
                <li key={row.userId} className="flex min-h-11 min-w-0 items-center gap-3 px-4 py-2 text-sm">
                  <span className="figure w-4 shrink-0 text-center font-bold text-dim">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-bold" style={nameColour({ id: row.userId, colour: member?.colour })}>
                    {member?.name ?? 'A former member'}
                    {withdrawn.has(row.userId) ? <span className="font-normal text-dim"> (withdrawn)</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-dim">{recordLabel(row)}</span>
                  <span className="figure w-14 shrink-0 text-right font-bold">{countLabel(row.points, 'pt')}</span>
                </li>
              )
            })}
          </ol>
        ) : null}
        {forming ? (
          <p className="p-4 text-sm text-dim">
            <span className="font-bold text-bone">A league is forming.</span>{' '}
            {league.players.length ? `${countLabel(league.players.length, 'player')} joined so far` : 'Nobody has joined yet'}; once it’s
            published, everyone plays everyone once.
          </p>
        ) : null}
        {league?.complete ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-dim">
            <Trophy aria-hidden className="size-4 shrink-0 text-parchment" />
            <span>
              <span className="font-bold text-bone">{leagueOutcome(league)}.</span> The table is final.
            </span>
          </p>
        ) : null}
        {past?.length ? (
          <p className="px-4 py-3 text-sm text-dim">
            {countLabel(past.length, 'past league')}, the latest ended {moment(past[0]!.endedAt)}
            {past[0]!.winners.length ? ` and ${formatList(past[0]!.winners)} ${past[0]!.winners.length > 1 ? 'shared it' : 'won it'}` : ''}.
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** The pairs of members who have played each other most, and how it stands between them. */
export function HeadToHead({ summary, members }: { summary: GroupSummary; members: readonly Member[] }) {
  if (!summary.rivalries.length) return null
  const byId = new Map(members.map((member) => [member.userId, member]))
  const player = (id: string, mirrored = false) => {
    const member = byId.get(id)
    const name = member?.name ?? 'A former member'
    return (
      <Link
        to="/users/$userId"
        params={{ userId: id }}
        className={cn('group flex min-w-0 items-center gap-2', mirrored && 'flex-row-reverse text-right')}
      >
        <PlayerAvatar name={name} image={member?.image ?? null} className="hidden size-7 shrink-0 text-3xs sm:flex" />
        <span className="truncate text-sm font-bold group-hover:underline" style={nameColour({ id, colour: member?.colour })}>
          {name}
        </span>
      </Link>
    )
  }
  return (
    <section data-group-rivalries>
      <SectionHeading title="Head to head" />
      <ul className="divide-y divide-edge part">
        {summary.rivalries.map((rivalry) => (
          <li
            key={`${rivalry.a}-${rivalry.b}`}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2.5"
          >
            {player(rivalry.a)}
            <span className="text-center">
              <span className="figure block text-lg leading-none font-bold whitespace-nowrap">
                <span className={rivalry.aWon < rivalry.bWon ? 'text-dim' : undefined}>{rivalry.aWon}</span>
                <span className="px-1 text-faint">–</span>
                <span className={rivalry.bWon < rivalry.aWon ? 'text-dim' : undefined}>{rivalry.bWon}</span>
              </span>
              <span className="text-2xs text-faint">
                {rivalry.drawn ? `${countLabel(rivalry.drawn, 'draw')} · ` : ''}
                {countLabel(rivalry.battles, 'game')}
              </span>
            </span>
            {player(rivalry.b, true)}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The latest finished battles as one line each; the Battles tab holds the full cards. */
export function RecentResults({
  table,
  member,
  quiet,
  label,
  onAll,
}: {
  table: GroupTable
  member: boolean
  /** Whether nothing else is on, with no open hidden-list game to show above. */
  quiet: boolean
  label: (battle: Battle) => string
  onAll: () => void
}) {
  const { date } = useDateFormatting()
  if (!table.recent.length)
    return quiet && !table.active.length ? (
      <section>
        <SectionHeading title="Recent results" />
        <p className="text-sm text-dim">
          {member ? 'No games yet. Start the first with New game.' : 'No games yet. Members’ games show up here.'}
        </p>
      </section>
    ) : null
  return (
    <section data-group-recent>
      <SectionHeading
        title="Recent results"
        action={table.finished > table.recent.length ? <AllLink onClick={onAll}>All games</AllLink> : null}
      />
      <BattleLines
        battles={table.recent}
        detail={(battle) => `${label(battle)}${table.games[battle.token] ? '' : ` · ${date(battle.lastActivity)}`}`}
      />
    </section>
  )
}
