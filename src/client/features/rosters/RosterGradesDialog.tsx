import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Crosshair, Flag, Footprints, Shield, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import type { RosterPick } from '../../../core/roster'
import type { Grade, GradeCategory, GradeRow, RosterGrades } from '../../../core/rosterGrades'
import { formatList } from '../../text'
import { rosterGradesQuery, sharedRosterQuery } from '../../queries'
import { claimInput, type GuestDraft } from './guestDraft'
import { positionedPicks } from './rosterPicks'

/**
 * Colour and line form both carry the grade, solid for A and B and dashed for C and D, so it reads without colour
 * too. Each colour keeps its job: Map Green the best, Chart Blue a gauge, Amber a warning, Rust a loss.
 */
const GRADE_TONE: Record<Grade, { text: string; border: string; stroke: string; dashed: boolean }> = {
  A: { text: 'text-achieved', border: 'border-achieved', stroke: 'stroke-achieved', dashed: false },
  B: { text: 'text-info', border: 'border-info', stroke: 'stroke-info', dashed: false },
  C: { text: 'text-discarded', border: 'border-dashed border-discarded', stroke: 'stroke-discarded', dashed: true },
  D: { text: 'text-rust', border: 'border-dashed border-rust', stroke: 'stroke-rust', dashed: true },
}

/** What each category is about, at a glance; the grade, not the icon, carries the colour. */
const CATEGORY_ICON: Record<string, LucideIcon> = { control: Flag, mobility: Footprints, damage: Crosshair, durability: Shield }

/** Where each category sits in the two desktop columns; written out whole so Tailwind finds the classes. */
const CATEGORY_AREA: Record<string, string> = {
  control: 'md:[grid-area:control]',
  mobility: 'md:[grid-area:mobility]',
  damage: 'md:[grid-area:damage]',
  durability: 'md:[grid-area:durability]',
}

/** What the roster can do on the table, scored the way Lighthouse scores a page; it asks the server only while open. */
export function RosterGradesDialog({
  open,
  onClose,
  name,
  setup,
  picks,
  failed = false,
}: {
  open: boolean
  onClose: () => void
  name: string
  setup: Parameters<typeof rosterGradesQuery>[0]
  picks: readonly RosterPick[]
  /** The list itself could not be loaded, so there is nothing to grade. */
  failed?: boolean
}) {
  const grades = useQuery(rosterGradesQuery(setup, picks, open))
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Roster grades</DialogTitle>
          <DialogDescription>
            What {name || 'this roster'} can do on the table, scored against tournament lists of the same faction and size. Scores describe
            the list, not your odds of winning.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-5">
          {grades.data ? (
            <>
              <Scores grades={grades.data} />
              <Gaps grades={grades.data} />
              {/* Damage has the most measures, so it takes the right column alone beside the other three; the last row
                  takes the slack so the left ones stay together. */}
              <div className="grid gap-5 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] md:items-start md:[grid-template-areas:'control_damage'_'mobility_damage'_'durability_damage']">
                {grades.data.categories.map((category) => (
                  <Category key={category.key} category={category} />
                ))}
              </div>
            </>
          ) : grades.isError || failed ? (
            <Problem>Grades could not be worked out right now. They need a connection to Praetorium; try again in a moment.</Problem>
          ) : (
            <output className="grid gap-5" aria-label="Grading this roster">
              <span className="sr-only">Grading this roster…</span>
              <Skeleton className="h-40 rounded-xl" />
              <div className="grid gap-5 md:grid-cols-2">
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-48 rounded-xl" />
                ))}
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
              How scores work
            </Link>
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A library roster's grades, loading the whole list first; a visitor's list is already on the device. */
export function SavedRosterGradesDialog({
  id,
  guest,
  name,
  onClose,
}: {
  id: string
  guest: GuestDraft | null
  name: string
  onClose: () => void
}) {
  const saved = useQuery({ ...sharedRosterQuery(id), enabled: !guest })
  const roster = guest ? claimInput(guest) : saved.data
  const picks = roster ? positionedPicks(roster.picks.map((pick, key) => ({ ...pick, key }))) : []
  return (
    <RosterGradesDialog
      open
      onClose={onClose}
      name={name}
      setup={roster ?? { catalogueId: '', detachmentIds: [], disposition: null, limit: 0 }}
      picks={picks}
      failed={!guest && (saved.isError || saved.data === null)}
    />
  )
}

