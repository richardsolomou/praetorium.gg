import { Link } from '@tanstack/react-router'
import { Calculator, Eye, Lock, LockOpen } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { buttonClass } from '../../components/buttonClass'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SealedEventEntryView } from '../../../core/sealedEvent'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { formatList } from '../../text'
import { useDispositionNames } from '../battle/setup/chrome'
import { entrantGroups, type SealedEvent } from './sealedEvent'

/** One person in an event: who they are, where their entry stands, and whatever the reader may do about it. */
export function EntrantRow({
  entry,
  label,
  detail,
  sealing = false,
  sample = false,
  children,
}: {
  entry: SealedEventEntryView
  label: string
  detail: ReactNode
  /** Before the reveal: a sealed roster shows as a sealed part, and a player still owing one hangs off a dashed gate. */
  sealing?: boolean
  /** A made-up player in the sample tournament, who has no profile to open. */
  sample?: boolean
  children?: ReactNode
}) {
  const sealed = sealing && entry.submitted
  // A seal status is short enough to sit beside the name on a phone.
  const basis = sealing ? 'basis-28' : 'basis-44'
  const person = (
    <>
      <PlayerAvatar name={entry.name} image={entry.image} className="size-9 text-xs" />
      <span className="min-w-0">
        <span className="block truncate font-bold uppercase group-hover:underline">{label}</span>
        {sealing ? null : <span className="block text-xs text-dim">{detail}</span>}
      </span>
    </>
  )
  const status = !sealing ? null : sealed ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-parchment/60 px-1.5 py-px text-xs font-semibold text-parchment">
      <Lock className="size-3" aria-hidden /> {detail}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-faint">
      <LockOpen className="size-3" aria-hidden /> {detail}
    </span>
  )
  return (
    <div
      data-person={entry.name}
      data-gate={entry.status === 'rejected' ? 'cut' : sealing && !entry.submitted ? 'pending' : undefined}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 part p-3"
    >
      {sample ? (
        <div className={`flex min-w-0 flex-1 items-center gap-3 ${basis}`}>{person}</div>
      ) : (
        <Link
          to="/users/$userId"
          params={{ userId: entry.userId }}
          className={`group flex min-w-0 flex-1 items-center gap-3 hover:text-info ${basis}`}
        >
          {person}
        </Link>
      )}
      {status || children ? (
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {status}
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function EntrantList({ children }: { children: ReactNode }) {
  return <div className="runner gap-2 [--gate-y:1.875rem]">{children}</div>
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

/**
 * The event's entrants split by side or pair, the same before and after the reveal, a pair named with the card it sealed
 * once the reader may see it: its own members before the reveal, everyone after.
 */
export function useEntrantGroups<T extends SealedEventEntryView>(
  sealedEvent: SealedEvent | undefined,
  accepted: readonly T[],
  label: (entry: SealedEventEntryView) => string,
) {
  const nameDisposition = useDispositionNames()
  if (!sealedEvent) return []
  return entrantGroups(sealedEvent, accepted, (members) => {
    const card = sealedEvent.entries.find((entry) => entry.userId === members[0]?.userId)?.team?.disposition
    const named = nameDisposition(card)?.name
    return [formatList(members.map(label)), named && `plays ${named}`].filter(Boolean).join(' · ')
  })
}

export function sealStatus(entry: Pick<SealedEventEntryView, 'submitted'>, revealed: boolean) {
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
    <IconAction
      tooltip="View roster"
      trigger={
        <Link
          to="/rosters/$id"
          params={{ id: userId }}
          search={{ sealedEvent: token, event: eventToken }}
          aria-label={`View ${label}’s roster`}
          className={buttonClass({ variant: 'ghost', size: 'icon-sm', className: 'text-dim hover:text-info pointer-coarse:size-11' })}
        />
      }
    >
      <Eye aria-hidden />
    </IconAction>
  )
}

/** A borderless icon with its name in a tooltip, the way entrant rows offer their actions. */
export function IconAction({ tooltip, trigger, children }: { tooltip: string; trigger: ReactElement; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export function SimulateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconAction
      tooltip={`Simulate against ${label}`}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-dim hover:text-info pointer-coarse:size-11"
          aria-label={`Simulate against ${label}`}
          onClick={onClick}
        />
      }
    >
      <Calculator aria-hidden />
    </IconAction>
  )
}
