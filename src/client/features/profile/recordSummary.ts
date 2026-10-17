import type { ServiceRecord } from '../../../core/serviceRecord'
import { countLabel, formatList } from '../../text'

/**
 * The one-line answer to "who is this player", in words rather than a dash-run.
 *
 * `8–2–1` reads as a score to anybody who has not been told the order. The counts
 * are broken out properly by the record below; this only has to be readable.
 */
export function recordSummary(record: ServiceRecord) {
  if (!record.battles) return 'No finished battles to show.'
  const parts = [
    countLabel(record.won, 'win'),
    countLabel(record.lost, 'loss', 'losses'),
    ...(record.drawn ? [countLabel(record.drawn, 'draw')] : []),
  ]
  return `${formatList(parts)} from ${countLabel(record.battles, 'battle')}.`
}
