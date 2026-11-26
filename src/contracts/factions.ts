import type { StratagemWindow } from '../core/battlePhases'
export type EnhancementEligibility = { anyOf: string[][]; excluded: string[]; requiredAbilities?: string[]; requiredWargear?: string[] }

export type DetachmentReference = {
  enhancements: number
  upgrades: number
  stratagems: number
  points: number | null
  dispositions: string[]
}

export type DetachmentRulesDetail = {
  id: string
  name: string
  points: number | null
  dispositions: string[]
  /** Each card's `vsDataId` is the VS Data ability its summary is, where VS Data's aliases name the card. */
  rules: { name: string; description: string; vsDataId?: string }[]
  /** The `abilityKey`s of the rules the rules version marks absent here, which the catalogue's own rules must not add back. */
  absentRules?: string[]
  enhancements: {
    name: string
    points: number | null
    description: string | null
    eligibility: EnhancementEligibility | null
    vsDataId?: string
  }[]
  upgrades: { name: string; points: number | null; description: string | null; vsDataId?: string }[]
  stratagems: {
    id: string
    name: string
    /** Null for a Stratagem its build prints that VS Data does not publish yet. */
    cp: number | null
    type: string | null
    phases: string[]
    turn: string | null
    /** Each phase with its own turn, where they differ; then it decides over `phases` and `turn`. */
    windows?: StratagemWindow[]
    description: string | null
  }[]
}
