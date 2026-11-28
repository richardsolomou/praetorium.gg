// One-off: Detachment cards per kind in the current rules version without a VS Data id, by what else finds them. Ids only.
import path from 'node:path'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const { catalogue, rules } = loadSnapshotWithRules(path.resolve(catalogueDataDirectory()))
const tally: Record<string, number> = {}
const missing: string[] = []
for (const faction of factionsFor(catalogue, rules).factions)
  for (const detachment of faction.detachments) {
    const detail = detachmentReference(catalogue, rules, faction.id, detachment.slug)
    for (const kind of ['rules', 'enhancements', 'upgrades'] as const)
      for (const card of (detail?.[kind] ?? []) as { name: string; description: string | null; vsDataId?: string; bsdataId?: string }[]) {
        const how = card.vsDataId ? 'id' : card.bsdataId ? 'bsdata-id' : card.description ? 'text' : 'none'
        tally[`${kind}:${how}`] = (tally[`${kind}:${how}`] ?? 0) + 1
        if (how === 'text' || how === 'none') missing.push(`${kind} | ${how} | ${faction.slug} | ${detachment.slug} | ${card.name}`)
      }
  }
console.log(JSON.stringify(tally, null, 1))
console.log(missing.join('\n'))
