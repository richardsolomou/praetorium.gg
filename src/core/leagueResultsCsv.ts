import { csv } from './csv'
import { LEAGUE_RESULTS_BATTLE_LIMIT } from './leagueResults'

type ResultsCsvRow = { place: number; player: string; figures: readonly number[] }

/** An event's results table as the reader sees it, headed by the event, when it was captured and whether it is complete. */
export function leagueResultsCsv({
  event,
  capturedAt,
  partial,
  columns,
  rows,
}: {
  event: string
  capturedAt: Date
  partial: boolean
  columns: readonly string[]
  rows: readonly ResultsCsvRow[]
}) {
  return csv([
    ['Event', event],
    ['Captured', capturedAt.toISOString()],
    ...(partial ? [['Completeness', `Only the latest ${LEAGUE_RESULTS_BATTLE_LIMIT} battles are included.`]] : []),
    [],
    ['Place', 'Player', ...columns],
    ...rows.map((row) => [row.place, row.player, ...row.figures]),
  ])
}
