import { Link } from '@tanstack/react-router'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'

export function EventsTabs({ current }: { current: 'clubs' | 'tournaments' }) {
  return (
    <nav aria-label="Events" className={pageLinkTabsClass}>
      {(
        [
          ['clubs', '/clubs', 'Clubs'],
          ['tournaments', '/tournaments', 'Tournaments'],
        ] as const
      ).map(([section, to, label]) => (
        <Link
          key={section}
          to={to}
          aria-current={current === section ? 'page' : undefined}
          className={pageLinkTabClass(current === section)}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
