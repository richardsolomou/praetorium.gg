import { SectionHeading } from '../../components/SectionHeading'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { decodeSimulatorState } from '../../../contracts/simulatorState'
import { FactionMark } from '../../components/FactionMark'
import { factionIndexQuery } from '../../queries'
import { useMatchupHistory } from './matchupHistory'
import { OwnerAvatars, useRosterOwners } from './rosterOwners'

/** The player's latest pairings in a row that scrolls, each reopening in the simulator. */
export function RecentSimulations({ onOpen }: { onOpen?: (shared: string) => void }) {
  const { recent, forget } = useMatchupHistory()
  const ownerOf = useRosterOwners()
  const { data: index } = useQuery({ ...factionIndexQuery(), enabled: recent.length > 0 })
  if (!recent.length) return null
  const mark = (catalogueId: string | undefined) => {
    if (!catalogueId) return null
    const faction = index?.factions.find((candidate) => candidate.id === catalogueId)
    return (
      <FactionMark
        faction={{ slug: faction?.slug ?? catalogueId, displayName: faction?.displayName ?? '', icon: faction?.icon ?? null }}
        size="sm"
      />
    )
  }
  return (
    <section aria-label="Recent simulations" className="min-w-0">
      <SectionHeading title="Recent simulations" count={recent.length} />
      {/* A row bleeds to the window on a phone, so the cut-off card reads as a scroller. */}
      <ul className="-mx-3 flex snap-x overflow-x-auto border-y border-edge px-3 sm:mx-0 sm:px-0">
        {recent.map((entry) => {
          const [attacker, defender] = decodeSimulatorState(entry.shared)?.sides ?? []
          return (
            <li
              key={entry.shared}
              className="group relative w-64 shrink-0 snap-start border-edge transition-colors not-last:border-r hover:bg-raised"
            >
              <Link
                to="/simulator"
                search={{ s: entry.shared }}
                aria-label={`${entry.attacker} vs ${entry.defender}`}
                className="grid gap-1.5 py-2.5 pr-9 pl-3 text-sm"
                onClick={(event) => {
                  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  // `surface` stays on the event so earlier insights that split by it still read.
                  posthog.capture('combat_simulator_recent_opened', { surface: 'simulator' })
                  if (onOpen) {
                    event.preventDefault()
                    onOpen(entry.shared)
                  }
                }}
              >
                {[
                  { role: 'attacker', side: attacker, name: entry.attacker, tone: 'font-medium text-bone' },
                  { role: 'defender', side: defender, name: entry.defender, tone: 'text-dim' },
                ].map(({ role, side, name, tone }) => {
                  const owner = ownerOf(side?.roster)
                  return (
                    <span key={role} className="flex min-w-0 items-start gap-2">
                      {mark(side?.catalogueId)}
                      <span className={`line-clamp-2 min-w-0 flex-1 break-words ${tone}`} title={name}>
                        {name}
                      </span>
                      {owner ? (
                        <span title={owner.name}>
                          <OwnerAvatars owners={[owner]} />
                        </span>
                      ) : null}
                    </span>
                  )
                })}
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
