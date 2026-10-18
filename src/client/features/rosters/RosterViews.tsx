import { Link } from '@tanstack/react-router'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'
import type { RosterAudience } from '../../../core/rosterDiscovery'

export type RosterView = 'mine' | RosterAudience

const VIEWS: readonly [RosterView, string][] = [
  ['mine', 'Mine'],
  ['friends', 'Friends'],
  ['public', 'Public'],
]

/** The rosters page tabs, the same for a visitor, whose Friends tab says what an account adds. */
export function RosterViews({ view }: { view: RosterView }) {
  return (
    <nav aria-label="Rosters" className={pageLinkTabsClass}>
      {VIEWS.map(([section, label]) => (
        <Link
          key={section}
          to="/rosters"
          search={section === 'mine' ? {} : { view: section }}
          aria-current={view === section ? 'page' : undefined}
          className={pageLinkTabClass(view === section)}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
