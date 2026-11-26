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
import { RankFigure } from '../../components/RankFigure'
import { SectionHeading } from '../../components/SectionHeading'
import { useDateFormatting, useMoment } from '../../dates'
import { nameColour } from '../../playerName'
import type { groupLeagueQuery, groupStandingsQuery, QueryData } from '../../queries'
import { countLabel } from '../../text'
import type { Battle } from '../battles/battle'
import { BattleLines, ResultLetter } from '../battles/BattleLines'
import { leagueOutcome, type Group, type GroupTab } from './group'

type GroupTable = NonNullable<QueryData<typeof groupStandingsQuery>>
type League = NonNullable<QueryData<typeof groupLeagueQuery>>
type Member = Group['members'][number]

/** The overview shows the head of each list and links to its tab for the rest. */
const STANDINGS_SHOWN = 3
const RESULTS_SHOWN = 3

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
    <section aria-labelledby="group-glance" data-group-glance>
      <SectionHeading id="group-glance" title="Group stats" />
      <div className="border-y border-edge">
        <dl className="grid grid-cols-3 divide-x divide-edge">
          {figures.map(([label, value]) => (
            <div key={label} className="px-2 py-3 sm:px-4">
              <dt className="eyebrow">{label}</dt>
              <dd className="figure mt-1.5 text-3xl leading-none text-bone">{value}</dd>
            </div>
          ))}
        </dl>
        {summary.live ? (
          <Link
            to="/groups/$token"
            params={{ token }}
            search={{ tab: 'battles', status: 'playing', period: '7d' }}
            className="flex min-h-11 items-center justify-between gap-3 border-t border-edge px-2 py-2 text-sm transition-colors hover:bg-raised sm:px-4"
          >
            <span className="flex items-center gap-2 font-bold text-parchment">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
              {countLabel(summary.live, 'battle')} in play this week
            </span>
            <span className="flex items-center gap-1 text-dim">
              Watch <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        ) : null}
        {summary.factions.length ? (
          <div className="border-t border-edge px-2 py-3 sm:px-4">
            <p className="eyebrow">Most played</p>
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
      </div>
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
      <ol className="divide-y divide-edge border-y border-edge">
        {shown.map((row) => (
          <StandingRow key={row.id} row={row} place={place.get(row.id)} form={table.summary.form[row.id] ?? []} you={row.id === viewerId} />
        ))}
      </ol>
    </section>
  )
}

function StandingRow({ row, place, form, you }: { row: Standing; place?: number; form: readonly BattleOutcome[]; you: boolean }) {
  return (
    <li className={cn('flex min-h-15 min-w-0 items-center gap-3 px-2 py-2.5', you && 'bg-parchment/8')}>
      <RankFigure place={place} placed={place !== undefined} />
      <Link to="/users/$userId" params={{ userId: row.id }} className="group flex min-w-0 flex-1 items-center gap-2.5">
        <PlayerAvatar name={row.name} image={row.image} className="size-7 shrink-0 text-3xs" />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[0.9375rem] leading-tight font-bold group-hover:underline" style={nameColour(row)}>
              {row.name}
            </span>
            {you ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
          </span>
          <span className="mt-0.5 block text-2xs text-dim">
            <span className="readout font-semibold text-bone/85">{recordLabel(row)}</span> · {countLabel(row.battles, 'game')}
          </span>
        </span>
      </Link>
      <Form outcomes={form} />
      <span className="w-14 shrink-0 text-right">
        <span className="figure block text-2xl leading-none text-bone">{place ? row.rating : '—'}</span>
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

/** Won, drawn and lost, in the order every results table reads them. */
const recordLabel = ({ won, drawn, lost }: { won: number; drawn: number; lost: number }) => `${won}–${drawn}–${lost}`

/** The league in one line: a draft taking players, a running league's progress, or a finished one's result, with the way to its tab. */
export function LeagueStatus({ league, now, onShow }: { league: League | null | undefined; now: number; onShow: (tab: GroupTab) => void }) {
  const moment = useMoment()
  if (!league) return null
  const games = league.published ? league.fixtures.filter((fixture) => fixture.status !== 'bye' && fixture.status !== 'void') : []
  const played = games.filter((fixture) => fixture.status === 'finished').length
  const rounds = Math.max(0, ...games.map((fixture) => fixture.round))
  const round = games
    .filter((fixture) => leagueFixtureUnfinished(fixture.status))
    .reduce((low, fixture) => Math.min(low, fixture.round), Infinity)
  const deadline = Number.isFinite(round) ? (league.deadlines[round - 1] ?? null) : null
  const overdue = games.filter((fixture) => leagueFixtureOverdue(fixture.status, league.deadlines[fixture.round - 1] ?? null, now)).length
  const status = !league.published ? (
    <>Forming · {league.players.length ? `${countLabel(league.players.length, 'player')} joined` : 'nobody has joined yet'}</>
  ) : league.complete ? (
    <>
      <Trophy aria-hidden className="mr-1 inline size-3.5 align-[-0.125em] text-parchment" />
      {leagueOutcome(league)}
    </>
  ) : (
    <>
      Round {round} of {rounds} · {played} of {countLabel(games.length, 'game')} played
      {overdue ? (
        <>
          {' · '}
          <span className="text-discarded">{overdue} overdue</span>
        </>
      ) : deadline !== null && deadline > now ? (
        ` · due ${moment(deadline)}`
      ) : null}
    </>
  )
  return (
    <section
      data-group-league-overview
      aria-label="League"
      className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-edge py-1.5 pl-2"
    >
      <p className="min-w-0 text-sm text-dim">
        <span className="font-semibold text-bone">League</span> · {status}
      </p>
      <AllLink onClick={() => onShow('league')}>{league.complete ? 'Final table' : league.published ? 'Fixtures' : 'League'}</AllLink>
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
        <span className="truncate text-[0.9375rem] font-bold group-hover:underline" style={nameColour({ id, colour: member?.colour })}>
          {name}
        </span>
      </Link>
    )
  }
  return (
    <section data-group-rivalries>
      <SectionHeading title="Head to head" />
      <ul className="divide-y divide-edge border-y border-edge">
        {summary.rivalries.map((rivalry) => (
          <li
            key={`${rivalry.a}-${rivalry.b}`}
            className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2 py-2.5"
          >
            {player(rivalry.a)}
            <span className="text-center">
              <span className="figure block text-2xl leading-none whitespace-nowrap text-bone">
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
        action={table.finished > RESULTS_SHOWN ? <AllLink onClick={onAll}>All battles</AllLink> : null}
      />
      <BattleLines
        battles={table.recent.slice(0, RESULTS_SHOWN)}
        detail={(battle) => `${label(battle)}${table.games[battle.token] ? '' : ` · ${date(battle.lastActivity)}`}`}
      />
    </section>
  )
}
