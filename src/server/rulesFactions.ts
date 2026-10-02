import type { Stratagem } from '../core/battle'
import type { EnhancementEligibility } from './datacards'

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

export type LoadedFactions = {
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  factionKeys: Map<string, string>
  factionParents: Map<string, string>
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  byDetachment: Map<string, Map<string, Stratagem[]>>
}
