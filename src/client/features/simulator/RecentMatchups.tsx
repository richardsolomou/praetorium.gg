import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { forgetMatchup, useRecentMatchups } from './matchupHistory'

export function RecentMatchups({ surface, onOpen }: { surface: 'home' | 'simulator'; onOpen?: (shared: string) => void }) {
  const recent = useRecentMatchups()
  if (!recent.length) return null
  return (
    <section aria-label="Recent matchups" className="min-w-0">
      <h2 className="rubric border-b border-edge pb-2">Recent matchups</h2>
      <p className="mt-2 text-xs text-dim">Kept on this device. Reopen to calculate with the current army data.</p>
      <ul className="divide-y divide-edge border-b border-edge">
        {recent.map((entry) => (
          <li key={entry.shared} className="flex min-w-0 items-center gap-2">
            <Link
              to="/simulator"
              search={{ s: entry.shared }}
              className="min-w-0 flex-1 py-3 text-sm text-info hover:text-parchment"
              onClick={(event) => {
                if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                posthog.capture('combat_simulator_recent_opened', { surface })
                if (onOpen) {
                  event.preventDefault()
                  onOpen(entry.shared)
                }
              }}
            >
              <span className="block break-words font-bold">
                {entry.attacker} <span className="font-normal text-dim">vs</span> {entry.defender}
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={`Remove ${entry.attacker} vs ${entry.defender}`}
              onClick={() => forgetMatchup(entry.shared)}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
