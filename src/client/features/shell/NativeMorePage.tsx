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
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { openConversations, unreadReplies, useSupportTickets } from '../feedback/support'
import { countLabel } from '../../text'
import { useUnseenRelease } from './seenRelease'
import { UnseenDot, unseenLabel } from './WhatsNew'

type MoreLink = { icon: LucideIcon; label: string; to: LinkProps['to'] }
type Tool = MoreLink & { description: string }

const TOOLS: readonly Tool[] = [
  { description: 'Damage and kill odds for any attack', icon: Calculator, label: 'Combat simulator', to: '/simulator' },
  { description: 'Packs, scoring and deployments', icon: BookOpen, label: 'Missions', to: '/missions' },
  { description: 'Core rules, missions and event rules', icon: Gavel, label: 'Rules', to: '/rules' },
  { description: 'Primary mission matchups', icon: Layers3, label: 'Force dispositions', to: '/force-dispositions' },
]

const COMMUNITY: readonly MoreLink[] = [
  { icon: Users, label: 'Groups', to: '/groups' },
  { icon: Trophy, label: 'Tournaments', to: '/tournaments' },
  { icon: Medal, label: 'Leaderboard', to: '/leaderboard' },
]

const FRIENDS: MoreLink = { icon: UserRound, label: 'Friends', to: '/friends' }

const ACCOUNT: readonly MoreLink[] = [{ icon: Boxes, label: 'Collection', to: '/collection' }]

const WHATS_NEW: MoreLink = { icon: Sparkles, label: "What's new", to: '/whats-new' }

const HELP: readonly MoreLink[] = [
  { icon: GraduationCap, label: 'Docs', to: '/docs' },
  { icon: History, label: 'Data updates', to: '/data-updates' },
]

const rowClass = 'flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left text-bone transition-colors hover:bg-raised'

function Row({ icon: Icon, label, status }: { icon: LucideIcon; label: string; status?: ReactNode }) {
  return (
    <>
      <Icon className="size-4.5 shrink-0 text-dim" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      {status}
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-2xs font-semibold tracking-label text-dim uppercase">
        {title}
      </h2>
      <div className="part divide-y divide-edge overflow-hidden">{children}</div>
    </section>
  )
}

function Links({ links }: { links: readonly MoreLink[] }) {
  return links.map(({ to, icon, label }) => (
    <Link key={to} to={to} className={rowClass}>
      <Row icon={icon} label={label} />
    </Link>
  ))
}

function Tools() {
  return (
    <section aria-labelledby="more-tools-heading">
      <h2 id="more-tools-heading" className="sr-only">
        Tools
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOOLS.map(({ to, icon: Icon, label, description }) => (
          <Link
            key={to}
            to={to}
            className="part flex flex-col gap-1 p-3 text-bone transition-colors hover:border-runner-hi hover:bg-raised"
          >
            <span className="flex items-start gap-2">
              <Icon className="mt-px size-4.5 shrink-0 text-parchment" aria-hidden />
              <h3 className="text-sm leading-tight text-balance">{label}</h3>
            </span>
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
  const unseenRelease = useUnseenRelease()

  return (
    <main className="w-full">
      <h1 className="sr-only">More</h1>
      <PageContent className="grid content-start gap-6">
        {me ? (
          <Link
            to="/profile"
            className="part flex items-center gap-3 p-3 text-bone transition-colors hover:border-runner-hi hover:bg-raised"
          >
            <PlayerAvatar name={me.name} image={me.image} className="size-11 shrink-0 text-base" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{me.name}</span>
              <span className="block text-xs text-dim">Profile and account</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
          </Link>
        ) : null}
        <Tools />
        <div className="grid content-start gap-6 sm:grid-cols-2">
          <Group id="more-community-heading" title="Community">
            <Links links={me ? [...COMMUNITY, FRIENDS] : COMMUNITY} />
          </Group>
          {me ? (
            <Group id="more-account-heading" title="Your things">
              <Links links={ACCOUNT} />
              {me.role === 'admin' ? (
                <Link to="/admin" className={rowClass}>
                  <Row icon={ShieldCheck} label="Admin" />
                </Link>
              ) : null}
            </Group>
          ) : null}
          <Group id="more-help-heading" title="Help">
            <Link to={WHATS_NEW.to} aria-label={unseenRelease ? unseenLabel : undefined} className={rowClass}>
              <Row icon={WHATS_NEW.icon} label={WHATS_NEW.label} status={unseenRelease ? <UnseenDot /> : null} />
            </Link>
            <Links links={HELP} />
            <button type="button" onClick={openConversations} className={rowClass}>
              <Row
                icon={MessageSquareWarning}
                label="Feedback"
                status={unread ? <span className="chip text-parchment">{countLabel(unread, 'new reply', 'new replies')}</span> : null}
              />
            </button>
            <Link to="/support" className={rowClass}>
              <Row icon={CircleHelp} label="Support" />
            </Link>
          </Group>
        </div>
      </PageContent>
    </main>
  )
}
