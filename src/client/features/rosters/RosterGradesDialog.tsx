import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import type { RosterPick } from '../../../core/roster'
import type { Grade, GradeRow } from '../../../core/rosterGrades'
import { formatList } from '../../text'
import { rosterGradesQuery } from '../../queries'

/** Colour and line form both carry the grade: solid for A and B, dashed for C and D, so it reads without colour too. */
const GRADE_MARK: Record<Grade, string> = {
  A: 'border-achieved text-achieved',
  B: 'border-runner-hi text-bone',
  C: 'border-dashed border-runner-hi text-dim',
  D: 'border-dashed border-discarded text-discarded',
}
const UNGRADED_MARK = 'border-dotted border-runner text-faint'

const ON_THE_TABLE = new Set(['presence', 'spread', 'reach', 'deployment'])

/** What the roster can do on the table, graded row by row; it asks the server only while open. */
export function RosterGradesDialog({
  open,
  onClose,
  name,
  setup,
  picks,
}: {
  open: boolean
  onClose: () => void
  name: string
  setup: Parameters<typeof rosterGradesQuery>[0]
  picks: readonly RosterPick[]
}) {
  const grades = useQuery(rosterGradesQuery(setup, picks, open))
  const rows = grades.data?.rows ?? []
  const groups = [
    { title: 'On the table', rows: rows.filter((row) => ON_THE_TABLE.has(row.key)) },
    { title: 'Damage', rows: rows.filter((row) => !ON_THE_TABLE.has(row.key)) },
  ]
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Roster grades</DialogTitle>
          <DialogDescription>
            What {name || 'this roster'} can do on the table, graded against lists that place at tournaments. Not a chance to win.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-5">
          {grades.data ? (
            <>
              <Overview groups={groups} />
              <Gaps rows={rows} missing={grades.data.missing} />
              <div className="grid gap-5 md:grid-cols-2 md:items-start">
                {groups.map((group) => (
                  <Group key={group.title} title={group.title} rows={group.rows} />
                ))}
              </div>
            </>
          ) : grades.isError ? (
            <Problem>Grades could not be worked out right now. They need a connection to Praetorium; try again in a moment.</Problem>
          ) : (
            <output className="grid gap-5" aria-label="Grading this roster">
              <span className="sr-only">Grading this roster…</span>
              <Skeleton className="h-28 rounded-xl" />
              <div className="grid gap-5 md:grid-cols-2">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </output>
          )}
        </DialogBody>
        <DialogFooter className="border-t border-edge bg-sunken px-4 py-3 text-xs text-dim sm:justify-start">
          <p>
            Each unit fights at full strength with its saved wargear and passive rules; stratagems and switched-on abilities stay off.{' '}
            <Link
              to="/docs/$docId"
              params={{ docId: 'roster-grades' }}
              className="text-info underline-offset-4 hover:underline"
              onClick={onClose}
            >
              How grades work
            </Link>
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Every grade at a glance, named, in the two groups the details below use. */
function Overview({ groups }: { groups: readonly { title: string; rows: readonly GradeRow[] }[] }) {
  const rows = groups.flatMap((group) => group.rows)
  const strongest = rows.filter((row) => row.grade === 'A').map((row) => row.label.toLowerCase())
  const lowest = rows.reduce<Grade | null>((worst, row) => (row.grade && (!worst || row.grade > worst) ? row.grade : worst), null)
  const thinnest = lowest === 'C' || lowest === 'D' ? rows.filter((row) => row.grade === lowest).map((row) => row.label.toLowerCase()) : []
  return (
    <section aria-label="Overview" className="part grid gap-3 p-3">
      <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-4">
        {groups.map((group) => (
          <div key={group.title} className="grid gap-1.5">
            <h3 className="text-2xs font-semibold tracking-label text-faint uppercase">{group.title}</h3>
            <ol className="grid grid-cols-4 items-start gap-1.5">
              {group.rows.map((row) => (
                <li key={row.key} className="grid content-start justify-items-center gap-1 text-center">
                  <GradeMark grade={row.grade} />
                  <span className="text-3xs leading-tight text-dim">{shortLabel(row.label)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="border-t border-edge pt-2.5 text-sm text-dim">
        <span className="font-semibold text-bone">Strongest at</span>{' '}
        {strongest.length ? `${formatList(strongest)}.` : 'nothing yet: no grade reaches an A.'}
        {thinnest.length ? (
          <>
            {' '}
            <span className="font-semibold text-bone">Thinnest at</span> {formatList(thinnest)}.
          </>
        ) : null}
      </p>
    </section>
  )
}

/** The kill rows say what they kill; the overview only has room for the target. */
const shortLabel = (label: string) => label.replace(/^(Kill|Clear) /, '').replace(/^\w/, (first) => first.toUpperCase())

function Gaps({ rows, missing }: { rows: readonly GradeRow[]; missing: readonly string[] }) {
  if (missing.length)
    return (
      <section aria-label="Gaps" className="grid gap-1.5 rounded-xl border border-discarded/40 bg-discarded/5 px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-discarded">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Worth knowing
        </h3>
        <p className="text-sm text-bone">
          Nothing in this list can take half the wounds of {new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(missing)} on its
          own, something nearly every list that places at a tournament can do.
        </p>
      </section>
    )
  if (rows.every((row) => row.grade && !row.notCalculated?.length))
    return <p className="text-sm text-achieved">No gaps: every reference target has a unit that can deal with it.</p>
  return null
}

function Group({ title, rows }: { title: string; rows: readonly GradeRow[] }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="rubric">{title}</h3>
      <ul className="part divide-y divide-edge">
        {rows.map((row) => (
          <li key={row.key} data-grade-row={row.key} className="flex items-start gap-3 px-3 py-2.5">
            <GradeMark grade={row.grade} large />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-semibold text-bone">{row.label}</span>
              <span className="text-sm text-dim">{row.detail}</span>
              {row.units?.length ? (
                <span className="flex flex-wrap gap-1 pt-1">
                  {row.units.map((unit) => (
                    <span key={unit} className="chip normal-case tracking-normal">
                      {unit}
                    </span>
                  ))}
                </span>
              ) : null}
              {row.notCalculated?.length ? (
                <span className="text-xs text-discarded">Not calculated for {formatList(row.notCalculated)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The letter is drawn for the eye; screen readers hear "grade B" beside the row's own label. */
function GradeMark({ grade, large = false }: { grade: Grade | null; large?: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center border-[1.5px] font-display leading-none font-bold ${
          large ? 'size-9 rounded-lg text-lg' : 'size-8 rounded-md text-base'
        } ${grade ? GRADE_MARK[grade] : UNGRADED_MARK}`}
      >
        {grade ?? '–'}
      </span>
      <span className="sr-only">{grade ? `Grade ${grade}` : 'Not graded'}</span>
    </>
  )
}
