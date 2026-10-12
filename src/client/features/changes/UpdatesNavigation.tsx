import { Link } from '@tanstack/react-router'

export function UpdatesNavigation({ current }: { current: 'app' | 'data' }) {
  return (
    <nav aria-label="Updates" className="flex gap-6">
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
          className={`min-h-11 content-center border-b-2 text-sm font-semibold ${current === section ? 'border-parchment text-parchment' : 'border-transparent text-dim hover:border-edge-strong hover:text-bone'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
