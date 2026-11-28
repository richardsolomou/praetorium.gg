// One-off: each catalogue-only detachment rule's print-pack summary record without an owner (main) and with one (#2174). Ids only.
import path from 'node:path'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import { wholeRuleTokens, recordsPrinting } from '../src/shared/ruleSummaries'
import { datasheetAbilitySummary, unitsInBook } from '../src/shared/vsDataAbilities'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { canonicalDetachmentName } from '../src/core/detachmentName'
import { routeSlug } from '../src/core/slug'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const { catalogue, rules } = loadSnapshotWithRules(directory)
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const records = read.recordsIn(null)!
for (const faction of factionsFor(catalogue, rules).factions)
  for (const detachment of faction.detachments) {
    const detail = detachmentReference(catalogue, rules, faction.id, detachment.slug)
    for (const rule of detail?.rules ?? []) {
      if (rule.vsDataId || !rule.bsdataId || !rule.description) continue
      const tokens = wholeRuleTokens(rule.description)
      const printed = recordsPrinting(tokens, new Map(tokens.map((t) => [t.file, read.summariesIn(t.file)]))).map(({ id }) => ({ id, summary: id }))
      const owner = `@${faction.slug}.${routeSlug(canonicalDetachmentName(detachment.slug))}`
      const main = datasheetAbilitySummary(null, '', rule.bsdataId, printed, rule.name)
      const fixed = datasheetAbilitySummary(unitsInBook(records, faction.id), owner, rule.bsdataId, printed, rule.name)
      console.log([faction.slug, detachment.slug, rule.name, `main=${main}`, `fixed=${fixed}`].join(' | '))
    }
  }
