import { Link } from '@tanstack/react-router'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'

export function UpdatesNavigation({ current }: { current: 'app' | 'data' }) {
  return (
    <nav aria-label="Updates" className={pageLinkTabsClass}>
      {(
        [
          ['app', '/whats-new', "What's new"],
          ['data', '/data-updates', 'Data updates'],
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