/** The overall score beside each category's, then one line on what the list does best and worst. */
function Scores({ grades }: { grades: RosterGrades }) {
  const rows = grades.categories.flatMap((category) => category.rows)
  const strongest = rows.filter((row) => row.grade === 'A').map((row) => row.label.toLowerCase())
  const lowest = rows.reduce<Grade | null>((worst, row) => (row.grade && (!worst || row.grade > worst) ? row.grade : worst), null)
  const thinnest = lowest === 'C' || lowest === 'D' ? rows.filter((row) => row.grade === lowest).map((row) => row.label.toLowerCase()) : []
  return (
    <section aria-label="Scores" className="part grid gap-4 p-4">
      <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr] sm:gap-6">
        <div className="grid justify-items-center gap-1.5">
          <Gauge score={grades.score} grade={grades.grade} large />
          <span className="grid justify-items-center text-center">
            <span className="text-sm font-semibold text-bone">Overall</span>
            <span className="text-xs text-dim">{grades.comparedWith ? `Among ${grades.comparedWith} lists` : 'Among all factions'}</span>
          </span>
        </div>
        <ol aria-label="Categories" className="grid grid-cols-4 items-start gap-2">
          {grades.categories.map((category) => (
            <li key={category.key} className="grid content-start justify-items-center gap-1.5 text-center">
              <Gauge score={category.score} grade={category.grade} />
              <CategoryLabel category={category} className="text-xs leading-tight text-dim" icon="hidden sm:block" />
            </li>
          ))}
        </ol>
      </div>
      <p className="border-t border-edge pt-3 text-sm text-dim">
        <span className="font-semibold text-bone">Strongest at</span>{' '}
        {strongest.length ? `${formatList(strongest)}.` : 'nothing yet: no measure reaches an A.'}
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

/** A ring whose arc is the score out of 100; it is dashed below a B so it reads without colour too. */
function Gauge({ score, grade, large = false }: { score: number | null; grade: Grade | null; large?: boolean }) {
  const tone = grade ? GRADE_TONE[grade] : null
  // The ring is drawn in a 100-unit box, so the large gauge's thinner stroke keeps it as thick on screen as before.
  const width = large ? 6 : 9
  return (
    <span className={`relative grid place-items-center ${large ? 'size-28' : 'size-14'}`}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth={width} className="stroke-edge" />
        {score !== null && tone ? (
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            pathLength={100}
            strokeWidth={width}
            strokeLinecap={tone.dashed ? 'butt' : 'round'}
            strokeDasharray={tone.dashed ? dashedArc(score) : `${score} 100`}
            className={tone.stroke}
          />
        ) : null}
      </svg>
      <span className={`relative grid justify-items-center leading-none ${tone?.text ?? 'text-faint'}`}>
        <span className={`figure font-semibold ${large ? 'text-3xl' : 'text-lg'}`}>{score ?? '–'}</span>
        {large && grade ? <span className="mt-1 font-display text-2xs font-bold tracking-label uppercase">Grade {grade}</span> : null}
      </span>
      <span className="sr-only">{score === null ? 'Not scored' : `${score} out of 100, grade ${grade}`}</span>
    </span>
  )
}

/** Short dashes that still end at the score, so a low score keeps both its length and its line form. */
function dashedArc(score: number) {
  const count = Math.max(1, Math.round(score / 5))
  const step = score / count
  return `${Array.from({ length: count }, () => `${(step * 0.6).toFixed(2)} ${(step * 0.4).toFixed(2)}`).join(' ')} 0 100`
}

function Gaps({ grades }: { grades: RosterGrades }) {
  if (grades.missing.length)
    return (
      <section aria-label="Gaps" className="grid gap-1.5 rounded-xl border border-discarded/40 bg-discarded/5 px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-discarded">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Worth knowing
        </h3>
        <p className="text-sm text-bone">
          Nothing in this list can take half the wounds of {new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(grades.missing)} on
          its own, something nearly every tournament list this size can do.
        </p>
      </section>
    )
  const damage = grades.categories.find((category) => category.key === 'damage')?.rows ?? []
  if (damage.every((row) => row.grade && !row.notCalculated?.length))
    return <p className="text-sm text-achieved">No gaps: this list has a unit for every target tournament lists this size can deal with.</p>
  return null
}

/** A category's name with its icon; `icon` hides the icon where a label can wrap, as under the narrow gauges. */
function CategoryLabel({ category, className, icon = '' }: { category: GradeCategory; className: string; icon?: string }) {
  const Icon = CATEGORY_ICON[category.key]
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {Icon ? <Icon className={`size-3.5 shrink-0 text-faint ${icon}`} aria-hidden /> : null}
      {category.label}
    </span>
  )
}

function Category({ category }: { category: GradeCategory }) {
  return (
    <section aria-label={category.label} className={`grid gap-2 ${CATEGORY_AREA[category.key] ?? ''}`}>
      <h3 className="flex items-baseline justify-between gap-3">
        <CategoryLabel category={category} className="rubric" />
        <span className={`figure text-sm ${category.grade ? GRADE_TONE[category.grade].text : 'text-faint'}`}>
          {category.score ?? '–'}
          <span className="text-faint">/100</span>
        </span>
      </h3>
      <ul className="part divide-y divide-edge">
        {category.rows.map((row) => (
          <Measure key={row.key} row={row} />
        ))}
      </ul>
    </section>
  )
}

function Measure({ row }: { row: GradeRow }) {
  return (
    <li data-grade-row={row.key} className="flex items-start gap-3 px-3 py-2.5">
      <span
        aria-hidden
        className={`grid size-9 shrink-0 place-items-center rounded-lg border-[1.5px] font-display text-lg leading-none font-bold ${
          row.grade ? `${GRADE_TONE[row.grade].border} ${GRADE_TONE[row.grade].text}` : 'border-dotted border-runner text-faint'
        }`}
      >
        {row.grade ?? '–'}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-bone">{row.label}</span>
          <span aria-hidden className="figure text-xs text-faint">
            {row.score ?? '–'}
          </span>
        </span>
        <span className="sr-only">{row.grade ? `Grade ${row.grade}, ${row.score} out of 100` : 'Not graded'}</span>
        <span className="text-sm text-dim">{row.detail}</span>
        {row.units?.length ? (
          <span className="flex flex-wrap gap-1 pt-1">
            {[...counted(row.units)].map(([unit, copies]) => (
              <span key={unit} className="chip tracking-normal normal-case">
                {copies > 1 ? `${unit} ×${copies}` : unit}
              </span>
            ))}
          </span>
        ) : null}
        {row.notCalculated?.length ? (
          <span className="text-xs text-discarded">Not calculated for {formatList(row.notCalculated)}</span>
        ) : null}
      </span>
    </li>
  )
}

/** A list can hold the same unit twice; one chip names it with its count. */
function counted(names: readonly string[]) {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return counts
}
