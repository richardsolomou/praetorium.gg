import type { Stratagem } from '../core/battle'

import type { DetachmentReference, DetachmentRulesDetail } from '../contracts/factions'
export type { DetachmentReference, DetachmentRulesDetail } from '../contracts/factions'

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
