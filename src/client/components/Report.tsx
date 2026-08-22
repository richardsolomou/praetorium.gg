import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { reportQuery } from '../queries'

export type ReportPlayer = { id: string; name: string; className: string }

/** Short enough for the gutter, and still distinct from every other phase. */
const PHASE_LABELS: Record<string, string> = {
  command: 'cmd',
  movement: 'move',
  shooting: 'shoot',
  charge: 'chrg',
  fight: 'fight',
  end: 'end',
}

const NO_PLAYERS: readonly ReportPlayer[] = []

/**
 * The account of the battle, read back out of the log.
 *
 * Nothing is stored to make this possible — the log is already a complete record,
 * so this is a rendering of it. Newest first, and windowed, because it grows all
 * game and the page refetches on every change.
 */
export function Report({ token, open, players = NO_PLAYERS }: { token: string; open: boolean; players?: readonly ReportPlayer[] }) {
  const { data: entries } = useQuery(reportQuery(token, open))
  const [filter, setFilter] = useState<'all' | 'cp'>('all')
  const visible = (filter === 'cp' ? (entries ?? []).filter(isCommandPointEntry) : (entries ?? [])).toReversed()

  if (!entries?.length) return <p className="mt-3 text-xs text-dim">Nothing has happened yet.</p>

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
      <div className="mt-3 h-96 overflow-y-auto pr-1">
        {visible.length ? (
          <ol className="w-full space-y-1">
            {visible.map((entry) => (
              <li key={entry.seq} className="flex w-full gap-3 text-sm">
                <span className="readout w-20 shrink-0 text-right text-xs text-dim">
                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span className="block text-[0.625rem] text-faint">
                    {entry.round ? `R${entry.round}` : '—'} {PHASE_LABELS[entry.phase] ?? entry.phase}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-bone">{colourNames(entry.text, players)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-dim">No command point events yet.</p>
        )}
      </div>
    </>
  )
}

/** Each player keeps one colour across both devices, so a line says who acted before you read it. */
function colourNames(text: string, players: readonly ReportPlayer[]) {
  const named = players.filter((player) => player.name).toSorted((a, b) => b.name.length - a.name.length)
  if (!named.length) return text

  const parts: (string | { key: string; name: string; className: string })[] = []
  let rest = text
  let guard = 0
  while (rest && guard++ < 100) {
    let at = -1
    let hit: ReportPlayer | null = null
    for (const player of named) {
      const found = rest.indexOf(player.name)
      if (found !== -1 && (at === -1 || found < at)) {
        at = found
        hit = player
      }
    }
    if (!hit || at === -1) break
    if (at) parts.push(rest.slice(0, at))
    parts.push({ key: `${hit.id}-${parts.length}`, name: hit.name, className: hit.className })
    rest = rest.slice(at + hit.name.length)
  }
  if (rest) parts.push(rest)

  return parts.map((part) =>
    typeof part === 'string' ? (
      part
    ) : (
      <span key={part.key} className={`font-semibold ${part.className}`}>
        {part.name}
      </span>
    ),
  )
}

function isCommandPointEntry(entry: { commandKind: string; text: string }) {
  return ['adjust-cp', 'use-stratagem'].includes(entry.commandKind) || /command points?|\bCP\b/i.test(entry.text)
}
