import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  Calculator,
  ChevronRight,
  CircleHelp,
  Gavel,
  GraduationCap,
  History,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { meQuery } from '../../queries'
import { PageContent } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { openConversations, unreadReplies, useSupportTickets } from '../feedback/support'
import { countLabel } from '../../text'
import { useUnseenRelease } from './seenRelease'
import { UnseenDot, unseenLabel } from './WhatsNew'
import { COMMUNITY_LINKS, COMMUNITY_PAGES, FRIENDS_PAGE } from './CommunityLinks'
import { useUnreadNotices } from '../notifications/Notifications'
import { nameColour } from '../../playerName'

type MoreLink = { Icon: LucideIcon; label: string; to: LinkProps['to'] }
type Tool = MoreLink & { description: string }

const TOOLS: readonly Tool[] = [
  { description: 'Damage and kill odds for any attack', Icon: Calculator, label: 'Combat simulator', to: '/simulator' },
  { description: 'Packs, scoring and deployments', Icon: BookOpen, label: 'Missions', to: '/missions' },
  { description: 'Core rules, missions and event rules', Icon: Gavel, label: 'Rules', to: '/rules' },
  { description: 'Army lists, imports and battle tracking', Icon: GraduationCap, label: 'Docs', to: '/docs' },
]

const ACCOUNT: readonly MoreLink[] = [{ Icon: Boxes, label: 'Collection', to: '/collection' }]

const WHATS_NEW: MoreLink = { Icon: Sparkles, label: "What's new", to: '/whats-new' }

const HELP: readonly MoreLink[] = [{ Icon: History, label: 'Data updates', to: '/data-updates' }]

const rowClass = 'flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left text-bone transition-colors hover:bg-raised'

function Row({
  icon: Icon,
  label,
  status,
  external = false,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  status?: ReactNode
  external?: boolean
}) {
  const Trailing = external ? ArrowUpRight : ChevronRight
  return (
    <>
      <Icon className="size-4.5 shrink-0 text-dim" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      {status}
      <Trailing className="size-4 shrink-0 text-faint" aria-hidden />
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
  return links.map(({ to, Icon, label }) => (
    <Link key={to} to={to} className={rowClass}>
      <Row icon={Icon} label={label} />
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
        {TOOLS.map(({ to, Icon, label, description }) => (
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
  const unreadNotices = useUnreadNotices(Boolean(me))

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
              <span className="block truncate font-semibold" style={nameColour(me)}>
                {me.name}
              </span>
              <span className="block text-xs text-dim">Profile and account</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
          </Link>
        ) : null}
        <Tools />
        <div className="grid content-start gap-6 sm:grid-cols-2">
          <Group id="more-community-heading" title="Community">
            <Links links={me ? [...COMMUNITY_PAGES, FRIENDS_PAGE] : COMMUNITY_PAGES} />
            {COMMUNITY_LINKS.map(({ href, Icon, label }) => (
              <a key={href} href={href} target="_blank" rel="noreferrer noopener" className={rowClass}>
                <Row icon={Icon} label={label} external />
              </a>
            ))}
          </Group>
          {me ? (
            <Group id="more-account-heading" title="Your things">
              <Link to="/notifications" className={rowClass}>
                <Row
                  icon={Bell}
                  label="Notifications"
                  status={unreadNotices ? <span className="chip text-parchment">{unreadNotices} unread</span> : null}
                />
              </Link>
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
              <Row icon={WHATS_NEW.Icon} label={WHATS_NEW.label} status={unseenRelease ? <UnseenDot /> : null} />
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
