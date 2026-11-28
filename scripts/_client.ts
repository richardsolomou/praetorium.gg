import fs from 'node:fs'
import path from 'node:path'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { loadRules } from '../src/server/rules'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import { datasheetIn } from '../src/shared/catalogue'
import { hasTextTokens } from '../src/core/sourceText'
import { summaryNamedBy, wholeRuleTokens, abilityKeysNamed } from '../src/shared/ruleSummaries'
import { datasheetAbilitySummary } from './_vsDataAbilitiesBefore'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const edition = process.argv[2]!
const entry = readCatalogueComposition(directory)!.editions.find((c) => c.edition.id === edition)!
const { catalogue, rules } = entry.base
  ? loadSnapshotWithRules(directory)
  : (() => {
      const target = editionDirectory(directory, entry)
      const c = loadCatalogue(target, entry.edition)!
      const r = loadRules(target, { battlemasterDirectory: path.join(directory, 'battlemaster'), iconDirectory: path.join(directory, 'icons'), snapshotDirectory: directory, rulesVersion: edition, catalogue: c })!
      return { catalogue: c, rules: r }
    })()
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const records = read.recordsIn(entry.base ? null : edition)!
const keywords = read.abilities()
const joins = JSON.parse(fs.readFileSync(`/private/tmp/claude-501/probe2/joins-${edition}.json`, 'utf8')) as { by: string; record: string | null; holders: { id: string }[] }[]
const candidate = new Map<string, string>()
for (const j of joins) if (j.by === 'name' && j.record) for (const h of j.holders) candidate.set(h.id, j.record)
const tally: Record<string, number> = {}
const rows: unknown[] = []
const seen = new Set<string>()
for (const faction of catalogue.factions)
  for (const id of catalogue.index.datasheets.get(faction.id) ?? []) {
    const sheet = datasheetIn(catalogue, faction.id, id)
    for (const ability of sheet?.abilities ?? []) {
      const text = ability.description ?? ''
      if (!(hasTextTokens(text) || (!text && ability.name))) continue
      const k = `${id}|${ability.id}|${text}`
      if (seen.has(k)) continue
      seen.add(k)
      const tokens = wholeRuleTokens(text)
      const printed = tokens.length ? summaryNamedBy(tokens, new Map(tokens.map((t) => [t.file, read.summariesIn(t.file)])), ability.name) : null
      const own = datasheetAbilitySummary(records, id, ability.name, ability.id, printed ? { id: printed.id, summary: printed.id } : null)
      const core = own ? null : (abilityKeysNamed(ability.name).find((key) => keywords[key]) ?? null)
      const current = own ?? core
      const alias = records.aliases[ability.id] ? `ability:${records.aliases[ability.id]}` : null
      const target = alias ?? candidate.get(ability.id) ?? printed?.id ?? null
      const verdict = !current && !target ? 'none' : current === target ? 'same' : !target ? 'lost' : !current ? 'gained' : 'differs'
      const how = alias ? 'alias' : candidate.has(ability.id) ? 'candidate' : printed ? 'printed' : 'nothing'
      tally[`${verdict}:${how}`] = (tally[`${verdict}:${how}`] ?? 0) + 1
      rows.push({ verdict, how, sheet: id, ability: ability.id, name: ability.name, current, currentBy: own ? (printed && own === printed.id ? 'printed' : alias && own === alias ? 'alias' : 'name') : core ? 'keyword' : null, target, candidate: candidate.get(ability.id) ?? null })
    }
  }
fs.writeFileSync(`/private/tmp/claude-501/probe2/client-${edition}.json`, JSON.stringify(rows))
console.log(edition, JSON.stringify(tally))
