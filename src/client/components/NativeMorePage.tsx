import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Gavel, House, Medal, MessageSquareWarning, ShieldCheck, Trophy, Users, type LucideIcon } from 'lucide-react'
import { meQuery } from '../queries'
import { PageContent, PageHeader } from './Page'

type MoreLink = { description: string; icon: LucideIcon; label: string; to: '/' | '/leaderboard' | '/leagues' | '/rules' }

const MORE_LINKS: readonly MoreLink[] = [
  { description: 'Live battles and activity', icon: House, label: 'Home', to: '/' },
  { description: 'Organized play', icon: Trophy, label: 'Leagues', to: '/leagues' },
  { description: 'Player standings', icon: Medal, label: 'Leaderboard', to: '/leaderboard' },
  { description: 'Game reference', icon: Gavel, label: 'Rules', to: '/rules' },
]

export function NativeMorePage() {
  const { data: me } = useQuery(meQuery())
  const secondaryClass =
    'flex min-h-13 items-center gap-3 border border-edge bg-panel px-4 py-3 font-semibold hover:border-info hover:bg-raised'

  return (
    <main className="w-full bg-sunken">
      <PageHeader eyebrow="Application" title="More" />
      <PageContent className="grid content-start gap-8">
        <section aria-labelledby="more-navigation-heading">
          <h2 id="more-navigation-heading" className="eyebrow mb-3 text-dim">
            Explore
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MORE_LINKS.map(({ description, icon: Icon, label, to }) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-28 flex-col justify-between border border-edge bg-panel p-3 text-bone hover:border-info hover:bg-raised"
              >
                <Icon className="size-6 text-info" />
                <span>
                  <span className="block font-semibold uppercase">{label}</span>
                  <span className="mt-0.5 block text-xs text-dim">{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="more-other-heading">
          <h2 id="more-other-heading" className="eyebrow mb-3 text-dim">
            Other
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {me ? (
              <Link to="/friends" className={secondaryClass}>
                <Users className="size-5 text-info" /> Friends
              </Link>
            ) : null}
            {me?.role === 'admin' ? (
              <Link to="/admin" className={secondaryClass}>
                <ShieldCheck className="size-5 text-info" /> Admin
              </Link>
            ) : null}
            <a href="https://github.com/richardsolomou/praetorium.gg/issues" target="_blank" rel="noreferrer" className={secondaryClass}>
              <MessageSquareWarning className="size-5 text-info" /> Feedback
            </a>
          </div>
        </section>
      </PageContent>
    </main>
  )
}
