// One-off: every detachment rule, Enhancement and upgrade card a rules version's datacards give no VS Data id, with the
// records of its name under its detachment that the client's name lookup lands on. Private output, ids only.
import fs from 'node:fs'
import path from 'node:path'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { loadRules } from '../src/server/rules'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import { unitAbilitySlug } from '../src/core/summaryMarkdown'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const edition = process.argv[2]!
const entry = readCatalogueComposition(directory)!.editions.find((c) => c.edition.id === edition)!
const { rules } = entry.base
  ? loadSnapshotWithRules(directory)
  : (() => {
      const target = editionDirectory(directory, entry)
      const c = loadCatalogue(target, entry.edition)!
      return { rules: loadRules(target, { battlemasterDirectory: path.join(directory, 'battlemaster'), iconDirectory: path.join(directory, 'icons'), snapshotDirectory: directory, rulesVersion: edition, catalogue: c })! }
    })()
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const units = read.recordsIn(entry.base ? null : edition)!
const keys = Object.keys(units.abilities)
const misses = ((globalThis as any).__misses ?? []) as { owner: string; detachment: string; kind: string; name: string; aliases: string[] }[]
const out = misses.map((miss) => {
  const rule = `.${miss.detachment}.${unitAbilitySlug(miss.name.replace(/\s*\(Upgrade\)\s*$/i, ''))}`
  return { ...miss, byName: keys.filter((key) => key.endsWith(rule)) }
})
fs.mkdirSync('/private/tmp/claude-501/probe2/forks', { recursive: true })
fs.writeFileSync(`/private/tmp/claude-501/probe2/forks/${edition}.json`, JSON.stringify(out, null, 1))
console.log(edition, 'misses', out.length, 'with a name record', out.filter((o) => o.byName.length).length)
