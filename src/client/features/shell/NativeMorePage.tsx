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
import { openFeedback } from '../feedback/FeedbackDialog'

type MoreLink = { description: string; icon: LucideIcon; label: string; to: LinkProps['to'] }

const REFERENCE: readonly MoreLink[] = [
  { description: 'Mission packs, scoring and deployments', icon: BookOpen, label: 'Missions', to: '/missions' },
  { description: 'Primary mission matchups', icon: Layers3, label: 'Force dispositions', to: '/force-dispositions' },
  { description: 'Core rules, missions and event rules', icon: Gavel, label: 'Rules', to: '/rules' },
  { description: 'Points and datasheet changes', icon: History, label: 'Data updates', to: '/data-updates' },
]

const PLAY: readonly MoreLink[] = [
  { description: 'Damage and kill probabilities', icon: Calculator, label: 'Combat simulator', to: '/simulator' },
  { description: 'Organized play', icon: Trophy, label: 'Leagues', to: '/leagues' },
  { description: 'Player standings', icon: Medal, label: 'Leaderboard', to: '/leaderboard' },
]

const FRIENDS: MoreLink = { description: 'Invite friends to private battles', icon: Users, label: 'Friends', to: '/friends' }

const ACCOUNT: readonly MoreLink[] = [
  { description: 'Your name, picture and account', icon: UserRound, label: 'Profile', to: '/profile' },
  { description: 'The models on your shelf', icon: Boxes, label: 'Collection', to: '/collection' },
]

const HELP: readonly MoreLink[] = [
  { description: 'Army lists, imports and battle tracking', icon: GraduationCap, label: 'Player guides', to: '/guides' },
  { description: 'Changes to the app', icon: Sparkles, label: "What's new", to: '/whats-new' },
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

export function NativeMorePage() {
  const { data: me } = useQuery(meQuery())

  return (
    <main className="w-full bg-sunken">
      <h1 className="sr-only">More</h1>
      <PageContent className="grid content-start gap-6 sm:grid-cols-2">
        <Group id="more-reference-heading" title="Reference">
          <Links links={REFERENCE} />
        </Group>
        <Group id="more-play-heading" title="Play">
          <Links links={me ? [...PLAY, FRIENDS] : PLAY} />
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
          <button type="button" onClick={openFeedback} className={rowClass}>
            <Row icon={MessageSquareWarning} label="Send feedback" description="Report a problem or suggest a change" />
          </button>
          <Link to="/support" className={rowClass}>
            <Row icon={CircleHelp} label="Support" description="Get help or recover your account" />
          </Link>
        </Group>
      </PageContent>
    </main>
  )
}
