import { useQuery } from '@tanstack/react-query'
import { reportQuery } from '../queries'

/**
 * The account of the battle, read back out of the log.
 *
 * Nothing is stored to make this possible — the log is already a complete record,
 * so this is a rendering of it. Fetched only when opened, since it grows all game
 * and the page refetches on every change.
 */
export function Report({ token, open }: { token: string; open: boolean }) {
  const { data: entries } = useQuery(reportQuery(token, open))

  if (!entries?.length) return <p className="mt-3 text-xs text-dim">Nothing has happened yet.</p>

  return (
    <ol className="mt-3 space-y-1">
      {entries.map((entry) => (
        <li key={entry.seq} className="flex gap-3 text-sm">
          <span className="readout w-14 shrink-0 text-right text-xs text-dim">
            {entry.round ? `R${entry.round}` : '—'} {entry.phase.slice(0, 3)}
          </span>
          <span className="min-w-0 flex-1 text-bone">{entry.text}</span>
        </li>
      ))}
    </ol>
  )
}
