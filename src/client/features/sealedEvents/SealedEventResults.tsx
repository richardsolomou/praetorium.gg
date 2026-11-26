import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { SEALED_EVENT_RESULTS_BATTLE_LIMIT } from '../../../core/sealedEventResults'
import { sealedEventResultsCsv } from '../../../core/sealedEventResultsCsv'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { RankFigure } from '../../components/RankFigure'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'
import { safeFileName } from '../../downloadFile'
import { useExportText } from '../../useCopyText'
import { OUTLINE_TAG } from '../../components/rosterSetup'
import { nameColour } from '../../playerName'

/**
 * An event's table from its finished battles: in open play wins, then draws, then victory points; in Swiss rounds and
 * leagues match points, then victory points, then strength of schedule.
 *
 * Narrow columns let a phone show every one; anything narrower still scrolls inside the frame, as the leaderboard does.
 */
export function SealedEventResults<
  Entry extends { userId: string; name: string; image: string | null; colour?: string | null; dropped?: boolean },
>({
  event,
  rows,
  format = 'open',
  partial,
  entries,
  label,
  sample = false,
  title = 'Results',
  detail,
  actions,
}: {
  event: string
  rows: readonly ResultRow[]
  format?: keyof typeof FORMAT_COLUMNS
  partial: boolean
  entries: readonly Entry[]
  label: (entry: Entry) => string
  /** The sample tournament's made-up players, who have no profiles to open. */
  sample?: boolean
  title?: string
  /** A line under each player's name, such as the list they play. */
  detail?: (userId: string) => ReactNode
  /** What the reader can do from each player's row. */
  actions?: (userId: string) => ReactNode
}) {
  const columns = FORMAT_COLUMNS[format]
  // A team tournament's teams have no profiles to open.
  const teams = format === 'teamGames' || format === 'teamPoints'
  const people = new Map(entries.map((entry) => [entry.userId, entry]))
  const { exportText, native, copied, problem } = useExportText()
  const exportFile = async () => {
    const csv = sealedEventResultsCsv({
      event,
      capturedAt: new Date(),
      partial,
      columns: columns.map((column) => column.title),
      rows: rows.flatMap((row, place) => {
        const entry = people.get(row.userId)
        return entry ? [{ place: place + 1, player: label(entry), figures: columns.map((column) => figureOf(column, row)) }] : []
      }),
    })
    posthog.capture('sealed_event_results_exported', { swiss: format !== 'open', teams, partial, players: rows.length })
    await exportText(csv, {
      name: `${safeFileName(event, 'event')}-results.csv`,
      type: 'text/csv;charset=utf-8',
      operation: 'sealed_event_results_export_copy',
    })
  }
  return (
    <section data-sealed-event-results>
      <SectionHeading
        title={title}
        action={
          sample ? undefined : (
            <Button variant="outline" size="sm" onClick={() => void exportFile()}>
              <Download /> {native ? (copied ? 'Copied CSV' : 'Copy CSV') : 'Export CSV'}
            </Button>
          )
        }
      />
      {problem ? <Problem className="mb-2">{problem}</Problem> : null}
      <div className="overflow-x-auto border-y border-edge">
        <table className="w-full min-w-76 table-fixed border-collapse text-sm">
          <thead>
            <tr className="eyebrow border-b border-edge text-left text-dim">
              <th scope="col" className="w-10 px-1 py-2.5 font-bold sm:w-14 sm:px-3">
                #
              </th>
              <th scope="col" className="px-2 py-2.5 font-bold sm:px-3">
                {teams ? 'Team' : 'Player'}
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="w-8 px-1 py-2.5 text-right font-bold sm:w-12 sm:px-3">
                  <abbr title={column.title} className="no-underline">
                    {column.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, place) => {
              const entry = people.get(row.userId)
              if (!entry) return null
              const player = (
                <>
                  <PlayerAvatar name={entry.name} image={entry.image} className="size-7 text-3xs max-sm:hidden" />
                  {/* A phone leaves the name too narrow to cut short, so it wraps there instead. */}
                  <span
                    className="min-w-0 text-[0.9375rem] font-bold break-words sm:truncate"
                    style={nameColour({ id: entry.userId, colour: entry.colour })}
                  >
                    {label(entry)}
                  </span>
                  {entry.dropped ? <span className={`${OUTLINE_TAG} border-edge text-dim`}>Dropped</span> : null}
                </>
              )
              const line = detail?.(row.userId)
              const tools = actions?.(row.userId)
              // A player's list reads on its own row under their name, as wide as the table, so a phone never squeezes it.
              const extra = Boolean(line || tools)
              const pad = extra ? 'pt-2.5 pb-1' : 'py-2.5'
              return (
                <Fragment key={row.userId}>
                  <tr data-result={entry.name} className={extra ? '' : 'border-b border-edge last:border-0'}>
                    <td rowSpan={extra ? 2 : 1} className="px-1 py-2.5 align-middle sm:px-3">
                      <RankFigure place={place + 1} placed={row.played > 0} />
                    </td>
                    <td className={`overflow-hidden px-2 sm:px-3 ${pad}`}>
                      {sample || teams ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">{player}</div>
                      ) : (
                        <Link
                          to="/users/$userId"
                          params={{ userId: row.userId }}
                          className="group flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 hover:underline sm:flex-nowrap"
                        >
                          {player}
                        </Link>
                      )}
                    </td>
                    {columns.map((column) => {
                      const figure = figureOf(column, row)
                      return (
                        <td
                          key={column.key}
                          className={`px-1 text-right sm:px-3 ${pad} ${column.key === 'points' ? 'figure text-xl leading-none' : 'readout'} ${figure ? column.tint : 'text-faint'}`}
                        >
                          {figure}
                        </td>
                      )
                    })}
                  </tr>
                  {extra ? (
                    <tr data-result-detail={entry.name} className="border-b border-edge last:border-0">
                      <td colSpan={columns.length + 1} className="px-2 pb-1.5 sm:px-3">
                        {/* Starts under the name, past the avatar a phone leaves out. */}
                        <div className="flex min-w-0 items-center gap-2 sm:pl-9">
                          <div className="min-w-0 flex-1">{line}</div>
                          {tools ? <span className="flex shrink-0 items-center">{tools}</span> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {partial ? <p className="mt-2 text-xs text-dim">{`Counts the latest ${SEALED_EVENT_RESULTS_BATTLE_LIMIT} battles.`}</p> : null}
    </section>
  )
}

/** Each column in the tint its outcome reads in elsewhere: wins green, losses rust, victory points as a score. */
const COLUMNS = [
  { key: 'played', short: 'P', title: 'Played', tint: 'text-dim' },
  { key: 'won', short: 'W', title: 'Won', tint: 'text-achieved' },
  { key: 'drawn', short: 'D', title: 'Drawn', tint: 'text-dim' },
  { key: 'lost', short: 'L', title: 'Lost', tint: 'text-rust' },
  { key: 'points', short: 'VP', title: 'Victory points', tint: 'text-info' },
] as const

/** An open-play, Swiss or league result, which share every column but the ones only Swiss keeps. */
type ResultRow = { userId: string; played: number } & Partial<Record<(typeof SWISS_COLUMNS)[number]['key'], number>>

const SWISS_COLUMNS = [
  { key: 'points', short: 'Pts', title: 'Match points: 3 for a win or bye, 1 for a draw', tint: 'text-bone' },
  { key: 'won', short: 'W', title: 'Won', tint: 'text-achieved' },
  { key: 'drawn', short: 'D', title: 'Drawn', tint: 'text-dim' },
  { key: 'lost', short: 'L', title: 'Lost', tint: 'text-rust' },
  { key: 'vp', short: 'VP', title: 'Victory points', tint: 'text-info' },
  { key: 'schedule', short: 'SoS', title: 'Strength of schedule: the match points of everyone faced', tint: 'text-dim' },
] as const

/**
 * A league's games are played in any order, so how many results each player has is what makes their points comparable;
 * a bye counts from the start, so it counts here too. Strength of schedule stays out: once everyone has played
 * everyone, tied players have faced the same field.
 */
const LEAGUE_COLUMNS = [
  {
    key: 'results',
    short: 'P',
    title: 'Played, a bye included',
    tint: 'text-dim',
    figure: (row: ResultRow) => (row.won ?? 0) + (row.drawn ?? 0) + (row.lost ?? 0),
  },
  ...SWISS_COLUMNS.filter((column) => column.key !== 'schedule'),
] as const

/** A team's Swiss columns, its score from its games standing in for victory points as the tiebreak. */
const teamColumns = (score: { short: string; title: string }) =>
  SWISS_COLUMNS.map((column) => (column.key === 'vp' ? { ...column, ...score } : column))

const FORMAT_COLUMNS = {
  open: COLUMNS,
  swiss: SWISS_COLUMNS,
  league: LEAGUE_COLUMNS,
  teamGames: teamColumns({ short: 'GW', title: 'Games won across its meetings, a draw counting half' }),
  teamPoints: teamColumns({ short: 'VP', title: 'Victory points across its games' }),
}

type ResultColumn = { key: string; figure?: (row: ResultRow) => number }

const figureOf = (column: ResultColumn, row: ResultRow) =>
  column.figure ? column.figure(row) : ((row[column.key as keyof ResultRow] as number | undefined) ?? 0)
