import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import type { LeagueEntryView } from '../../../core/league'
import { LEAGUE_RESULTS_BATTLE_LIMIT } from '../../../core/leagueResults'
import { leagueResultsCsv } from '../../../core/leagueResultsCsv'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'
import { downloadFile, safeFileName } from '../../downloadFile'
import { nativeBridgeVersion } from '../../nativeBridge'
import { useCopyText } from '../../useCopyText'

/**
 * An event's table from its finished battles: in open play wins, then draws, then victory points; in Swiss rounds
 * match points, then victory points, then strength of schedule.
 *
 * Narrow columns let a phone show every one; anything narrower still scrolls inside the frame, as the leaderboard does.
 */
export function LeagueResults({
  event,
  rows,
  swiss = false,
  partial,
  entries,
  label,
  sample = false,
}: {
  event: string
  rows: readonly ResultRow[]
  swiss?: boolean
  partial: boolean
  entries: readonly LeagueEntryView[]
  label: (entry: LeagueEntryView) => string
  /** The sample tournament's made-up players, who have no profiles to open. */
  sample?: boolean
}) {
  const columns = swiss ? SWISS_COLUMNS : COLUMNS
  const people = new Map(entries.map((entry) => [entry.userId, entry]))
  const { copy, copied, problem } = useCopyText()
  const native = nativeBridgeVersion() !== undefined
  const exportFile = async () => {
    const csv = leagueResultsCsv({
      event,
      capturedAt: new Date(),
      partial,
      columns: columns.map((column) => column.title),
      rows: rows.flatMap((row, place) => {
        const entry = people.get(row.userId)
        return entry ? [{ place: place + 1, player: label(entry), figures: columns.map((column) => row[column.key] ?? 0) }] : []
      }),
    })
    posthog.capture('league_results_exported', { swiss, partial, players: rows.length })
    if (native) await copy(csv, { failure: 'Copy failed. Try again.', operation: 'league_results_export_copy' })
    else downloadFile(`${safeFileName(event, 'event')}-results.csv`, csv, 'text/csv;charset=utf-8')
  }
  return (
    <section data-league-results>
      <SectionHeading
        title="Results"
        action={
          <Button variant="outline" size="sm" onClick={() => void exportFile()}>
            <Download /> {native ? (copied ? 'Copied CSV' : 'Copy CSV') : 'Export CSV'}
          </Button>
        }
      />
      {problem ? <Problem className="mb-2">{problem}</Problem> : null}
      <div className="overflow-x-auto border border-edge bg-panel">
        <table className="w-full min-w-72 table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs tracking-wide text-faint uppercase">
              <th scope="col" className="w-8 px-2 py-3 font-normal sm:w-10 sm:px-3">
                #
              </th>
              <th scope="col" className="px-2 py-3 font-normal sm:px-3">
                Player
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="w-9 px-1 py-3 text-right font-normal sm:w-12 sm:px-3">
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
                  <span className="truncate font-bold uppercase">{label(entry)}</span>
                  {entry.dropped ? <span className="chip shrink-0 text-dim">Dropped</span> : null}
                </>
              )
              return (
                <tr key={row.userId} data-result={entry.name} className="border-b border-edge last:border-0">
                  <td className={`readout px-2 py-3 sm:px-3 ${place === 0 && row.played ? 'font-bold text-parchment' : 'text-faint'}`}>
                    {place + 1}
                  </td>
                  <td className="overflow-hidden px-2 py-3 sm:px-3">
                    {sample ? (
                      <div className="flex min-w-0 items-center gap-2">{player}</div>
                    ) : (
                      <Link to="/users/$userId" params={{ userId: row.userId }} className="flex min-w-0 items-center gap-2 hover:text-info">
                        {player}
                      </Link>
                    )}
                  </td>
                  {columns.map((column) => {
                    const figure = row[column.key] ?? 0
                    return (
                      <td key={column.key} className={`readout px-1 py-3 text-right sm:px-3 ${figure ? column.tint : 'text-faint'}`}>
                        {figure}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {partial ? <p className="mt-2 text-xs text-dim">{`Counts the latest ${LEAGUE_RESULTS_BATTLE_LIMIT} battles.`}</p> : null}
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

/** An open-play or Swiss result, which share every column but the ones only Swiss keeps. */
type ResultRow = { userId: string; played: number } & Partial<Record<(typeof SWISS_COLUMNS)[number]['key'], number>>

const SWISS_COLUMNS = [
  { key: 'points', short: 'Pts', title: 'Match points: 3 for a win or bye, 1 for a draw', tint: 'text-bone' },
  { key: 'won', short: 'W', title: 'Won', tint: 'text-achieved' },
  { key: 'drawn', short: 'D', title: 'Drawn', tint: 'text-dim' },
  { key: 'lost', short: 'L', title: 'Lost', tint: 'text-rust' },
  { key: 'vp', short: 'VP', title: 'Victory points', tint: 'text-info' },
  { key: 'schedule', short: 'SoS', title: 'Strength of schedule: the match points of everyone faced', tint: 'text-dim' },
] as const
