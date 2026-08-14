import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
  const [filter, setFilter] = useState<'all' | 'cp'>('all')

  if (!entries?.length) return <p className="mt-3 text-xs text-dim">Nothing has happened yet.</p>

  const visible = filter === 'cp' ? entries.filter(isCommandPointEntry) : entries

  return (
    <>
      <ToggleGroup
        value={[filter]}
        onValueChange={(value) => {
          if (value[0] === 'all' || value[0] === 'cp') setFilter(value[0])
        }}
        variant="outline"
        size="sm"
        className="mt-3"
        aria-label="Filter battle events"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="cp">CP only</ToggleGroupItem>
      </ToggleGroup>
      <ol className="mt-3 space-y-1">
        {visible.map((entry) => (
          <li key={entry.seq} className="flex gap-3 text-sm">
            <span className="readout w-20 shrink-0 text-right text-xs text-dim">
              {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              <span className="block text-[0.625rem] text-faint">
                {entry.round ? `R${entry.round}` : '—'} {entry.phase.slice(0, 3)}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-bone">{entry.text}</span>
          </li>
        ))}
      </ol>
      {!visible.length ? <p className="mt-3 text-xs text-dim">No command point events yet.</p> : null}
    </>
  )
}

function isCommandPointEntry(entry: { commandKind: string; text: string }) {
  return ['adjust-cp', 'use-stratagem'].includes(entry.commandKind) || /command points?|\bCP\b/i.test(entry.text)
}
