import { Link } from '@tanstack/react-router'
import { pageLinkTabClass, PageLinkTabs } from '../../components/PageTabs'

export function UpdatesNavigation({ current }: { current: 'app' | 'data' }) {
  return (
    <PageLinkTabs label="Updates">
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
    </PageLinkTabs>
  )
}
