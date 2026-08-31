import { TriangleAlert } from 'lucide-react'
import { type FormatRule, waivedFormatRules } from '../../core/battle'

/**
 * How a list says it is not playing all of its format.
 *
 * A waiver is the owner's decision and a fact about the army their opponent is about
 * to face, so it is drawn the same way in both directions: on the list in the
 * library and the builder, on the row being chosen for a seat or sealed into a
 * league, and on the army once it is attached. One component, so a waived list
 * cannot be loud in the place it is chosen and silent in the place it is faced.
 */
export function rosterWaivers(roster: { limit: number; waivedRules?: readonly string[] | null } | null | undefined): FormatRule[] {
  return roster ? waivedFormatRules(roster.limit, roster.waivedRules ?? []) : []
}

/** The waived restrictions as one readable list, for a sentence that names them. */
export const waiverLabels = (rules: readonly FormatRule[]) => rules.map((rule) => rule.label).join(', ')

export const waiverCount = (rules: readonly FormatRule[]) => `${rules.length} format ${rules.length === 1 ? 'restriction' : 'restrictions'}`

/** A chip beside a list's identity, naming what it is being built without. */
export function WaiverChip({ rules, className = '' }: { rules: readonly FormatRule[]; className?: string }) {
  if (!rules.length) return null
  return (
    <span className={`chip shrink-0 text-discarded ${className}`}>
      <TriangleAlert className="size-3" aria-hidden />
      Waived: {waiverLabels(rules)}
    </span>
  )
}

/** The same fact as a line, where an army has room for one. */
export function WaiverNote({ rules, className = '' }: { rules: readonly FormatRule[]; className?: string }) {
  if (!rules.length) return null
  return <p className={`text-xs text-discarded ${className}`}>Format restrictions off: {waiverLabels(rules)}</p>
}
