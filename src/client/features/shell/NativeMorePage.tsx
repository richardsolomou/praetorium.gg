import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import {
  BookOpen,
  Boxes,
  Calculator,
  ChevronRight,
  CircleHelp,
  Gavel,
  GraduationCap,
  History,
  Layers3,
  Medal,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { meQuery } from '../../queries'
import { PageContent } from '../../components/Page'
import { openConversations, unreadReplies, useSupportTickets } from '../feedback/support'
import { countLabel } from '../../text'

type MoreLink = { description: string; icon: LucideIcon; label: string; to: LinkProps['to'] }

const TOOLS: readonly MoreLink[] = [
  { description: 'Damage and kill odds for any attack', icon: Calculator, label: 'Combat simulator', to: '/simulator' },
  { description: 'Packs, scoring and deployments', icon: BookOpen, label: 'Missions', to: '/missions' },
  { description: 'Core rules, missions and event rules', icon: Gavel, label: 'Rules', to: '/rules' },
  { description: 'Primary mission matchups', icon: Layers3, label: 'Force dispositions', to: '/force-dispositions' },
]

const COMMUNITY: readonly MoreLink[] = [
  { description: 'Your group’s games and table', icon: Users, label: 'Clubs', to: '/clubs' },
  { description: 'One-off events with sealed lists', icon: Trophy, label: 'Tournaments', to: '/tournaments' },
  { description: 'Player standings', icon: Medal, label: 'Leaderboard', to: '/leaderboard' },
]

const FRIENDS: MoreLink = { description: 'Invite friends to battles', icon: Users, label: 'Friends', to: '/friends' }

const ACCOUNT: readonly MoreLink[] = [
  { description: 'Your name, picture and account', icon: UserRound, label: 'Profile', to: '/profile' },
  { description: 'The models on your shelf', icon: Boxes, label: 'Collection', to: '/collection' },
]

const HELP: readonly MoreLink[] = [
  { description: 'Army lists, imports and battle tracking', icon: GraduationCap, label: 'Docs', to: '/docs' },
  { description: 'Changes to the app', icon: Sparkles, label: "What's new", to: '/whats-new' },
  { description: 'Points and datasheet changes', icon: History, label: 'Data updates', to: '/data-updates' },
]

const rowClass = 'flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left text-bone hover:bg-raised'

function Row({ icon: Icon, label, description }: Omit<MoreLink, 'to'>) {
  return (
    <>
      <Icon className="size-5 shrink-0 text-info" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-dim">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" />
    </>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="eyebrow mb-2 text-dim">
        {title}
      </h2>
      <div className="divide-y divide-edge border border-edge bg-panel">{children}</div>
    </section>
  )
}

function Links({ links }: { links: readonly MoreLink[] }) {
  return links.map(({ to, ...row }) => (
    <Link key={to} to={to} className={rowClass}>
      <Row {...row} />
    </Link>
  ))
}

function Tools() {
  return (
    <section aria-labelledby="more-tools-heading">
      <h2 id="more-tools-heading" className="sr-only">
        Tools
      </h2>
      <div className="grid grid-cols-2 gap-px border border-edge bg-edge sm:grid-cols-4">
        {TOOLS.map(({ to, icon: Icon, label, description }) => (
          <Link key={to} to={to} className="flex min-h-32 flex-col gap-1 bg-panel p-3 text-bone hover:bg-raised">
            <Icon className="mb-2 size-6 text-info" aria-hidden />
            <h3 className="text-lg leading-tight text-balance">{label}</h3>
            <span className="text-xs leading-snug text-dim">{description}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function NativeMorePage() {
  const { data: me } = useQuery(meQuery())
  const { tickets } = useSupportTickets()
  const unread = unreadReplies(tickets)

  return (
    <main className="w-full bg-sunken">
      <h1 className="sr-only">More</h1>
      <PageContent className="grid content-start gap-6">
        <Tools />
        <div className="grid content-start gap-6 sm:grid-cols-2">
          <Group id="more-community-heading" title="Community">
            <Links links={me ? [...COMMUNITY, FRIENDS] : COMMUNITY} />
          </Group>
          {me ? (
            <Group id="more-account-heading" title="Account">
              <Links links={ACCOUNT} />
              {me.role === 'admin' ? (
                <Link to="/admin" className={rowClass}>
                  <Row icon={ShieldCheck} label="Admin" description="Players and reported photos" />
                </Link>
              ) : null}
            </Group>
          ) : null}
          <Group id="more-help-heading" title="Help">
            <Links links={HELP} />
            <button type="button" onClick={openConversations} className={rowClass}>
              <Row
                icon={MessageSquareWarning}
                label="Feedback"
                description={
                  unread
                    ? `${countLabel(unread, 'new reply', 'new replies')} to read`
                    : 'Report a problem, suggest a change or read our replies'
                }
              />
            </button>
            <Link to="/support" className={rowClass}>
              <Row icon={CircleHelp} label="Support" description="Get help or recover your account" />
            </Link>
          </Group>
        </div>
      </PageContent>
    </main>
  )
}
