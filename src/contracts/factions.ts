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
  rules: { name: string; description: string }[]
  enhancements: { name: string; points: number | null; description: string | null; eligibility: EnhancementEligibility | null }[]
  upgrades: { name: string; points: number | null; description: string | null }[]
  stratagems: {
    id: string
    name: string
    cp: number
    type: string | null
    phases: string[]
    turn: string | null
    description: string | null
  }[]
}
