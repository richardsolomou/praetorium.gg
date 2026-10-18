import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { decodeSimulatorState } from '../../../contracts/simulatorState'
import { FactionMark } from '../../components/FactionMark'
import { factionIndexQuery } from '../../queries'
import { useMatchupHistory } from './matchupHistory'

export function RecentMatchups({ surface, onOpen }: { surface: 'home' | 'simulator'; onOpen?: (shared: string) => void }) {
  const { recent, forget } = useMatchupHistory()
  const { data: index } = useQuery({ ...factionIndexQuery(), enabled: recent.length > 0 })
  if (!recent.length) return null
  const mark = (catalogueId: string | undefined) => {
    if (!catalogueId) return null
    const faction = index?.factions.find((candidate) => candidate.id === catalogueId)
    return <FactionMark id={faction?.slug ?? catalogueId} name={faction?.displayName} icon={faction?.icon ?? null} size="sm" />
  }
  return (
    <section aria-label="Recent matchups" className="min-w-0">
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Recent matchups</span>
        <span className="readout">{recent.length}</span>
      </h2>
      {/* Bleeds to the window on a phone, so the cut-off card reads as a scroller. */}
      <ul className="-mx-3 mt-3 flex snap-x gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
        {recent.map((entry) => {
          const [attacker, defender] = decodeSimulatorState(entry.shared)?.sides ?? []
          return (
            <li
              key={entry.shared}
              className="group relative w-64 shrink-0 snap-start border border-edge bg-panel transition-colors hover:border-info hover:bg-raised"
            >
              <Link
                to="/simulator"
                search={{ s: entry.shared }}
                aria-label={`${entry.attacker} vs ${entry.defender}`}
                className="grid gap-1.5 py-2.5 pr-9 pl-3 text-sm"
                onClick={(event) => {
                  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  posthog.capture('combat_simulator_recent_opened', { surface })
                  if (onOpen) {
                    event.preventDefault()
                    onOpen(entry.shared)
                  }
                }}
              >
                <span className="flex min-w-0 items-start gap-2">
                  {mark(attacker?.catalogueId)}
                  <span className="line-clamp-2 font-bold break-words text-bone" title={entry.attacker}>
                    {entry.attacker}
                  </span>
                </span>
                <span className="flex min-w-0 items-start gap-2">
                  {mark(defender?.catalogueId)}
                  <span className="line-clamp-2 break-words text-dim" title={entry.defender}>
                    {entry.defender}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="absolute top-1 right-1 grid size-8 place-items-center text-faint hover:text-bone focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Remove ${entry.attacker} vs ${entry.defender}`}
                onClick={() => forget(entry.shared)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
