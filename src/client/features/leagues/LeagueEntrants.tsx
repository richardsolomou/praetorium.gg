import { Link } from '@tanstack/react-router'
import { Eye } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClass } from '../../components/buttonClass'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LeagueEntryView } from '../../../core/league'
import { PlayerAvatar } from '../../components/PlayerAvatar'

/** One person in an event: who they are, where their entry stands, and whatever the reader may do about it. */
export function EntrantRow({
  entry,
  label,
  detail,
  sample = false,
  children,
}: {
  entry: LeagueEntryView
  label: string
  detail: ReactNode
  /** A made-up player in the sample tournament, who has no profile to open. */
  sample?: boolean
  children?: ReactNode
}) {
  const person = (
    <>
      <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
      <span className="min-w-0">
        <span className="block truncate font-bold uppercase group-hover:underline">{label}</span>
        <span className="block text-xs text-dim">{detail}</span>
      </span>
    </>
  )
  return (
    <div data-person={entry.name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3">
      {sample ? (
        <div className="flex min-w-0 flex-1 basis-44 items-center gap-3">{person}</div>
      ) : (
        <Link
          to="/users/$userId"
          params={{ userId: entry.userId }}
          className="group flex min-w-0 flex-1 basis-44 items-center gap-3 hover:text-info"
        >
          {person}
        </Link>
      )}
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
  if (revealed) return entry.submitted ? 'Roster revealed' : 'No roster'
  return entry.submitted ? 'Roster sealed' : 'No roster yet'
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
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to="/rosters/$id"
            params={{ id: userId }}
            search={{ league: token, event: eventToken }}
            aria-label={`View ${label}’s roster`}
            className={buttonClass({ variant: 'ghost', size: 'icon-sm', className: 'text-dim hover:text-info pointer-coarse:size-11' })}
          />
        }
      >
        <Eye aria-hidden />
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        View roster
      </TooltipContent>
    </Tooltip>
  )
}
