// One-off: every datasheet ability's record before (name logic) and after (ids, with the reviewed aliases and frozen map
// layered on), per rules version. Private output, counts and ids only.
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
import { datasheetAbilitySummary as before } from './_vsDataAbilitiesBefore'
import { datasheetAbilitySummary as after } from '../src/shared/vsDataAbilities'
import { idsIn } from '../src/shared/vsDataPoints'
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
      return { catalogue: c, rules: loadRules(target, { battlemasterDirectory: path.join(directory, 'battlemaster'), iconDirectory: path.join(directory, 'icons'), snapshotDirectory: directory, rulesVersion: edition, catalogue: c })! }
    })()
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const records = read.recordsIn(entry.base ? null : edition)!
const keywords = read.abilities()
// The aliases VS Data will publish for this version, and the frozen per-datasheet map, as `bsdataRecords` reads them.
const reviewed = JSON.parse(fs.readFileSync(process.env.REVIEWED!, 'utf8')).aliases as Record<string, (string | { versions: string[]; aliases: string[] })[]>
const aliases = { ...records.aliases }
for (const [key, items] of Object.entries(reviewed))
  for (const item of items)
    for (const alias of typeof item === 'string' ? [item] : item.versions.includes(edition === 'custodes-11e' ? 'mfm-1-6' : edition) ? item.aliases : [])
      if (key.startsWith('ability:') && records.abilities[key.slice('ability:'.length)] !== undefined && !aliases[alias.slice(7).replaceAll('.', '-')])
        aliases[alias.slice(7).replaceAll('.', '-')] = key.slice('ability:'.length)
const frozen = JSON.parse(fs.readFileSync(process.env.FROZEN!, 'utf8')).ids as Record<string, string>
// A frozen entry on a record that is no ability (a core keyword) still keeps the datasheet off the id's alias.
for (const [k, v] of idsIn(frozen, entry.base ? null : edition)) aliases[k] = v.startsWith('ability:') ? v.slice('ability:'.length) : ''
const withAliases = { ...records, aliases }
const tally: Record<string, number> = {}
const changed: unknown[] = []
const baseline: unknown[] = []
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
      const p = printed ? { id: printed.id, summary: printed.id } : null
      const keyword = abilityKeysNamed(ability.name).find((key) => keywords[key]) ?? null
      const was = before(records, id, ability.name, ability.id, p) ?? keyword
      const now = after(withAliases, id, ability.id, p) ?? keyword
      baseline.push({ sheet: id, ability: ability.id, was })
      const verdict = was === now ? 'same' : !now ? 'lost' : !was ? 'gained' : 'changed'
      tally[verdict] = (tally[verdict] ?? 0) + 1
      if (verdict !== 'same') changed.push({ verdict, sheet: id, ability: ability.id, name: ability.name, was, now })
    }
  }
fs.mkdirSync('/private/tmp/claude-501/probe2/verify', { recursive: true })
fs.writeFileSync(`/private/tmp/claude-501/probe2/verify/${edition}.json`, JSON.stringify(changed))
fs.writeFileSync(`/private/tmp/claude-501/probe2/verify/baseline-${edition}.json`, JSON.stringify(baseline))
console.log(edition, JSON.stringify(tally))
