import type { ServiceRecord } from '../../../core/serviceRecord'

/**
 * The one-line answer to "who is this player", in words rather than a dash-run.
 *
 * `8–2–1` reads as a score to anybody who has not been told the order. The counts
 * are broken out properly by the record below; this only has to be readable.
 */
export function recordSummary(record: ServiceRecord) {
  if (!record.battles) return 'No finished battles to show.'
  const parts = [
    `${record.won} ${record.won === 1 ? 'win' : 'wins'}`,
    `${record.lost} ${record.lost === 1 ? 'loss' : 'losses'}`,
    ...(record.drawn ? [`${record.drawn} ${record.drawn === 1 ? 'draw' : 'draws'}`] : []),
  ]
  const listed = parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join(' and ')
  return `${listed} from ${record.battles} ${record.battles === 1 ? 'battle' : 'battles'}.`
}
