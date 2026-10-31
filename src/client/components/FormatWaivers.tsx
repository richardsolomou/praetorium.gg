import { Link } from '@tanstack/react-router'
import { Pencil, TriangleAlert, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type FormatRule, waivedFormatRules } from '../../core/battle'
import { countLabel } from '../text'
import { buttonClass } from './buttonClass'

/**
 * How a list says it is not playing all of its format.
 *
 * A waiver is the owner's decision and a fact about the army their opponent is about
 * to face, so it is drawn the same way in both directions: on the list in the
 * library and the builder, on the row being chosen for a seat or sealed into a
 * sealed event, and on the army once it is attached. One module, so a waived list cannot
 * be loud in the place it is chosen and silent in the place it is faced, and so the
 * four places that name a restriction all name it the same way.
 */
export function rosterWaivers(
  roster: { limit: number; pointsBudget?: number | null; waivedRules?: readonly string[] | null } | null | undefined,
): FormatRule[] {
  return roster ? waivedFormatRules(roster.limit, roster.waivedRules ?? [], roster.pointsBudget) : []
}

/** The waived restrictions as one readable list, for a sentence that names them. */
const waiverLabels = (rules: readonly FormatRule[]) => rules.map((rule) => rule.label).join(', ')

const switchedOff = (rules: readonly FormatRule[]) =>
  `${rules.length} format ${rules.length === 1 ? 'restriction is' : 'restrictions are'} switched off`

/**
 * A mark beside a list's identity, which says what it is on hover.
 *
 * The identity line is what a list is, and every other thing on it is a fact about
 * the army rather than a caveat; spelling the waivers out there made the caveat the
 * loudest thing on the line. The mark holds the place, and the reader asks for the
 * rest. Wherever a list is being decided about — chosen for a seat, sealed into a
 * sealed event, read under its own roster — the full sentence is still written out.
 */
export function WaiverChip({ rules, className = '' }: { rules: readonly FormatRule[]; className?: string }) {
  if (!rules.length) return null
  const summary = `${countLabel(rules.length, 'format restriction')} switched off: ${waiverLabels(rules)}`
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn('relative inline-flex shrink-0 items-center text-discarded', className)} />}>
        <TriangleAlert className="size-4" aria-hidden />
        {/* The mark shows on hover and the tooltip is not read aloud, so the sentence travels with it. */}
        <span className="sr-only">{summary}</span>
      </TooltipTrigger>
      <TooltipContent className="block">
        <span className="block font-semibold">{switchedOff(rules)}</span>
        <span className="mt-0.5 block">{waiverLabels(rules)}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/** The same fact as a line, where a row or an army has room for one. */
export function WaiverNote({ rules, className = '' }: { rules: readonly FormatRule[]; className?: string }) {
  if (!rules.length) return null
  return <p className={cn('text-xs text-discarded', className)}>Format restrictions off: {waiverLabels(rules)}</p>
}

/**
 * Each waived restriction on its own line, for the moment someone has to decide
 * about them. A run-on sentence made the reader count commas to find out what they
 * were agreeing to.
 */
function WaiverList({ rules }: { rules: readonly FormatRule[] }) {
  return (
    <ul className="my-3 min-w-0 space-y-1.5 border border-discarded/40 bg-discarded/5 p-2.5">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-start gap-2 text-sm text-discarded">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-semibold">{rule.label}</span>
            <span className="block text-xs text-dim">{rule.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

type WaivingRoster = Parameters<typeof rosterWaivers>[0] & { id: string; name: string }

/** Asks before a waiving list is brought anyway; `consequence` finishes "Praetorium has not checked them, so …". */
export function WaiverConfirmDialog<Roster extends WaivingRoster>({
  roster,
  noun,
  consequence,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  roster: Roster | null
  noun: string
  consequence: string
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: (roster: Roster) => void
}) {
  const rules = rosterWaivers(roster)
  const one = rules.length === 1
  return (
    <AlertDialog open={roster !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <AlertDialogContent aria-busy={pending} className="border-discarded/50 sm:max-w-lg [&>*]:min-w-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-discarded">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            {one ? `This ${noun} waives a rule` : `This ${noun} waives ${rules.length} rules`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {roster?.name} is not playing {one ? 'one of' : 'some of'} the rules of its battle size:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <WaiverList rules={rules} />
        <p className="text-sm text-dim">
          Praetorium has not checked {one ? 'it' : 'them'}, so {consequence}
        </p>
        <AlertDialogFooter className="sm:flex-wrap">
          {roster ? (
            <Link
              to="/rosters/$id"
              params={{ id: roster.id }}
              data-slot="button"
              className={buttonClass({ variant: 'outline', className: 'sm:mr-auto' })}
            >
              <Pencil /> Edit roster
            </Link>
          ) : null}
          <AlertDialogCancel disabled={pending}>Choose another</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => roster && onConfirm(roster)}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * What a list is not playing, said under it beside the errors.
 *
 * A waived restriction is why an error a player expected is not reported, so it is
 * read where those errors are. It is a standing statement rather than a problem to
 * solve — the player switched it off on purpose — so it can be dismissed, and it
 * comes back when the set of waived restrictions changes.
 */
export function WaiverWarning({
  rules,
  onDismiss,
  editable,
}: {
  rules: readonly FormatRule[]
  onDismiss: () => void
  /** Whether this reader is the one who can switch them back on. */
  editable: boolean
}) {
  if (!rules.length) return null

  return (
    <section
      className="mt-2 flex items-start gap-2 border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded"
      aria-label="Format restrictions switched off"
    >
      <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold uppercase">{switchedOff(rules)}</p>
        <ul className="mt-1 list-inside list-disc">
          {rules.map((rule) => (
            <li key={rule.id}>
              {rule.label} — {rule.hint}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-faint">
          {editable
            ? 'Nothing is checked against them, and everyone you play sees what this list waives. The picker menu switches them back on.'
            : 'Nothing is checked against them, and this list is not legal where the format is enforced.'}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss the format restriction warning"
        className="-mt-1 -mr-1 shrink-0 text-discarded hover:text-bone"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </Button>
    </section>
  )
}
