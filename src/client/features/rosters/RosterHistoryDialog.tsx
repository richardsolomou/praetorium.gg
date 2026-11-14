import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History, Lock, Swords } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { sameRoster } from '../../../core/rosterDifferences'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { useDateFormatting } from '../../dates'
import type { rosterHistory } from '../../functions'
import { rosterHistoryQuery } from '../../queries'
import { RosterDifferenceChips, RosterDifferenceList, type VariantSetup } from './RosterDifferences'
import { PROBLEM_LABEL } from './RosterSummary'

type History = Awaited<ReturnType<typeof rosterHistory>>
type Version = History['versions'][number]

const STATUS: Record<string, string> = { setup: 'Setting up', playing: 'In progress', finished: 'Finished' }

/**
 * The list as each earlier sitting left it, against the list as it stands, with the copies its battles and sealed events
 * froze between them, newest first on one runner.
 */
export function RosterHistoryDialog({
  rosterId,
  ownerId,
  setup,
  now,
  open,
  onClose,
}: {
  rosterId: string
  ownerId: string
  /** The list as it stands, which every version's changes are drawn as. */
  setup: VariantSetup
  /** The list's total as the builder prices it now. */
  now: { points: number | null | undefined; budget: number }
  open: boolean
  onClose: () => void
}) {
  const history = useQuery({ ...rosterHistoryQuery(rosterId), enabled: open })
  const { date } = useDateFormatting()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Each time you come back and change this list, the version you left is kept here, priced with today’s points for its rules
            version.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {history.isPending ? (
            <ul aria-label="Loading history" aria-busy="true" className="runner gap-2">
              {[0, 1, 2].map((key) => (
                <li key={key}>
                  <Skeleton className="h-14 rounded-xl" />
                </li>
              ))}
            </ul>
          ) : history.isError ? (
            <Problem>Could not load this roster’s history. Try again.</Problem>
          ) : (
            <Timeline history={history.data} rosterId={rosterId} ownerId={ownerId} setup={setup} now={now} date={date} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Timeline({
  history,
  rosterId,
  ownerId,
  setup,
  now,
  date,
}: {
  history: History
  rosterId: string
  ownerId: string
  setup: VariantSetup
  now: { points: number | null | undefined; budget: number }
  date: (at: number) => string
}) {
  const entries: { at: number; key: string; node: ReactNode }[] = [
    ...history.versions.map((version) => ({
      at: version.savedAt,
      key: `version:${version.savedAt}`,
      node: <VersionEntry version={version} setup={setup} date={date} />,
    })),
    ...history.battles.map((battle) => ({
      at: battle.createdAt,
      key: `battle:${battle.token}`,
      node: (
        <CopyEntry
          icon={<Swords />}
          title={`Battle · ${STATUS[battle.status] ?? battle.status}`}
          detail={battle.name === history.name ? date(battle.createdAt) : `${date(battle.createdAt)} · as ${battle.name}`}
          points={battle.points}
          link={
            <Link to="/rosters/$id" params={{ id: rosterId }} search={{ battle: battle.token }}>
              View army
            </Link>
          }
        />
      ),
    })),
    ...history.events.map((event) => ({
      at: event.sealedAt ?? 0,
      key: `event:${event.eventToken}`,
      node: (
        <CopyEntry
          icon={<Lock />}
          title={event.title}
          detail={event.sealedAt === null ? 'Sealed' : `Sealed · ${date(event.sealedAt)}`}
          points={event.points}
          link={
            <Link to="/rosters/$id" params={{ id: ownerId }} search={{ sealedEvent: event.token, event: event.eventToken }}>
              View sealed list
            </Link>
          }
        />
      ),
    })),
  ].sort((left, right) => right.at - left.at)

  return (
    <div className="space-y-4">
      {history.versions.length ? null : (
        <p className="flex items-start gap-2 text-sm text-dim">
          <History className="mt-0.5 size-4 shrink-0" aria-hidden />
          No earlier versions yet. Edits you make in one sitting count as one, so the list you leave is kept the next time you change it.
        </p>
      )}
      <ol className="runner gap-2" data-roster-history>
        <li data-gate="current" className="flex min-h-9 items-center justify-between gap-3 px-4 text-sm font-semibold">
          Now
          <Points points={now.points ?? null} budget={now.budget} />
        </li>
        {entries.map(({ key, node }) => (
          <li key={key}>{node}</li>
        ))}
      </ol>
    </div>
  )
}

function Points({ points, budget }: { points: number | null; budget?: number }) {
  return (
    <span className="readout shrink-0 text-sm font-semibold text-bone">
      {points ?? '—'}
      {budget === undefined ? ' pts' : <span className="font-normal text-dim">/{budget}</span>}
    </span>
  )
}

function VersionEntry({ version, setup, date }: { version: Version; setup: VariantSetup; date: (at: number) => string }) {
  const { changes } = version
  return (
    <article className="part space-y-2 px-4 py-3" data-roster-version>
      <header className="flex min-w-0 items-baseline gap-2">
        <h3 className="min-w-0 flex-1 truncate font-sans text-sm font-bold normal-case">{version.name || 'Unnamed roster'}</h3>
        {version.problem ? <span className="shrink-0 text-xs font-semibold text-destructive">{PROBLEM_LABEL[version.problem]}</span> : null}
        <Points points={version.points} budget={version.budget} />
      </header>
      <p className="text-xs text-dim">Saved {date(version.savedAt)}</p>
      {sameRoster(changes) ? null : (
        <div className="space-y-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            <span>Since then</span>
            <RosterDifferenceChips differences={changes} setup={setup} />
          </p>
          {changes.added.length || changes.removed.length ? <RosterDifferenceList differences={changes} /> : null}
        </div>
      )}
    </article>
  )
}

function CopyEntry({
  icon,
  title,
  detail,
  points,
  link,
}: {
  icon: ReactNode
  title: string
  detail: string
  points: number | null
  link: ReactNode
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-xl border border-edge px-4 py-2.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-dim">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-xs text-dim">{detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {points === null ? null : <Points points={points} />}
        <span className="text-xs font-semibold text-info hover:text-bone">{link}</span>
      </span>
    </article>
  )
}
