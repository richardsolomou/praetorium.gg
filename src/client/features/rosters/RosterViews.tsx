import { Link } from '@tanstack/react-router'
import { pageLinkTabClass, PageLinkTabs } from '../../components/PageTabs'
import type { RosterAudience } from '../../../core/rosterDiscovery'

export type RosterView = 'mine' | RosterAudience | 'played' | 'winning'

const VIEWS: readonly [RosterView, string][] = [
  ['mine', 'Mine'],
  ['friends', 'Friends'],
  ['public', 'Public'],
  ['played', 'Played'],
  ['winning', 'Winning'],
]

/** The rosters page tabs, the same for a visitor, whose Friends tab says what an account adds. */
export function RosterViews({ view }: { view: RosterView }) {
  return (
    <PageLinkTabs label="Rosters">
      {VIEWS.map(([section, label]) => (
        <Link
          key={section}
          to="/rosters"
          search={section === 'mine' ? {} : { view: section }}
          activeOptions={{ exact: true }}
          aria-current={view === section ? 'page' : undefined}
          className={pageLinkTabClass(view === section)}
        >
          {label}
        </Link>
      ))}
    </PageLinkTabs>
  )
}
