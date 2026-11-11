import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
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

// The server runs every unit against every reference target, so a burst of edits asks once it settles.
const SETTLE_MS = 600

function useSettled<T>(value: T) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

/** What the roster can do on the table, graded row by row, in the pane beside it. */
export function RosterGradesPanel({ setup, picks }: { setup: Parameters<typeof rosterGradesQuery>[0]; picks: readonly RosterPick[] }) {
  const settled = useSettled(picks)
  const grades = useQuery(rosterGradesQuery(setup, settled))
  const updating = grades.isPlaceholderData || settled !== picks
  return (
    <div data-roster-grades className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6">
      {grades.data ? (
        <div aria-busy={updating} className={`space-y-5 transition-opacity duration-200 ${updating ? 'opacity-60' : ''}`}>
          <Summary rows={grades.data.rows} missing={grades.data.missing} />
          <Group title="On the table" rows={grades.data.rows.filter((row) => ON_THE_TABLE.has(row.key))} />
          <Group title="Damage" rows={grades.data.rows.filter((row) => !ON_THE_TABLE.has(row.key))} />
          <p className="text-xs text-faint">
            Graded against lists that place at tournaments, with each unit at full strength and its passive rules. Not a chance to win.{' '}
            <Link to="/docs/$docId" params={{ docId: 'roster-grades' }} className="text-info underline-offset-4 hover:underline">
              How grades work
            </Link>
          </p>
        </div>
      ) : grades.isError ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-discarded">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Grades could not be worked out right now. They need a connection to Praetorium; try again in a moment.</span>
        </p>
      ) : (
        <output className="block space-y-5" aria-label="Grading this roster">
          <span className="sr-only">Grading this roster…</span>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </output>
      )}
    </div>
  )
}

function Summary({ rows, missing }: { rows: readonly GradeRow[]; missing: readonly string[] }) {
  const strongest = rows.filter((row) => row.grade === 'A').map((row) => row.label)
  const lowest = rows.reduce<Grade | null>((worst, row) => (row.grade && (!worst || row.grade > worst) ? row.grade : worst), null)
  const thinnest = lowest === 'C' || lowest === 'D' ? rows.filter((row) => row.grade === lowest).map((row) => row.label) : []
  const lower = (labels: readonly string[]) => formatList(labels.map((label) => label.toLowerCase()))
  return (
    <section aria-label="Summary" className="part space-y-3 px-3 py-3">
      <ol aria-label="Every grade" className="flex flex-wrap gap-1">
        {rows.map((row, index) => (
          <li
            key={row.key}
            title={`${row.label}: ${row.grade ?? 'not graded'}`}
            className={index && ON_THE_TABLE.has(rows[index - 1]!.key) && !ON_THE_TABLE.has(row.key) ? 'ml-2.5' : undefined}
          >
            <GradeMark grade={row.grade} size="small" />
          </li>
        ))}
      </ol>
      <dl className="space-y-1 text-sm text-dim">
        <div>
          <dt className="inline font-semibold text-bone">Strongest at </dt>
          <dd className="inline">{strongest.length ? `${lower(strongest)}.` : 'nothing yet: no grade reaches an A.'}</dd>
        </div>
        {thinnest.length ? (
          <div>
            <dt className="inline font-semibold text-bone">Thinnest at </dt>
            <dd className="inline">{lower(thinnest)}.</dd>
          </div>
        ) : null}
      </dl>
      {missing.length ? (
        <ul aria-label="Gaps" className="space-y-1 border-t border-edge pt-2.5">
          {missing.map((gap) => (
            <li key={gap} className="flex items-start gap-1.5 text-sm text-discarded">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-edge pt-2.5 text-sm text-achieved">
          No gaps: every reference target has a unit that can deal with it.
        </p>
      )}
    </section>
  )
}

function Group({ title, rows }: { title: string; rows: readonly GradeRow[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="rubric">{title}</h3>
      <ul className="part divide-y divide-edge">
        {rows.map((row) => (
          <li key={row.key} data-grade-row={row.key} className="flex items-start gap-3 px-3 py-2.5">
            <GradeMark grade={row.grade} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-bone">{row.label}</span>
              <span className="block text-sm text-dim">{row.detail}</span>
              {row.units?.length ? <span className="mt-0.5 block text-xs break-words text-faint">{row.units.join(' · ')}</span> : null}
              {row.notCalculated?.length ? (
                <span className="mt-0.5 block text-xs text-discarded">Not calculated for {formatList(row.notCalculated)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function GradeMark({ grade, size = 'large' }: { grade: Grade | null; size?: 'large' | 'small' }) {
  return (
    <span
      aria-label={grade ? `Grade ${grade}` : 'Not graded'}
      className={`grid shrink-0 place-items-center border-[1.5px] font-display leading-none font-bold ${
        size === 'large' ? 'size-9 rounded-lg text-lg' : 'size-6 rounded-md text-xs'
      } ${grade ? GRADE_MARK[grade] : UNGRADED_MARK}`}
    >
      {grade ?? '–'}
    </span>
  )
}
