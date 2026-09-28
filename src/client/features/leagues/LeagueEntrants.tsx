import { Link } from '@tanstack/react-router'
import { Eye } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { alliedLeagueRosterLimit, type LeagueEntryView } from '../../../core/league'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { League } from './leagueEvent'

export function SectionHeading({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="rubric mb-2 flex min-h-8 items-end justify-between gap-3 border-b border-edge pb-2">
      <h2 className="flex items-baseline gap-2">
        {title}
        {count === undefined ? null : <span className="readout text-faint">{count}</span>}
      </h2>
      {action}
    </div>
  )
}

/** One person in an event: who they are, where their entry stands, and whatever the reader may do about it. */
export function EntrantRow({
  entry,
  label,
  detail,
  children,
}: {
  entry: LeagueEntryView
  label: string
  detail: ReactNode
  children?: ReactNode
}) {
  return (
    <div data-person={entry.name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <Link
        to="/users/$userId"
        params={{ userId: entry.userId }}
        className="group flex min-w-0 flex-1 basis-44 items-center gap-3 hover:text-info"
      >
        <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
        <span className="min-w-0">
          <span className="block truncate font-bold uppercase group-hover:underline">{label}</span>
          <span className="block text-xs text-dim">{detail}</span>
        </span>
      </Link>
      {children ? <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">{children}</div> : null}
    </div>
  )
}

export function EntrantList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-edge border border-edge bg-panel">{children}</div>
}

/** A labelled run of entrants inside a section, such as one side of a 2v1 or one doubles team. */
export function EntrantGroup({
  group,
  title,
  detail,
  action,
  children,
}: {
  group: string
  title: string
  detail?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-group={group}>
      <div className="mb-1.5 flex min-h-8 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="eyebrow text-bone">{title}</h3>
          {detail ? <p className="text-xs text-dim">{detail}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function sealStatus(entry: Pick<LeagueEntryView, 'submitted'>, revealed: boolean) {
  if (revealed) return entry.submitted ? 'List revealed' : 'No list'
  return entry.submitted ? 'List sealed' : 'No list yet'
}

/** What each side of a 2v1 means at the table, said where the side is named rather than left to be guessed. */
export function sideGroups(league: Pick<League, 'rosterLimit'>): Record<'solo' | 'allied' | 'unsized', { title: string; detail?: string }> {
  const solo = league.rosterLimit ?? 0
  return {
    solo: { title: `Solo · ${solo.toLocaleString()} points`, detail: 'Plays alone against a pair.' },
    allied: {
      title: `Allied · ${alliedLeagueRosterLimit(solo).toLocaleString()} points`,
      detail: 'Plays beside another ally.',
    },
    unsized: { title: 'Waiting for a size' },
  }
}

export function ViewRosterButton({
  token,
  eventToken,
  userId,
  label,
}: {
  token: string
  eventToken: string
  userId: string
  label: string
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="pointer-coarse:h-11"
      nativeButton={false}
      aria-label={`View ${label}’s roster`}
      render={<Link to="/rosters/$id" params={{ id: userId }} search={{ league: token, event: eventToken }} />}
    >
      <Eye /> View roster
    </Button>
  )
}
